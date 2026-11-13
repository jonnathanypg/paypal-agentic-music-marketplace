# -*- coding: utf-8 -*-
"""
MediaSuite 2.0 — Router de Comercio Electrónico y Descargas
===========================================================
Implementa el catálogo, flujos de pago (Invitado y PayPal),
canje de tokens, suscripciones e inyección de metadatos DRM asíncrona.
"""

import os
import re
import uuid
import datetime
import hashlib
import hmac
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
import db_models
from auth_utils import encrypt_data, decrypt_data
from celery_app import celery_app
from config import AUDIOBOOKS_OUTPUT, SHORTS_OUTPUT_VIDEOS, PLAYLIST_OUTPUT
from lib.creator_registry import CREATOR_META, CREATOR_SLUGS, SLUG_TO_CREATOR

router = APIRouter()

# Judge/local demo checkout: records a purchase without contacting PayPal.
# Disabled unless the deployment explicitly opts in (see .env.example).
DEMO_CHECKOUT_ENABLED = os.getenv("ALLOW_DEMO_CHECKOUT", "").strip().lower() in {"1", "true", "yes", "on"}


def _session_user(request: Request, db: Session):
    """Return the logged-in user from the session cookie, if any."""
    token = request.cookies.get("mediasuite_session")
    if not token:
        return None
    try:
        from routers.auth import verify_token
        payload = verify_token(token)
        if not payload:
            return None
        return db.query(db_models.User).filter(db_models.User.username == payload.get("user")).first()
    except Exception:
        return None


def _download_signature(purchase_id: int) -> str:
    from config import SECRET_KEY
    return hmac.new(SECRET_KEY.encode(), f"download:{purchase_id}".encode(), hashlib.sha256).hexdigest()


def _creator_slug_for_name(creator_name: Optional[str]) -> Optional[str]:
    if not creator_name:
        return None
    return CREATOR_SLUGS.get(creator_name)


def _extract_paypal_capture(capture_data: dict) -> dict:
    """Devuelve el primer capture de una orden PayPal v2."""
    payments = (capture_data.get("purchase_units") or [{}])[0].get("payments") or {}
    captures = payments.get("captures") or []
    return captures[0] if captures else {}


def _capture_paypal_order(client, api_url: str, headers: dict, order_id: str,
                          expected_value: float, expected_currency: str = "USD"):
    """Captura una orden PayPal de forma idempotente.

    Devuelve ``(tx_id, capture_data)``. Si la orden ya fue capturada (por
    ejemplo, un reintento tras fallar la persistencia en BD) se recupera su
    estado en lugar de fallar, evitando que el comprador quede sin acceso
    después de haber sido cobrado.
    """
    capture_res = client.post(
        f"{api_url}/v2/checkout/orders/{order_id}/capture",
        headers=headers,
        json={},
        timeout=15.0,
    )
    capture_data = None
    if capture_res.status_code in (200, 201):
        capture_data = capture_res.json()
    else:
        err_body = {}
        try:
            err_body = capture_res.json()
        except Exception:
            pass
        issues = {d.get("issue") for d in (err_body.get("details") or []) if d.get("issue")}
        if capture_res.status_code in (409, 422) or "ORDER_ALREADY_CAPTURED" in issues:
            get_res = client.get(
                f"{api_url}/v2/checkout/orders/{order_id}",
                headers=headers,
                timeout=15.0,
            )
            if get_res.status_code == 200:
                capture_data = get_res.json()
        if capture_data is None:
            detail_msg = err_body.get("message") or "Error al capturar la orden"
            raise HTTPException(status_code=400, detail=f"Fallo en captura de PayPal: {detail_msg}")

    status = capture_data.get("status")
    if status != "COMPLETED":
        raise HTTPException(status_code=400, detail=f"La orden de PayPal no se completó: Estado={status}")

    capture = _extract_paypal_capture(capture_data)
    purchase_unit = (capture_data.get("purchase_units") or [{}])[0]
    tx_id = capture.get("id") or f"PAY-{order_id}"
    amount = capture.get("amount") or purchase_unit.get("amount") or {}
    captured_value = amount.get("value")
    captured_currency = amount.get("currency_code", expected_currency)
    try:
        captured_float = float(captured_value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="PayPal no devolvió un monto capturado válido")

    expected_amount = float(expected_value or 0)
    # Only enforce an amount when the catalog actually defines a positive price.
    # A missing/zero price must not turn a completed capture into a failed sale.
    if expected_amount > 0 and (
        captured_currency != expected_currency
        or abs(captured_float - expected_amount) > 0.01
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Monto capturado (${captured_float:.2f} {captured_currency}) no coincide "
                f"con el precio esperado (${expected_amount:.2f} {expected_currency})"
            ),
        )
    return tx_id, capture_data

# ══════════════════════════════════════════════════════════════
#  SCHEMAS DE ENTRADA Y SALIDA
# ══════════════════════════════════════════════════════════════

class CatalogItemCreate(BaseModel):
    title: str
    description: Optional[str] = None
    artist: str
    type: str  # song, album, audiobook, video, project_zip
    file_path: str
    album_art_path: Optional[str] = None
    price_tokens: int = 1
    price_usd: float = 0.99

class CatalogItemResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    artist: str
    type: str
    price_tokens: int
    price_usd: float
    album_art_path: Optional[str]
    file_path: str
    lyrics_path: Optional[str] = None
    creator: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None
    duration_seconds: Optional[int] = None
    play_count: Optional[int] = 0
    language: Optional[str] = "es"

    class Config:
        from_attributes = True

class PurchaseRequest(BaseModel):
    media_catalog_id: int
    payment_method: str  # paypal, tokens
    guest_email: Optional[EmailStr] = None
    guest_password: Optional[str] = None
    guest_username: Optional[str] = None
    auto_register: Optional[bool] = False
    order_id: Optional[str] = None
    # When true, PayPal Orders v2 uses the dedicated Sandbox app credentials.
    sandbox_mode: Optional[bool] = False
    # Optional channel/label the buyer is browsing (used for sandbox demo splits).
    channel_slug: Optional[str] = None

# ══════════════════════════════════════════════════════════════
#  CATÁLOGO DE MEDIOS
# ══════════════════════════════════════════════════════════════

# Agent configuration for metadata classification
METADATA_AGENT_SYSTEM_PROMPT = """You are the MediaSuite 2.0 Metadata Classification Agent.
Your task is to analyze the lyrics or text content of a media asset and classify it into the correct category and extract its metadata.
You must respond with a JSON object.

The possible creators/channels are:
1. "Billionaire SoundTrack" - If it is a music track (Spanish/Latin language, focused on wealth, business, abundance, growth).
2. "Billionaires Playlist" - If it is a music track (English language, focused on wealth, success, abundance, growth).
3. "Audiolibros de Metafísica" - If it is an audiobook or speech about metaphysics, spiritual laws of wealth, mental transformation (Conny Mendez, Florence Scovel Shinn, Hermetic philosophy).
4. "Mentalidad HBL" - If it is about Eduardo Salazar's lessons or direct network marketing mindset training.
5. "Efecto Metamorfosis" - If it is a reportage, biography, or analytical documentary about famous/celebrity figures (e.g. Elon Musk, Cristiano Ronaldo, Messi, etc.).

Analyze the language, style, and content.
If the text is in Spanish and is a song: creator should be "Billionaire SoundTrack".
If the text is in English and is a song: creator should be "Billionaires Playlist".
For audiobooks or speech:
- If it mentions Eduardo Salazar or HBL, creator is "Mentalidad HBL".
- If it mentions metaphysics, spiritual law, Kybalion, Shinn, Hopkins, Conny Mendez, vibration, creator is "Audiolibros de Metafísica".
- Otherwise if it is a celebrity story/biography, creator is "Efecto Metamorfosis".

Respond ONLY with a JSON object matching this structure:
{
  "creator": "...",
  "genre": "...",
  "description": "...",
  "language": "es" or "en"
}
"""

def clean_string(s: str) -> str:
    import re
    # Remove version prefix like "1_" or "2_" or track prefix like "12_" at the beginning
    s = re.sub(r'^\d+[_ ]', '', s)
    # Remove file extension
    s = os.path.splitext(s)[0]
    # Replace underscores/dashes with spaces
    s = s.replace('_', ' ').replace('-', ' ')
    # Convert to lowercase and strip special chars
    s = "".join(c for c in s.lower() if c.isalnum() or c.isspace())
    return " ".join(s.split())

def check_title_match(t1: str, t2: str) -> bool:
    # Coincidencia estricta: los títulos limpios deben ser idénticos o uno estar exactamente contenido
    # para evitar falsos positivos (por ejemplo, "Garden of Belief" vs "Subconscious Garden")
    clean1 = clean_string(t1)
    clean2 = clean_string(t2)
    return clean1 == clean2

def classify_metadata_with_agent(title: str, lyrics_text: str) -> dict:
    import json
    try:
        from lib.llm_client import call_llm
        prompt = f"Title: {title}\nLyrics:\n{lyrics_text[:1500]}"
        res = call_llm(
            prompt=prompt,
            system_prompt=METADATA_AGENT_SYSTEM_PROMPT,
            model_family="auto",
            response_format={"type": "json_object"}
        )
        return json.loads(res)
    except Exception:
        is_spanish = any(w in title.lower() or w in lyrics_text.lower()[:300] for w in ["para", "el", "la", "de", "con", "en", "riqueza", "mente", "creer"])
        return {
            "creator": "Billionaire SoundTrack" if is_spanish else "Billionaires Playlist",
            "genre": "Ambient",
            "description": f"Contenido multimedia: {title}",
            "language": "es" if is_spanish else "en"
        }

def auto_sync_lyrics_for_song(audio_rel_path: str, lyrics_rel_path: str) -> None:
    """Detects if lyrics file has artificial 10s timestamps or is missing timestamps, 
    and automatically transcribes and aligns it using Whisper and fuzzy aligner."""
    from config import MEDIA_LIBRARY_DIR
    import os
    import re
    import logging
    
    if not lyrics_rel_path or not audio_rel_path:
        return
        
    audio_path = os.path.join(str(MEDIA_LIBRARY_DIR), audio_rel_path.replace("media_library/", ""))
    lyrics_path = os.path.join(str(MEDIA_LIBRARY_DIR), lyrics_rel_path.replace("media_library/", ""))
    
    if not os.path.exists(audio_path) or not os.path.exists(lyrics_path):
        return
        
    try:
        with open(lyrics_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        logging.getLogger("uvicorn").error(f"Error reading lyrics file during auto-sync: {e}")
        return
        
    lines = content.split("\n")
    lrc_lines = []
    lrc_regex = re.compile(r'^\[(\d+):(\d+(?:\.\d+)?)\]')
    for l in lines:
        match = lrc_regex.match(l.strip())
        if match:
            min_val = int(match.group(1))
            sec_val = float(match.group(2))
            lrc_lines.append(min_val * 60 + sec_val)
            
    is_bad = False
    if not lrc_lines:
        is_bad = True
    elif len(lrc_lines) >= 3:
        diffs = [lrc_lines[i] - lrc_lines[i-1] for i in range(1, len(lrc_lines))]
        if all(abs(d - 10.0) < 0.01 for d in diffs):
            is_bad = True
            
    if not is_bad:
        return # Already synchronized correctly
        
    logging.getLogger("uvicorn").info(f"🔄 Auto-syncing lyrics: {audio_rel_path} -> {lyrics_rel_path}...")
    try:
        from lib.shorts_engine.subtitle_engine import transcribe_audio
        from lib.playlist_engine.subtitle_generator import _build_verse_segments
        
        language = "es" if "para_millonarios" in audio_rel_path.lower() else "en"
        
        parts = re.split(r'\n\s*---\s*\n', content)
        header_content = parts[0]
        
        h_lines = header_content.split("\n")
        reference_lines = []
        for l in h_lines:
            trimmed = l.strip()
            lower = trimmed.lower()
            if (lower.startswith("title:") or lower.startswith("tags:") or 
                lower.startswith("genero:") or lower.startswith("gender:") or 
                lower.startswith("prompt:") or lower.startswith("artist:") or 
                lower.startswith("album:")):
                continue
            cleaned_line = lrc_regex.sub('', trimmed).strip()
            if cleaned_line:
                reference_lines.append(cleaned_line)
        reference_lyrics_text = "\n".join(reference_lines)
        
        whisper_words = transcribe_audio(audio_path, language=language, initial_prompt=reference_lyrics_text)
        if not whisper_words:
            logging.getLogger("uvicorn").warning(f"Whisper returned no words for {audio_rel_path}")
            return
            
        verse_segments = _build_verse_segments(whisper_words, reference_lyrics_text)
        if not verse_segments:
            logging.getLogger("uvicorn").warning(f"Alignment produced no segments for {audio_rel_path}")
            return
            
        def format_time_str(secs):
            m = int(secs // 60)
            s = secs % 60
            return f"[{m:02d}:{s:05.2f}]"
            
        lrc_formatted = []
        for seg in verse_segments:
            lrc_formatted.append(f"{format_time_str(seg['start'])} {seg['text']}")
            
        new_content = header_content + "\n---\n" + "\n".join(lrc_formatted) + "\n"
        with open(lyrics_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        logging.getLogger("uvicorn").info(f"✅ Auto-sync completed for {lyrics_rel_path}")
    except Exception as e:
        logging.getLogger("uvicorn").error(f"Error executing auto-sync for {audio_rel_path}: {e}")

def perform_scan(db: Session):
    from config import MEDIA_LIBRARY_DIR
    import glob
    import json
    import re
    
    if True:
        # ── 1. Escanear Canciones (MusicPlaylist) ──
        # Los proyectos de playlists musicales guardan las canciones en media_library/MusicPlaylist/<ProjectName>/songs/*.mp3
        playlist_songs_pattern = os.path.join(str(MEDIA_LIBRARY_DIR), "MusicPlaylist", "*", "songs", "*.mp3")
        for file_path in glob.glob(playlist_songs_pattern):
            rel_path = os.path.relpath(file_path, str(MEDIA_LIBRARY_DIR))
            full_rel_path = os.path.join("media_library", rel_path)
            
            # Fast-path: si ya existe en el catálogo con creador e información asignada, saltar costoso LLM y Whisper
            exists_fast = db.query(db_models.MediaCatalog).filter(
                (db_models.MediaCatalog.file_path == file_path) |
                (db_models.MediaCatalog.file_path == full_rel_path)
            ).first()
            if exists_fast and exists_fast.creator and exists_fast.creator_slug:
                continue

            project_dir = os.path.dirname(os.path.dirname(file_path))
            project_name = os.path.basename(project_dir)
            artist = project_name.replace("_", " ")
            
            filename = os.path.basename(file_path)
            clean_song_title = clean_string(filename)
            
            # ── DETERMINAR TÍTULO Y GÉNERO CORE ──
            if filename.startswith("1_"):
                title = clean_song_title.title() + " (Day Version)"
                genre = "Day / Uplifting"
            elif filename.startswith("2_"):
                title = clean_song_title.title() + " (Night Version)"
                genre = "Night / Relax"
            else:
                title = clean_song_title.title()
                genre = "Instrumental"
                
            # ── SYNC DE LETRAS CON SU AUDIO RESPECTIVO (Por título o prefijo numérico) ──
            lyrics_path = None
            lyrics_dir = os.path.join(project_dir, "lyrics")
            if os.path.exists(lyrics_dir):
                lyrics_files = glob.glob(os.path.join(lyrics_dir, "*.txt"))
                best_lyric_file = None
                
                # Intento 0: Coincidencia exacta de nombre de archivo (ej: 1_Title.txt o 2_Title.txt)
                song_base = os.path.splitext(filename)[0]
                for lf in lyrics_files:
                    lf_base = os.path.splitext(os.path.basename(lf))[0]
                    if song_base.lower().replace(':', '').replace('-', '') == lf_base.lower().replace(':', '').replace('-', ''):
                        best_lyric_file = lf
                        break

                # Intento 1: Match estricto de título
                if not best_lyric_file:
                    for lf in lyrics_files:
                        clean_lyric_title = clean_string(os.path.basename(lf))
                        if check_title_match(filename, os.path.basename(lf)):
                            best_lyric_file = lf
                            break
                            
                # Intento 2: Match por prefijo numérico (ej: 1_ o 2_)
                if not best_lyric_file:
                    song_num_match = re.search(r'^(\d+)_', filename)
                    if song_num_match:
                        song_num = song_num_match.group(1)
                        for lf in lyrics_files:
                            lyric_filename = os.path.basename(lf)
                            lyric_num_match = re.search(r'^(\d+)[_ ]', lyric_filename)
                            if lyric_num_match and lyric_num_match.group(1) == song_num:
                                best_lyric_file = lf
                                break
                                
                # No fallback to random lyrics files to avoid mismatching
                    
                if best_lyric_file:
                    lyrics_path = os.path.relpath(best_lyric_file, str(MEDIA_LIBRARY_DIR))
                    lyrics_path = os.path.join("media_library", lyrics_path)

            # ── SYNC DE DESCRIPCIÓN CON EL SONG_PLAN.JSON (Por título) ──
            description = f"Pistas de audio premium de {artist}."
            song_plan_path = os.path.join(project_dir, "song_plan.json")
            if os.path.exists(song_plan_path):
                try:
                    with open(song_plan_path, "r", encoding="utf-8") as f:
                        song_plan = json.load(f)
                        for plan in song_plan:
                            plan_title = plan.get("title", "")
                            if check_title_match(filename, plan_title):
                                description = plan.get("description", description)
                                break
                except Exception:
                    pass

            # ── DETERMINAR CREADOR/CANAL (DETERMINÍSTICO PRIMERO) ──
            creator = None
            proj_lower = project_name.lower()
            if "para_millonarios" in proj_lower or "para_millonario" in proj_lower or "millonarios" in proj_lower:
                creator = "Billionaire SoundTrack"
            elif "for_billionaires" in proj_lower or "for_billionaire" in proj_lower or "billionaires" in proj_lower:
                creator = "Billionaires Playlist"
            else:
                # Fallback a clasificador de lenguaje o LLM Agent
                lyrics_text = ""
                if lyrics_path:
                    abs_lyrics = os.path.join(str(MEDIA_LIBRARY_DIR), lyrics_path.replace("media_library/", ""))
                    if os.path.exists(abs_lyrics):
                        try:
                            with open(abs_lyrics, "r", encoding="utf-8") as lf_file:
                                lyrics_text = lf_file.read()
                        except Exception:
                            pass
                
                # Sólo llamamos al Agente LLM en casos ambiguos si hay letras para razonar
                if lyrics_text:
                    agent_res = classify_metadata_with_agent(title, lyrics_text)
                    creator = agent_res.get("creator", "Billionaire SoundTrack")
                    if description.startswith("Pistas de audio"):
                        description = agent_res.get("description", description)
                    if genre == "Instrumental" or genre == "AI Music":
                        genre = agent_res.get("genre", genre)
                else:
                    is_spanish = any(w in clean_song_title or w in artist.lower() for w in ["para", "millonarios", "tema", "riqueza", "mente", "creer"])
                    creator = "Billionaire SoundTrack" if is_spanish else "Billionaires Playlist"

            # Guardar o actualizar base de datos
            exists = db.query(db_models.MediaCatalog).filter(
                (db_models.MediaCatalog.file_path == file_path) |
                (db_models.MediaCatalog.file_path == full_rel_path)
            ).first()
            
            if not exists:
                new_song = db_models.MediaCatalog(
                    title=title,
                    artist=artist,
                    type="song",
                    file_path=full_rel_path,
                    price_tokens=3,
                    price_usd=0.99,
                    is_public=True,
                    genre=genre,
                    lyrics_path=lyrics_path,
                    description=description,
                    creator=creator,
                    creator_slug=_creator_slug_for_name(creator),
                )
                db.add(new_song)
                db.commit()
            else:
                updated = False
                if not exists.creator or exists.creator != creator:
                    exists.creator = creator
                    updated = True
                slug_val = _creator_slug_for_name(creator)
                if slug_val and exists.creator_slug != slug_val:
                    exists.creator_slug = slug_val
                    updated = True
                if lyrics_path and exists.lyrics_path != lyrics_path:
                    exists.lyrics_path = lyrics_path
                    updated = True
                if description and exists.description != description:
                    exists.description = description
                    updated = True
                if genre and exists.genre != genre:
                    exists.genre = genre
                    updated = True
                if updated:
                    db.commit()
            
            # Sincronización automática de letras (IAGS compliant / Whisper Auto-Sync)
            if lyrics_path:
                try:
                    auto_sync_lyrics_for_song(full_rel_path, lyrics_path)
                except Exception as sync_err:
                    logging.getLogger("uvicorn").error(f"Error in automatic lyrics sync for {title}: {sync_err}")
                
        # ── 2. Escanear Audiolibros (Audiobooks / Narrations) ──
        # Escaneamos los subdirectorios en output para tomar SÓLO el archivo unificado completo (evitando fragmentos)
        audiobook_output_root = os.path.join(str(MEDIA_LIBRARY_DIR), "Audiobooks", "output")
        if os.path.exists(audiobook_output_root):
            for project_folder in os.listdir(audiobook_output_root):
                project_dir = os.path.join(audiobook_output_root, project_folder)
                if not os.path.isdir(project_dir):
                    continue
                
                # Buscar archivos mp3 en este directorio de proyecto
                mp3_files = glob.glob(os.path.join(project_dir, "*.mp3"))
                if not mp3_files:
                    continue
                
                # Seleccionar el archivo completo unificado:
                # 1. Buscar el que termine en _FULL.mp3
                full_file = next((f for f in mp3_files if f.endswith("_FULL.mp3") or "_FULL" in f), None)
                if not full_file:
                    # 2. Si no hay _FULL, tomar el archivo más pesado (que representa la mezcla unificada)
                    full_file = max(mp3_files, key=os.path.getsize)
                    
                file_path = full_file
                rel_path = os.path.relpath(file_path, str(MEDIA_LIBRARY_DIR))
                full_rel_path = os.path.join("media_library", rel_path)
                
                filename = os.path.basename(file_path)
                title = filename.replace("_FULL.mp3", "").replace(".mp3", "").replace("_", " ")
                project_name = os.path.basename(project_dir)
                artist = project_name.replace("_", " ")
                
                # ── DETERMINAR CREADOR/CANAL (DETERMINÍSTICO) ──
                creator = "Efecto Metamorfosis"
                artist_override = "MediaSuite Narrations"
                
                proj_lower = project_name.lower()
                if "salazar" in proj_lower:
                    creator = "Mentalidad HBL"
                    artist_override = "Eduardo Salazar"
                else:
                    metaphysics_keywords = [
                        "curacion", "juego", "vida", "kybalion", "vibracion", 
                        "pensamiento", "rico", "metafisica", "hopkins", "shinn", 
                        "trimegisto", "atkinson", "wattles", "mendez"
                    ]
                    if any(kw in proj_lower for kw in metaphysics_keywords):
                        creator = "Audiolibros de Metafísica"
                        artist_override = "Metafísica & Ley de Atracción"
                    else:
                        creator = "Efecto Metamorfosis"
                        artist_override = artist
                
                # Truncar defensivamente para cumplir límites de MySQL (VARCHAR limits)
                if title and len(title) > 147:
                    title = title[:147] + "..."
                if artist_override and len(artist_override) > 97:
                    artist_override = artist_override[:97] + "..."
                if creator and len(creator) > 97:
                    creator = creator[:97] + "..."
                        
                # Buscar metadatos pregrabados del audiolibro
                metadata_file = os.path.join(project_dir, "metadata.json")
                description = f"Narración premium: {title}."
                genre = "Audiolibro / Narración"
                
                if os.path.exists(metadata_file):
                    try:
                        with open(metadata_file, "r", encoding="utf-8") as f:
                            meta_data = json.load(f)
                            if "description" in meta_data:
                                description = meta_data["description"]
                            if "genre" in meta_data:
                                genre = meta_data["genre"]
                    except Exception:
                        pass

                exists = db.query(db_models.MediaCatalog).filter(
                    (db_models.MediaCatalog.file_path == file_path) |
                    (db_models.MediaCatalog.file_path == full_rel_path)
                ).first()
                
                if not exists:
                    new_book = db_models.MediaCatalog(
                        title=title,
                        artist=artist_override,
                        type="audiobook",
                        file_path=full_rel_path,
                        price_tokens=3,
                        price_usd=4.99,
                        is_public=True,
                        genre=genre,
                        description=description,
                        creator=creator,
                        creator_slug=_creator_slug_for_name(creator),
                    )
                    db.add(new_book)
                    db.commit()
                else:
                    updated = False
                    if not exists.creator or exists.creator != creator:
                        exists.creator = creator
                        updated = True
                    slug_val = _creator_slug_for_name(creator)
                    if slug_val and exists.creator_slug != slug_val:
                        exists.creator_slug = slug_val
                        updated = True
                    if not exists.artist or (exists.artist == "MediaSuite Narrations" and artist_override != "MediaSuite Narrations"):
                        exists.artist = artist_override
                        updated = True
                    if updated:
                        db.commit()

_LAST_SCAN_TS = 0.0
_SCAN_IN_PROGRESS = False

def _scan_catalog_task():
    global _LAST_SCAN_TS, _SCAN_IN_PROGRESS
    import time
    now = time.time()
    if _SCAN_IN_PROGRESS or (now - _LAST_SCAN_TS < 600):
        return
    _SCAN_IN_PROGRESS = True
    _LAST_SCAN_TS = now
    from database import SessionLocal
    db = SessionLocal()
    try:
        perform_scan(db)
    except Exception as e:
        import logging
        logging.getLogger("uvicorn").error(f"Error scanning catalog in background: {e}")
    finally:
        db.close()
        _SCAN_IN_PROGRESS = False

@router.get("/catalog", response_model=List[CatalogItemResponse])
def get_catalog(background_tasks: BackgroundTasks, type: Optional[str] = None, scan: bool = False, db: Session = Depends(get_db)):
    """
    Obtiene el catálogo público de canciones, álbumes, etc.
    Sincroniza y escanea automáticamente la carpeta media_library para registrar
    nuevos recursos (canciones, audiolibros, reportajes) generados.
    """
    total_items = db.query(db_models.MediaCatalog).count()
    
    # Solo escaneamos el disco si se solicita explícitamente (?scan=true) o si la base de datos está vacía,
    # de manera asíncrona mediante BackgroundTasks para no congelar la petición (thermodynamic performance principle).
    if scan or total_items == 0:
        background_tasks.add_task(_scan_catalog_task)

    query = db.query(db_models.MediaCatalog).filter(db_models.MediaCatalog.is_public == True)
    if type:
        query = query.filter(db_models.MediaCatalog.type == type)
    else:
        # Excluir temporalmente audiolibros del feed de música principal
        query = query.filter(db_models.MediaCatalog.type != "audiobook")
    return query.all()

@router.post("/catalog", response_model=CatalogItemResponse)
def add_to_catalog(item: CatalogItemCreate, db: Session = Depends(get_db)):
    """(Admin) Añadir un recurso multimedia al catálogo para la venta."""
    # Validación de existencia física
    if not os.path.exists(item.file_path):
         raise HTTPException(status_code=400, detail=f"El archivo especificado no existe: {item.file_path}")
         
    new_item = db_models.MediaCatalog(
        title=item.title,
        description=item.description,
        artist=item.artist,
        type=item.type,
        file_path=item.file_path,
        album_art_path=item.album_art_path,
        price_tokens=item.price_tokens,
        price_usd=item.price_usd
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

# ══════════════════════════════════════════════════════════════
#  PROCESAMIENTO DE COMPRAS Y PAGOS
# ══════════════════════════════════════════════════════════════

from fastapi import Response
@router.post("/purchase")
def make_purchase(req: PurchaseRequest, request: Request, response: Response = None, db: Session = Depends(get_db)):
    """
    Procesa la compra de un track o recurso.
    Soporta:
    1. Pago con Tokens (Usuario logueado).
    2. PayPal (Simulación de pasarela para Invitados y Registrados).
    3. Auto-Registro de cuenta en base al checkout de invitado.
    """
    media_item = db.query(db_models.MediaCatalog).filter(db_models.MediaCatalog.id == req.media_catalog_id).first()
    if not media_item:
        raise HTTPException(status_code=404, detail="Recurso no encontrado en el catálogo")

    # Identificar si hay sesión JWT iniciada (Usuario Registrado)
    token = request.cookies.get("mediasuite_session")
    current_user_name = None
    user = None
    if token:
        try:
            from routers.auth import verify_token
            payload = verify_token(token)
            if payload:
                current_user_name = payload.get("user")
                user = db.query(db_models.User).filter(db_models.User.username == current_user_name).first()
        except Exception:
            pass

    # Si es invitado y pide auto_register, creamos su cuenta primero
    if not user and req.payment_method == "paypal" and req.auto_register and req.guest_email:
        from auth_utils import hash_password

        # Verificar si el correo ya existe
        existing_user = db.query(db_models.User).filter(
            (db_models.User.email == str(req.guest_email)) | 
            (db_models.User.username == (req.guest_username or str(req.guest_email).split("@")[0]))
        ).first()
        
        if not existing_user:
            # Crear cuenta automáticamente
            username = req.guest_username or f"user_{uuid.uuid4().hex[:6]}"
            pwd = req.guest_password or f"Pass.{uuid.uuid4().hex[:8]}"
            user = db_models.User(
                username=username,
                email=str(req.guest_email),
                password_hash=hash_password(pwd),
                role="client",
                tokens_balance=5 # 5 de regalo
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            # Opcional: Emitir cookie si Response está disponible
            try:
                from routers.auth import _issue_jwt, JWT_EXPIRATION_DAYS
                jwt_token = _issue_jwt(user.username, user.role)
                if response:
                    response.set_cookie(
                        "mediasuite_session",
                        jwt_token,
                        httponly=True,
                        samesite="lax",
                        max_age=JWT_EXPIRATION_DAYS * 24 * 3600,
                    )
            except Exception:
                pass
        else:
            user = existing_user

    # Validar flujo de Tokens (Solo usuarios registrados)
    if req.payment_method == "tokens":
        if not user:
            raise HTTPException(status_code=401, detail="Debe iniciar sesión para pagar con créditos/tokens")
        if user.tokens_balance < media_item.price_tokens:
            raise HTTPException(status_code=400, detail="Saldo de tokens insuficiente")
        
        # Debitar tokens
        user.tokens_balance -= media_item.price_tokens
        
        # Crear registro de compra
        purchase = db_models.Purchase(
            user_id=user.id,
            media_catalog_id=media_item.id,
            payment_method="tokens",
            amount_paid=0.00,
            transaction_id=f"TOK-{uuid.uuid4().hex[:12].upper()}"
        )
        db.add(purchase)
        db.commit()
        db.refresh(purchase)
        return {"success": True, "message": "Canje de tokens exitoso", "purchase_id": purchase.id, "balance": user.tokens_balance, "auto_user": user.username if req.auto_register else None}

    # Flujo PayPal (Invitado o Registrado)
    elif req.payment_method == "paypal":
        buyer_email = req.guest_email if not user else user.email
        if not buyer_email:
            raise HTTPException(status_code=400, detail="Se requiere correo electrónico para facturar")
            
        # PayPal is never simulated here: a real approved order must be captured.
        if not req.order_id:
            raise HTTPException(status_code=400, detail="Se requiere el order_id aprobado de PayPal para completar la compra")

        from paypal_runtime import get_paypal_runtime
        import httpx

        sandbox = bool(req.sandbox_mode)
        paypal_client_id, paypal_client_secret, api_url, paypal_mode = get_paypal_runtime(sandbox)
        if not paypal_client_id or not paypal_client_secret:
            raise HTTPException(
                status_code=503,
                detail="PayPal credentials are not configured for this mode (live/sandbox).",
            )

        tx_id = None
        try:
            # 1. Obtener Token de Acceso de PayPal
            async_client = httpx
            token_res = async_client.post(
                f"{api_url}/v1/oauth2/token",
                auth=(paypal_client_id, paypal_client_secret),
                data={"grant_type": "client_credentials"},
                timeout=15.0
            )
            if token_res.status_code != 200:
                raise HTTPException(status_code=500, detail="No se pudo autenticar con PayPal API")

            access_token = token_res.json().get("access_token")
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }

            # 2. Capturar pago (idempotente: recupera órdenes ya capturadas)
            tx_id, _capture_data = _capture_paypal_order(
                async_client,
                api_url,
                headers,
                req.order_id,
                expected_value=float(media_item.price_usd or 0),
                expected_currency="USD",
            )
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Error de red con pasarela de PayPal: {str(e)}")

        # 3. Persistir la compra de forma idempotente. Si el pago ya se había
        # capturado en un intento anterior, se reutiliza el registro existente.
        purchase = db.query(db_models.Purchase).filter(
            db_models.Purchase.transaction_id == tx_id
        ).first()
        is_new_purchase = purchase is None
        if is_new_purchase:
            try:
                purchase = db_models.Purchase(
                    user_id=user.id if user else None,
                    guest_email=encrypt_data(str(buyer_email)) if not user else None, # Cifrado ZK para invitados
                    media_catalog_id=media_item.id,
                    payment_method="paypal",
                    amount_paid=media_item.price_usd,
                    transaction_id=tx_id
                )
                db.add(purchase)
                db.commit()
                db.refresh(purchase)
            except Exception as db_err:
                db.rollback()
                import logging
                logging.getLogger(__name__).error(
                    "Pago PayPal %s capturado pero no se pudo registrar en BD: %s", tx_id, db_err
                )
                raise HTTPException(
                    status_code=500,
                    detail=(
                        f"El pago fue capturado en PayPal (transacción {tx_id}) pero no se pudo "
                        "registrar la compra. No vuelvas a pagar: contacta a soporte con este código."
                    ),
                )

        # ── Acreditar ganancia neta al Artista y aplicar regla de retiro PayPal (Marketplace Split) ──
        artist_split = None
        try:
            if not is_new_purchase:
                raise RuntimeError("purchase_already_recorded")
            from routers.artist_studio import record_artist_sale_and_split

            # Sandbox-only demo attribution: when a judge buys from the demo
            # label channel, credit that label profile so the 85/15 ledger is
            # visible in the demo Artist Studio. Live sales keep the track's
            # real creator attribution.
            split_override = None
            if sandbox and req.channel_slug:
                channel_norm = re.sub(r"[^a-z0-9]", "", req.channel_slug.lower())
                if "billionairerecords" in channel_norm:
                    channel_profile = db.query(db_models.ArtistProfile).filter(
                        db_models.ArtistProfile.slug == req.channel_slug
                    ).first()
                    if channel_profile:
                        split_override = channel_profile.slug

            artist_split = record_artist_sale_and_split(
                db=db,
                media_item=media_item,
                gross_amount_usd=float(media_item.price_usd or 0.99),
                buyer_email=str(buyer_email),
                purchase_id=purchase.id,
                paypal_order_id=req.order_id or tx_id,
                sale_channel="web_portal",
                sandbox=sandbox,
                artist_slug_override=split_override,
            )
            # Registrar señal de compra (+25) en el Algoritmo de Recomendación
            sig = db_models.UserRecommendationSignal(
                user_id=user.id if user else None,
                signal_type="purchase",
                media_catalog_id=media_item.id,
                extracted_genre=media_item.genre,
                extracted_artist=media_item.creator or media_item.artist,
                raw_query=f"Purchased: {media_item.title}",
                weight=25.0,
            )
            db.add(sig)
            db.commit()
        except Exception as split_err:
            if str(split_err) != "purchase_already_recorded":
                import logging
                logging.getLogger(__name__).warning(f"No se pudo registrar artist_split: {split_err}")

        return {
            "success": True,
            "message": "Pago aprobado por PayPal / Tarjeta de Crédito",
            "purchase_id": purchase.id,
            "transaction_id": tx_id,
            "auto_user": user.username if user else None,
            "artist_split": artist_split,
        }

    else:
        raise HTTPException(status_code=400, detail="Método de pago no soportado")


@router.post("/demo/purchase")
def demo_purchase(req: PurchaseRequest, request: Request, db: Session = Depends(get_db)):
    """Judge/local-only purchase simulation: records the sale without PayPal.

    Enabled by ``ALLOW_DEMO_CHECKOUT=1`` (see ``.env.example``). It never calls
    PayPal nor charges money, so the purchase, library access, artist split and
    download flow can be evaluated offline.
    """
    if not DEMO_CHECKOUT_ENABLED:
        raise HTTPException(status_code=404, detail="Demo checkout is disabled on this server")

    media_item = db.query(db_models.MediaCatalog).filter(db_models.MediaCatalog.id == req.media_catalog_id).first()
    if not media_item:
        raise HTTPException(status_code=404, detail="Recurso no encontrado en el catálogo")

    user = _session_user(request, db)
    buyer_email = req.guest_email if not user else user.email
    if not buyer_email:
        raise HTTPException(status_code=400, detail="Se requiere correo electrónico para la compra demo")

    tx_id = f"DEMO-{uuid.uuid4().hex[:16].upper()}"
    try:
        purchase = db_models.Purchase(
            user_id=user.id if user else None,
            guest_email=encrypt_data(str(buyer_email)) if not user else None,
            media_catalog_id=media_item.id,
            payment_method="paypal",
            amount_paid=media_item.price_usd or 0,
            transaction_id=tx_id,
        )
        db.add(purchase)
        db.commit()
        db.refresh(purchase)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"No se pudo registrar la compra demo: {exc}")

    artist_split = None
    try:
        from routers.artist_studio import record_artist_sale_and_split

        split_override = None
        if req.channel_slug:
            channel_norm = re.sub(r"[^a-z0-9]", "", req.channel_slug.lower())
            if "billionairerecords" in channel_norm:
                channel_profile = db.query(db_models.ArtistProfile).filter(
                    db_models.ArtistProfile.slug == req.channel_slug
                ).first()
                if channel_profile:
                    split_override = channel_profile.slug

        artist_split = record_artist_sale_and_split(
            db=db,
            media_item=media_item,
            gross_amount_usd=float(media_item.price_usd or 0.99),
            buyer_email=str(buyer_email),
            purchase_id=purchase.id,
            paypal_order_id=tx_id,
            sale_channel="demo",
            sandbox=True,
            artist_slug_override=split_override,
        )
        db.add(db_models.UserRecommendationSignal(
            user_id=user.id if user else None,
            signal_type="purchase",
            media_catalog_id=media_item.id,
            extracted_genre=media_item.genre,
            extracted_artist=media_item.creator or media_item.artist,
            raw_query=f"Demo purchase: {media_item.title}",
            weight=25.0,
        ))
        db.commit()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Demo purchase split failed: %s", exc)
        db.rollback()

    return {
        "success": True,
        "message": "Compra demo registrada (sin cargo real)",
        "demo": True,
        "purchase_id": purchase.id,
        "transaction_id": tx_id,
        "artist_split": artist_split,
    }


@router.post("/paypal/create-order")
def create_paypal_order(req: PurchaseRequest, db: Session = Depends(get_db)):
    """
    Inicializa una orden real en la API de PayPal para el recurso seleccionado.
    Retorna el id de la orden de PayPal.
    """
    media_item = db.query(db_models.MediaCatalog).filter(db_models.MediaCatalog.id == req.media_catalog_id).first()
    if not media_item:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")

    from paypal_runtime import get_paypal_runtime
    import httpx

    sandbox = bool(req.sandbox_mode)
    paypal_client_id, paypal_client_secret, api_url, paypal_mode = get_paypal_runtime(sandbox)

    if not paypal_client_id or not paypal_client_secret:
        if sandbox:
            raise HTTPException(
                status_code=503,
                detail="Sandbox mode requested, but PAYPAL_SANDBOX_CLIENT_ID / PAYPAL_SANDBOX_CLIENT_SECRET are not configured on the server.",
            )
        # Fallback a simulación si no hay credenciales configuradas
        return {"success": True, "order_id": f"MOCK_ORD_{uuid.uuid4().hex[:12].upper()}", "mode": "mock"}

    try:
        # 1. Obtener token de acceso
        async_client = httpx
        token_res = async_client.post(
            f"{api_url}/v1/oauth2/token",
            auth=(paypal_client_id, paypal_client_secret),
            data={"grant_type": "client_credentials"},
            timeout=15.0
        )
        if token_res.status_code != 200:
            raise HTTPException(status_code=500, detail="No se pudo autenticar con PayPal API")
            
        access_token = token_res.json().get("access_token")
        
        # 2. Crear orden
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        order_payload = {
            "intent": "CAPTURE",
            "purchase_units": [{
                "amount": {
                    "currency_code": "USD",
                    "value": f"{media_item.price_usd:.2f}"
                },
                "description": f"MediaSuite - {media_item.title}"
            }]
        }
        order_res = async_client.post(
            f"{api_url}/v2/checkout/orders",
            headers=headers,
            json=order_payload,
            timeout=15.0
        )
        if order_res.status_code in [200, 201]:
            order_data = order_res.json()
            return {"success": True, "order_id": order_data.get("id"), "mode": paypal_mode}
        else:
            error_detail = "No se pudo crear la orden en PayPal"
            try:
                error_detail = order_res.json().get("message") or error_detail
            except Exception:
                pass
            raise HTTPException(status_code=400, detail=error_detail)
            
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Error de red con PayPal: {str(e)}")


# ══════════════════════════════════════════════════════════════
#  DESCARGAS Y DRM TRIGGER
# ══════════════════════════════════════════════════════════════

@router.get("/download-link/{purchase_id}")
def generate_download_link(purchase_id: int, request: Request, db: Session = Depends(get_db)):
    """Genera un token seguro y temporal para descargar el archivo comprado."""
    purchase = db.query(db_models.Purchase).filter(db_models.Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Registro de compra no encontrado")

    # Preferred path: short-lived token in Redis (production DRM/watermark flow).
    try:
        import redis
        from config import REDIS_URL
        r = redis.from_url(REDIS_URL, socket_connect_timeout=0.5, socket_timeout=0.5)
        r.ping()
        download_token = uuid.uuid4().hex
        r.setex(f"dl_token:{download_token}", 86400, str(purchase.id))
        return {
            "success": True,
            "download_url": f"/api/ecommerce/download/{download_token}",
        }
    except Exception:
        # Local/demo fallback when Redis is not running: signed direct download.
        return {
            "success": True,
            "download_url": (
                f"/api/ecommerce/download-direct/{purchase.id}"
                f"?sig={_download_signature(purchase.id)}"
            ),
            "mode": "direct",
        }


@router.get("/download-direct/{purchase_id}")
def download_direct(purchase_id: int, sig: str = "", db: Session = Depends(get_db)):
    """Direct download fallback for local/demo runs without Redis."""
    if not sig or not hmac.compare_digest(sig, _download_signature(purchase_id)):
        raise HTTPException(status_code=403, detail="Firma de descarga inválida")
    purchase = db.query(db_models.Purchase).filter(db_models.Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Registro de compra no encontrado")
    media_item = purchase.media_item
    if not media_item or not media_item.file_path:
        raise HTTPException(status_code=404, detail="El recurso comprado no tiene archivo asociado")
    from config import MEDIA_LIBRARY_DIR
    relative = media_item.file_path.replace("media_library/", "", 1).replace("media_library\\", "", 1).lstrip("/\\")
    file_path = os.path.join(str(MEDIA_LIBRARY_DIR), relative)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Archivo no disponible en este entorno")
    return FileResponse(file_path, filename=os.path.basename(file_path), media_type="application/octet-stream")

@router.get("/download/{token}")
def download_licensed_file(token: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Descarga el recurso inyectando los metadatos personalizados del comprador.
    Utiliza el worker de Celery en background para procesar el ID3.
    """
    import redis
    from config import REDIS_URL
    r = redis.from_url(REDIS_URL, decode_responses=True)
    
    purchase_id_str = r.get(f"dl_token:{token}")
    if not purchase_id_str:
        raise HTTPException(status_code=410, detail="El enlace de descarga ha expirado o es inválido (Límite de 24 horas)")
        
    purchase_id = int(purchase_id_str)
    purchase = db.query(db_models.Purchase).filter(db_models.Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
        
    media_item = purchase.media_item
    
    # 1. Determinar el identificador del comprador (para la marca de agua)
    buyer_id = "Invitado"
    if purchase.user:
        buyer_id = purchase.user.username
    elif purchase.guest_email:
        buyer_id = decrypt_data(purchase.guest_email)
        
    # 2. Generar Hash de Licencia único
    license_hash = hashlib.sha256(f"{purchase.id}-{buyer_id}-{purchase.transaction_id}".encode()).hexdigest()
    
    # 3. Lanzar la tarea de inyección DRM en Celery de forma sincrónica para descargas en tiempo real,
    #    o retornar directamente el archivo base si es un video/zip grande.
    #    Para archivos MP3 pequeños, la inyección mutagen toma < 0.2 segundos.
    
    source_file = media_item.file_path
    if not os.path.isabs(source_file):
        from config import ROOT_DIR
        source_file = os.path.join(ROOT_DIR, source_file)

    if not os.path.exists(source_file):
        raise HTTPException(status_code=404, detail=f"El archivo fuente no se encuentra en el VPS (Ruta: {source_file})")

    # Carpeta temporal de descargas de comercio electrónico
    dl_cache_dir = os.path.join(os.path.dirname(source_file), "licensed_downloads")
    os.makedirs(dl_cache_dir, exist_ok=True)
    
    album_art = media_item.album_art_path
    if album_art and not os.path.isabs(album_art):
        from config import ROOT_DIR
        album_art = os.path.join(ROOT_DIR, album_art)

    # Si es audio (MP3), inyectamos DRM
    if source_file.lower().endswith(".mp3"):
        from tasks.drm_tasks import inject_drm_and_metadata
        # Ejecutamos de forma síncrona aquí usando .apply() para entregar el archivo modificado inmediatamente
        task_res = inject_drm_and_metadata.apply(args=[
            source_file,
            dl_cache_dir,
            purchase.id,
            buyer_id,
            license_hash,
            media_item.title,
            media_item.artist,
            album_art
        ])
        final_file_path = task_res.result
    else:
        # Para Zips o Videos, retornamos directo
        final_file_path = source_file
        
    # Incrementar contador de descargas
    purchase.download_count += 1
    db.commit()
    
    return FileResponse(
        path=final_file_path,
        media_type="application/octet-stream",
        filename=os.path.basename(final_file_path)
    )

# ══════════════════════════════════════════════════════════════
#  HISTORIAL Y TOKENS DEL CLIENTE
# ══════════════════════════════════════════════════════════════

@router.get("/me/purchases")
def get_my_purchases(request: Request, db: Session = Depends(get_db)):
    """Obtiene el historial de descargas del usuario registrado."""
    token = request.cookies.get("mediasuite_session")
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
        
    from routers.auth import verify_token
    payload = verify_token(token)
    if not payload:
         raise HTTPException(status_code=401, detail="Sesión expirada")
         
    username = payload.get("user")
    user = db.query(db_models.User).filter(db_models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    purchases = db.query(db_models.Purchase).filter(db_models.Purchase.user_id == user.id).all()
    
    res = []
    for p in purchases:
        res.append({
            "purchase_id": p.id,
            "title": p.media_item.title,
            "artist": p.media_item.artist,
            "type": p.media_item.type,
            "amount_paid": float(p.amount_paid) if p.amount_paid else 0.00,
            "payment_method": p.payment_method,
            "transaction_id": p.transaction_id,
            "download_count": p.download_count,
            "purchased_at": p.purchased_at.isoformat()
        })
    return res

# ══════════════════════════════════════════════════════════════
#  PLANES DE SUSCRIPCIÓN Y RE-DESCARGA
# ══════════════════════════════════════════════════════════════

SUBSCRIPTION_PLANS = {
    "starter":          {"name": "Starter",          "price_usd": 4.99,  "tokens_per_month": 15,  "file_types": ["mp3", "lyrics"],                      "description": "15 descargas/mes · MP3 + Letras",                    "color": "#06b6d4"},
    "starter_monthly":  {"name": "Starter Mensual",  "price_usd": 4.99,  "tokens_per_month": 15,  "file_types": ["mp3", "lyrics"],                      "description": "15 descargas/mes · MP3 + Letras",                    "color": "#06b6d4"},
    "starter_annual":   {"name": "Starter Anual",    "price_usd": 47.88, "tokens_per_month": 15,  "file_types": ["mp3", "lyrics"],                      "description": "15 descargas/mes · MP3 + Letras (Facturado Anual)",  "color": "#06b6d4"},
    "pro":              {"name": "Pro",              "price_usd": 9.99,  "tokens_per_month": 35,  "file_types": ["mp3", "wav", "lyrics", "stems"],        "description": "35 descargas/mes · MP3 + WAV + Stems",              "color": "#7c3aed"},
    "pro_monthly":      {"name": "Pro Mensual",      "price_usd": 9.99,  "tokens_per_month": 35,  "file_types": ["mp3", "wav", "lyrics", "stems"],        "description": "35 descargas/mes · MP3 + WAV + Stems",              "color": "#7c3aed"},
    "pro_annual":       {"name": "Pro Anual",        "price_usd": 89.88, "tokens_per_month": 35,  "file_types": ["mp3", "wav", "lyrics", "stems"],        "description": "35 descargas/mes · MP3 + WAV + Stems (Facturado Anual)", "color": "#7c3aed"},
    "enterprise":       {"name": "Enterprise",       "price_usd": 29.99, "tokens_per_month": 100, "file_types": ["mp3", "wav", "lyrics", "stems", "video"],"description": "100 descargas/mes · Acceso Completo",              "color": "#f59e0b"},
}

@router.get("/plans")
def get_subscription_plans():
    return {"plans": SUBSCRIPTION_PLANS}

class SubscriptionRequest(BaseModel):
    plan_name: str
    payment_method: str = "paypal"
    order_id: Optional[str] = None
    sandbox_mode: Optional[bool] = False

@router.post("/subscribe")
def subscribe_to_plan(req: SubscriptionRequest, request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("mediasuite_session")
    if not token:
        raise HTTPException(status_code=401, detail="Debe iniciar sesión")
    from routers.auth import verify_token
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Sesión expirada")
    user = db.query(db_models.User).filter(db_models.User.username == payload.get("user")).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    plan = SUBSCRIPTION_PLANS.get(req.plan_name)
    if not plan:
        raise HTTPException(status_code=400, detail=f"Plan '{req.plan_name}' no existe")

    # Verificar si es pago con PayPal (tiene order_id)
    if req.payment_method == "paypal":
        if not req.order_id:
            raise HTTPException(status_code=400, detail="Se requiere el order_id aprobado de PayPal para activar la suscripción")
        from paypal_runtime import get_paypal_runtime
        import httpx
        tx_id = None
        sandbox = bool(req.sandbox_mode)
        paypal_client_id, paypal_client_secret, api_url, paypal_mode = get_paypal_runtime(sandbox)
        if not paypal_client_id or not paypal_client_secret:
            raise HTTPException(status_code=503, detail="PayPal credentials are not configured for this mode (live/sandbox).")
        try:
            async_client = httpx
            token_res = async_client.post(
                f"{api_url}/v1/oauth2/token",
                auth=(paypal_client_id, paypal_client_secret),
                data={"grant_type": "client_credentials"},
                timeout=15.0
            )
            if token_res.status_code != 200:
                raise HTTPException(status_code=500, detail="No se pudo autenticar con PayPal API")

            access_token = token_res.json().get("access_token")
            headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
            tx_id, _capture_data = _capture_paypal_order(
                async_client,
                api_url,
                headers,
                req.order_id,
                expected_value=float(plan["price_usd"]),
                expected_currency="USD",
            )
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Error de red con PayPal: {str(e)}")
        if not tx_id:
            raise HTTPException(status_code=400, detail="No se pudo verificar la transacción de PayPal")

    now = datetime.datetime.utcnow()
    old_sub = db.query(db_models.Subscription).filter(
        db_models.Subscription.user_id == user.id,
        db_models.Subscription.status == "active"
    ).first()
    if old_sub:
        old_sub.status = "cancelled"
    sub = db_models.Subscription(
        user_id=user.id,
        plan_name=plan["name"],
        tokens_per_month=plan["tokens_per_month"],
        file_types_allowed=",".join(plan["file_types"]),
        status="active",
        current_period_end=now + datetime.timedelta(days=30)
    )
    db.add(sub)
    user.tokens_balance += plan["tokens_per_month"]
    db.commit()
    return {
        "success": True,
        "plan": plan["name"],
        "tokens_granted": plan["tokens_per_month"],
        "new_balance": user.tokens_balance,
        "transaction_id": tx_id or None,
    }


@router.post("/demo/subscribe")
def demo_subscribe(req: SubscriptionRequest, request: Request, db: Session = Depends(get_db)):
    """Activate a subscription locally without PayPal (judge demo only)."""
    if not DEMO_CHECKOUT_ENABLED:
        raise HTTPException(status_code=404, detail="Demo checkout is disabled on this server")
    user = _session_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Inicia sesión con una cuenta demo para probar la suscripción")
    plan = SUBSCRIPTION_PLANS.get(req.plan_name)
    if not plan:
        raise HTTPException(status_code=400, detail=f"Plan '{req.plan_name}' no existe")

    now = datetime.datetime.utcnow()
    old_sub = db.query(db_models.Subscription).filter(
        db_models.Subscription.user_id == user.id,
        db_models.Subscription.status == "active",
    ).first()
    if old_sub:
        old_sub.status = "cancelled"
    db.add(db_models.Subscription(
        user_id=user.id,
        plan_name=plan["name"],
        tokens_per_month=plan["tokens_per_month"],
        file_types_allowed=",".join(plan["file_types"]),
        status="active",
        current_period_end=now + datetime.timedelta(days=30),
    ))
    user.tokens_balance += plan["tokens_per_month"]
    db.commit()
    return {
        "success": True,
        "message": "Suscripción demo activada (sin cargo real)",
        "demo": True,
        "plan": plan["name"],
        "tokens_granted": plan["tokens_per_month"],
        "new_balance": user.tokens_balance,
        "transaction_id": f"DEMO-SUB-{uuid.uuid4().hex[:12].upper()}",
    }


@router.post("/paypal/create-subscription-order")
def create_subscription_paypal_order(req: SubscriptionRequest, db: Session = Depends(get_db)):
    """Crea una orden de PayPal para un plan de suscripción."""
    plan = SUBSCRIPTION_PLANS.get(req.plan_name)
    if not plan:
        raise HTTPException(status_code=400, detail=f"Plan '{req.plan_name}' no existe")

    from paypal_runtime import get_paypal_runtime
    import httpx

    sandbox = bool(req.sandbox_mode)
    paypal_client_id, paypal_client_secret, api_url, paypal_mode = get_paypal_runtime(sandbox)
    if not paypal_client_id or not paypal_client_secret:
        if sandbox:
            raise HTTPException(status_code=503, detail="Sandbox mode requested, but sandbox PayPal credentials are not configured on the server.")
        return {"success": True, "order_id": f"MOCK_ORD_{uuid.uuid4().hex[:12].upper()}", "plan": plan["name"], "amount": plan["price_usd"], "mode": "mock"}

    try:
        async_client = httpx
        token_res = async_client.post(
            f"{api_url}/v1/oauth2/token",
            auth=(paypal_client_id, paypal_client_secret),
            data={"grant_type": "client_credentials"},
            timeout=15.0
        )
        if token_res.status_code != 200:
            raise HTTPException(status_code=500, detail="No se pudo autenticar con PayPal API")
        access_token = token_res.json().get("access_token")
        headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
        order_payload = {
            "intent": "CAPTURE",
            "purchase_units": [{
                "amount": {
                    "currency_code": "USD",
                    "value": f"{plan['price_usd']:.2f}"
                },
                "description": f"MediaSuite - Plan {plan['name']}"
            }]
        }
        order_res = async_client.post(
            f"{api_url}/v2/checkout/orders",
            headers=headers, json=order_payload, timeout=15.0
        )
        if order_res.status_code in [200, 201]:
            order_data = order_res.json()
            return {"success": True, "order_id": order_data.get("id"), "plan": plan["name"], "amount": plan["price_usd"], "mode": paypal_mode}
        else:
            raise HTTPException(status_code=400, detail="No se pudo crear la orden en PayPal")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Error de red con PayPal: {str(e)}")

@router.get("/me/redownload/{purchase_id}")
def redownload_purchased(purchase_id: int, request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("mediasuite_session")
    if not token:
        raise HTTPException(status_code=401, detail="Debe iniciar sesión")
    from routers.auth import verify_token
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Sesión expirada")
    user = db.query(db_models.User).filter(db_models.User.username == payload.get("user")).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    purchase = db.query(db_models.Purchase).filter(
        db_models.Purchase.id == purchase_id,
        db_models.Purchase.user_id == user.id
    ).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    redownload_cost = max(1, purchase.media_item.price_tokens // 3)
    if user.tokens_balance < redownload_cost:
        raise HTTPException(status_code=400, detail=f"Saldo insuficiente. Costo: {redownload_cost} crédito(s). Tu saldo: {user.tokens_balance}")
    user.tokens_balance -= redownload_cost
    purchase.download_count += 1
    db.commit()
    import redis
    from config import REDIS_URL
    r = redis.from_url(REDIS_URL)
    download_token = uuid.uuid4().hex
    r.setex(f"dl_token:{download_token}", 172800, str(purchase.id))
    return {"success": True, "download_url": f"/api/ecommerce/download/{download_token}", "cost_tokens": redownload_cost, "new_balance": user.tokens_balance}

@router.get("/me/info")
def get_my_info(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("mediasuite_session")
    if not token:
        return {"authenticated": False, "user": None}
    from routers.auth import verify_token
    payload = verify_token(token)
    if not payload:
        return {"authenticated": False, "user": None}
    user = db.query(db_models.User).filter(db_models.User.username == payload.get("user")).first()
    if not user:
        return {"authenticated": False, "user": None}
    active_sub = db.query(db_models.Subscription).filter(
        db_models.Subscription.user_id == user.id,
        db_models.Subscription.status == "active"
    ).first()
    return {
        "authenticated": True,
        "user": {"id": user.id, "username": user.username, "email": user.email, "role": user.role, "tokens_balance": user.tokens_balance},
        "subscription": {
            "plan": active_sub.plan_name,
            "tokens_per_month": active_sub.tokens_per_month,
            "file_types": active_sub.file_types_allowed.split(","),
            "period_end": active_sub.current_period_end.isoformat() if active_sub.current_period_end else None
        } if active_sub else None
    }

# ══════════════════════════════════════════════════════════════
#  GESTIÓN DE METADATOS DEL CATÁLOGO (Admin)
# ══════════════════════════════════════════════════════════════

class CatalogItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    artist: Optional[str] = None
    genre: Optional[str] = None
    price_tokens: Optional[int] = None
    price_usd: Optional[float] = None
    album_art_path: Optional[str] = None
    lyrics_path: Optional[str] = None
    is_public: Optional[bool] = None

@router.patch("/catalog/{item_id}")
def update_catalog_item(item_id: int, update: CatalogItemUpdate, request: Request, db: Session = Depends(get_db)):
    """(Admin) Actualiza metadatos de un item del catálogo."""
    token = request.cookies.get("mediasuite_session")
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    from routers.auth import verify_token
    payload = verify_token(token)
    if not payload or payload.get("role") not in ["super_admin", "tools_admin"]:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    item = db.query(db_models.MediaCatalog).filter(db_models.MediaCatalog.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    for field, value in update.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return {"success": True, "item": {"id": item.id, "title": item.title, "artist": item.artist}}


# ══════════════════════════════════════════════════════════════
#  GESTIÓN DE PORTADAS (ALBUM ART) — AUTO-PEXELS + UPLOAD
# ══════════════════════════════════════════════════════════════

import httpx
import shutil
from fastapi import UploadFile, File

def _build_pexels_query(title: str, genre: str, creator: str, artist: str) -> str:
    """
    Construye una query de búsqueda contextual para Pexels basada en
    el título, género y canal del audio. Prioriza términos visuales atractivos.
    """
    title_clean = title.replace("(Day Version)", "").replace("(Night Version)", "").replace("(Instrumental)", "").strip()
    # Eliminar prefijos de número
    import re
    title_clean = re.sub(r'^\d+[\s_\-]+', '', title_clean)

    # Detectar keywords del contexto
    genre_lower = (genre or "").lower()
    creator_lower = (creator or "").lower()
    title_lower = title_clean.lower()

    # Mapeo de géneros a términos visuales
    visual_terms = []
    if "afrobeat" in genre_lower or "afro" in title_lower:
        visual_terms = ["african music vibrant colors", "african sunset gold"]
    elif "blues" in genre_lower:
        visual_terms = ["blues music soulful", "vintage guitar smoke"]
    elif "dancehall" in genre_lower or "reggae" in genre_lower:
        visual_terms = ["dancehall caribbean vibrant", "tropical music energy"]
    elif "deep house" in genre_lower or "house" in genre_lower:
        visual_terms = ["deep house night club lights", "electronic music abstract"]
    elif "rap" in genre_lower or "hip hop" in genre_lower:
        visual_terms = ["hip hop urban gold", "rap music city lights"]
    elif "ambient" in genre_lower:
        visual_terms = ["ambient music meditation glow", "abstract light universe"]
    elif "night" in title_lower or "noche" in title_lower:
        visual_terms = ["night city lights purple", "moonlight mystical"]
    elif "day" in title_lower or "dawn" in title_lower or "amanecer" in title_lower:
        visual_terms = ["golden sunrise energy", "dawn golden light"]
    elif "billionaires" in creator_lower or "millonarios" in creator_lower:
        visual_terms = ["luxury gold wealth success", "millionaire lifestyle abundance"]
    else:
        visual_terms = ["music abstract gold", "sound wave visualization"]

    # Extraer palabras clave del título para personalización
    key_words = [w for w in title_clean.split() if len(w) > 4 and w.lower() not in
                 {"sobre","entre","hacia","desde","antes","después","cuando","donde","como","para","with","from","this","that","into","through","upon","every","their"}]
    title_hint = " ".join(key_words[:2]) if key_words else ""

    query = visual_terms[0] if visual_terms else "music gold abstract"
    if title_hint:
        query = f"{title_hint} {query}"
    return query


async def _fetch_pexels_photo(query: str, photo_index: int = 0) -> dict | None:
    """
    Busca una foto en Pexels y devuelve los metadatos del primer resultado.
    Usa photo_index para evitar repetir imágenes entre canciones.
    """
    from config import PEXELS_API_KEY
    if not PEXELS_API_KEY:
        return None
    headers = {"Authorization": PEXELS_API_KEY}
    # Usamos per_page=15 y page aleatoria para variedad
    page = (photo_index // 15) + 1
    idx_in_page = photo_index % 15
    params = {
        "query": query,
        "orientation": "square",
        "size": "medium",
        "per_page": 15,
        "page": page,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get("https://api.pexels.com/v1/search", headers=headers, params=params)
            if res.status_code != 200:
                return None
            data = res.json()
            photos = data.get("photos", [])
            if not photos:
                # Try page 1 as fallback
                params["page"] = 1
                res2 = await client.get("https://api.pexels.com/v1/search", headers=headers, params=params)
                if res2.status_code == 200:
                    photos = res2.json().get("photos", [])
            if photos:
                return photos[min(idx_in_page, len(photos) - 1)]
    except Exception:
        pass
    return None


async def _download_pexels_photo_to_disk(photo: dict, dest_path: str) -> bool:
    """Descarga la foto de Pexels al disco en formato cuadrado."""
    # Preferimos 'large2x' o 'large' para calidad HD cuadrada
    src = photo.get("src", {})
    url = src.get("large2x") or src.get("large") or src.get("medium") or src.get("original")
    if not url:
        return False
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(url)
            r.raise_for_status()
            with open(dest_path, "wb") as f:
                f.write(r.content)
        return True
    except Exception:
        return False


@router.post("/catalog/{item_id}/cover/auto")
async def auto_generate_cover(item_id: int, db: Session = Depends(get_db)):
    """
    Genera automáticamente una portada única para el archivo de catálogo buscando
    una imagen contextual en Pexels (basada en título, género y canal) y la
    descarga en formato cuadrado. Si el ítem ya tiene una portada personalizada
    (album_art_path que NO sea de Pexels auto-generada), no la sobreescribe.
    """
    from config import PEXELS_API_KEY, MEDIA_LIBRARY_DIR
    if not PEXELS_API_KEY:
        raise HTTPException(status_code=500, detail="PEXELS_API_KEY no configurada. Configura tu clave API de Pexels en el .env")

    item = db.query(db_models.MediaCatalog).filter(db_models.MediaCatalog.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado en el catálogo")

    # Si ya tiene portada personalizada (no auto-Pexels), no sobreescribir
    if item.album_art_path and "/pexels_auto/" not in (item.album_art_path or ""):
        return {
            "success": True,
            "skipped": True,
            "message": "El archivo ya tiene una portada personalizada",
            "album_art_path": item.album_art_path
        }

    # Construir query contextual
    query = _build_pexels_query(
        title=item.title or "",
        genre=item.genre or "",
        creator=item.creator or "",
        artist=item.artist or ""
    )

    # Usar el ID del item como semilla para diversidad (cada canción obtiene imagen diferente)
    photo_index = (item_id * 3) % 45  # Dispersión: 45 slots distintos

    photo = await _fetch_pexels_photo(query, photo_index)
    if not photo:
        raise HTTPException(status_code=503, detail=f"No se encontraron imágenes en Pexels para: '{query}'. Intenta de nuevo o sube una portada personalizada.")

    # Guardar imagen en disco
    covers_dir = MEDIA_LIBRARY_DIR / "covers" / "pexels_auto"
    covers_dir.mkdir(parents=True, exist_ok=True)

    photo_id = photo.get("id", "unknown")
    filename = f"cover_{item_id}_pexels_{photo_id}.jpg"
    dest_path = covers_dir / filename

    success = await _download_pexels_photo_to_disk(photo, str(dest_path))
    if not success:
        raise HTTPException(status_code=503, detail="Error descargando la imagen de Pexels. Verifica tu conexión o intenta más tarde.")

    # Guardar ruta relativa en BD
    rel_path = f"media_library/covers/pexels_auto/{filename}"
    item.album_art_path = rel_path
    db.commit()
    db.refresh(item)

    return {
        "success": True,
        "skipped": False,
        "album_art_path": rel_path,
        "pexels_photo_id": photo_id,
        "query_used": query,
        "photographer": photo.get("photographer", "Unknown"),
        "pexels_url": photo.get("url", ""),
    }


@router.post("/catalog/covers/auto-batch")
async def auto_generate_covers_batch(db: Session = Depends(get_db)):
    """
    Genera portadas automáticas desde Pexels para TODOS los ítems del catálogo
    que no tengan portada personalizada. Proceso por lotes con control de rate-limit.
    """
    from config import PEXELS_API_KEY
    if not PEXELS_API_KEY:
        raise HTTPException(status_code=500, detail="PEXELS_API_KEY no configurada")

    import asyncio

    # Obtener todos los ítems sin portada o con portada auto-pexels (reemplazable)
    items_needing_cover = db.query(db_models.MediaCatalog).filter(
        db_models.MediaCatalog.is_public == True
    ).all()

    results = {"processed": 0, "skipped": 0, "failed": 0, "details": []}

    for item in items_needing_cover:
        # Solo procesar los que no tienen portada personalizada
        if item.album_art_path and "/pexels_auto/" not in (item.album_art_path or ""):
            results["skipped"] += 1
            continue

        try:
            query = _build_pexels_query(
                title=item.title or "",
                genre=item.genre or "",
                creator=item.creator or "",
                artist=item.artist or ""
            )
            photo_index = (item.id * 3) % 45
            photo = await _fetch_pexels_photo(query, photo_index)
            if not photo:
                results["failed"] += 1
                results["details"].append({"id": item.id, "title": item.title, "status": "no_photo", "query": query})
                continue

            from config import MEDIA_LIBRARY_DIR
            covers_dir = MEDIA_LIBRARY_DIR / "covers" / "pexels_auto"
            covers_dir.mkdir(parents=True, exist_ok=True)
            photo_id = photo.get("id", "unknown")
            filename = f"cover_{item.id}_pexels_{photo_id}.jpg"
            dest_path = covers_dir / filename

            success = await _download_pexels_photo_to_disk(photo, str(dest_path))
            if not success:
                results["failed"] += 1
                results["details"].append({"id": item.id, "title": item.title, "status": "download_failed"})
                continue

            rel_path = f"media_library/covers/pexels_auto/{filename}"
            item.album_art_path = rel_path
            db.commit()

            results["processed"] += 1
            results["details"].append({"id": item.id, "title": item.title, "status": "ok", "path": rel_path})

            # Rate limit: 1 request per second para no sobrecargar Pexels API
            await asyncio.sleep(1.1)

        except Exception as e:
            results["failed"] += 1
            results["details"].append({"id": item.id, "title": item.title, "status": "error", "error": str(e)})

    return {"success": True, **results}


@router.post("/catalog/{item_id}/cover/upload")
async def upload_custom_cover(
    item_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Sube una portada personalizada para un item del catálogo.
    Acepta JPG, PNG o WEBP. Se guarda en media_library/covers/custom/.
    Esta portada tiene prioridad sobre la auto-generada de Pexels.
    """
    from config import MEDIA_LIBRARY_DIR

    item = db.query(db_models.MediaCatalog).filter(db_models.MediaCatalog.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")

    # Validar tipo de archivo
    allowed_types = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
    content_type = file.content_type or ""
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de archivo no soportado: {content_type}. Usa JPG, PNG o WEBP."
        )

    # Extensión del archivo
    ext_map = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    ext = ext_map.get(content_type, ".jpg")

    # Guardar en disco
    covers_dir = MEDIA_LIBRARY_DIR / "covers" / "custom"
    covers_dir.mkdir(parents=True, exist_ok=True)
    filename = f"cover_{item_id}_custom{ext}"
    dest_path = covers_dir / filename

    try:
        content = await file.read()
        with open(str(dest_path), "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando el archivo: {str(e)}")

    # Actualizar BD con ruta relativa
    rel_path = f"media_library/covers/custom/{filename}"
    item.album_art_path = rel_path
    db.commit()
    db.refresh(item)

    return {
        "success": True,
        "album_art_path": rel_path,
        "filename": filename,
        "size_kb": round(len(content) / 1024, 1),
    }


@router.post("/catalog/{item_id}/publish")
def publish_to_catalog(item_id: int, request: Request, db: Session = Depends(get_db)):
    """(Admin) Hace público un item para el portal de streaming."""
    token = request.cookies.get("mediasuite_session")
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    from routers.auth import verify_token
    payload = verify_token(token)
    if not payload or payload.get("role") not in ["super_admin", "tools_admin"]:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    item = db.query(db_models.MediaCatalog).filter(db_models.MediaCatalog.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    item.is_public = True
    db.commit()
    return {"success": True, "message": f"Item '{item.title}' publicado en el portal"}


# ══════════════════════════════════════════════════════════════
#  PERFILES DE CREADOR / CANAL
# ══════════════════════════════════════════════════════════════

@router.get("/creators")
def get_all_creators(db: Session = Depends(get_db)):
    """Retorna la lista de creadores oficiales + artistas independientes registrados."""
    result = []
    seen_slugs = set()
    for creator_name, meta in CREATOR_META.items():
        slug = meta.get("slug")
        if slug:
            seen_slugs.add(slug)
        items = db.query(db_models.MediaCatalog).filter(
            db_models.MediaCatalog.creator == creator_name,
            db_models.MediaCatalog.is_public == True
        ).all()
        total_streams = sum(i.play_count or 0 for i in items)
        songs = [i for i in items if i.type == "song"]
        audiobooks = [i for i in items if i.type == "audiobook"]
        unique_albums = set(i.album for i in songs if i.album and i.album != "Single")
        result.append({
            **meta,
            "track_count": len(songs),
            "audiobook_count": len(audiobooks),
            "total_items": len(items),
            "total_streams": total_streams,
            "album_count": len(unique_albums),
        })

    # Añadir artistas independientes de ArtistProfile
    indie_profiles = db.query(db_models.ArtistProfile).all()
    for ap in indie_profiles:
        if ap.slug in seen_slugs:
            continue
        seen_slugs.add(ap.slug)
        items = db.query(db_models.MediaCatalog).filter(
            (db_models.MediaCatalog.creator_slug == ap.slug) |
            (db_models.MediaCatalog.creator == ap.display_name),
            db_models.MediaCatalog.is_public == True
        ).all()
        songs = [i for i in items if i.type == "song"]
        total_streams = sum(i.play_count or 0 for i in items)
        unique_albums = set(i.album for i in songs if i.album and i.album != "Single")
        result.append({
            "slug": ap.slug,
            "name": ap.display_name,
            "description": ap.bio or f"Canal oficial de {ap.display_name}",
            "color": ap.primary_color or "#8b5cf6",
            "gradient": "from-purple-500/20 to-indigo-600/10",
            "type": "Artista Independiente",
            "creator_type": "music",
            "language": ap.language or "es",
            "avatar_url": ap.avatar_url,
            "banner_url": ap.banner_url,
            "track_count": len(songs),
            "audiobook_count": 0,
            "total_items": len(items),
            "total_streams": total_streams,
            "album_count": len(unique_albums),
        })
    return result


@router.get("/creator/{slug}")
def get_creator_profile(slug: str, db: Session = Depends(get_db)):
    """
    Retorna el perfil completo de un creador o artista independiente: info, stats, álbumes, 
    canciones más escuchadas, lanzamientos recientes, encuestas de comunidad y agente IA.
    """
    creator_name = SLUG_TO_CREATOR.get(slug)
    meta = CREATOR_META.get(creator_name, {}) if creator_name else {}

    artist_profile = db.query(db_models.ArtistProfile).filter(
        db_models.ArtistProfile.slug == slug
    ).first()

    if not creator_name and not artist_profile:
        creator_row = db.query(db_models.Creator).filter(db_models.Creator.slug == slug).first()
        if creator_row:
            creator_name = creator_row.name
            meta = {
                "slug": creator_row.slug,
                "name": creator_row.name,
                "description": creator_row.description,
                "color": creator_row.color or "#8b5cf6",
                "gradient": creator_row.gradient or "from-purple-500/20 to-indigo-600/10",
                "type": "Canal Musical",
                "creator_type": creator_row.creator_type,
                "language": creator_row.language,
            }
        else:
            raise HTTPException(status_code=404, detail=f"Creador '{slug}' no encontrado")

    if artist_profile and not creator_name:
        creator_name = artist_profile.display_name
        meta = {
            "slug": artist_profile.slug,
            "name": artist_profile.display_name,
            "description": artist_profile.bio or f"Canal oficial de {artist_profile.display_name}",
            "color": artist_profile.primary_color or "#8b5cf6",
            "gradient": "from-purple-500/20 to-indigo-600/10",
            "type": "Artista Verificado PayPal",
            "creator_type": "music",
            "language": artist_profile.language or "es",
            "avatar_url": artist_profile.avatar_url,
            "banner_url": artist_profile.banner_url,
            "paypal_verified": artist_profile.paypal_verified,
            "agent_name": artist_profile.agent_name,
            "agent_welcome_message": artist_profile.agent_welcome_message,
        }

    # Todos los items de este creador o artista independiente
    norm_slug = re.sub(r"[^a-z0-9]", "", (slug or "").lower())
    is_label_profile = bool(artist_profile and "billionairerecords" in norm_slug)
    if is_label_profile:
        # Sello: agrupa todos los canales musicales oficiales (misma vista que el Artist Studio).
        all_items = db.query(db_models.MediaCatalog).filter(
            db_models.MediaCatalog.is_public == True,
            db_models.MediaCatalog.type != "audiobook",
        ).all()
    else:
        all_items = db.query(db_models.MediaCatalog).filter(
            (db_models.MediaCatalog.creator == creator_name) |
            (db_models.MediaCatalog.creator_slug == slug) |
            (db_models.MediaCatalog.artist == creator_name),
            db_models.MediaCatalog.is_public == True
        ).all()
    
    songs = [i for i in all_items if i.type == "song"]
    audiobooks = [i for i in all_items if i.type == "audiobook"]
    
    # Stats
    total_streams = sum(i.play_count or 0 for i in all_items)
    
    # Álbumes únicos (agrupados por propiedad album)
    albums_dict: dict = {}
    for s in songs:
        album_name = s.album if s.album and s.album != "Single" else None
        if not album_name:
            continue
        if album_name not in albums_dict:
            albums_dict[album_name] = {
                "name": album_name,
                "tracks": [],
                "cover": None,
                "total_streams": 0,
            }
        albums_dict[album_name]["tracks"].append({
            "id": s.id,
            "title": s.title,
            "artist": s.artist,
            "type": s.type,
            "price_tokens": s.price_tokens,
            "price_usd": float(s.price_usd) if s.price_usd else 0.99,
            "album_art_path": s.album_art_path,
            "file_path": s.file_path,
            "genre": s.genre,
            "duration_seconds": s.duration_seconds,
            "play_count": s.play_count or 0,
            "creator": s.creator,
            "album": s.album,
            "lyrics_path": s.lyrics_path,
        })
        albums_dict[album_name]["total_streams"] += s.play_count or 0
        if not albums_dict[album_name]["cover"] and s.album_art_path:
            albums_dict[album_name]["cover"] = s.album_art_path
    
    albums_list = list(albums_dict.values())
    
    def item_to_dict(i):
        return {
            "id": i.id,
            "title": i.title,
            "artist": i.artist,
            "type": i.type,
            "price_tokens": i.price_tokens,
            "price_usd": float(i.price_usd) if i.price_usd else 0.99,
            "album_art_path": i.album_art_path,
            "file_path": i.file_path,
            "genre": i.genre,
            "duration_seconds": i.duration_seconds,
            "play_count": i.play_count or 0,
            "creator": i.creator,
            "album": i.album,
            "lyrics_path": getattr(i, "lyrics_path", None),
            "description": i.description,
            "created_at": i.created_at.isoformat() if i.created_at else None,
        }
    
    # Top 10 más escuchadas
    top_tracks = sorted(songs + audiobooks, key=lambda x: x.play_count or 0, reverse=True)[:10]
    
    # 10 más recientes (por created_at)
    recent_items = sorted(
        songs + audiobooks,
        key=lambda x: x.created_at or __import__("datetime").datetime.min,
        reverse=True
    )[:10]

    polls_out = []
    subscribers_count = 0
    if artist_profile:
        import json as _json
        polls_rows = db.query(db_models.ArtistPoll).filter(
            db_models.ArtistPoll.artist_profile_id == artist_profile.id,
            db_models.ArtistPoll.is_active == True
        ).order_by(db_models.ArtistPoll.created_at.desc()).all()
        for pr in polls_rows:
            polls_out.append({
                "id": pr.id,
                "question": pr.question,
                "options": _json.loads(pr.options_json or "[]"),
                "total_votes": pr.total_votes or 0,
            })
        subscribers_count = db.query(db_models.ArtistSubscriber).filter(
            db_models.ArtistSubscriber.artist_profile_id == artist_profile.id
        ).count()

    return {
        **meta,
        "stats": {
            "total_tracks": len(songs),
            "total_audiobooks": len(audiobooks),
            "total_items": len(all_items),
            "total_streams": total_streams,
            "total_albums": len(albums_list),
            "subscribers_count": subscribers_count,
        },
        "albums": albums_list,
        "top_tracks": [item_to_dict(i) for i in top_tracks],
        "recent_items": [item_to_dict(i) for i in recent_items],
        "all_songs": [item_to_dict(i) for i in songs],
        "all_audiobooks": [item_to_dict(i) for i in audiobooks],
        "polls": polls_out,
    }


@router.post("/catalog/{item_id}/play")
def increment_play_count(item_id: int, db: Session = Depends(get_db)):
    """Incrementa el contador de reproducciones de un track."""
    item = db.query(db_models.MediaCatalog).filter(db_models.MediaCatalog.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    item.play_count = (item.play_count or 0) + 1
    db.commit()
    return {"success": True, "play_count": item.play_count}


# ══════════════════════════════════════════════════════════════
#  FIX: ESCANEO DE ÁLBUMES DE MUSICPLAYLIST COMO TIPO "album"
# ══════════════════════════════════════════════════════════════

@router.post("/catalog/sync-albums")
def sync_musicplaylist_albums(request: Request, db: Session = Depends(get_db)):
    """
    (Admin) Sincroniza los proyectos MusicPlaylist como registros de tipo 'album'
    en el catálogo, para que el filtro de álbumes los muestre correctamente.
    Crea o actualiza 1 registro album por cada carpeta de proyecto MusicPlaylist.
    """
    from config import MEDIA_LIBRARY_DIR
    import glob
    import json
    
    token = request.cookies.get("mediasuite_session")
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    from routers.auth import verify_token
    payload = verify_token(token)
    if not payload or payload.get("role") not in ["super_admin", "tools_admin"]:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    created = 0
    updated = 0
    
    music_playlist_dir = MEDIA_LIBRARY_DIR / "MusicPlaylist"
    if not music_playlist_dir.exists():
        return {"success": True, "created": 0, "updated": 0, "message": "Directorio MusicPlaylist no encontrado"}
    
    for project_dir in music_playlist_dir.iterdir():
        if not project_dir.is_dir():
            continue
        
        project_name = project_dir.name
        songs_dir = project_dir / "songs"
        if not songs_dir.exists():
            continue
        
        mp3_files = list(songs_dir.glob("*.mp3"))
        if not mp3_files:
            continue
        
        artist = project_name.replace("_", " ")
        
        # Determinar creador
        creator = None
        proj_lower = project_name.lower()
        if "para_millonarios" in proj_lower or "millonarios" in proj_lower:
            creator = "Billionaire SoundTrack"
        elif "for_billionaires" in proj_lower or "billionaires" in proj_lower:
            creator = "Billionaires Playlist"
        else:
            creator = "Billionaire SoundTrack"
        
        # Buscar portada: primer song que tenga album_art_path
        album_cover = None
        songs_in_db = db.query(db_models.MediaCatalog).filter(
            db_models.MediaCatalog.artist == artist,
            db_models.MediaCatalog.type == "song"
        ).all()
        for s in songs_in_db:
            if s.album_art_path:
                album_cover = s.album_art_path
                break
        
        # Contar streams del álbum
        total_album_streams = sum(s.play_count or 0 for s in songs_in_db)
        
        # Buscar descripción en song_plan.json
        description = f"Álbum completo de {artist}. {len(mp3_files)} tracks de producción premium."
        song_plan_path = project_dir / "song_plan.json"
        if song_plan_path.exists():
            try:
                with open(str(song_plan_path), "r", encoding="utf-8") as f:
                    sp = json.load(f)
                    if sp and isinstance(sp, list) and sp[0].get("description"):
                        description = f"Álbum: {artist}. {sp[0].get('description', description)}"
            except Exception:
                pass
        
        # Ruta relativa del directorio del proyecto como file_path del álbum
        rel_path = f"media_library/MusicPlaylist/{project_name}"
        
        exists = db.query(db_models.MediaCatalog).filter(
            db_models.MediaCatalog.type == "album",
            db_models.MediaCatalog.file_path == rel_path
        ).first()
        
        if not exists:
            new_album = db_models.MediaCatalog(
                title=artist,
                artist=artist,
                description=description,
                type="album",
                file_path=rel_path,
                album_art_path=album_cover,
                price_tokens=len(mp3_files),
                price_usd=float(len(mp3_files)) * 0.99,
                is_public=True,
                genre="Instrumental / Ambient",
                creator=creator,
                creator_slug=_creator_slug_for_name(creator),
                play_count=total_album_streams,
            )
            db.add(new_album)
            db.commit()
            created += 1
        else:
            # Actualizar datos del álbum existente
            if album_cover and not exists.album_art_path:
                exists.album_art_path = album_cover
            exists.play_count = total_album_streams
            if creator:
                exists.creator = creator
            db.commit()
            updated += 1
    
    return {
        "success": True,
        "created": created,
        "updated": updated,
        "message": f"Álbumes MusicPlaylist sincronizados: {created} creados, {updated} actualizados"
    }

