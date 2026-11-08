# -*- coding: utf-8 -*-
"""
MediaSuite 2.0 — Auto Cover System
=====================================
Sistema inteligente de portadas para el catálogo de medios:
- Auto-asigna portadas únicas desde Pexels según título/género/artista
- Descarga imágenes cuadradas de alta calidad (medium size ~400px)
- Permite personalizar la portada de cualquier archivo con imagen propia
- No repite imágenes entre archivos del catálogo
- Consume recursos mínimos (rate-limited, sequential, no Celery)
"""

import os
import asyncio
import logging
import hashlib
import random
import re
import unicodedata
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import PEXELS_API_KEY, MEDIA_LIBRARY_DIR

logger = logging.getLogger("covers.router")
router = APIRouter()

# Directorio donde guardaremos las portadas auto-asignadas
COVERS_DIR = MEDIA_LIBRARY_DIR / "covers"
COVERS_DIR.mkdir(parents=True, exist_ok=True)

# Set global de Pexels photo IDs ya usados (evitar repeticiones en sesión)
_used_pexels_ids: set[int] = set()

PEXELS_BASE = "https://api.pexels.com"


# ── Utilidades ───────────────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    text = text.lower().strip()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _build_search_query(title: str, genre: str = "", artist: str = "", creator: str = "", use_llm: bool = False) -> str:
    """
    Construye una query de búsqueda en inglés apropiada para el contexto del track.
    Usa extracción determinista instantánea (0ms) por defecto para no bloquear el event loop de FastAPI.
    """
    from config import OPENAI_API_KEY
    if use_llm and OPENAI_API_KEY:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=OPENAI_API_KEY)
            prompt = (
                f"Identify the central theme of a media item with:\n"
                f"Title: '{title}'\n"
                f"Genre: '{genre}'\n"
                f"Artist: '{artist}'\n"
                f"Creator: '{creator}'\n\n"
                f"Translate key concepts to English. Return ONLY 2 to 4 descriptive English keywords separated by spaces. "
                f"Do NOT include adjectives or styling unless absolutely key. Keep it visually searchable on stock image sites (Pexels)."
            )
            res = client.chat.completions.create(
                model="gpt-5-nano",
                messages=[
                    {"role": "system", "content": "You are a visual asset search query builder. Respond ONLY with the keywords, nothing else."},
                    {"role": "user", "content": prompt}
                ],
                max_completion_tokens=50
            )
            gpt_query = res.choices[0].message.content.strip().lower()
            # Eliminar puntuaciones extrañas
            gpt_query = re.sub(r"[^\w\s]", "", gpt_query)
            if gpt_query and len(gpt_query.split()) >= 1:
                logger.info(f"[GPT Query Builder] Generated: '{gpt_query}' for '{title}'")
                return gpt_query[:80]
        except Exception as e:
            logger.warning(f"Error generating query with gpt-5-nano: {e}. Falling back to rule-based.")

    # Fallback basado en reglas
    # Extraer palabras clave del título (máx 3 palabras, ignorar stopwords)
    stopwords_es = {"version", "dia", "day", "night", "noche", "de", "la", "el",
                    "los", "las", "del", "en", "un", "una", "y", "o", "que",
                    "con", "por", "para", "sobre", "al", "a", "es", "se"}
    stopwords_en = {"version", "the", "a", "an", "of", "in", "and", "or", "on",
                    "with", "at", "to", "for", "by", "from"}
    all_stops = stopwords_es | stopwords_en

    title_words = [w for w in _normalize(title).split() if len(w) >= 3 and w not in all_stops][:3]
    title_query = " ".join(title_words)

    # Mapa de géneros → keywords visuales para Pexels
    genre_visual_map = {
        "rap": "hip hop urban street",
        "hip hop": "hip hop urban street",
        "afrobeats": "afro music vibrant",
        "blues": "blues music guitar",
        "dancehall": "dancehall caribbean music",
        "deep house": "house music night club",
        "electronic": "electronic music neon",
        "ambient": "meditation peaceful nature",
        "audiobook": "book reading wisdom",
        "day": "golden sunlight morning",
        "night": "night stars meditation",
        "uplifting": "sunrise inspiration golden",
        "relax": "peaceful calm nature",
        "millonarios": "luxury wealth success gold mansion",
        "billionaires": "luxury wealth gold mansion yacht",
        "playlist": "luxury wealth gold yacht mansion",
        "manifestation": "universe spiritual light energy",
        "metaphysics": "spiritual cosmic universe wisdom energy",
    }

    genre_lower = _normalize(genre)
    artist_lower = _normalize(artist)
    creator_lower = _normalize(creator)

    # Buscar en el mapa de géneros
    visual_hint = ""
    for key, hint in genre_visual_map.items():
        if key in genre_lower or key in artist_lower or key in title_query or key in creator_lower:
            visual_hint = hint
            break

    if not visual_hint:
        # Fallback basado en palabras clave comunes en títulos
        if any(w in title_query for w in ["llama", "flame", "fuego", "fire"]):
            visual_hint = "purple flame violet fire"
        elif any(w in title_query for w in ["jardin", "garden", "cosecha", "harvest"]):
            visual_hint = "golden garden nature abundance"
        elif any(w in title_query for w in ["rio", "river", "agua", "water", "fluir", "flow"]):
            visual_hint = "river flow golden water"
        elif any(w in title_query for w in ["corona", "crown", "maestro", "master"]):
            visual_hint = "crown golden luxury success"
        elif any(w in title_query for w in ["alma", "soul", "espiritu", "spirit"]):
            visual_hint = "spiritual soul universe light"
        elif any(w in title_query for w in ["dinero", "money", "riqueza", "wealth", "abundancia", "abundance", "lujo", "luxury"]):
            visual_hint = "wealth success golden abundance mansion"
        elif any(w in title_query for w in ["sueno", "dream", "subconsciente", "subconscious"]):
            visual_hint = "dream surreal cosmic"
        elif any(w in title_query for w in ["decreto", "yo soy", "i am", "afirmacion", "affirmation"]):
            visual_hint = "spiritual affirmation universe light"
        elif any(w in title_query for w in ["energia", "energy", "universo", "universe", "sabiduria", "wisdom"]):
            visual_hint = "spiritual cosmic universe energy wisdom"
        else:
            visual_hint = "music abstract art"

    # Combinar query
    if title_query:
        query = f"{title_query} {visual_hint}".strip()
    else:
        query = visual_hint or "music abstract"

    return query[:80]  # Limitar longitud


async def _fetch_pexels_photo(
    query: str,
    exclude_ids: set[int],
    per_page: int = 15,
    orientation: str = "square",
) -> Optional[dict]:
    """Busca en Pexels y retorna una foto no usada antes que no contenga keywords negativas."""
    if not PEXELS_API_KEY:
        return None

    headers = {"Authorization": PEXELS_API_KEY}
    
    # Definimos palabras negativas que queremos evitar en nuestras portadas premium
    negative_keywords = {
        "pobreza", "poverty", "crime", "crimen", "delincuencia", "sad", "sadness", "tristeza", 
        "ruins", "ruinas", "dirty", "sucio", "trash", "basura", "poor", "beggar", "mendigo",
        "violence", "violencia", "weapons", "armas", "death", "muerte", "sickness", "enfermedad"
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            # Intentar con varios offsets para mayor variedad
            for page in [1, 2, 3]:
                params = {
                    "query": query,
                    "page": page,
                    "per_page": per_page,
                    "orientation": orientation,
                }
                res = await client.get(f"{PEXELS_BASE}/v1/search", headers=headers, params=params)
                if res.status_code != 200:
                    logger.warning(f"Pexels {res.status_code} para query='{query}'")
                    return None

                photos = res.json().get("photos", [])
                if not photos:
                    break

                # Filtrar los ya usados y que no tengan keywords negativas
                available = []
                for p in photos:
                    if p["id"] in exclude_ids:
                        continue
                    
                    # Chequear en alt text, url o fotógrafo si hay alguna palabra negativa
                    text_to_check = f"{p.get('alt', '')} {p.get('url', '')}".lower()
                    has_negative = any(neg in text_to_check for neg in negative_keywords)
                    if not has_negative:
                        available.append(p)

                if available:
                    return random.choice(available)

    except Exception as e:
        logger.error(f"Error Pexels: {e}")

    return None


async def _download_photo(photo: dict, dest_path: Path) -> bool:
    """Descarga una foto de Pexels (tamaño 'medium' ~400px) y la guarda."""
    src = photo.get("src", {})
    # Preferir 'medium' (400px) para balance calidad/tamaño
    url = src.get("medium") or src.get("small") or src.get("original")
    if not url:
        return False

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            res = await client.get(url)
            res.raise_for_status()
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            dest_path.write_bytes(res.content)
            return True
    except Exception as e:
        logger.error(f"Error descargando foto: {e}")
        return False


# ── Endpoints ────────────────────────────────────────────────────────────────

class AutoCoverRequest(BaseModel):
    media_id: int
    title: str
    genre: str = ""
    artist: str = ""
    creator: str = ""
    force: bool = False  # True para reemplazar portada existente


@router.post("/auto-assign")
async def auto_assign_cover(req: AutoCoverRequest):
    """
    Asigna automáticamente una portada única desde Pexels a un item del catálogo.
    Descarga imagen cuadrada, la guarda en media_library/covers/ y actualiza la DB.
    """
    try:
        from database import SessionLocal
        from db_models import MediaCatalog
        db = SessionLocal()
        try:
            item = db.query(MediaCatalog).filter(MediaCatalog.id == req.media_id).first()
            if not item:
                raise HTTPException(status_code=404, detail="Item no encontrado")

            # Si ya tiene portada y no se forzó, retornar la existente
            if item.album_art_path and not req.force:
                return JSONResponse({
                    "success": True,
                    "skipped": True,
                    "message": "Ya tiene portada asignada",
                    "album_art_path": item.album_art_path,
                })

            # Construir query de búsqueda
            query = _build_search_query(req.title, req.genre, req.artist, req.creator)
            logger.info(f"[Cover] ID={req.media_id} '{req.title}' → query='{query}'")

            # Obtener IDs globales ya usados + los en DB
            exclude_ids = set(_used_pexels_ids)
            # También excluir IDs usados en la DB (en nombre de archivo)
            for f in COVERS_DIR.glob("pexels_*.jpg"):
                try:
                    pid = int(f.stem.split("_")[1])
                    exclude_ids.add(pid)
                except (IndexError, ValueError):
                    pass

            photo = await _fetch_pexels_photo(query, exclude_ids)

            if not photo:
                # Fallback: buscar con query más genérica
                fallback_query = "music abstract art"
                photo = await _fetch_pexels_photo(fallback_query, exclude_ids)

            if not photo:
                return JSONResponse({
                    "success": False,
                    "message": "No se encontró imagen en Pexels",
                })

            photo_id = photo["id"]
            _used_pexels_ids.add(photo_id)

            # Determinar nombre de archivo
            safe_title = re.sub(r"[^\w]", "_", req.title.lower())[:40]
            filename = f"pexels_{photo_id}_{safe_title}.jpg"
            dest_path = COVERS_DIR / filename

            # Descargar
            ok = await _download_photo(photo, dest_path)
            if not ok:
                return JSONResponse({"success": False, "message": "Error al descargar imagen"})

            # Actualizar DB — ruta relativa a media_library
            rel_path = f"media_library/covers/{filename}"
            item.album_art_path = rel_path
            db.commit()

            return JSONResponse({
                "success": True,
                "media_id": req.media_id,
                "title": req.title,
                "pexels_id": photo_id,
                "album_art_path": rel_path,
                "photographer": photo.get("photographer", ""),
                "pexels_url": photo.get("url", ""),
                "query_used": query,
            })

        finally:
            db.close()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en auto-assign cover: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class BatchCoverRequest(BaseModel):
    limit: int = 20         # Máximo items a procesar por batch
    only_missing: bool = True  # Solo items sin portada
    delay_ms: int = 800     # Delay entre requests (ms) para no saturar Pexels


# Estado del batch en memoria
_batch_running = False
_batch_progress = {"total": 0, "done": 0, "errors": 0, "running": False}


async def _run_batch(limit: int, only_missing: bool, delay_s: float):
    """Tarea de background: asigna portadas en lote."""
    global _batch_running, _batch_progress

    try:
        from database import SessionLocal
        from db_models import MediaCatalog
        db = SessionLocal()
        try:
            query = db.query(MediaCatalog)
            if only_missing:
                query = query.filter(
                    (MediaCatalog.album_art_path == None) |
                    (MediaCatalog.album_art_path == "")
                )
            items = query.limit(limit).all()
            _batch_progress.update({"total": len(items), "done": 0, "errors": 0, "running": True})

            for item in items:
                if not _batch_running:
                    break  # Cancelado

                query_str = _build_search_query(
                    item.title or "",
                    item.genre or "",
                    item.artist or "",
                    item.creator or "",
                )

                exclude_ids = set(_used_pexels_ids)
                for f in COVERS_DIR.glob("pexels_*.jpg"):
                    try:
                        pid = int(f.stem.split("_")[1])
                        exclude_ids.add(pid)
                    except (IndexError, ValueError):
                        pass

                photo = await _fetch_pexels_photo(query_str, exclude_ids)
                if not photo:
                    photo = await _fetch_pexels_photo("music abstract", exclude_ids)

                if photo:
                    photo_id = photo["id"]
                    _used_pexels_ids.add(photo_id)
                    safe_title = re.sub(r"[^\w]", "_", (item.title or "track").lower())[:35]
                    filename = f"pexels_{photo_id}_{safe_title}.jpg"
                    dest_path = COVERS_DIR / filename
                    ok = await _download_photo(photo, dest_path)
                    if ok:
                        item.album_art_path = f"media_library/covers/{filename}"
                        db.commit()
                        _batch_progress["done"] += 1
                        logger.info(f"[Batch] ✓ {item.title[:40]} → {filename}")
                    else:
                        _batch_progress["errors"] += 1
                else:
                    _batch_progress["errors"] += 1

                # Rate limiting suave
                await asyncio.sleep(delay_s)

        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error en batch covers: {e}")
    finally:
        _batch_running = False
        _batch_progress["running"] = False


@router.post("/batch-assign")
async def batch_assign_covers(req: BatchCoverRequest, background_tasks: BackgroundTasks):
    """
    Asigna portadas en lote a items sin portada.
    Se ejecuta en background sin bloquear el servidor.
    Delay configurable para no saturar la API de Pexels.
    """
    global _batch_running

    if _batch_running:
        return JSONResponse({
            "success": False,
            "message": "Ya hay un batch en ejecución",
            "progress": _batch_progress,
        })

    _batch_running = True
    delay_s = max(0.3, req.delay_ms / 1000)

    background_tasks.add_task(_run_batch, req.limit, req.only_missing, delay_s)

    return JSONResponse({
        "success": True,
        "message": f"Batch iniciado: hasta {req.limit} portadas, delay={delay_s:.1f}s",
        "status_endpoint": "/api/covers/batch-status",
    })


@router.get("/batch-status")
async def get_batch_status():
    """Estado actual del batch de portadas."""
    return JSONResponse(_batch_progress)


@router.post("/batch-cancel")
async def cancel_batch():
    """Cancela el batch en ejecución."""
    global _batch_running
    _batch_running = False
    return JSONResponse({"success": True, "message": "Cancelando batch..."})


@router.post("/upload-custom/{media_id}")
async def upload_custom_cover(
    media_id: int,
    request: Request,
    file: UploadFile = File(...),
):
    """
    Sube una imagen personalizada como portada de un item del catálogo.
    Acepta JPG, PNG, WEBP. La guarda en media_library/covers/custom/.
    Restringido a administradores.
    """
    # ── Verificar Permisos de Administrador ──
    token = request.cookies.get("mediasuite_session")
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
        
    try:
        from routers.auth import verify_token
        payload = verify_token(token)
        if not payload or payload.get("role") not in ["super_admin", "tools_admin"]:
            raise HTTPException(status_code=403, detail="Acceso denegado: Se requieren permisos administrativos")
    except Exception:
        raise HTTPException(status_code=403, detail="Token inválido o expirado")

    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Tipo no permitido: {file.content_type}. Use JPG, PNG o WEBP.")

    # Leer archivo
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB máx
        raise HTTPException(status_code=400, detail="Imagen demasiado grande (máx 10MB)")

    try:
        from database import SessionLocal
        from db_models import MediaCatalog
        db = SessionLocal()
        try:
            item = db.query(MediaCatalog).filter(MediaCatalog.id == media_id).first()
            if not item:
                raise HTTPException(status_code=404, detail="Item no encontrado")

            # Guardar en custom/
            custom_dir = COVERS_DIR / "custom"
            custom_dir.mkdir(parents=True, exist_ok=True)

            ext = ".jpg" if "jpeg" in (file.content_type or "") else f".{file.content_type.split('/')[-1]}"
            safe_name = re.sub(r"[^\w]", "_", (item.title or f"item_{media_id}").lower())[:40]
            filename = f"custom_{media_id}_{safe_name}{ext}"
            dest_path = custom_dir / filename

            dest_path.write_bytes(content)

            # Actualizar DB
            rel_path = f"media_library/covers/custom/{filename}"
            item.album_art_path = rel_path
            db.commit()

            return JSONResponse({
                "success": True,
                "media_id": media_id,
                "album_art_path": rel_path,
                "size_kb": round(len(content) / 1024, 1),
            })

        finally:
            db.close()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error subiendo portada personalizada: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def covers_status():
    """Estadísticas de portadas en el catálogo."""
    try:
        from database import SessionLocal
        from db_models import MediaCatalog
        db = SessionLocal()
        try:
            total = db.query(MediaCatalog).count()
            with_art = db.query(MediaCatalog).filter(
                MediaCatalog.album_art_path != None,
                MediaCatalog.album_art_path != "",
            ).count()
            without_art = total - with_art

            custom_count = len(list((COVERS_DIR / "custom").glob("*.*"))) if (COVERS_DIR / "custom").exists() else 0
            pexels_count = len(list(COVERS_DIR.glob("pexels_*.jpg")))

            return JSONResponse({
                "total_items": total,
                "with_cover": with_art,
                "without_cover": without_art,
                "custom_covers": custom_count,
                "pexels_covers": pexels_count,
                "coverage_pct": round(with_art / total * 100, 1) if total else 0,
                "batch_running": _batch_running,
            })
        finally:
            db.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/remove/{media_id}")
async def remove_cover(media_id: int):
    """Elimina la portada asignada a un item (lo deja sin portada para re-asignar)."""
    try:
        from database import SessionLocal
        from db_models import MediaCatalog
        db = SessionLocal()
        try:
            item = db.query(MediaCatalog).filter(MediaCatalog.id == media_id).first()
            if not item:
                raise HTTPException(status_code=404, detail="Item no encontrado")
            item.album_art_path = None
            db.commit()
            return JSONResponse({"success": True, "message": "Portada eliminada"})
        finally:
            db.close()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
