# -*- coding: utf-8 -*-
"""
MediaSuite 2.0 — TTS Chat Router (Edge TTS + Chat Agéntico Inteligente)
=========================================================================
Mejoras v3:
- Búsqueda fuzzy multi-estrategia mejorada (difflib + word overlap + ES↔EN + artist)
- Consulta directa a DB (campo is_public correcto)
- Lectura de letras + descripción profunda + álbum/creator context
- Intención semántica avanzada: entiende contexto multi-turno
- Soporte de track actual como contexto conversacional
"""

import asyncio
import logging
import re
import os
import tempfile
import time
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, Any

from lib.saori_copilot import (
    artist_analysis_text,
    build_account_context,
    detect_navigation_intent,
    fan_analysis_text,
    music_only,
    wants_account_analysis,
)

from lib.agent_context_resolver import (
    AgentContext,
    PLAY_KEYWORDS,
    build_catalog_prompt_lines,
    build_creator_prompt_section,
    get_rag_namespaces,
    prioritize_catalog,
    resolve_agent_context,
    resolve_creator_from_message,
    scoped_fuzzy_search,
    score_match,
    tokenize,
    expand_with_translations,
    normalize,
)
from lib.creator_registry import SLUG_TO_CREATOR, get_creator_meta_by_slug

logger = logging.getLogger(__name__)
router = APIRouter()

KOKORO_VOICES = {
    "ef_dora": "Dora (Kokoro ES / Expresiva y Natural - Local ⭐)",
    "em_alex": "Alex (Kokoro ES / Neutro Profesional - Local ⭐)",
    "em_santa": "Santa (Kokoro ES / Cálido y Grave - Local)",
    "af_heart": "Heart (Kokoro EN-US / Estudio Calidad - Local ⭐)",
    "af_bella": "Bella (Kokoro EN-US / Narrativa Suave - Local)",
    "am_michael": "Michael (Kokoro EN-US / Firme Profesional - Local)",
    "am_adam": "Adam (Kokoro EN-US / Cálido y Claro - Local)",
    "bf_emma": "Emma (Kokoro EN-UK / Sofisticada - Local)",
    "bm_george": "George (Kokoro EN-UK / Elegante - Local)",
}

EDGE_TTS_VOICES = {
    "es-ES-ElviraNeural": "Elvira (Edge-TTS ES - Premium)",
    "es-MX-DaliaNeural": "Dalia (Edge-TTS MX - Natural)",
    "es-MX-JorgeNeural": "Jorge (Edge-TTS MX - Masculino)",
    "en-US-AriaNeural": "Aria (Edge-TTS US)",
    "en-US-GuyNeural": "Guy (Edge-TTS US)",
}

ALL_VOICES = {**KOKORO_VOICES, **EDGE_TTS_VOICES}

# Mapa de traducciones — re-exportado vía agent_context_resolver (compatibilidad)
TRANSLATION_MAP = {}  # deprecated; usar agent_context_resolver.TRANSLATION_MAP


class TTSRequest(BaseModel):
    text: str
    voice: str = "ef_dora"
    rate: str = "+0%"
    pitch: str = "+0Hz"
    speed: float = 1.0


@router.post("/speak")
async def text_to_speech(req: TTSRequest):
    text = req.text[:4000].strip()
    if not text:
        raise HTTPException(status_code=400, detail="Texto vacío")

    voice = req.voice or "ef_dora"

    # Si es voz Kokoro (o no especificada válida), usar Kokoro ONNX local
    if voice in KOKORO_VOICES or voice.startswith(("ef_", "em_", "af_", "am_", "bf_", "bm_")):
        from lib.audiobooks_engine.kokoro_manager import KokoroOnnxManager
        km = KokoroOnnxManager()
        
        loop = asyncio.get_event_loop()
        temp_out = tempfile.mktemp(suffix=".mp3")
        try:
            success = await loop.run_in_executor(
                None,
                lambda: km.synthesize(text=text, output_path=temp_out, voice=voice, speed=req.speed)
            )
            if not success or not os.path.exists(temp_out):
                raise HTTPException(status_code=500, detail="Error en síntesis Kokoro ONNX")
            
            with open(temp_out, "rb") as f:
                audio_bytes = f.read()
            
            return Response(
                content=audio_bytes,
                media_type="audio/mpeg",
                headers={
                    "Content-Disposition": f'inline; filename="kokoro_{voice}.mp3"',
                    "Cache-Control": "no-cache",
                    "X-Engine": "Kokoro-82M-ONNX"
                }
            )
        finally:
            if os.path.exists(temp_out):
                try:
                    os.remove(temp_out)
                except Exception:
                    pass

    # Si es voz Edge-TTS, streaming tradicional
    try:
        import edge_tts
    except ImportError:
        raise HTTPException(status_code=503, detail="edge-tts no instalado")

    edge_voice = voice if voice in EDGE_TTS_VOICES else "es-MX-DaliaNeural"

    async def generate_stream():
        communicate = edge_tts.Communicate(text=text, voice=edge_voice, rate=req.rate, pitch=req.pitch)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                yield chunk["data"]

    return StreamingResponse(generate_stream(), media_type="audio/mpeg",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "X-Engine": "Edge-TTS"})


@router.get("/voices")
async def list_voices():
    from lib.voice_clone_engine import VoiceCloneManager
    custom_cloned = []
    try:
        custom_cloned = [v for v in VoiceCloneManager.list_voices() if v.get("type") == "cloned_profile"]
    except Exception:
        pass

    return {
        "voices": ALL_VOICES + custom_cloned,
        "kokoro_voices": KOKORO_VOICES,
        "edge_voices": EDGE_TTS_VOICES,
        "cloned_voices": custom_cloned,
        "default": "ef_dora"
    }


def load_skill_file(file_path: str) -> str:
    """Lee un archivo markdown de skill y extrae su contenido de instrucciones."""
    if not os.path.exists(file_path):
        return ""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                return parts[2].strip()
        return content.strip()
    except Exception as e:
        logger.error(f"Error cargando archivo de skill {file_path}: {e}")
        return ""


_CATALOG_CACHE: dict[str, Any] = {"data": None, "ts": 0.0}
_CATALOG_TTL = 120.0  # segundos


def get_full_catalog_from_db() -> list[dict]:
    """Consulta el catálogo completo desde la base de datos (con caché TTL corta)."""
    now = time.time()
    cached = _CATALOG_CACHE.get("data")
    if cached is not None and (now - _CATALOG_CACHE.get("ts", 0.0)) < _CATALOG_TTL:
        return cached
    try:
        from database import SessionLocal
        from db_models import MediaCatalog
        db = SessionLocal()
        try:
            # Nota: el modelo usa 'is_public', no 'is_active'
            items = db.query(MediaCatalog).filter(MediaCatalog.is_public == True).all()
            result = []
            for item in items:
                creator_slug = item.creator_slug or ""
                # Resolver idioma desde el creador (cache manual por slug)
                item_lang = ""
                if creator_slug:
                    cm = get_creator_meta_by_slug(creator_slug)
                    item_lang = cm.get("language", "") or ""
                result.append({
                    "id": item.id,
                    "title": item.title or "",
                    "artist": item.artist or "",
                    "album": item.album or "",          # propiedad calculada del modelo
                    "genre": item.genre or "",
                    "type": item.type or "",
                    "creator": item.creator or "",
                    "creator_slug": creator_slug,
                    "language": item_lang,
                    "price_usd": float(item.price_usd or 0.99),
                    "price_tokens": int(item.price_tokens or 1),
                    "album_art_path": item.album_art_path or "",
                    "lyrics_path": item.lyrics_path or "",
                    "description": item.description or "",
                    "file_path": item.file_path or "",
                    "stream_url": item.stream_url or "",
                    "duration_seconds": item.duration_seconds or 0,
                })
            _CATALOG_CACHE["data"] = result
            _CATALOG_CACHE["ts"] = time.time()
            return result
        finally:
            db.close()
    except Exception as e:
        logger.error(f"No se pudo consultar DB: {e}")
        return _CATALOG_CACHE.get("data") or []


def read_lyrics_content(lyrics_path: str, max_chars: int = 2000) -> str:
    """Lee el contenido de un archivo de letras."""
    if not lyrics_path:
        return ""
    try:
        # Rutas relativas → absolutas
        # El archivo está en backend/routers/tts_chat.py, por eso
        # dirname(__file__)         → backend/routers
        # dirname(dirname(__file__)) → backend
        # dirname(x3)               → MediaSuite (raíz del proyecto)
        # Los lyrics_path en DB son relativos a la raíz del proyecto (ej: media_library/MusicPlaylist/...)
        if not os.path.isabs(lyrics_path):
            # Raíz del proyecto MediaSuite (un nivel sobre backend/)
            project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            full_path = os.path.join(project_root, lyrics_path)
            if os.path.exists(full_path):
                lyrics_path = full_path
            else:
                # Fallback: intentar desde backend/ por compatibilidad
                backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                lyrics_path = os.path.join(backend_dir, lyrics_path)

        # Si la ruta apunta a un archivo stub (<200 bytes) o no existe, buscar el archivo con letra completa
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        if not os.path.exists(lyrics_path) or (os.path.isfile(lyrics_path) and os.path.getsize(lyrics_path) < 200):
            dir_name = os.path.dirname(lyrics_path)
            base_name = os.path.basename(lyrics_path)
            if os.path.exists(dir_name):
                import re as _re
                m = _re.match(r'^[12]_(?:[0-9]+_)?(.*)\.txt$', base_name)
                if m:
                    core_name = m.group(1).replace('_', ' ').lower().strip()
                    candidates = []
                    for f in os.listdir(dir_name):
                        if not f.endswith('.txt'):
                            continue
                        fp = os.path.join(dir_name, f)
                        try:
                            sz = os.path.getsize(fp)
                        except OSError:
                            continue
                        if sz < 200:
                            continue
                        fm = _re.match(r'^[12]_(?:[0-9]+_)?(.*)\.txt$', f)
                        if fm:
                            fcore = fm.group(1).replace('_', ' ').lower().strip()
                            if core_name == fcore:
                                candidates.append((10, sz, fp))
                            elif core_name in fcore or fcore in core_name:
                                candidates.append((5, sz, fp))
                        else:
                            fclean = f[:-4].replace('_', ' ').lower().strip()
                            if core_name in fclean:
                                candidates.append((3, sz, fp))
                    if candidates:
                        candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
                        lyrics_path = candidates[0][2]

        if os.path.exists(lyrics_path):
            with open(lyrics_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read(max_chars)
            return content.strip()
    except Exception as e:
        logger.debug(f"No se pudo leer letras: {e}")
    return ""


async def _call_chat_llm(
    system_prompt: str,
    user_message: str,
    history: Optional[list] = None,
    timeout: float = 14.0,
) -> str:
    """Invoca un LLM de baja latencia con cascada de proveedores.

    Patrón reutilizado de aigovcorex/aikrofy: cliente nativo (sin langchain pesado),
    timeout estricto por intento (asyncio.wait_for) y max_retries=0 para evitar
    cuelgues. Cadena: Groq gpt-oss-120b (~0.4s) → OpenAI gpt-4o-mini (~1s) →
    gpt-5-nano. Devuelve "" si ningún proveedor responde (el caller cae a heurísticas).
    """
    msgs: list[dict] = [{"role": "system", "content": system_prompt}]
    if history:
        for h in history[-6:]:
            sender = (h.get("sender") or "user").lower()
            role = "assistant" if sender in ("bot", "assistant", "saori", "agent") else "user"
            txt = (h.get("text") or "").strip()
            if txt:
                msgs.append({"role": role, "content": txt})
    msgs.append({"role": "user", "content": user_message})

    from config import OPENAI_API_KEY, GROQ_API_KEY

    async def _groq() -> str:
        from groq import AsyncGroq
        client = AsyncGroq(api_key=GROQ_API_KEY, timeout=timeout, max_retries=0)
        r = await client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=msgs,
            temperature=0.6,
            max_tokens=800,
        )
        return (r.choices[0].message.content or "").strip()

    async def _openai(model: str) -> str:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=OPENAI_API_KEY, timeout=timeout, max_retries=0)
        kwargs: dict[str, Any] = {"model": model, "messages": msgs}
        if model.startswith("gpt-5"):
            kwargs["max_completion_tokens"] = 800
        else:
            kwargs["temperature"] = 0.6
            kwargs["max_tokens"] = 800
        r = await client.chat.completions.create(**kwargs)
        return (r.choices[0].message.content or "").strip()

    attempts: list[tuple[str, Any]] = []
    if GROQ_API_KEY:
        attempts.append(("groq/gpt-oss-120b", _groq))
    if OPENAI_API_KEY:
        attempts.append(("openai/gpt-4o-mini", lambda: _openai("gpt-4o-mini")))
        attempts.append(("openai/gpt-5-nano", lambda: _openai("gpt-5-nano")))

    for name, fn in attempts:
        t0 = time.time()
        try:
            text = await asyncio.wait_for(fn(), timeout=timeout)
            if text:
                logger.info(f"Saori LLM {name} OK en {time.time() - t0:.2f}s")
                return text
        except Exception as e:
            logger.warning(f"Saori LLM {name} falló en {time.time() - t0:.2f}s: {type(e).__name__}: {str(e)[:120]}")
    return ""


def _get_item_language(item: dict) -> str:
    """Deriva el idioma de un item del catálogo desde el metadato del creador."""
    lang = item.get("language", "")
    if lang:
        return lang
    creator_slug = item.get("creator_slug", "")
    if creator_slug:
        meta = get_creator_meta_by_slug(creator_slug)
        lang = meta.get("language", "")
    return lang or "es"


def fuzzy_search(query: str, catalog: list[dict], top_n: int = 5, threshold: float = 0.18) -> list[dict]:
    """Wrapper retrocompatible — búsqueda global sin scope de creador."""
    dummy_ctx = AgentContext(scope="global", catalog_subset=catalog, global_catalog=catalog)
    return scoped_fuzzy_search(
        query, catalog, dummy_ctx, top_n=top_n, threshold=threshold, read_lyrics_fn=None
    )


# ─── Modelo de request mejorado ──────────────────────────────────────────────

class AgentChatRequest(BaseModel):
    message: str
    catalog_context: Optional[list] = None  # fallback si no hay DB
    current_track: Optional[dict] = None    # track actualmente reproduciéndose
    conversation_history: Optional[list] = None  # historial reciente para contexto
    user_language: str = "es"
    current_path: Optional[str] = None      # ruta actual (/@slug o /channel/slug)
    creator_slug: Optional[str] = None
    creator_name: Optional[str] = None
    creator_type: Optional[str] = None    # music | documentary | educational
    creator_language: Optional[str] = None
    # Contexto de copiloto (rol, página/módulo/sección y estado de UI)
    user_role: Optional[str] = None        # artist | fan | guest
    page_context: Optional[dict] = None    # {module, section, title, path}
    ui_state: Optional[dict] = None        # estado de la interfaz (tab activo, filtros)


# ─── Endpoint principal del agente ───────────────────────────────────────────

@router.post("/agent-chat")
async def agent_chat(req: AgentChatRequest, request: Request):
    raw_message = req.message.strip()
    message_lower = raw_message.lower()
    current_track = req.current_track or {}
    action = None
    action_data: dict[str, Any] = {}
    response_text = ""

    # Intentar cargar catálogo completo desde DB; fallback al contexto del frontend
    catalog = get_full_catalog_from_db()
    if not catalog:
        catalog = req.catalog_context or []

    # La plataforma es estrictamente musical: nunca exponer audiolibros a Saori.
    catalog = music_only(catalog)

    # ── Contexto de cuenta verificado (rol, cifras reales, página actual) ──
    account: dict[str, Any] = {"role": "guest", "authenticated": False,
                               "prompt_block": "", "page_line": "", "artist": {}, "fan": {}}
    _acc_db = None
    try:
        from database import SessionLocal
        _acc_db = SessionLocal()
        account = build_account_context(
            request,
            _acc_db,
            page_context=req.page_context,
            role_hint=req.user_role,
        )
    except Exception as acc_err:
        logger.warning(f"No se pudo construir contexto de cuenta para Saori: {acc_err}")
    finally:
        if _acc_db is not None:
            try:
                _acc_db.close()
            except Exception:
                pass

    account_role = account.get("role") or "guest"
    page_line = account.get("page_line") or ""

    # ── Resolver contexto de creador y scope de búsqueda ──
    ctx = resolve_agent_context(
        raw_message,
        catalog,
        current_path=req.current_path,
        creator_slug=req.creator_slug,
        creator_name=req.creator_name,
        creator_type=req.creator_type,
    )
    scoped_catalog = ctx.catalog_subset

    # ── Palabras clave de intención ──
    play_kw = PLAY_KEYWORDS
    buy_kw = ["comprar", "descargar", "adquirir", "buy", "download", "quiero comprar",
              "me la compro", "quiero descargar"]
    filter_kw = ["muéstrame", "filtrar", "mostrar", "ver canciones",
                 "ver álbumes", "listar", "que canciones", "que tienes",
                 "catalogo", "catálogo", "lista de"]
    search_kw = ["busca", "buscar", "encuentra", "busco", "dame"]
    lyrics_kw = ["letra", "letras", "lyrics", "dice la cancion", "dice la canción",
                 "qué dice", "que dice", "dime la letra"]
    meaning_kw = ["significa", "significado", "trata", "habla de", "mensaje",
                  "qué trata", "de que trata", "sobre qué", "interpretacion",
                  "explicar", "explica", "que quiere decir", "que habla",
                  "de que habla", "tema de", "concepto"]
    greet_kw = ["hola", "hi", "hello", "buenas", "buenos", "hey", "saludo"]
    help_kw = ["ayuda", "help", "qué puedes", "que puedes"]

    # Versión sin acentos ni signos para detección robusta de intención
    # (ej: "explícame" → "explicame", "recomiéndame" → "recomiendame")
    message_norm = normalize(raw_message)

    is_play_intent = any(k in message_lower for k in play_kw) or any(k in message_norm for k in play_kw)
    is_buy_intent = any(k in message_lower for k in buy_kw)
    is_filter_intent = any(k in message_lower for k in filter_kw) and not is_play_intent
    is_search_intent = any(k in message_lower for k in search_kw) and not is_play_intent
    is_lyrics_intent = any(k in message_norm for k in lyrics_kw)
    is_meaning_intent = any(k in message_norm for k in meaning_kw)
    is_greet = any(k in message_norm for k in greet_kw) and len(raw_message) < 30
    is_help = any(k in message_norm for k in help_kw) and not is_play_intent
    is_recommend_intent = any(k in message_norm for k in ["recomiend", "sugiere", "sugerencia", "sugerime", "me recomiendas", "que me recomiendes", "que me guste", "para mi", "algo bueno", "que valga la pena", "algo que escuchar", "que puedo escuchar", "ponme algo"])
    is_recommendation_pick = False  # se activa cuando best_match se asigna por recomendación, no por título
    
    dj_kw = ["dj", "stream dj", "deck", "plato", "crossfade", "mezcla", "mezclar", "autodj", "auto-dj", "fade", "ecualiza", "graves", "agudos", "pitch", "cue"]
    is_dj_intent = any(k in message_lower for k in dj_kw)

    # Defaults seguros: se recalculan en el resolvedor agéntico cuando aplica.
    # Evita NameError si el mensaje es muy corto y no entra en ese bloque.
    target_lang: Optional[str] = None
    target_genre: Optional[str] = None
    target_version: Optional[str] = None

    # ── Copiloto de cuenta: análisis preciso y navegación determinista ──
    # Se resuelve antes de la búsqueda difusa para evitar respuestas genéricas
    # o alucinaciones cuando el usuario pregunta por su cuenta o pide abrir algo.
    if account_role in ("artist", "fan") and wants_account_analysis(raw_message):
        if account_role == "artist":
            response_text = artist_analysis_text(account.get("artist") or {})
        else:
            response_text = fan_analysis_text(account.get("fan") or {})
        nav = detect_navigation_intent(raw_message, account_role) or {}
        return JSONResponse({
            "response": response_text,
            "action": "navigate" if nav.get("path") else None,
            "action_data": nav if nav.get("path") else {},
            "account_role": account_role,
            "catalog_size": len(catalog),
        })

    nav_intent = detect_navigation_intent(raw_message, account_role)
    if nav_intent and not is_play_intent:
        path = nav_intent.get("path") or ""
        section = nav_intent.get("section") or ""
        artist_facts = account.get("artist") or {}
        if account_role == "artist" and not path and artist_facts.get("slug"):
            path = f"/channel/{artist_facts['slug']}"
            response_text = (
                f"Abriendo tu canal público en {path}. Desde ahí puedes compartir tu música "
                f"y tu enlace de venta directo por PayPal."
            )
        elif section:
            label = {
                "overview": "Estudio & Analítica",
                "catalog": "Mi Catálogo",
                "paypal": "PayPal Marketplace & Retiros",
                "agent": "Agente IA + WhatsApp & Telegram",
                "community": "Comunidad, Votaciones & Fans",
            }.get(section, section)
            response_text = f"Abriendo {label} en tu panel de artista."
            if section == "paypal" and artist_facts:
                response_text += (
                    f" Tu saldo disponible es ${float(artist_facts.get('available_balance_usd') or 0):,.2f} USD "
                    f"y tu modo de retiro es {artist_facts.get('payout_mode', 'manual')}."
                )
        elif path.startswith("/?sandbox"):
            response_text = "Activando el modo Sandbox para que puedas probar el checkout sin dinero real."
        elif path == "/portal":
            response_text = "Abriendo tu portal de fan con tus compras, descargas y biblioteca."
        else:
            response_text = "Abriendo el inicio para explorar el catálogo musical."
        return JSONResponse({
            "response": response_text,
            "action": "navigate",
            "action_data": {"path": path, "section": section, "url": path},
            "account_role": account_role,
            "catalog_size": len(catalog),
        })


    # ── Buscar canción mencionada en el mensaje (scope acotado) ──
    search_catalog = scoped_catalog
    search_ctx = ctx
    # El resolvedor agéntico (más abajo) hace su propia búsqueda multi-estrategia
    # cuando la intención es reproducir/buscar o el mensaje es largo; evitamos una
    # pasada fuzzy redundante en ese caso (ahorra ~1.4s por turno).
    will_run_agent_search = is_play_intent or is_search_intent or len(raw_message) > 5
    if will_run_agent_search:
        search_results: list[dict] = []
        best_match = None
    else:
        search_results = scoped_fuzzy_search(
            raw_message, search_catalog, search_ctx, top_n=5, threshold=0.18, read_lyrics_fn=None
        )
        best_match = search_results[0] if search_results else None

    # ── Sistema Agéntico de Búsqueda Multi-Paso (Agent Search Resolver) ──
    # Si la intención es reproducir o buscar, activamos el resolvedor agéntico
    if is_play_intent or is_search_intent or len(raw_message) > 5:
        # 1. Extraer pistas clave del mensaje (género, idioma, versión)
        target_genre = None
        if "rap" in message_lower:
            target_genre = "rap"
        elif "afro" in message_lower or "afrobeats" in message_lower:
            target_genre = "afrobeats"
        elif "dancehall" in message_lower:
            target_genre = "dancehall"
            
        is_spanish_requested = any(w in message_lower for w in ["espanol", "español", "castellano", "epsnaol", "epsnol", "espan", "spañ", "spanish", "esp", "castel"])
        is_english_requested = any(w in message_lower for w in ["ingles", "inglés", "english", "engli", "ingl", "ing", "eng", "night version", "day version"])
        target_lang = "es" if is_spanish_requested else ("en" if is_english_requested else None)

        # ── Forzar búsqueda global si el idioma pedido difiere del creador activo ──
        search_catalog = scoped_catalog
        search_ctx = ctx
        if target_lang and ctx.active_creator_slug:
            creator_lang = ctx.active_creator_meta.get("language", "")
            if creator_lang and target_lang != creator_lang:
                search_catalog = catalog
                search_ctx = AgentContext(
                    scope="global",
                    catalog_subset=catalog,
                    global_catalog=catalog,
                    content_type=ctx.content_type,
                    scope_label=f"toda la plataforma (búsqueda en {'español' if target_lang == 'es' else 'inglés'})",
                    expand_reason=(
                        f"El usuario pidió contenido en {'español' if target_lang == 'es' else 'inglés'} "
                        f"y el canal activo ({ctx.active_creator_name}) está en "
                        f"{'español' if creator_lang == 'es' else 'inglés'}. "
                        f"Buscando en toda la plataforma."
                    ),
                )

        target_version = None
        if any(x in message_lower for x in ["version dia", "versión día", "version de dia", "version del dia", "dia", "día"]):
            target_version = "day"
        elif any(x in message_lower for x in ["version noche", "versión noche", "version de noche", "version del noche", "noche"]):
            target_version = "night"

        # 2. Obtener consulta de música limpia eliminando ruido conversacional
        clean_music_query = raw_message
        noise_phrases = [
            "cancion que se llama como acabando",
            "canción que se llama como acabando",
            "no pero me refiero a una cancion que se llama",
            "no pero me refiero a una canción que se llama",
            "no me refiero a una cancion que se llama",
            "no me refiero a una canción que se llama",
            "puedes buscar una canacin que se llama",
            "puedes buscar una cancion que se llama",
            "reproduzca la cancion que se llama",
            "reproduce la cancion que se llama",
            "reproducir la cancion que se llama",
            "la que yo te digo es en espanol",
            "la que yo te digo es en español",
            "la que yo te digo es",
            "quiero la que se llama",
            "quiero escuchar la",
            "quiero escuchar",
            "reproduce la de",
            "reproduce la",
            "reproducir la",
            "reproduce",
            "quiero la",
            "quiero oir",
            "que suene",
            "escuchame",
            "toca",
            "play",
            "ponme",
            "pon",
            "si,",
            "si "
        ]
        for skip in noise_phrases:
            if skip in message_lower:
                idx = message_lower.find(skip) + len(skip)
                clean_music_query = raw_message[idx:].strip().lstrip(",. ")
                break

        # Limpiar palabras descriptivas del query para buscar el núcleo del título
        clean_music_query = re.sub(r"\b(es de rap|que es de rap|de rap|version dia|version noche|dia|noche|por favor|gracias|inmediatamente|algo asi|algo así|puedes buscarla y reproducirla)\b.*$", "", clean_music_query, flags=re.IGNORECASE).strip()
        
        # Correcciones fonéticas o conceptuales comunes del curador inteligente
        # Ej: "acabando zanjas" -> "cavar zanjas", "cavar zanja" -> "cavar zanjas"
        clean_query_norm = normalize(clean_music_query)
        if "acabando zanja" in clean_query_norm or "cavar zanja" in clean_query_norm or "cavando zanja" in clean_query_norm:
            clean_music_query = "cavar zanjas"

        # 3. Lanzar búsquedas bajo diferentes estrategias
        strategy_results = []
        
        # Estrategia A: Búsqueda del título puro (Fuzzy)
        if len(clean_music_query) >= 3:
            strategy_results.extend(scoped_fuzzy_search(
                clean_music_query, search_catalog, search_ctx, top_n=5, threshold=0.10, read_lyrics_fn=None
            ))
        # Solo añadir la pasada del mensaje crudo si aporta (evita búsqueda duplicada)
        if normalize(clean_music_query) != message_norm:
            strategy_results.extend(scoped_fuzzy_search(
                raw_message, search_catalog, search_ctx, top_n=4, threshold=0.12, read_lyrics_fn=None
            ))

        # 4. Agente de Scoring y Re-Ranking: Evaluar cada candidato según filtros específicos del usuario
        scored_candidates = []
        seen_ids = set()
        
        for item in strategy_results:
            if item["id"] in seen_ids:
                continue
            seen_ids.add(item["id"])
            
            # Puntuación base combinada de título, artista y descripción
            allow_cross = search_ctx.scope == "global"
            score = score_match(
                expand_with_translations(tokenize(clean_music_query), allow_cross_language=allow_cross),
                item.get("title", ""),
                clean_music_query,
            )
            
            # Boost por coincidencia de idioma
            item_title_norm = normalize(item.get("title", ""))
            item_desc_norm = normalize(item.get("description", ""))
            item_artist_norm = normalize(item.get("artist", ""))
            item_creator_norm = normalize(item.get("creator", ""))
            item_album_norm = normalize(item.get("album", ""))
            
            # Detectar idioma del item por el creador (fuente única de verdad)
            item_language = _get_item_language(item)
            is_spanish_item = item_language == "es"
            is_english_item = item_language == "en"
            
            if target_lang == "es" and is_spanish_item:
                score += 0.40
            elif target_lang == "en" and is_english_item:
                score += 0.40
            elif target_lang is None and is_spanish_item:
                # Si el usuario busca en español por defecto ("llama violeta") preferir español
                if any(w in message_lower for w in ["llama", "violeta", "corriente", "yo soy"]):
                    score += 0.25
            elif target_lang == "es" and is_english_item:
                score -= 0.15  # Penalizar si pide español y es inglés
            elif target_lang == "en" and is_spanish_item:
                score -= 0.15  # Penalizar si pide inglés y es español

            # Boost por coincidencia de género (ej: rap)
            if target_genre:
                if target_genre in item_artist_norm or target_genre in item_desc_norm or target_genre in normalize(item.get("genre", "")):
                    score += 0.30
                    
            # Boost por versión (día vs noche)
            if target_version == "day" and "day version" in item_title_norm:
                score += 0.25
            elif target_version == "night" and "night version" in item_title_norm:
                score += 0.25
                
            # Penalizar si busca día y es noche o viceversa
            if target_version == "day" and "night version" in item_title_norm:
                score -= 0.20
            elif target_version == "night" and "day version" in item_title_norm:
                score -= 0.20

            scored_candidates.append((score, item))

        # Ordenar candidatos re-evaluados de mayor a menor puntuación
        scored_candidates.sort(key=lambda x: x[0], reverse=True)
        
        # Actualizar resultados con el ranking inteligente del agente
        search_results = [item for score, item in scored_candidates if score >= 0.12]
        best_match = search_results[0] if search_results else None
        best_match_score = scored_candidates[0][0] if scored_candidates else 0.0

        # Idioma implícito para recomendaciones: el del usuario si no se pidió uno.
        rec_lang = target_lang or (req.user_language if req.user_language in ("es", "en") else None)
        # Preferir canciones salvo que el usuario pida explícitamente audiolibro/libro
        # o esté dentro de un canal de audiolibros.
        wants_audiobook = any(
            w in message_norm for w in ["audiolibro", "audiobook", "libro", "podcast", "resumen", "documental", "capitulo"]
        )
        prefer_song = (not wants_audiobook) and ctx.content_type != "audiobook"

        def _prefer_songs(pool: list[dict]) -> list[dict]:
            if not prefer_song:
                return pool
            songs = [i for i in pool if (i.get("type") or "") == "song"]
            return songs or pool

        # Si el fuzzy search no encontró nada, o es una recomendación sin título claro
        # (score bajo), poblar con candidatos filtrados por idioma/género/canción.
        force_recommend = is_recommend_intent and best_match_score < 0.5
        if force_recommend or (not best_match and (is_recommend_intent or target_lang or target_genre)):
            agent_candidates = search_catalog
            if target_lang:
                agent_candidates = [i for i in agent_candidates if _get_item_language(i) == target_lang]
            elif is_recommend_intent and rec_lang:
                agent_candidates = [i for i in agent_candidates if _get_item_language(i) == rec_lang] or agent_candidates
            if target_genre:
                agent_candidates = [i for i in agent_candidates if target_genre in (i.get("genre") or "").lower()]

            agent_candidates = _prefer_songs(agent_candidates)

            # Fallback global si no se encuentra en el catálogo filtrado
            if not agent_candidates and target_lang:
                agent_candidates = [i for i in catalog if _get_item_language(i) == target_lang]

            if agent_candidates:
                search_results = agent_candidates[:5]
                best_match = agent_candidates[0]
                is_recommendation_pick = True

        # Fallback "la que sea" / sin título específico: si el usuario quiere reproducir
        # pero no hay ninguna coincidencia, auto-seleccionar una pista disponible.
        if not best_match and is_play_intent:
            fallback_pool = (
                [i for i in scoped_catalog if _get_item_language(i) == rec_lang]
                if (target_lang or rec_lang) else scoped_catalog
            )
            if not fallback_pool:
                fallback_pool = scoped_catalog
            fallback_pool = _prefer_songs(fallback_pool)
            if fallback_pool:
                best_match = fallback_pool[0]
                search_results = fallback_pool[:5]
                is_recommendation_pick = True

        # Si el usuario no pidió audiolibro y el match resultó ser uno (fuzzy débil),
        # preferir una canción disponible del idioma pedido.
        if (
            best_match
            and prefer_song
            and is_play_intent
            and (best_match.get("type") or "") != "song"
        ):
            song_pool = [
                i for i in (search_catalog or scoped_catalog)
                if (i.get("type") or "") == "song"
                and (not (target_lang or rec_lang) or _get_item_language(i) == (target_lang or rec_lang))
            ]
            if song_pool:
                best_match = song_pool[0]
                search_results = song_pool[:5]
                is_recommendation_pick = True

    # ── Interceptar menciones de creadores para navegar a su perfil ──
    matched_creator_slug = None
    is_nav_or_play = is_play_intent or is_search_intent or any(
        w in message_lower for w in ["ir a", "mostrar", "ver", "redirec", "pantalla", "página", "pagina", "creador", "artista"]
    )

    if is_nav_or_play:
        matched_creator_slug = resolve_creator_from_message(raw_message)
        # Si el usuario ya está en ese canal, no redirigir — solo reproducir/recomendar aquí
        if matched_creator_slug and matched_creator_slug == ctx.active_creator_slug:
            matched_creator_slug = None

    if matched_creator_slug:
        creator_name = SLUG_TO_CREATOR.get(matched_creator_slug, matched_creator_slug)
        creator_songs = [
            item for item in catalog
            if item.get("creator_slug") == matched_creator_slug
            or item.get("creator") == creator_name
        ]
        autoplay_track = creator_songs[0] if creator_songs else None
            
        action = "navigate_creator"
        action_data = {"slug": matched_creator_slug}
        
        if autoplay_track:
            action_data["autoplay_track"] = autoplay_track
            response_text = (
                f"Entendido. Te he redirigido a la sección de {creator_name} en exito.cyou/@{matched_creator_slug} "
                f"para explorar todo su contenido. Para comenzar, estamos reproduciendo su canción {autoplay_track['title']}. ¡Disfrútalo!"
            )
        else:
            response_text = (
                f"Entendido. Te he redirigiendo a la sección de {creator_name} en exito.cyou/@{matched_creator_slug}."
            )

            
        return JSONResponse({
            "response": response_text,
            "action": action,
            "action_data": action_data,
            "catalog_size": len(catalog),
        })

    # ── Procesar intenciones ──

    # Usar LLM para procesar de forma inteligente si es una pregunta conversacional, emocional, de traducción o explicación
    # Palabras clave que indican una conversación o pregunta abstracta
    llm_kw = ["traduc", "tradus", "explic", "consept", "tenant", "multitenant", "empresa", "recomiend", "emocion", "momento del dia", 
              "desafio", "autodescubr", "meta", "objetivo", "humana", "triste", "alegre", "feliz", "motiv", "estres", "ansied",
              "puedes", "como", "por que", "quien", "ayuda", "dime", "cuenta", "significa"]

    # Activar LLM para preguntas conversacionales, semánticas y explicativas
    # También activar si el usuario quiere reproducir pero no hay coincidencia (best_match=None)
    use_llm = (
        not is_play_intent and not is_greet and not is_help
        and (
            is_meaning_intent or is_lyrics_intent or is_recommend_intent
            or any(k in message_lower for k in llm_kw)
            or (not is_filter_intent and not is_search_intent and len(raw_message) > 10)
        )
    ) or (is_play_intent and not best_match)
    
    # ── Intención de Stream DJ / Mezclador Inteligente en Tiempo Real ──
    if is_dj_intent:
        deck_target = "B" if ("deck b" in message_lower or "plato b" in message_lower or "canal b" in message_lower or " al b" in message_lower) else "A"

        # 1. Abrir o mostrar Stream DJ
        if any(k in message_lower for k in ["abre", "abrir", "modo dj", "inicia dj", "entra a dj", "ir a dj", "stream dj", "mostrar dj", "pon el dj"]):
            return JSONResponse({
                "response": "¡Abriendo el Stream DJ Cloud Studio! La cabina dual deck está lista para mezclar con baja latencia y Web Audio.",
                "action": "open_dj",
                "action_data": {},
                "catalog_size": len(catalog),
            })

        # 2. Crossfade dinámico
        if any(k in message_lower for k in ["crossfade", "fade", "pasa al", "transicion", "transición", "cruza"]):
            target_val = 1.0 if ("b" in message_lower or "derech" in message_lower) else (0.0 if ("a" in message_lower or "izquierd" in message_lower) else 0.5)
            target_name = "Deck B" if target_val == 1.0 else ("Deck A" if target_val == 0.0 else "Centro")
            return JSONResponse({
                "response": f"Ejecutando crossfade suave hacia el {target_name} con curva de potencia constante...",
                "action": "dj_crossfade",
                "action_data": {"target": target_val, "duration_sec": 4},
                "catalog_size": len(catalog),
            })

        # 3. Auto-DJ Mix programado
        if any(k in message_lower for k in ["auto dj", "autodj", "sesion dj", "sesión dj", "mezcla dos", "hazme una mezcla"]):
            track_a = best_match or (catalog[0] if catalog else None)
            track_b = (catalog[1] if len(catalog) > 1 else track_a)
            return JSONResponse({
                "response": f"¡Sesión Auto-DJ activada! He cargado '{track_a.get('title', 'Track A')}' en el Deck A y '{track_b.get('title', 'Track B')}' en el Deck B con transición automática programada.",
                "action": "dj_autodj",
                "action_data": {"trackA": track_a, "trackB": track_b},
                "catalog_size": len(catalog),
            })

        # 4. Cargar track en Deck A o Deck B
        if best_match or any(k in message_lower for k in ["carga", "cargar", "pon", "monta", "deck", "plato"]):
            track_to_load = best_match or (catalog[0] if catalog else None)
            if track_to_load:
                return JSONResponse({
                    "response": f"He cargado '{track_to_load.get('title')}' en el Deck {deck_target}. Está sincronizado y listo para mezclar.",
                    "action": "dj_load",
                    "action_data": {"deck": deck_target, "item": track_to_load},
                    "catalog_size": len(catalog),
                })

    # ── Letras: mostrar directamente si solo piden ver la letra (rápido y fiable) ──
    # Para "explícame la letra" (meaning + lyrics) se delega al LLM con la letra inyectada.
    if is_lyrics_intent and not is_meaning_intent:
        track_to_show = best_match or (current_track if current_track.get("id") else None)
        if track_to_show:
            title = track_to_show.get("title", "la canción actual")
            lyrics_content = read_lyrics_content(track_to_show.get("lyrics_path", ""), max_chars=1200)
            if lyrics_content:
                sample = "\n".join([l for l in lyrics_content.split("\n") if l.strip()][:12])
                return JSONResponse({
                    "response": f'Letras de "{title}":\n\n{sample}\n\nLetra completa disponible sincronizada en el reproductor.',
                    "action": "show_lyrics",
                    "action_data": {"item": track_to_show},
                    "catalog_size": len(catalog),
                })
            return JSONResponse({
                "response": f'No encontré el archivo de letras de "{title}", pero puedes ver la letra sincronizada en el reproductor si está disponible.',
                "action": "show_lyrics_current",
                "action_data": {},
                "catalog_size": len(catalog),
            })

    # ── Respuesta inmediata de reproducción / recomendación (sin LLM) ──
    # Si la intención es clara de reproducir o recomendar y ya tenemos el mejor track,
    # reproducir de inmediato (no mostrar listas ni quedarse mudo).
    if best_match and not is_filter_intent and not is_lyrics_intent and (is_play_intent or is_recommend_intent):
        lang_label = {"es": "en español", "en": "en inglés"}.get(target_lang or "", "")
        genre_label = f" de {target_genre}" if target_genre else ""
        track_title = best_match.get("title", "la canción")
        creator_label = best_match.get("creator", "")
        verb = "Te recomiendo" if (is_recommend_intent and not is_play_intent) else "Reproduciendo"
        response_text = (
            f"{verb}: {track_title}"
            + (f" de {creator_label}" if creator_label else "")
            + (f" — una pista {lang_label}{genre_label} seleccionada para ti." if (lang_label or genre_label) else ".")
        )
        return JSONResponse({
            "response": response_text,
            "action": "play",
            "action_data": {"item": best_match, "alternatives": search_results[1:5]},
            "catalog_size": len(catalog),
        })

    if use_llm:
        try:
            # Motor LLM nativo con cascada rápida y fail-fast (Groq → OpenAI).
            # Se evita langchain (retries + prompts gigantes) que causaba cuelgues.
            if True:
                path_str = req.current_path or ""
                # Usar el catálogo correcto según si hay override de idioma
                is_lang_override = search_ctx is not ctx
                # Ordenar catálogo priorizando idioma solicitado (target_lang) y creador activo para evitar truncado por límite de 20
                raw_catalog_subset = list(search_catalog if is_lang_override else scoped_catalog)
                
                def final_sort_key(item: dict) -> tuple[int, int, str]:
                    lang_match = 0
                    if target_lang:
                        lang_match = 0 if _get_item_language(item) == target_lang else 1
                    
                    creator_match = 1
                    if ctx.active_creator_name:
                        if item.get("creator") == ctx.active_creator_name or item.get("creator_slug") == ctx.active_creator_slug:
                            creator_match = 0
                            
                    return (lang_match, creator_match, normalize(item.get("title", "")))

                catalog_for_prompt = sorted(raw_catalog_subset, key=final_sort_key)
                catalog_context_str = build_catalog_prompt_lines(
                    catalog_for_prompt, limit=12, read_lyrics_fn=None
                )
                creator_section = build_creator_prompt_section(
                    search_ctx if is_lang_override else ctx,
                )

                curr_track_str = "Ninguno"
                if current_track.get("id"):
                    album_label = current_track.get("album") or current_track.get("artist") or ""
                    curr_track_str = (
                        f"Título: {current_track.get('title')} | Álbum/Serie: {album_label} | "
                        f"Canal: {current_track.get('creator', ctx.active_creator_name or 'desconocido')} | "
                        f"Género: {current_track.get('genre')}"
                    )
                    if current_track.get("lyrics_path"):
                        content = read_lyrics_content(current_track["lyrics_path"], max_chars=800)
                        if content:
                            curr_track_str += f"\nLetras actuales:\n{content}"

                # ── Pista en foco: la que el usuario mencionó (best_match) o la actual ──
                # Se inyectan sus letras completas para que Saori pueda explicarlas de verdad.
                focus_track = best_match or (current_track if current_track.get("id") else None)
                focus_track_str = ""
                if focus_track:
                    ft_parts = [
                        f"Título: {focus_track.get('title', '')}",
                        f"Canal/Creador: {focus_track.get('creator', '')}",
                        f"Género: {focus_track.get('genre', '')}",
                        f"Álbum/Serie: {focus_track.get('album') or focus_track.get('artist') or ''}",
                    ]
                    if focus_track.get("description"):
                        ft_parts.append(f"Descripción: {focus_track['description']}")
                    focus_lyrics = read_lyrics_content(focus_track.get("lyrics_path", ""), max_chars=1800)
                    if focus_lyrics:
                        ft_parts.append(
                            "LETRA COMPLETA (úsala para explicar, resumir o citar con precisión):\n"
                            + focus_lyrics
                        )
                    focus_track_str = "\n".join(ft_parts)

                # RAG multi-namespace (creador → tipo → global)
                # Se omite si ya tenemos la letra/descripción de la pista en foco
                # (preguntas de letra/significado) para responder más rápido.
                rag_context = ""
                focus_has_lyrics = bool(focus_track_str and "LETRA COMPLETA" in focus_track_str)
                if not ((is_lyrics_intent or is_meaning_intent) and focus_has_lyrics):
                    try:
                        from lib.pinecone_sync import pinecone_sync
                        rag_namespaces = get_rag_namespaces(ctx)
                        matches = await asyncio.wait_for(
                            pinecone_sync.query_vectors(
                                raw_message, top_k=4, namespaces=rag_namespaces
                            ),
                            timeout=4.0,
                        )
                        if matches:
                            rag_context = "\nContexto semántico RAG (priorizado por canal/tipo):\n"
                            for match in matches:
                                meta = match.get("metadata", {})
                                ns = match.get("_namespace", "global")
                                rag_context += (
                                    f"- [{ns}] Fuente: {meta.get('filename', meta.get('title', 'N/A'))} | "
                                    f"Texto: {meta.get('text', '')[:400]}\n"
                                )
                    except Exception as ree:
                        logger.warning(f"Error en consulta RAG Pinecone: {ree}")

                hist_str = ""
                if req.conversation_history:
                    hist_str = "\n".join(
                        [f"{h.get('sender', 'user')}: {h.get('text', '')}" for h in req.conversation_history[-5:]]
                    )

                # Cargar el prompt desde el archivo de skill modular
                skills_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "skills")
                saori_skill = load_skill_file(os.path.join(skills_dir, "saori_assistant.md"))
                if not saori_skill:
                    saori_skill = (
                        "Eres Saori, copiloto de Éxito.cyou, un marketplace musical con PayPal. "
                        "Ayudas a fans a descubrir, escuchar, comprar y descargar música, y a artistas "
                        "a gestionar su cuenta, ingresos, catálogo, audiencia y agente de ventas."
                    )

                account_block = account.get("prompt_block") or ""
                ui_state_str = ""
                if isinstance(req.ui_state, dict) and req.ui_state:
                    clean_ui = {k: v for k, v in req.ui_state.items() if isinstance(v, (str, int, float, bool))}
                    if clean_ui:
                        ui_state_str = "ESTADO DE LA INTERFAZ: " + ", ".join(
                            f"{k}={v}" for k, v in clean_ui.items()
                        ) + ".\n"

                system_prompt = (
                    f"{saori_skill}\n\n"
                    f"REGLA DE PLATAFORMA: Éxito.cyou es EXCLUSIVAMENTE un marketplace y streaming de MÚSICA. "
                    f"Nunca menciones audiolibros, frecuencias Solfeggio, decretos, membresías, "
                    f"programación mental ni funciones que no aparezcan en este contexto. Si no tienes un dato, dilo.\n"
                    f"{page_line}\n"
                    f"Ruta actual del navegador: {path_str}\n"
                    f"{ui_state_str}"
                    f"{creator_section}\n"
                    f"{account_block}\n"
                    f"IMPORTANTE - CANCIÓN ACTUAL: La canción que está reproduciéndose AHORA MISMO se indica en 'Reproduciendo actualmente'. "
                    f"Cuando el usuario pregunte qué está sonando, responde EXACTAMENTE con el título indicado ahí. No inventes ni confundas títulos.\n"
                    f"IMPORTANTE - PRECISIÓN: Usa solo los DATOS VERIFICADOS de la cuenta y el catálogo. Prohibido inventar cifras, "
                    f"ventas, retiros, funciones o páginas. Si no sabes algo, dilo y ofrece abrir la sección correcta.\n"
                    f"IMPORTANTE - COPILOTO: Conoces la ubicación del usuario y puedes ayudarle a navegar con "
                    f'{{"action":"navigate","path":"/artist-studio","section":"paypal"}} o {{"action":"navigate","path":"/portal"}}. '
                    f"Puedes reproducir con {{\"action\":\"play\",\"trackid\":ID}} y abrir el checkout con "
                    f'{{"action":"checkout","trackid":ID}}. Escribe el JSON al final, invisible para el usuario.\n'
                    f"IMPORTANTE - FORMATO: Texto natural conversacional en español mexicano, sin markdown.\n"


                    f"Catálogo relevante para esta conversación ({ctx.scope_label}):\n"


                    f"{catalog_context_str}\n\n"


                    f"Reproduciendo actualmente: {curr_track_str}\n\n"


                    f"PISTA EN FOCO (la que el usuario menciona o la que está escuchando):\n{focus_track_str or 'Ninguna'}\n"
                    f"Si el usuario pide explicar la letra, el significado o de qué trata, usa la LETRA COMPLETA de esta pista en foco. "
                    f"Nunca digas que no tienes acceso a la letra si está incluida arriba.\n\n"


                    f"Historial reciente:\n{hist_str}\n\n"


                    f"{rag_context}\n"


                )
                
                from langchain_core.messages import SystemMessage, HumanMessage
                messages = [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=raw_message)
                ]
                response_text = await _call_chat_llm(
                    system_prompt, raw_message, req.conversation_history, timeout=14.0
                )
                if not response_text:
                    raise RuntimeError("LLM sin respuesta a tiempo; usando heurísticas")
                # Sanitizar asteriscos y guiones bajos según AGENTS.md regla 4:
                response_text = response_text.replace("**", "").replace("_", "")
                
                # Extraer JSON de control si el LLM lo escribió explícitamente en el texto
                # Captura tanto claves en inglés como en español generadas por el LLM
                import json
                json_match = re.search(
                    r'\{[^{}]*"(?:action|destination|slug|trackid|accion|cancionid|artistaslug|destino|tipo|ruta|artista)"[^{}]*\}',
                    response_text,
                    re.IGNORECASE
                )
                if json_match:
                    try:
                        extracted_json = json.loads(json_match.group(0))
                        # Quitar siempre el JSON visible del texto del bot para que no se le muestre al usuario en el chat ni lo lea el TTS
                        response_text = response_text.replace(json_match.group(0), "").strip()
                        
                        # Mapear claves en español a claves en inglés para normalización
                        if "accion" in extracted_json and "action" not in extracted_json:
                            extracted_json["action"] = extracted_json.pop("accion")
                        if "cancionid" in extracted_json and "trackid" not in extracted_json:
                            extracted_json["trackid"] = extracted_json.pop("cancionid")
                        if "artistaslug" in extracted_json and "slug" not in extracted_json:
                            extracted_json["slug"] = extracted_json.pop("artistaslug")
                        if "destino" in extracted_json and "destination" not in extracted_json:
                            extracted_json["destination"] = extracted_json.pop("destino")
                        if "artista" in extracted_json and "slug" not in extracted_json:
                            extracted_json["slug"] = extracted_json.pop("artista")
                        
                        # Navegación interna del copiloto (paneles, portal, sandbox)
                        if extracted_json.get("action") == "navigate" and (extracted_json.get("path") or extracted_json.get("ruta")):
                            nav_path = extracted_json.get("path") or extracted_json.get("ruta") or ""
                            if nav_path.startswith("/"):
                                action = "navigate"
                                action_data = {
                                    "path": nav_path,
                                    "section": extracted_json.get("section") or "",
                                    "url": nav_path,
                                }
                        # Si es una acción de navegación o redirección a creador escrita por el LLM
                        elif extracted_json.get("action") == "navigate" or "destination" in extracted_json or "slug" in extracted_json or "artistslug" in extracted_json:
                            dest = extracted_json.get("destination") or extracted_json.get("slug") or extracted_json.get("artistslug")
                            if dest:
                                dest_map = {
                                    "billionairesplaylist": "billionairesplaylist",
                                    "billionaire soundtrack": "billionairesoundtrack",
                                    "billionairesoundtrack": "billionairesoundtrack",
                                    "audiolibrosmetafisica": "audiolibrosmetafisica",
                                    "mentalidadhbl": "mentalidadhbl",
                                    "efectometamorfosis": "efectometamorfosis"
                                }
                                resolved_slug = dest_map.get(dest.lower().strip(), dest)
                                action = "navigate_creator"
                                action_data = {"slug": resolved_slug}
                                
                                # Si también indica reproducir una pista por id
                                track_id = extracted_json.get("trackid")
                                if track_id:
                                    matching_tracks = [t for t in catalog if str(t.get("id")) == str(track_id)]
                                    if matching_tracks:
                                        action_data["autoplay_track"] = matching_tracks[0]
                                else:
                                    creator_songs = [
                                        i for i in catalog
                                        if i.get("creator_slug") == resolved_slug
                                        or i.get("creator") == SLUG_TO_CREATOR.get(resolved_slug)
                                    ]
                                    if creator_songs:
                                        action_data["autoplay_track"] = creator_songs[0]
                                        
                        # Si indica reproducir una pista
                        elif extracted_json.get("action") == "play" or "trackid" in extracted_json:
                            track_id = extracted_json.get("trackid")
                            if track_id:
                                matching_tracks = [t for t in catalog if str(t.get("id")) == str(track_id)]
                                if matching_tracks:
                                    # Si indica una redirección a artista/creador en el JSON
                                    art_slug = extracted_json.get("artistslug") or extracted_json.get("creator")
                                    if art_slug:
                                        dest_map = {
                                            "billionairesplaylist": "billionairesplaylist",
                                            "billionaire soundtrack": "billionairesoundtrack",
                                            "billionairesoundtrack": "billionairesoundtrack",
                                            "audiolibrosmetafisica": "audiolibrosmetafisica",
                                            "mentalidadhbl": "mentalidadhbl",
                                            "efectometamorfosis": "efectometamorfosis"
                                        }
                                        resolved_slug = dest_map.get(art_slug.lower().strip(), art_slug)
                                        action = "navigate_creator"
                                        action_data = {
                                            "slug": resolved_slug,
                                            "autoplay_track": matching_tracks[0]
                                        }
                                    else:
                                        action = "play"
                                        action_data = {"item": matching_tracks[0]}
                    except Exception as json_err:
                        logger.warning(f"Error parseando JSON embebido de la IA: {json_err}")

                navigation_triggered = action == "navigate_creator"
                message_lower = raw_message.lower()
                response_lower = response_text.lower()
                
                # Intentar navegar al creador de la canción actual si piden ver el canal/creador
                if not navigation_triggered:
                    if any(w in message_lower for w in ["creador", "canal", "artista", "quien", "quién", "quien es", "quien hizo"]) and any(w in message_lower for w in ["quien", "quién", "mostrar", "ver", "ir a", "llévame", "llevame", "cuál", "cual", "de esta", "de la", "página", "pagina"]):
                        target_creator = None
                        source_track = None
                        # Priorizar track actual (lo que está sonando)
                        if current_track and current_track.get("creator"):
                            target_creator = current_track.get("creator")
                            source_track = current_track
                        elif best_match and best_match.get("creator"):
                            target_creator = best_match.get("creator")
                            source_track = best_match
                        
                        if target_creator:
                            # Buscar slug exacto del creador
                            resolved_slug = None
                            resolved_name = target_creator
                            for slug_cand, name_cand in SLUG_TO_CREATOR.items():
                                if name_cand.lower() == target_creator.lower():
                                    resolved_slug = slug_cand
                                    resolved_name = name_cand
                                    break
                            # Si no se encontró en SLUG_TO_CREATOR, calcular slug dinámico
                            if not resolved_slug:
                                resolved_slug = target_creator.lower().replace(" ", "").replace("-","").replace("ñ","n").replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u")
                            
                            action = "navigate_creator"
                            action_data = {"slug": resolved_slug}
                            navigation_triggered = True
                            if source_track:
                                action_data["autoplay_track"] = source_track
                            # IMPORTANTE: Sobreescribir texto del LLM con el nombre correcto del creador
                            response_text = (
                                f"Abriendo la página del canal **{resolved_name}**. "
                                + (f"Puedes explorar todo el contenido de **{resolved_name}** incluyendo '{source_track.get('title', '')}' y más pistas del catálogo." if source_track else "")
                            )


                if not navigation_triggered:
                    nav_slug = resolve_creator_from_message(raw_message)
                    if nav_slug and nav_slug != ctx.active_creator_slug:
                        if any(w in message_lower for w in [
                            "ir a", "mostrar", "ver", "redirec", "pantalla", "página", "pagina", "creador", "artista", "llevo", "canal"
                        ]):
                            action = "navigate_creator"
                            action_data = {"slug": nav_slug}
                            navigation_triggered = True
                            creator_songs = [
                                i for i in catalog
                                if i.get("creator_slug") == nav_slug or i.get("creator") == SLUG_TO_CREATOR.get(nav_slug)
                            ]
                            if creator_songs:
                                action_data["autoplay_track"] = creator_songs[0]

                if not navigation_triggered and best_match and action is None and (is_play_intent or is_recommend_intent) and not is_lyrics_intent:
                    action = "play"
                    action_data = {"item": best_match, "alternatives": search_results[1:5]}
        except Exception as e:
            logger.error(f"Error invocando LLM en chat: {e}")
            use_llm = False

    if not use_llm:
        if is_greet and not is_play_intent:
            if account_role == "artist":
                artist_facts = account.get("artist") or {}
                response_text = (
                    f"Hola, {account.get('name') or 'artista'}. Soy Saori, tu copiloto en Éxito.cyou. "
                    f"Estás en tu Artist Studio. Tu saldo disponible es "
                    f"${float(artist_facts.get('available_balance_usd') or 0):,.2f} USD, "
                    f"tienes {artist_facts.get('tracks_count', 0)} canciones y "
                    f"{artist_facts.get('sales_count', 0)} ventas registradas. "
                    f"Puedo analizar tu cuenta, abrir tus retiros, tu catálogo, tu audiencia o tu canal público. "
                    f"¿Qué quieres revisar?"
                )
            elif account_role == "fan":
                response_text = (
                    "Hola. Soy Saori, tu copiloto musical en Éxito.cyou. Puedo recomendarte música, "
                    "explicarte letras, controlar la reproducción y abrir tu portal de compras y descargas. "
                    "¿Qué quieres escuchar hoy?"
                )
            else:
                response_text = (
                    "Hola. Soy Saori, tu copiloto musical en Éxito.cyou. Puedo recomendarte música, "
                    "explicarte letras, controlar la reproducción y mostrarte cómo comprar o descargar pistas "
                    "por PayPal. ¿Qué te gustaría escuchar?"
                )


        elif is_help and not is_play_intent:
            if account_role == "artist":
                response_text = (
                    "Puedo ayudarte como copiloto de tu cuenta de artista:\n\n"
                    "Analizar tu cuenta: analiza mi cuenta\n"
                    "Ingresos y retiros: abre PayPal Marketplace\n"
                    "Catálogo: abre mi catálogo\n"
                    "Audiencia: abre mi comunidad\n"
                    "Agente y WhatsApp: abre mi agente IA\n"
                    "Canal público: abre mi canal público\n"
                    "Música: reproduce una canción en español"
                )
            else:
                response_text = (
                    "Puedo ayudarte con lo siguiente:\n\n"
                    "Reproducir: reproduce una canción en español\n"
                    "Recomendar: recomiéndame algo para enfocarme\n"
                    "Letras: muéstrame la letra de esta canción\n"
                    "Significado: de qué trata esta canción\n"
                    "Comprar: quiero comprar esta pista\n"
                    "Mi cuenta: abre mi portal de compras y descargas"
                )

        elif is_meaning_intent:
            track_to_explain = best_match or (current_track if current_track.get("id") else None)

            if track_to_explain:
                title = track_to_explain.get("title", "esta canción")
                artist = track_to_explain.get("artist", "")
                description = track_to_explain.get("description", "")
                lyrics_path = track_to_explain.get("lyrics_path", "")
                genre = track_to_explain.get("genre", "")

                lyrics_content = read_lyrics_content(lyrics_path, max_chars=1500)

                parts = [f'"{title}" de {artist}' if artist else f'"{title}"']
                if genre:
                    parts.append(f"es una pieza de género {genre}.")
                if description:
                    parts.append(description)
                if lyrics_content:
                    sample_lines = [l for l in lyrics_content.split("\n") if l.strip()][:6]
                    if sample_lines:
                        parts.append(
                            "Aquí un fragmento de las letras:\n\n" + "\n".join(sample_lines[:4])
                        )
                    parts.append("Puedes ver las letras completas sincronizadas en el panel de reproducción.")

                if len(parts) == 1:
                    parts.append(
                        "No tengo información detallada sobre esta pieza en este momento, "
                        "pero puedo mostrarte las letras sincronizadas si las tienes disponibles."
                    )

                response_text = " ".join(parts)
                if best_match and best_match.get("id") != current_track.get("id"):
                    action = "play"
                    action_data = {"item": track_to_explain}
            else:
                response_text = (
                    "No hay ninguna canción reproduciéndose en este momento. "
                    "Dime cuál canción te interesa y te cuento sobre ella."
                )

        elif is_lyrics_intent:
            track_to_show = best_match or (current_track if current_track.get("id") else None)

            if track_to_show:
                title = track_to_show.get("title", "la canción actual")
                lyrics_content = read_lyrics_content(track_to_show.get("lyrics_path", ""), max_chars=800)
                if lyrics_content:
                    sample = "\n".join([l for l in lyrics_content.split("\n") if l.strip()][:8])
                    response_text = (
                        f'Letras de "{title}":\n\n{sample}\n\n'
                        "Letra completa disponible sincronizada en el reproductor."
                    )
                    action = "show_lyrics"
                    action_data = {"item": track_to_show}
                else:
                    response_text = (
                        f'Las letras de "{title}" no están disponibles todavía en el sistema. '
                        "Mostrando las letras sincronizadas si están en el reproductor."
                    )
                    action = "show_lyrics_current"
            else:
                action = "show_lyrics_current"
                response_text = "Mostrando las letras sincronizadas con la reproducción actual."

        elif is_play_intent:
            if best_match:
                top_score = score_match(
                    expand_with_translations(tokenize(raw_message), allow_cross_language=(ctx.scope == "global")),
                    best_match.get("title", ""),
                )
                
                if top_score > 0.65 or len(search_results) == 1 or is_recommendation_pick or is_recommend_intent:
                    action = "play"
                    action_data = {"item": best_match}
                    title = best_match.get("title", "")
                    artist = best_match.get("artist", "")
                    lang_note = "español" if target_lang == "es" else "inglés" if target_lang else ""
                    response_text = (
                        f'{"Te recomiendo " if (is_recommendation_pick or is_recommend_intent) else "¡Claro! Reproduciendo "}'
                        f'{f"en {lang_note} " if lang_note and (is_recommendation_pick or is_recommend_intent) else ""}'
                        f'"{title}"'
                        f'{" de " + artist if artist else ""}. '
                        f'{"¡Reproduciéndolo ahora para ti!" if (is_recommendation_pick or is_recommend_intent) else "¡Disfruta la música! 🎵"}'
                    )
                    if len(search_results) > 1:
                        action_data["alternatives"] = search_results[1:5]
                else:
                    # Ambigüedad REAL: múltiples resultados con score muy similar — mostrar lista para que el usuario elija
                    action = "show_results"
                    action_data = {"items": search_results[:5]}
                    response_text = (
                        "Encontré varias canciones similares. Selecciona cuál de ellas deseas escuchar en el carrusel de abajo:"
                    )
            else:
                # ── Recomendación inteligente ──
                # Si el usuario pide una recomendación (no un título específico),
                # auto-seleccionar el mejor track según idioma/género y reproducirlo
                if is_recommend_intent or target_lang or target_genre:
                    # Construir catálogo filtrado por idioma y género
                    candidates = search_catalog
                    if target_lang:
                        candidates = [
                            i for i in candidates
                            if _get_item_language(i) == target_lang
                        ]
                    if target_genre:
                        candidates = [
                            i for i in candidates
                            if target_genre in (i.get("genre") or "").lower()
                        ]
                    if candidates:
                        pick = candidates[0]
                        action = "play"
                        action_data = {"item": pick, "alternatives": candidates[1:5]}
                        title = pick.get("title", "")
                        artist = pick.get("artist", "")
                        lang_note = "español" if target_lang == "es" else "inglés" if target_lang else ""
                        genre_note = f" de {target_genre}" if target_genre else ""
                        response_text = (
                            f"Te recomiendo {f'en {lang_note}' if lang_note else ''}{genre_note} "
                            f'"{title}"{" de " + artist if artist else ""}. '
                            f"¡Reproduciéndolo ahora para ti!"
                        )
                    else:
                        action = "show_results"
                        action_data = {"items": scoped_catalog[:4]}
                        response_text = (
                            f"No encontré contenido{(' en ' + lang_note) if target_lang else ''} disponible."
                        )
                else:
                    broad_results = scoped_fuzzy_search(
                        raw_message, search_catalog, ctx, top_n=4, threshold=0.08, read_lyrics_fn=None
                    )
                    if broad_results:
                        action = "show_results"
                        action_data = {"items": broad_results}
                        response_text = (
                            "No encontré una coincidencia exacta, pero aquí tienes unas opciones sugeridas en base a tu búsqueda:"
                        )
                    else:
                        sample = search_catalog[:4] if search_catalog else (scoped_catalog[:4] if scoped_catalog else [])
                        action = "show_results"
                        action_data = {"items": sample}
                        response_text = (
                            "No encontré esa canción en el catálogo. Aquí tienes algunos de los temas más populares disponibles:"
                        )

        elif is_buy_intent:
            if best_match:
                action = "checkout"
                action_data = {"item": best_match}
                price = best_match.get("price_usd", 0.99)
                response_text = (
                    f'Abriendo compra de "{best_match["title"]}". '
                    f'Precio: ${price:.2f} USD. Serás redirigido al proceso de pago.'
                )
            else:
                response_text = "Dime el nombre del archivo que deseas comprar y lo busco para ti."

        elif is_filter_intent:
            media_type = "all"
            if any(x in message_lower for x in ["audiolibro", "audiobook", "podcast", "libro"]):
                media_type = "audiobook"
            elif any(x in message_lower for x in ["canción", "cancion", "música", "musica", "song", "rap", "hip", "pop", "rock"]):
                media_type = "song"
            elif any(x in message_lower for x in ["album", "álbum"]):
                media_type = "album"

            genre_terms = []
            for word in tokenize(raw_message):
                if any(word in g.lower() for g in ["rap", "hip hop", "pop", "rock", "jazz", "reggaeton", "electronica"]):
                    genre_terms.append(word)

            action = "filter"
            action_data = {"type": media_type, "genre": " ".join(genre_terms) if genre_terms else None}

            total = len([c for c in scoped_catalog if media_type == "all" or c.get("type") == media_type])
            response_text = (
                f"Mostrando {media_type if media_type != 'all' else 'todo el contenido'}"
                f"{' de género ' + ', '.join(genre_terms) if genre_terms else ''}. "
                f"Tenemos {total} elementos en el catálogo."
            )

        else:
            if search_results:
                if len(search_results) == 1:
                    item = search_results[0]
                    title = item.get("title", "")
                    artist = item.get("artist", "")
                    genre = item.get("genre", "")
                    response_text = (
                        f'Encontré "{title}"'
                        f'{" de " + artist if artist else ""}'
                        f'{" (" + genre + ")" if genre else ""}. '
                        "¿Deseas que lo reproduzca?"
                    )
                    action = "show_results"
                    action_data = {"items": search_results}
                else:
                    titles = ", ".join([f'"{r["title"]}"' for r in search_results[:3]])
                    response_text = (
                        f"Encontré {len(search_results)} resultado(s): {titles}. "
                        "¿Cuál deseas escuchar?"
                    )
                    action = "show_results"
                    action_data = {"items": search_results[:4]}
            elif is_search_intent:
                creators = list({c.get("creator", "") or c.get("artist", "") for c in catalog if c.get("creator") or c.get("artist")})[:4]
                response_text = (
                    "No encontré coincidencias exactas para tu búsqueda. "
                    f"Creadores disponibles: {', '.join(creators[:3]) if creators else 'varios'}. "
                    "Prueba con el título de una canción o nombre del álbum."
                )
            else:
                genres = list({c.get("genre", "") for c in catalog if c.get("genre")})[:4]
                genres_str = ", ".join(genres) if genres else "varios géneros"
                creators = list({c.get("creator", "") or c.get("artist", "") for c in catalog if c.get("creator") or c.get("artist")})[:3]
                response_text = (
                    "No entendí tu solicitud. Puedo reproducir canciones, mostrar letras, "
                    "explicar el significado de una canción, o ayudarte a comprar.\n\n"
                    f"🎵 Géneros: {genres_str}\n"
                    f"🎤 Creadores: {', '.join(creators) if creators else 'varios'}\n\n"
                    "Di algo como: reproduce Yo Soy Llama Violeta o muéstrame canciones de rap"
                )

    # ⚠️ Seguridad final: eliminar cualquier fragmento JSON que el LLM haya podido dejar en el texto
    # para que nunca aparezca en el chat ni lo lea Edge-TTS
    response_text = re.sub(r'\{[^{}]{0,500}\}', '', response_text).strip()
    # Limpiar líneas vacías múltiples resultantes
    response_text = re.sub(r'\n{3,}', '\n\n', response_text).strip()

    # ── Registrar señal conversacional de Saori en UserRecommendationSignal ──
    try:
        from database import SessionLocal
        import db_models
        sig_db = SessionLocal()
        try:
            rec_item = action_data.get("item") or (action_data.get("items", [None])[0] if isinstance(action_data.get("items"), list) and action_data.get("items") else None)
            sig = db_models.UserRecommendationSignal(
                signal_type="saori_recommendation" if is_recommend_intent else "saori_chat_request",
                media_catalog_id=rec_item.get("id") if isinstance(rec_item, dict) else None,
                extracted_genre=rec_item.get("genre") if isinstance(rec_item, dict) else None,
                extracted_artist=(rec_item.get("creator") or rec_item.get("artist")) if isinstance(rec_item, dict) else ctx.active_creator_name,
                raw_query=raw_message[:400],
                weight=14.0 if is_recommend_intent else 10.0,
            )
            sig_db.add(sig)
            sig_db.commit()
        finally:
            sig_db.close()
    except Exception as sig_err:
        logger.debug(f"Saori recommendation signal skipped: {sig_err}")

    return JSONResponse({
        "response": response_text,
        "action": action,
        "action_data": action_data,
        "catalog_size": len(catalog),
        "scope": ctx.scope,
        "scope_label": ctx.scope_label,
        "active_creator_slug": ctx.active_creator_slug,
    })


# ─── Rating de Satisfacción ────────────────────────────────────────────────────

class RatingRequest(BaseModel):
    rating: int
    feedback: Optional[str] = ""
    metrics: Optional[dict] = None  # métricas contextuales del momento


@router.post("/rating")
async def submit_rating(req: RatingRequest):
    """Recibe calificación 1-5 del usuario sobre su experiencia en el chat."""
    if req.rating < 1 or req.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    logger.info(
        f"SATISFACCIÓN: {req.rating}/5 | Feedback: {req.feedback or 'sin comentarios'} | "
        f"Métricas: {req.metrics or {}}"
    )

    # Persistir en DB si existe tabla de analytics
    try:
        from database import SessionLocal
        from db_models import Rating  # modelo opcional
        db = SessionLocal()
        try:
            db.execute(
                "INSERT INTO ratings (rating, feedback, created_at) VALUES (?, ?, datetime('now'))",
                (req.rating, req.feedback)
            )
            db.commit()
        except Exception:
            pass  # tabla puede no existir
        finally:
            db.close()
    except Exception:
        pass

    return JSONResponse({"status": "ok", "rating": req.rating})

