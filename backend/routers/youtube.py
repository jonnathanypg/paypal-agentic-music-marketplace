# -*- coding: utf-8 -*-
"""
Router: YouTube Multi-Account & Multi-Channel Manager
=====================================================
Permite:
- Conectar cuentas de Google / YouTube vía OAuth2 (con selección de cuenta).
- Configurar credenciales OAuth (Client ID y Secret) si no están en .env.
- Listar canales vinculados y gestionarlos.
- Vincular / Desvincular carpetas de proyectos a canales específicos.
- Generar copy viral optimizado (título, descripción, tags) según el idioma del proyecto.
- Lanzar subida de videos como borrador privado (draft) al canal asignado.
"""

import os
import json
import logging
from typing import Optional, List, Dict, Any
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Body
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
import db_models
from config import ROOT_DIR, MEDIA_LIBRARY_DIR, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
from lib.youtube_client import (
    get_authorization_url,
    exchange_code_and_get_channels,
    get_oauth_config,
    CLIENT_SECRETS_FILE,
    get_channel_audit_and_stats,
    get_channel_analytics_report,
    list_channel_videos,
    update_video_metadata,
    set_video_thumbnail,
    delete_video_from_youtube,
    list_channel_playlists,
    list_channel_comments,
    reply_to_comment,
)
from lib.youtube_copy_agent import generate_viral_copy
from tasks.youtube_tasks import upload_draft_video_task

router = APIRouter(prefix="/api/youtube", tags=["YouTube"])
logger = logging.getLogger("router_youtube")


# ── Modelos Pydantic ──

class OAuthConfigRequest(BaseModel):
    client_id: str
    client_secret: str
    redirect_uri: Optional[str] = None


class BindProjectRequest(BaseModel):
    project_path: str  # Ej: "MusicPlaylist/Afrobeats_para_Millonarios"
    project_name: Optional[str] = None
    channel_id: str
    default_language: Optional[str] = "es"  # es | en
    default_category_id: Optional[str] = "10"  # 10 = Music, 24 = Entertainment


class GenerateCopyRequest(BaseModel):
    project_path: str
    project_name: Optional[str] = None
    content_type: Optional[str] = "music"
    language: Optional[str] = None  # Si es None, se auto-detecta por el proyecto o binding
    style_or_genre: Optional[str] = None
    mood_or_topic: Optional[str] = None
    video_filename: Optional[str] = None


class UploadDraftRequest(BaseModel):
    project_path: str
    video_relative_path: str  # Relativo a media_library o absoluto
    channel_id: Optional[str] = None  # Si no se pasa, toma el asignado a la carpeta
    title: str
    description: str
    tags: List[str]
    category_id: Optional[str] = "10"


class UpdateVideoRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    category_id: Optional[str] = None
    privacy_status: Optional[str] = None  # public | private | unlisted


class SetThumbnailRequest(BaseModel):
    image_relative_path: str  # Ruta relativa a media_library o absoluta


class ReplyCommentRequest(BaseModel):
    parent_comment_id: str
    text: str


# ── Endpoints de Configuración OAuth ──

@router.get("/config")
def get_current_oauth_status(request: Request):
    """Devuelve si Google OAuth está configurado en el sistema."""
    cfg = get_oauth_config()
    web_cfg = cfg.get("web", {}) if cfg else {}
    has_keys = bool(web_cfg.get("client_id") and web_cfg.get("client_secret"))

    # Determinar redirect_uri dinámico según el dominio desde el que accede el usuario
    host = request.headers.get("host", "").split(":")[0]
    proto = request.headers.get("x-forwarded-proto", "https")
    if host and host not in ["127.0.0.1", "localhost"]:
        dynamic_redirect = f"{proto}://{host}/api/youtube/callback"
    else:
        dynamic_redirect = web_cfg.get("redirect_uris", [GOOGLE_REDIRECT_URI])[0] if web_cfg.get("redirect_uris") else GOOGLE_REDIRECT_URI

    return {
        "configured": has_keys,
        "client_id": web_cfg.get("client_id", "")[:12] + "..." if web_cfg.get("client_id") else "",
        "redirect_uri": dynamic_redirect
    }


@router.post("/config")
def save_oauth_config(data: OAuthConfigRequest):
    """Permite guardar las credenciales OAuth en client_secret.json si no estaban en .env."""
    c_id = data.client_id.strip()
    c_secret = data.client_secret.strip()
    r_uri = (data.redirect_uri or GOOGLE_REDIRECT_URI).strip()

    if not c_id or not c_secret:
        raise HTTPException(status_code=400, detail="client_id y client_secret son obligatorios")

    payload = {
        "web": {
            "client_id": c_id,
            "client_secret": c_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [r_uri]
        }
    }

    with open(CLIENT_SECRETS_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    return {"status": "ok", "message": "Credenciales OAuth de Google guardadas exitosamente"}


# ── Flujo OAuth2 Multi-cuenta ──

@router.get("/auth-url")
def get_auth_url(request: Request, redirect_uri: Optional[str] = None, state: Optional[str] = None):
    """
    Retorna la URL de Google OAuth para que el usuario inicie sesión.
    Usa prompt='select_account consent' para soportar añadir múltiples cuentas.
    """
    try:
        # Si no se especifica redirect_uri, resolver según el host del request (ej: https://exito.cyou/api/youtube/callback)
        resolved_redirect = redirect_uri
        if not resolved_redirect:
            host = request.headers.get("host", "").split(":")[0]
            proto = request.headers.get("x-forwarded-proto", "https")
            if host and host not in ["127.0.0.1", "localhost"]:
                resolved_redirect = f"{proto}://{host}/api/youtube/callback"

        url = get_authorization_url(redirect_uri=resolved_redirect, state=state)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al generar URL OAuth: {str(e)}")


@router.get("/callback")
def oauth_callback(
    request: Request,
    code: Optional[str] = None,
    error: Optional[str] = None,
    state: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Callback al que redirige Google. Extrae los canales de la cuenta y los guarda/actualiza en la base de datos.
    """
    if error:
        logger.error(f"Error en OAuth callback: {error}")
        return RedirectResponse(url=f"/projects?yt_error={error}")

    if not code:
        raise HTTPException(status_code=400, detail="Código de autorización no provisto")

    try:
        # Resolver redirect_uri con el mismo origen de la petición
        host = request.headers.get("host", "").split(":")[0]
        proto = request.headers.get("x-forwarded-proto", "https")
        dynamic_redirect = f"{proto}://{host}/api/youtube/callback" if (host and host not in ["127.0.0.1", "localhost"]) else None

        # ── MODO SOCIAL LOGIN (Fan o Artista vía Google OAuth) ──
        if state and state.startswith("auth_login|"):
            from lib.youtube_client import exchange_code_for_social_auth
            from routers.auth import _issue_jwt
            from auth_utils import hash_password
            from config import JWT_EXPIRATION_DAYS
            import secrets
            import re

            parts = state.split("|", 2)
            account_mode = parts[1] if len(parts) > 1 else "artist"
            redirect_to = parts[2] if len(parts) > 2 and parts[2].startswith("/") else ("/artist-studio" if account_mode == "artist" else "/")

            social_data = exchange_code_for_social_auth(code=code, redirect_uri=dynamic_redirect)
            email = social_data.get("email")
            name = social_data.get("name") or "Creator"
            picture = social_data.get("picture")
            channels_data = social_data.get("channels") or []

            if not email:
                return RedirectResponse(url="/login?error=google_email_missing")

            # Guardar también sus canales de YouTube si tiene alguno
            for ch in channels_data:
                existing_ch = db.query(db_models.YouTubeAccount).filter(
                    db_models.YouTubeAccount.channel_id == ch["channel_id"]
                ).first()
                if not existing_ch:
                    db.add(db_models.YouTubeAccount(
                        channel_id=ch["channel_id"],
                        channel_title=ch["channel_title"],
                        channel_description=ch["channel_description"],
                        custom_url=ch["custom_url"],
                        thumbnail_url=ch["thumbnail_url"],
                        account_email=ch["account_email"],
                        refresh_token=ch["refresh_token"],
                        client_id=ch["client_id"],
                        client_secret=ch["client_secret"],
                        is_active=True
                    ))

            # Buscar o crear Usuario
            user = db.query(db_models.User).filter(db_models.User.email == email).first()
            if not user:
                base_username = re.sub(r"[^a-zA-Z0-9_]", "", email.split("@")[0].lower()) or "user"
                candidate = base_username
                idx = 1
                while db.query(db_models.User).filter(db_models.User.username == candidate).first():
                    idx += 1
                    candidate = f"{base_username}{idx}"
                user = db_models.User(
                    username=candidate,
                    email=email,
                    password_hash=hash_password(secrets.token_urlsafe(24)),
                    role="client",
                    tokens_balance=10,
                )
                db.add(user)
                db.commit()
                db.refresh(user)

            # Si es modo artista o tiene canales de YouTube, asegurar su ArtistProfile
            if account_mode == "artist" or len(channels_data) > 0:
                first_ch = channels_data[0] if channels_data else {}
                stage_name = first_ch.get("channel_title") or name
                avatar = first_ch.get("thumbnail_url") or picture
                bio = first_ch.get("channel_description") or f"Canal oficial de {stage_name} en Exito.cyou."
                prof = db.query(db_models.ArtistProfile).filter(db_models.ArtistProfile.user_id == user.id).first()
                if not prof:
                    slug_base = re.sub(r"[^a-z0-9]+", "-", stage_name.lower()).strip("-") or f"artist-{user.id}"
                    slug_cand = slug_base
                    s_idx = 1
                    while db.query(db_models.ArtistProfile).filter(db_models.ArtistProfile.slug == slug_cand).first():
                        s_idx += 1
                        slug_cand = f"{slug_base}-{s_idx}"
                    prof = db_models.ArtistProfile(
                        user_id=user.id,
                        slug=slug_cand,
                        stage_name=stage_name,
                        bio=bio[:500],
                        avatar_url=avatar,
                        paypal_email=email,
                        payout_mode="instant",
                    )
                    db.add(prof)
                else:
                    if avatar and not prof.avatar_url:
                        prof.avatar_url = avatar
                db.commit()

            jwt_token = _issue_jwt(user.username, user.role)
            sep = "&" if "?" in redirect_to else "?"
            resp = RedirectResponse(url=f"{redirect_to}{sep}social=google&email={email}")
            resp.set_cookie(
                "mediasuite_session",
                jwt_token,
                httponly=True,
                samesite="lax",
                max_age=JWT_EXPIRATION_DAYS * 24 * 3600,
            )
            return resp

        channels_data = exchange_code_and_get_channels(code=code, redirect_uri=dynamic_redirect)
        if not channels_data:
            return RedirectResponse(url="/projects?yt_error=no_channels_found")

        saved_channels = []
        for ch in channels_data:
            existing = db.query(db_models.YouTubeAccount).filter(
                db_models.YouTubeAccount.channel_id == ch["channel_id"]
            ).first()

            if existing:
                existing.channel_title = ch["channel_title"]
                existing.channel_description = ch["channel_description"]
                existing.custom_url = ch["custom_url"]
                existing.thumbnail_url = ch["thumbnail_url"]
                existing.account_email = ch["account_email"]
                existing.refresh_token = ch["refresh_token"] or existing.refresh_token
                existing.client_id = ch["client_id"]
                existing.client_secret = ch["client_secret"]
                existing.is_active = True
            else:
                new_acc = db_models.YouTubeAccount(
                    channel_id=ch["channel_id"],
                    channel_title=ch["channel_title"],
                    channel_description=ch["channel_description"],
                    custom_url=ch["custom_url"],
                    thumbnail_url=ch["thumbnail_url"],
                    account_email=ch["account_email"],
                    refresh_token=ch["refresh_token"],
                    client_id=ch["client_id"],
                    client_secret=ch["client_secret"],
                    is_active=True
                )
                db.add(new_acc)
            saved_channels.append(ch["channel_title"])

        db.commit()
        logger.info(f"Canales de YouTube sincronizados: {saved_channels}")

        # Redirigir de vuelta al panel de proyectos con flag de éxito
        target_path = state if (state and state.startswith("/")) else "/projects"
        sep = "&" if "?" in target_path else "?"
        return RedirectResponse(url=f"{target_path}{sep}yt_success=1&channels_count={len(saved_channels)}")

    except Exception as e:
        logger.error(f"Error procesando callback de YouTube: {e}", exc_info=True)
        return RedirectResponse(url=f"/projects?yt_error={str(e)}")


# ── Gestión de Canales Registrados ──

@router.get("/channels")
def list_registered_channels(db: Session = Depends(get_db)):
    """Lista todos los canales de YouTube registrados en el sistema."""
    channels = db.query(db_models.YouTubeAccount).filter(db_models.YouTubeAccount.is_active == True).all()
    results = []
    for c in channels:
        bindings_count = db.query(db_models.ProjectChannelBinding).filter(
            db_models.ProjectChannelBinding.channel_id == c.channel_id
        ).count()

        results.append({
            "id": c.id,
            "channel_id": c.channel_id,
            "channel_title": c.channel_title,
            "channel_description": c.channel_description,
            "custom_url": c.custom_url,
            "thumbnail_url": c.thumbnail_url,
            "account_email": c.account_email,
            "linked_projects_count": bindings_count,
            "created_at": c.created_at.isoformat() if c.created_at else None
        })
    return {"channels": results}


@router.delete("/channels/{channel_id}")
def delete_channel(channel_id: str, db: Session = Depends(get_db)):
    """Elimina o desactiva un canal registrado."""
    channel = db.query(db_models.YouTubeAccount).filter(db_models.YouTubeAccount.channel_id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Canal no encontrado")

    db.delete(channel)
    db.commit()
    return {"status": "ok", "message": f"Canal '{channel.channel_title}' desvinculado"}


# ── Vinculación de Carpetas de Proyecto a Canales ──

@router.get("/project-channel")
def get_project_channel(project_path: str = Query(...), db: Session = Depends(get_db)):
    """
    Devuelve la información del canal asignado.
    Soporta HERENCIA JERÁRQUICA: si la subcarpeta no tiene binding directo,
    busca progresivamente hacia arriba en sus carpetas padre (ej: MusicPlaylist/Tema/songs -> MusicPlaylist/Tema).
    """
    clean_path = project_path.strip().strip("/")
    
    # 1. Probar ruta exacta y luego ancestros
    curr = Path(clean_path)
    binding = None
    
    # Lista de candidatos: desde la ruta específica hasta las carpetas padre
    candidates = []
    p = curr
    while str(p) != "." and str(p) != "/":
        candidates.append(str(p).replace("\\", "/"))
        p = p.parent

    for cand in candidates:
        binding = db.query(db_models.ProjectChannelBinding).filter(
            db_models.ProjectChannelBinding.project_path == cand
        ).first()
        if binding:
            break

    if not binding:
        return {"bound": False, "channel": None, "binding": None}

    channel = binding.channel
    return {
        "bound": True,
        "binding": {
            "project_path": binding.project_path,
            "project_name": binding.project_name,
            "channel_id": binding.channel_id,
            "default_language": binding.default_language,
            "default_category_id": binding.default_category_id,
            "default_privacy": binding.default_privacy,
            "is_inherited": binding.project_path != clean_path
        },
        "channel": {
            "channel_id": channel.channel_id,
            "channel_title": channel.channel_title,
            "thumbnail_url": channel.thumbnail_url,
            "custom_url": channel.custom_url,
            "account_email": channel.account_email
        } if channel else None
    }


@router.post("/project-channel")
def bind_project_channel(data: BindProjectRequest, db: Session = Depends(get_db)):
    """
    Vincula o actualiza el canal de YouTube asignado a una carpeta de proyecto.
    """
    clean_path = data.project_path.strip().strip("/")
    proj_name = data.project_name or Path(clean_path).name

    channel = db.query(db_models.YouTubeAccount).filter(
        db_models.YouTubeAccount.channel_id == data.channel_id
    ).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Canal de YouTube seleccionado no existe en el sistema")

    binding = db.query(db_models.ProjectChannelBinding).filter(
        db_models.ProjectChannelBinding.project_path == clean_path
    ).first()

    if binding:
        binding.channel_id = data.channel_id
        binding.project_name = proj_name
        binding.default_language = data.default_language or binding.default_language
        binding.default_category_id = data.default_category_id or binding.default_category_id
    else:
        binding = db_models.ProjectChannelBinding(
            project_path=clean_path,
            project_name=proj_name,
            channel_id=data.channel_id,
            default_language=data.default_language or "es",
            default_category_id=data.default_category_id or "10"
        )
        db.add(binding)

    db.commit()
    return {
        "status": "ok",
        "message": f"Proyecto '{proj_name}' vinculado al canal '{channel.channel_title}'",
        "binding": {
            "project_path": clean_path,
            "channel_id": channel.channel_id,
            "channel_title": channel.channel_title
        }
    }


@router.delete("/project-channel")
def unbind_project_channel(project_path: str = Query(...), db: Session = Depends(get_db)):
    """Desvincula un canal de una carpeta de proyecto."""
    clean_path = project_path.strip().strip("/")
    binding = db.query(db_models.ProjectChannelBinding).filter(
        db_models.ProjectChannelBinding.project_path == clean_path
    ).first()
    if not binding:
        return {"status": "ok", "message": "No había ningún canal vinculado a este proyecto"}

    db.delete(binding)
    db.commit()
    return {"status": "ok", "message": "Canal desvinculado del proyecto"}


# ── Generador de Copy Viral & SEO con IA ──

@router.post("/generate-copy")
def generate_copy_endpoint(data: GenerateCopyRequest, db: Session = Depends(get_db)):
    """
    Analiza la carpeta del proyecto (letras, capítulos, nombre, idioma) y genera un copy viral (título, descripción, tags).
    """
    clean_path = data.project_path.strip().strip("/")
    proj_dir = MEDIA_LIBRARY_DIR / clean_path
    proj_name = data.project_name or proj_dir.name

    # Detectar idioma objetivo
    language = data.language
    if not language:
        # 1. Intentar desde binding existente
        binding = db.query(db_models.ProjectChannelBinding).filter(
            db_models.ProjectChannelBinding.project_path == clean_path
        ).first()
        if binding:
            language = binding.default_language
        # 2. Si no, detectar por nombre de la carpeta (ej. 'para_Millonarios' -> es, 'for_Billionaires' -> en)
        if not language:
            lower_name = proj_name.lower()
            if "para" in lower_name or "millonarios" in lower_name or "musica" in lower_name or "espanol" in lower_name:
                language = "es"
            elif "for" in lower_name or "billionaires" in lower_name or "english" in lower_name:
                language = "en"
            else:
                language = "es"

    # Buscar letras o contexto en el proyecto
    lyrics_content = ""
    chapters_content = ""

    if proj_dir.exists() and proj_dir.is_dir():
        # Buscar archivo de capítulos
        for chap_file in [
            "YOUTUBE_MIX_CHAPTERS_FULL_DURATION.txt",
            "YOUTUBE_MIX_CHAPTERS_WITH_TRIM.txt",
            "chapters.txt"
        ]:
            c_path = proj_dir / chap_file
            if c_path.exists():
                try:
                    with open(c_path, "r", encoding="utf-8", errors="ignore") as f:
                        chapters_content = f.read()
                    break
                except Exception:
                    pass

        # Buscar archivo de letras
        lyrics_dir = proj_dir / "lyrics"
        if lyrics_dir.exists() and lyrics_dir.is_dir():
            all_l = []
            for lf in list(lyrics_dir.glob("*.txt"))[:3]:
                try:
                    with open(lf, "r", encoding="utf-8", errors="ignore") as f:
                        all_l.append(f.read())
                except Exception:
                    pass
            if all_l:
                lyrics_content = "\n---\n".join(all_l)

        # Si hay song_plan.json
        plan_file = proj_dir / "song_plan.json"
        if plan_file.exists() and not lyrics_content:
            try:
                with open(plan_file, "r", encoding="utf-8") as f:
                    plan_data = json.load(f)
                    lyrics_content = json.dumps(plan_data, ensure_ascii=False)[:1000]
            except Exception:
                pass

    copy_result = generate_viral_copy(
        project_name=proj_name,
        content_type=data.content_type or "music",
        language=language,
        lyrics=lyrics_content,
        chapters_text=chapters_content,
        style_or_genre=data.style_or_genre,
        mood_or_topic=data.mood_or_topic
    )

    return {
        "status": "ok",
        "project_name": proj_name,
        "language": language,
        "has_chapters": bool(chapters_content),
        "data": copy_result
    }


# ── Subida de Video como Borrador Privado ──

@router.post("/upload-draft")
def upload_draft_endpoint(data: UploadDraftRequest, db: Session = Depends(get_db)):
    """
    Encola la tarea de subida a YouTube como borrador privado (privacy=private).
    """
    clean_path = data.project_path.strip().strip("/")

    # Resolver canal
    channel_id = data.channel_id
    if not channel_id:
        binding = db.query(db_models.ProjectChannelBinding).filter(
            db_models.ProjectChannelBinding.project_path == clean_path
        ).first()
        if not binding:
            raise HTTPException(
                status_code=400,
                detail="Esta carpeta no tiene ningún canal de YouTube vinculado. Asigna uno primero."
            )
        channel_id = binding.channel_id

    channel = db.query(db_models.YouTubeAccount).filter(
        db_models.YouTubeAccount.channel_id == channel_id,
        db_models.YouTubeAccount.is_active == True
    ).first()
    if not channel:
        raise HTTPException(status_code=404, detail="El canal de YouTube especificado no existe o no está activo")

    # Resolver ruta absoluta del video
    v_path = data.video_relative_path.strip()
    if os.path.isabs(v_path):
        resolved_video = Path(v_path)
    else:
        # Primero buscar dentro del proyecto, luego en media_library raíz
        cand1 = MEDIA_LIBRARY_DIR / clean_path / v_path
        cand2 = MEDIA_LIBRARY_DIR / v_path
        if cand1.exists():
            resolved_video = cand1
        elif cand2.exists():
            resolved_video = cand2
        else:
            resolved_video = cand1

    if not resolved_video.exists() or not resolved_video.is_file():
        raise HTTPException(status_code=404, detail=f"El archivo de video no existe: {resolved_video}")

    # Encolar en Celery
    task = upload_draft_video_task.delay(
        channel_id=channel.channel_id,
        video_path=str(resolved_video.resolve()),
        title=data.title,
        description=data.description,
        tags=data.tags,
        category_id=data.category_id or "10",
        privacy_status="private"
    )

    return {
        "status": "queued",
        "task_id": task.id,
        "channel_title": channel.channel_title,
        "video_file": resolved_video.name,
        "privacy": "private (borrador)",
        "message": f"Subida iniciada para el canal '{channel.channel_title}'. Se guardará como borrador privado."
    }


# ── Módulo YouTube Studio & Analytics 360° ──

def _get_active_channel(channel_id: str, db: Session) -> db_models.YouTubeAccount:
    """Helper para verificar y obtener el registro de un canal activo."""
    channel = db.query(db_models.YouTubeAccount).filter(
        db_models.YouTubeAccount.channel_id == channel_id,
        db_models.YouTubeAccount.is_active == True
    ).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Canal de YouTube no encontrado o inactivo.")
    return channel


@router.get("/channels/{channel_id}/audit")
def get_channel_audit(channel_id: str, db: Session = Depends(get_db)):
    """
    Diagnóstico de salud, métricas globales, SEO de metadatos y recomendaciones del canal.
    """
    channel = _get_active_channel(channel_id, db)
    try:
        audit_data = get_channel_audit_and_stats(channel)
        return audit_data
    except Exception as e:
        logger.exception(f"Error generando auditoría de canal {channel_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al auditar el canal: {str(e)}")


@router.get("/channels/{channel_id}/analytics")
def get_channel_analytics(
    channel_id: str,
    start_date: str = Query(..., description="Fecha inicial formato YYYY-MM-DD"),
    end_date: str = Query(..., description="Fecha final formato YYYY-MM-DD"),
    metrics: Optional[str] = Query(None, description="Métricas separadas por coma"),
    dimensions: str = Query("day", description="day | month | country | deviceType"),
    db: Session = Depends(get_db)
):
    """
    Consulta detallada a la YouTube Analytics API v2.
    """
    channel = _get_active_channel(channel_id, db)
    try:
        report = get_channel_analytics_report(
            channel_record=channel,
            start_date=start_date,
            end_date=end_date,
            metrics=metrics,
            dimensions=dimensions
        )
        return report
    except Exception as e:
        logger.exception(f"Error consultando analíticas de canal {channel_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al consultar YouTube Analytics: {str(e)}")


@router.get("/channels/{channel_id}/videos")
def get_channel_videos(
    channel_id: str,
    max_results: int = Query(50, ge=1, le=50),
    page_token: Optional[str] = Query(None),
    order: str = Query("date", description="date | rating | relevance | title | videoCount | viewCount"),
    q: Optional[str] = Query(None, description="Búsqueda por texto"),
    db: Session = Depends(get_db)
):
    """
    Listado paginado de videos del canal con estadísticas individuales y estado de publicación.
    """
    channel = _get_active_channel(channel_id, db)
    try:
        videos_res = list_channel_videos(
            channel_record=channel,
            max_results=max_results,
            page_token=page_token,
            order=order,
            query=q
        )
        return videos_res
    except Exception as e:
        logger.exception(f"Error listando videos de canal {channel_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al listar videos: {str(e)}")


@router.patch("/channels/{channel_id}/videos/{video_id}")
def update_video(
    channel_id: str,
    video_id: str,
    data: UpdateVideoRequest,
    db: Session = Depends(get_db)
):
    """
    Actualiza metadatos de un video: título, descripción, tags, categoría y privacidad.
    """
    channel = _get_active_channel(channel_id, db)
    try:
        res = update_video_metadata(
            channel_record=channel,
            video_id=video_id,
            title=data.title,
            description=data.description,
            tags=data.tags,
            category_id=data.category_id,
            privacy_status=data.privacy_status
        )
        return res
    except Exception as e:
        logger.exception(f"Error actualizando video {video_id} en canal {channel_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al actualizar el video: {str(e)}")


@router.post("/channels/{channel_id}/videos/{video_id}/thumbnail")
def set_thumbnail(
    channel_id: str,
    video_id: str,
    data: SetThumbnailRequest,
    db: Session = Depends(get_db)
):
    """
    Establece o actualiza la miniatura personalizada de un video.
    """
    channel = _get_active_channel(channel_id, db)
    img_path = data.image_relative_path.strip()
    if os.path.isabs(img_path):
        resolved_img = Path(img_path)
    else:
        resolved_img = MEDIA_LIBRARY_DIR / img_path

    if not resolved_img.exists() or not resolved_img.is_file():
        raise HTTPException(status_code=404, detail=f"La imagen de miniatura no existe: {resolved_img}")

    try:
        res = set_video_thumbnail(channel_record=channel, video_id=video_id, image_path=str(resolved_img.resolve()))
        return res
    except Exception as e:
        logger.exception(f"Error subiendo miniatura a video {video_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al subir miniatura: {str(e)}")


@router.delete("/channels/{channel_id}/videos/{video_id}")
def delete_video(
    channel_id: str,
    video_id: str,
    db: Session = Depends(get_db)
):
    """
    Elimina permanentemente un video de YouTube vía API.
    """
    channel = _get_active_channel(channel_id, db)
    try:
        success = delete_video_from_youtube(channel_record=channel, video_id=video_id)
        return {"status": "success", "video_id": video_id, "deleted": success}
    except Exception as e:
        logger.exception(f"Error borrando video {video_id} en canal {channel_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar video: {str(e)}")


@router.get("/channels/{channel_id}/playlists")
def get_channel_playlists(
    channel_id: str,
    max_results: int = Query(50, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """
    Lista las listas de reproducción del canal con recuento de videos.
    """
    channel = _get_active_channel(channel_id, db)
    try:
        playlists = list_channel_playlists(channel_record=channel, max_results=max_results)
        return {"channel_id": channel_id, "playlists": playlists}
    except Exception as e:
        logger.exception(f"Error listando playlists de canal {channel_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al listar playlists: {str(e)}")


@router.get("/channels/{channel_id}/comments")
def get_channel_comments(
    channel_id: str,
    video_id: Optional[str] = Query(None, description="Filtrar por video específico"),
    max_results: int = Query(50, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """
    Lista los comentarios recientes de la comunidad en el canal o video.
    """
    channel = _get_active_channel(channel_id, db)
    try:
        comments = list_channel_comments(channel_record=channel, video_id=video_id, max_results=max_results)
        return {"channel_id": channel_id, "video_id": video_id, "comments": comments}
    except Exception as e:
        logger.exception(f"Error listando comentarios de canal {channel_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al listar comentarios: {str(e)}")


@router.post("/channels/{channel_id}/comments/reply")
def post_comment_reply(
    channel_id: str,
    data: ReplyCommentRequest,
    db: Session = Depends(get_db)
):
    """
    Publica una respuesta a un comentario existente.
    """
    channel = _get_active_channel(channel_id, db)
    try:
        res = reply_to_comment(channel_record=channel, parent_comment_id=data.parent_comment_id, text=data.text)
        return res
    except Exception as e:
        logger.exception(f"Error respondiendo al comentario {data.parent_comment_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al responder al comentario: {str(e)}")

