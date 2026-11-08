# -*- coding: utf-8 -*-
"""
YouTube Multi-Account & Multi-Channel Uploader
=============================================
Soporta:
1. Flujo OAuth2 Google (prompt='select_account consent') para múltiples cuentas.
2. Listado e importación de múltiples canales por cuenta.
3. Subida reanudable (Resumable Upload) de videos en segundo plano a canales específicos.
4. Soporte para metadatos virales optimizados por idioma (título, descripción, tags).
"""

import os
import time
import json
import logging
from typing import Optional, List, Dict, Any
from pathlib import Path

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError

from config import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    ROOT_DIR,
    BACKEND_DIR,
)

logger = logging.getLogger("youtube_client")

# Scopes requeridos (Suite Completa: Upload, Read/Write Videos, Analytics y Comentarios)
SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid"
]

CLIENT_SECRETS_FILE = ROOT_DIR / "client_secret.json"


def get_oauth_config() -> Dict[str, Any]:
    """
    Obtiene la configuración del cliente OAuth (desde variables de entorno o client_secret.json).
    """
    client_id = GOOGLE_CLIENT_ID or os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = GOOGLE_CLIENT_SECRET or os.getenv("GOOGLE_CLIENT_SECRET", "")
    redirect_uri = GOOGLE_REDIRECT_URI or os.getenv("GOOGLE_REDIRECT_URI", "https://media.weblifetech.com/api/youtube/callback")

    if client_id and client_secret:
        return {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [
                    redirect_uri,
                    "https://media.weblifetech.com/api/youtube/callback",
                    "https://exito.cyou/api/youtube/callback",
                    "http://127.0.0.1:8000/api/youtube/callback"
                ]
            }
        }

    if CLIENT_SECRETS_FILE.exists():
        with open(CLIENT_SECRETS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)

    return {}


def create_auth_flow(redirect_uri: Optional[str] = None) -> Flow:
    """
    Crea un flujo de autenticación OAuth2 de Google.
    Se desactiva autogenerate_code_verifier (PKCE) para soportar flujos estándar de backend sin estado en memoria entre peticiones.
    """
    config = get_oauth_config()
    if not config:
        raise ValueError(
            "Configuración de Google OAuth no encontrada. "
            "Define GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env o sube client_secret.json en la raíz de MediaSuite."
        )

    r_uri = redirect_uri or GOOGLE_REDIRECT_URI
    flow = Flow.from_client_config(
        client_config=config,
        scopes=SCOPES,
        redirect_uri=r_uri,
        autogenerate_code_verifier=False
    )
    return flow


def get_authorization_url(redirect_uri: Optional[str] = None, state: Optional[str] = None) -> str:
    """
    Genera la URL para iniciar sesión en Google.
    Usa prompt='select_account consent' para permitir seleccionar cuentas distintas.
    """
    flow = create_auth_flow(redirect_uri=redirect_uri)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="select_account consent",
        state=state
    )
    return auth_url


def exchange_code_and_get_channels(code: str, redirect_uri: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Intercambia el código de autorización por tokens y consulta los canales de YouTube de esa cuenta.
    Retorna una lista de canales con sus credenciales correspondientes.
    """
    flow = create_auth_flow(redirect_uri=redirect_uri)
    flow.fetch_token(code=code)
    creds = flow.credentials

    config = get_oauth_config().get("web", {})
    client_id = config.get("client_id", GOOGLE_CLIENT_ID)
    client_secret = config.get("client_secret", GOOGLE_CLIENT_SECRET)

    # 1. Obtener email de la cuenta de Google
    account_email = None
    try:
        oauth2_service = build("oauth2", "v2", credentials=creds)
        user_info = oauth2_service.userinfo().get().execute()
        account_email = user_info.get("email")
    except Exception as e:
        logger.warning(f"No se pudo obtener el email del usuario: {e}")

    # 2. Consultar canales de YouTube disponibles
    youtube = build("youtube", "v3", credentials=creds)
    channels_response = youtube.channels().list(
        mine=True,
        part="snippet,contentDetails,statistics"
    ).execute()

    items = channels_response.get("items", [])
    results = []

    for ch in items:
        ch_id = ch.get("id")
        snippet = ch.get("snippet", {})
        title = snippet.get("title", "Canal Sin Nombre")
        desc = snippet.get("description", "")
        custom_url = snippet.get("customUrl", "")
        thumb = (
            snippet.get("thumbnails", {}).get("high", {}).get("url") or
            snippet.get("thumbnails", {}).get("default", {}).get("url") or
            ""
        )

        results.append({
            "channel_id": ch_id,
            "channel_title": title,
            "channel_description": desc,
            "custom_url": custom_url,
            "thumbnail_url": thumb,
            "account_email": account_email,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri or "https://oauth2.googleapis.com/token",
            "client_id": client_id,
            "client_secret": client_secret,
            "scopes": creds.scopes or SCOPES
        })

    return results


def exchange_code_for_social_auth(code: str, redirect_uri: Optional[str] = None) -> Dict[str, Any]:
    """
    Intercambia el código de Google OAuth por el perfil del usuario (email, nombre, avatar)
    y opcionalmente sus canales de YouTube si existen (útil tanto para Fans como para Artistas).
    """
    flow = create_auth_flow(redirect_uri=redirect_uri)
    flow.fetch_token(code=code)
    creds = flow.credentials

    config = get_oauth_config().get("web", {})
    client_id = config.get("client_id", GOOGLE_CLIENT_ID)
    client_secret = config.get("client_secret", GOOGLE_CLIENT_SECRET)

    account_email = None
    user_name = None
    user_picture = None
    try:
        oauth2_service = build("oauth2", "v2", credentials=creds)
        user_info = oauth2_service.userinfo().get().execute()
        account_email = user_info.get("email")
        user_name = user_info.get("name") or (account_email.split("@")[0] if account_email else "User")
        user_picture = user_info.get("picture")
    except Exception as e:
        logger.warning(f"No se pudo obtener userinfo de Google: {e}")

    results = []
    try:
        youtube = build("youtube", "v3", credentials=creds)
        channels_response = youtube.channels().list(
            mine=True,
            part="snippet,contentDetails,statistics"
        ).execute()
        items = channels_response.get("items", [])
        for ch in items:
            ch_id = ch.get("id")
            snippet = ch.get("snippet", {})
            title = snippet.get("title", "Canal Sin Nombre")
            desc = snippet.get("description", "")
            custom_url = snippet.get("customUrl", "")
            thumb = (
                snippet.get("thumbnails", {}).get("high", {}).get("url") or
                snippet.get("thumbnails", {}).get("default", {}).get("url") or
                ""
            )
            results.append({
                "channel_id": ch_id,
                "channel_title": title,
                "channel_description": desc,
                "custom_url": custom_url,
                "thumbnail_url": thumb,
                "account_email": account_email,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri or "https://oauth2.googleapis.com/token",
                "client_id": client_id,
                "client_secret": client_secret,
                "scopes": creds.scopes or SCOPES
            })
    except Exception as e:
        logger.warning(f"Usuario de Google sin canales de YouTube activos o error menor: {e}")

    return {
        "email": account_email,
        "name": user_name,
        "picture": user_picture,
        "channels": results,
    }


def get_youtube_service_for_channel(channel_record: Any):
    """
    Crea un cliente de YouTube autenticado usando el refresh_token del canal específico.
    """
    config = get_oauth_config().get("web", {})
    client_id = getattr(channel_record, "client_id", None) or config.get("client_id") or GOOGLE_CLIENT_ID
    client_secret = getattr(channel_record, "client_secret", None) or config.get("client_secret") or GOOGLE_CLIENT_SECRET
    token_uri = getattr(channel_record, "token_uri", "https://oauth2.googleapis.com/token")

    creds = Credentials(
        token=None,
        refresh_token=channel_record.refresh_token,
        token_uri=token_uri,
        client_id=client_id,
        client_secret=client_secret,
        scopes=None
    )

    return build("youtube", "v3", credentials=creds)


def resumable_upload(insert_request, task_instance: Any = None) -> str:
    """
    Sube un video en bloques reanudables a YouTube informando progreso en Celery.
    """
    response = None
    error = None
    retry = 0
    MAX_RETRIES = 5

    while response is None:
        try:
            status, response = insert_request.next_chunk()
            if status and task_instance:
                pct = int(status.progress() * 100)
                task_instance.update_state(
                    state="PROGRESS",
                    meta={"details": f"Subiendo video a YouTube: {pct}%", "progress": f"{pct}%"}
                )
            if response and "id" in response:
                return response["id"]

        except HttpError as e:
            if e.resp.status in [500, 502, 503, 504]:
                error = f"Error recuperable del servidor de Google (intento {retry + 1}/{MAX_RETRIES}): {e}"
            else:
                raise HttpError(f"Error HTTP no recuperable de YouTube API: {e}", e.resp)
        except Exception as e:
            raise IOError(f"Error durante el streaming de subida a YouTube: {e}")

        if error:
            logger.warning(error)
            retry += 1
            if retry > MAX_RETRIES:
                raise RuntimeError("Se superó el número máximo de reintentos para la subida a YouTube.")
            time.sleep((2 ** retry) + 1)

    return ""


def upload_video_for_channel(
    channel_record: Any,
    video_path: str,
    title: str,
    description: str,
    tags: List[str],
    privacy_status: str = "private",
    category_id: str = "10",
    task_instance: Any = None
) -> Dict[str, Any]:
    """
    Sube un video al canal especificado con privacidad 'private' (borrador).
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"El archivo de video no existe en el servidor: {video_path}")

    youtube = get_youtube_service_for_channel(channel_record)

    body = {
        "snippet": {
            "title": title[:100],  # YouTube limita a 100 caracteres
            "description": description[:5000],  # Máximo 5000 caracteres
            "tags": tags[:50] if tags else [],
            "categoryId": str(category_id)
        },
        "status": {
            "privacyStatus": privacy_status,  # "private" por defecto
            "selfDeclaredMadeForKids": False
        }
    }

    insert_request = youtube.videos().insert(
        part="snippet,status",
        body=body,
        media_body=MediaFileUpload(video_path, chunksize=1024 * 1024 * 5, resumable=True)  # 5MB chunks
    )

    if task_instance:
        task_instance.update_state(
            state="PROGRESS",
            meta={"details": "Iniciando subida a YouTube...", "progress": "5%"}
        )

    video_id = resumable_upload(insert_request, task_instance=task_instance)

    if not video_id:
        raise RuntimeError("La subida a YouTube finalizó pero no se recibió un Video ID.")

    video_url = f"https://www.youtube.com/watch?v={video_id}"
    studio_url = f"https://studio.youtube.com/video/{video_id}/edit"

    return {
        "video_id": video_id,
        "video_url": video_url,
        "studio_url": studio_url,
        "privacy": privacy_status,
        "channel_id": channel_record.channel_id,
        "channel_title": channel_record.channel_title
    }


def upload_video_to_youtube(
    video_path: str,
    title: str,
    description: str,
    tags: Optional[List[str]] = None,
    task_instance: Any = None,
    privacy_status: str = "private",
    channel_id: Optional[str] = None
) -> str:
    """
    Función de compatibilidad retroactiva para orquestadores antiguos.
    Sube el video al canal por defecto o al canal especificado.
    """
    from database import SessionLocal
    from db_models import YouTubeAccount

    db = SessionLocal()
    try:
        query = db.query(YouTubeAccount).filter(YouTubeAccount.is_active == True)
        if channel_id:
            query = query.filter(YouTubeAccount.channel_id == channel_id)
        channel = query.first()

        if not channel:
            logger.warning("No hay ningún canal de YouTube activo configurado para subida automática.")
            return ""

        res = upload_video_for_channel(
            channel_record=channel,
            video_path=video_path,
            title=title,
            description=description,
            tags=tags or [],
            privacy_status=privacy_status,
            task_instance=task_instance
        )
        return res.get("video_url", "")
    except Exception as e:
        logger.error(f"Error en upload_video_to_youtube: {e}")
        return ""
    finally:
        db.close()


def get_youtube_analytics_service(channel_record: Any):
    """
    Crea el cliente de YouTube Analytics API (v2) usando las credenciales del canal.
    """
    config = get_oauth_config().get("web", {})
    client_id = getattr(channel_record, "client_id", None) or config.get("client_id") or GOOGLE_CLIENT_ID
    client_secret = getattr(channel_record, "client_secret", None) or config.get("client_secret") or GOOGLE_CLIENT_SECRET
    token_uri = getattr(channel_record, "token_uri", "https://oauth2.googleapis.com/token")

    creds = Credentials(
        token=None,
        refresh_token=channel_record.refresh_token,
        token_uri=token_uri,
        client_id=client_id,
        client_secret=client_secret,
        scopes=None
    )

    return build("youtubeAnalytics", "v2", credentials=creds)


def get_channel_audit_and_stats(channel_record: Any) -> Dict[str, Any]:
    """
    Auditoría 360° del canal: metadatos, branding, estadísticas acumuladas y diagnóstico de salud.
    """
    yt = get_youtube_service_for_channel(channel_record)
    ch_res = yt.channels().list(
        id=channel_record.channel_id,
        part="snippet,contentDetails,statistics,brandingSettings,status,topicDetails"
    ).execute()

    items = ch_res.get("items", [])
    if not items:
        # Fallback usando mine=True
        ch_res = yt.channels().list(
            mine=True,
            part="snippet,contentDetails,statistics,brandingSettings,status,topicDetails"
        ).execute()
        items = ch_res.get("items", [])

    if not items:
        raise ValueError(f"No se pudo encontrar información para el canal {channel_record.channel_id}")

    ch = items[0]
    snippet = ch.get("snippet", {})
    stats = ch.get("statistics", {})
    branding = ch.get("brandingSettings", {})
    content_details = ch.get("contentDetails", {})
    related_playlists = content_details.get("relatedPlaylists", {})
    uploads_playlist_id = related_playlists.get("uploads", "")

    # Parsing métricas
    view_count = int(stats.get("viewCount", 0))
    subscriber_count = int(stats.get("subscriberCount", 0))
    video_count = int(stats.get("videoCount", 0))
    comment_count = int(stats.get("commentCount", 0))

    # Diagnóstico SEO y Salud
    health_score = 100
    warnings = []
    recommendations = []

    if not snippet.get("description") or len(snippet.get("description", "")) < 100:
        health_score -= 15
        warnings.append("Descripción del canal demasiado breve o inexistente.")
        recommendations.append("Añade una descripción completa con palabras clave del nicho.")

    if not branding.get("image", {}).get("bannerExternalUrl"):
        health_score -= 10
        warnings.append("El canal no cuenta con un banner/cabecera personalizada.")
        recommendations.append("Diseña y sube un banner en resolución 2560x1440.")

    if not snippet.get("customUrl"):
        health_score -= 5
        warnings.append("El canal no tiene configurado un identificador único (@handle).")

    views_per_video = round(view_count / max(1, video_count), 2)
    subs_per_video = round(subscriber_count / max(1, video_count), 2)

    return {
        "channel_id": channel_record.channel_id,
        "title": snippet.get("title", channel_record.channel_title),
        "description": snippet.get("description", ""),
        "custom_url": snippet.get("customUrl", ""),
        "published_at": snippet.get("publishedAt", ""),
        "country": snippet.get("country", "Global"),
        "thumbnails": snippet.get("thumbnails", {}),
        "banner_url": branding.get("image", {}).get("bannerExternalUrl", ""),
        "keywords": branding.get("channel", {}).get("keywords", ""),
        "uploads_playlist_id": uploads_playlist_id,
        "statistics": {
            "view_count": view_count,
            "subscriber_count": subscriber_count,
            "hidden_subscriber_count": stats.get("hiddenSubscriberCount", False),
            "video_count": video_count,
            "comment_count": comment_count,
            "views_per_video": views_per_video,
            "subs_per_video": subs_per_video,
        },
        "health": {
            "score": max(10, health_score),
            "warnings": warnings,
            "recommendations": recommendations,
        }
    }


def get_channel_analytics_report(
    channel_record: Any,
    start_date: str,
    end_date: str,
    metrics: Optional[str] = None,
    dimensions: str = "day"
) -> Dict[str, Any]:
    """
    Consulta la YouTube Analytics API v2 para obtener métricas de rendimiento por día, país o fuente.
    """
    yt_analytics = get_youtube_analytics_service(channel_record)
    
    default_metrics = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares"
    query_metrics = metrics or default_metrics

    try:
        report = yt_analytics.reports().query(
            ids=f"channel=={channel_record.channel_id}",
            startDate=start_date,
            endDate=end_date,
            metrics=query_metrics,
            dimensions=dimensions,
            sort=f"{dimensions}" if dimensions in ["day", "month"] else "-views"
        ).execute()

        headers = [col.get("name") for col in report.get("columnHeaders", [])]
        rows = report.get("rows", [])

        # Formatear filas a objetos
        formatted_rows = []
        for r in rows:
            formatted_rows.append(dict(zip(headers, r)))

        return {
            "status": "success",
            "start_date": start_date,
            "end_date": end_date,
            "dimensions": dimensions,
            "headers": headers,
            "rows": formatted_rows,
            "totals": report.get("totals", {})
        }
    except HttpError as he:
        logger.warning(f"Error consultando YouTube Analytics API: {he}")
        return {
            "status": "error",
            "error_detail": str(he),
            "start_date": start_date,
            "end_date": end_date,
            "headers": [],
            "rows": [],
            "totals": {}
        }


def list_channel_videos(
    channel_record: Any,
    max_results: int = 50,
    page_token: Optional[str] = None,
    order: str = "date",
    query: Optional[str] = None
) -> Dict[str, Any]:
    """
    Lista los videos del canal con metadatos completos y estadísticas individuales.
    """
    yt = get_youtube_service_for_channel(channel_record)

    search_args: Dict[str, Any] = {
        "channelId": channel_record.channel_id,
        "part": "snippet,id",
        "order": order,
        "maxResults": min(max_results, 50),
        "type": "video"
    }
    if page_token:
        search_args["pageToken"] = page_token
    if query:
        search_args["q"] = query

    search_res = yt.search().list(**search_args).execute()
    items = search_res.get("items", [])
    video_ids = [it["id"]["videoId"] for it in items if "videoId" in it.get("id", {})]

    videos_details = []
    if video_ids:
        # Obtener estadísticas y contentDetails de los videos en lote
        vid_res = yt.videos().list(
            id=",".join(video_ids),
            part="snippet,contentDetails,statistics,status"
        ).execute()

        for v in vid_res.get("items", []):
            v_id = v.get("id")
            snip = v.get("snippet", {})
            st = v.get("statistics", {})
            stat = v.get("status", {})
            cd = v.get("contentDetails", {})

            videos_details.append({
                "video_id": v_id,
                "title": snip.get("title", ""),
                "description": snip.get("description", ""),
                "published_at": snip.get("publishedAt", ""),
                "channel_id": snip.get("channelId", ""),
                "tags": snip.get("tags", []),
                "category_id": snip.get("categoryId", ""),
                "thumbnails": snip.get("thumbnails", {}),
                "privacy_status": stat.get("privacyStatus", "public"),
                "publish_at": stat.get("publishAt", None),
                "duration": cd.get("duration", ""),
                "dimension": cd.get("dimension", "2d"),
                "definition": cd.get("definition", "hd"),
                "views": int(st.get("viewCount", 0)),
                "likes": int(st.get("likeCount", 0)),
                "comments": int(st.get("commentCount", 0)),
                "video_url": f"https://www.youtube.com/watch?v={v_id}"
            })

    return {
        "videos": videos_details,
        "next_page_token": search_res.get("nextPageToken"),
        "prev_page_token": search_res.get("prevPageToken"),
        "total_results": search_res.get("pageInfo", {}).get("totalResults", len(videos_details))
    }


def update_video_metadata(
    channel_record: Any,
    video_id: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    tags: Optional[List[str]] = None,
    category_id: Optional[str] = None,
    privacy_status: Optional[str] = None
) -> Dict[str, Any]:
    """
    Actualiza el título, descripción, tags o privacidad de un video en YouTube.
    """
    yt = get_youtube_service_for_channel(channel_record)

    # 1. Obtener el snippet actual para no sobreescribir valores no especificados
    vid_res = yt.videos().list(id=video_id, part="snippet,status").execute()
    items = vid_res.get("items", [])
    if not items:
        raise ValueError(f"Video {video_id} no encontrado")

    current = items[0]
    snip = current.get("snippet", {})
    stat = current.get("status", {})

    update_body: Dict[str, Any] = {
        "id": video_id,
        "snippet": {
            "title": title if title is not None else snip.get("title", ""),
            "description": description if description is not None else snip.get("description", ""),
            "tags": tags if tags is not None else snip.get("tags", []),
            "categoryId": category_id if category_id is not None else snip.get("categoryId", "22")
        }
    }

    if privacy_status:
        update_body["status"] = {
            "privacyStatus": privacy_status
        }
        part = "snippet,status"
    else:
        part = "snippet"

    res = yt.videos().update(part=part, body=update_body).execute()
    return {
        "status": "success",
        "video_id": res.get("id"),
        "title": res.get("snippet", {}).get("title"),
        "privacy_status": res.get("status", {}).get("privacyStatus")
    }


def set_video_thumbnail(channel_record: Any, video_id: str, image_path: str) -> Dict[str, Any]:
    """
    Sube o reemplaza la miniatura personalizada (Thumbnail) de un video en YouTube.
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"La imagen de miniatura no existe: {image_path}")

    yt = get_youtube_service_for_channel(channel_record)
    media = MediaFileUpload(image_path, mimetype="image/jpeg", resumable=False)
    res = yt.thumbnails().set(videoId=video_id, media_body=media).execute()
    return {
        "status": "success",
        "video_id": video_id,
        "items": res.get("items", [])
    }


def delete_video_from_youtube(channel_record: Any, video_id: str) -> bool:
    """
    Elimina físicamente un video de YouTube vía API.
    """
    yt = get_youtube_service_for_channel(channel_record)
    yt.videos().delete(id=video_id).execute()
    return True


def list_channel_playlists(channel_record: Any, max_results: int = 50) -> List[Dict[str, Any]]:
    """
    Lista las listas de reproducción del canal con conteo de items.
    """
    yt = get_youtube_service_for_channel(channel_record)
    res = yt.playlists().list(
        channelId=channel_record.channel_id,
        part="snippet,contentDetails,status",
        maxResults=max_results
    ).execute()

    playlists = []
    for item in res.get("items", []):
        snip = item.get("snippet", {})
        cd = item.get("contentDetails", {})
        stat = item.get("status", {})
        playlists.append({
            "playlist_id": item.get("id"),
            "title": snip.get("title"),
            "description": snip.get("description"),
            "item_count": cd.get("itemCount", 0),
            "privacy_status": stat.get("privacyStatus", "public"),
            "published_at": snip.get("publishedAt"),
            "thumbnails": snip.get("thumbnails", {})
        })
    return playlists


def list_channel_comments(channel_record: Any, video_id: Optional[str] = None, max_results: int = 50) -> List[Dict[str, Any]]:
    """
    Lista los comentarios recientes del canal o de un video específico.
    """
    yt = get_youtube_service_for_channel(channel_record)
    kwargs: Dict[str, Any] = {
        "part": "snippet,replies",
        "maxResults": min(max_results, 50),
        "textFormat": "plainText"
    }
    if video_id:
        kwargs["videoId"] = video_id
    else:
        kwargs["allThreadsRelatedToChannelId"] = channel_record.channel_id

    try:
        res = yt.commentThreads().list(**kwargs).execute()
        comments = []
        for item in res.get("items", []):
            top_level = item.get("snippet", {}).get("topLevelComment", {}).get("snippet", {})
            comments.append({
                "comment_id": item.get("id"),
                "video_id": item.get("snippet", {}).get("videoId"),
                "author_name": top_level.get("authorDisplayName"),
                "author_avatar": top_level.get("authorProfileImageUrl"),
                "author_channel_url": top_level.get("authorChannelUrl"),
                "text": top_level.get("textDisplay"),
                "like_count": top_level.get("likeCount", 0),
                "published_at": top_level.get("publishedAt"),
                "reply_count": item.get("snippet", {}).get("totalReplyCount", 0)
            })
        return comments
    except HttpError as he:
        logger.warning(f"Error listando comentarios: {he}")
        return []


def reply_to_comment(channel_record: Any, parent_comment_id: str, text: str) -> Dict[str, Any]:
    """
    Publica una respuesta a un hilo de comentarios en YouTube.
    """
    yt = get_youtube_service_for_channel(channel_record)
    body = {
        "snippet": {
            "parentId": parent_comment_id,
            "textOriginal": text
        }
    }
    res = yt.comments().insert(part="snippet", body=body).execute()
    return {
        "status": "success",
        "comment_id": res.get("id"),
        "text": res.get("snippet", {}).get("textDisplay")
    }


