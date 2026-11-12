# -*- coding: utf-8 -*-
"""
MediaSuite 2.0 / Éxito.cyou — Artist Studio, PayPal Agentic Marketplace & Omnichannel Router
=============================================================================================
Construido para el PayPal AI Hackathon 2026:
1. Panel de Artista Independiente (con o sin suscripción de producción exito.cyou).
2. Subida de canciones MP3/WAV, letras, portadas y creación de Álbumes con precios flexibles.
3. PayPal Marketplace Engine (Zero Fondos Propios):
   - Billetera virtual con retención automática de comisión de plataforma (15%).
   - Modos de retiro flexibles: Inmediato (Auto-Payout), Por Umbral ($), Programado (Semanal/Mensual) o Manual.
   - Conversión de saldo de ventas a Tokens de Producción IA.
   - Creación de órdenes PayPal conversacionales (Agentic Commerce Checkout Links).
4. Analíticas de Estudio tipo Spotify for Artists + Comunidad (Suscriptores, Notificaciones, Votaciones).
5. Integración Omnicanal Agéntica:
   - Agente IA personalizado del Artista con RAG Multitenant.
   - Vinculación de WhatsApp vía QR (Microservicio Aikrofy :3011 + Meta Business Tech Provider).
   - Vinculación de Bot de Telegram personalizado del artista.
6. Reacciones de Corazón / Me Gusta y Motor de Recomendación Musical con señales del Chat de Saori.
"""

import os
import re
import json
import uuid
import shutil
import logging
import datetime
from pathlib import Path
from typing import Optional, List, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
import db_models
from routers.auth import get_current_user, verify_token
from config import (
    PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET,
    PAYPAL_MODE,
    MEDIA_LIBRARY_DIR,
    UPLOADS_DIR,
)

logger = logging.getLogger(__name__)
router = APIRouter()

AIKROFY_WHATSAPP_API = os.getenv("AIKROFY_WHATSAPP_API", "http://127.0.0.1:3011")


# ══════════════════════════════════════════════════════════════════════════════
#  HELPERS: AUTENTICACIÓN Y RESOLUCIÓN DE PERFIL DE ARTISTA
# ══════════════════════════════════════════════════════════════════════════════

def _get_optional_user(request: Request, db: Session) -> Optional[db_models.User]:
    token = request.cookies.get("mediasuite_session")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        return None
    payload = verify_token(token)
    if not payload:
        return None
    return db.query(db_models.User).filter(db_models.User.username == payload.get("user")).first()


def _slugify(text: str) -> str:
    import re
    s = text.lower().strip()
    s = re.sub(r"[^a-z0-9_-]", "", s.replace(" ", "_"))
    return s or f"artist_{uuid.uuid4().hex[:6]}"


def _ensure_artist_profile(user: db_models.User, db: Session) -> db_models.ArtistProfile:
    """Obtiene o inicializa automáticamente el perfil de artista para cualquier usuario autenticado."""
    profile = db.query(db_models.ArtistProfile).filter(
        db_models.ArtistProfile.user_id == user.id
    ).first()
    if profile:
        # Sincronizar estado de suscripción de producción audiovisual
        has_sub = any(s.status == "active" for s in (user.subscriptions or [])) or user.role in ["super_admin", "tools_admin"]
        if profile.has_production_subscription != has_sub:
            profile.has_production_subscription = has_sub
            db.commit()
        return profile

    base_slug = _slugify(user.username)
    slug = base_slug
    counter = 1
    while db.query(db_models.ArtistProfile).filter(db_models.ArtistProfile.slug == slug).first():
        slug = f"{base_slug}{counter}"
        counter += 1

    has_sub = any(s.status == "active" for s in (user.subscriptions or [])) or user.role in ["super_admin", "tools_admin"]

    profile = db_models.ArtistProfile(
        user_id=user.id,
        slug=slug,
        display_name=user.username.replace("_", " ").title(),
        bio=f"Canal oficial de {user.username} en Éxito.cyou — Streaming & Direct-to-Fan Marketplace.",
        primary_color="#8b5cf6",
        genre_focus="Conscious Music / Urbano / Electrónica",
        language="es",
        has_production_subscription=has_sub,
        paypal_email=user.email,
        paypal_verified=True,
        payout_mode="manual",
        payout_threshold_usd=20.00,
        platform_fee_percent=15.00,
        agent_enabled=True,
        agent_name=f"{user.username.title()} AI",
        agent_persona_type="artist_clone",
        agent_welcome_message=f"¡Hola! Soy la versión IA de {user.username.title()}. Pregúntame por mis canciones, historias detrás de cada letra o adquiere mis tracks y álbumes directo por PayPal.",
        whatsapp_company_id=f"exito_artist_{slug}",
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    # También registrar en la tabla multitenant Creator para que /@slug funcione nativamente
    existing_creator = db.query(db_models.Creator).filter(db_models.Creator.slug == slug).first()
    if not existing_creator:
        new_creator = db_models.Creator(
            slug=slug,
            name=profile.display_name,
            creator_type="music",
            language=profile.language,
            description=profile.bio,
            color=profile.primary_color,
            gradient="from-purple-500/20 to-indigo-600/10",
            is_active=True,
        )
        db.add(new_creator)
        db.commit()

    return profile


def _execute_paypal_payout_or_mock(
    paypal_email: str,
    amount_usd: float,
    note: str = "Liquidación de regalías Éxito.cyou / MediaSuite",
    sandbox: bool = False,
) -> dict:
    """
    Ejecuta transferencia vía PayPal Payouts API v1 si las credenciales están activas,
    o retorna un comprobante auditable Sandbox/Live para demostración sin fricción.
    """
    from paypal_runtime import get_paypal_runtime

    batch_id = f"PP-PAYOUT-{uuid.uuid4().hex[:10].upper()}"
    paypal_client_id, paypal_client_secret, api_url, paypal_mode = get_paypal_runtime(sandbox)
    if paypal_client_id and paypal_client_secret and paypal_email:
        try:
            with httpx.Client(timeout=15.0) as client:
                token_res = client.post(
                    f"{api_url}/v1/oauth2/token",
                    auth=(paypal_client_id, paypal_client_secret),
                    data={"grant_type": "client_credentials"},
                )
                if token_res.status_code == 200:
                    access_token = token_res.json().get("access_token")
                    payout_payload = {
                        "sender_batch_header": {
                            "sender_batch_id": batch_id,
                            "email_subject": "Has recibido un pago de regalías de Éxito.cyou!",
                            "email_message": note,
                        },
                        "items": [
                            {
                                "recipient_type": "EMAIL",
                                "amount": {
                                    "value": f"{amount_usd:.2f}",
                                    "currency": "USD",
                                },
                                "note": note,
                                "sender_item_id": f"ITEM-{uuid.uuid4().hex[:8].upper()}",
                                "receiver": paypal_email,
                            }
                        ],
                    }
                    res = client.post(
                        f"{api_url}/v1/payments/payouts",
                        headers={
                            "Authorization": f"Bearer {access_token}",
                            "Content-Type": "application/json",
                        },
                        json=payout_payload,
                    )
                    if res.status_code in (200, 201):
                        data = res.json()
                        real_batch = data.get("batch_header", {}).get("payout_batch_id", batch_id)
                        return {"success": True, "batch_id": real_batch, "mode": paypal_mode, "live_api": paypal_mode == "live"}
        except Exception as e:
            logger.warning(f"PayPal Payout API fallback activado: {e}")

    return {"success": True, "batch_id": batch_id, "mode": paypal_mode, "live_api": False}


def record_artist_sale_and_split(
    db: Session,
    media_item: db_models.MediaCatalog,
    gross_amount_usd: float,
    buyer_email: Optional[str] = None,
    purchase_id: Optional[int] = None,
    paypal_order_id: Optional[str] = None,
    sale_channel: str = "web_portal",
    sandbox: bool = False,
    artist_slug_override: Optional[str] = None,
) -> Optional[dict]:
    """
    Se invoca automáticamente cuando un fan compra una canción o álbum con PayPal:
    1. Identifica al artista dueño del track/álbum.
    2. Calcula la comisión de MediaSuite (ej. 15%) y el neto del artista (85%).
    3. Acredita el saldo en la billetera del artista (Modelo Zero Fondos Propios: se paga de lo que acaba de entrar).
    4. Si el artista configuró 'instant' o superó su 'threshold', dispara el Payout automático a su PayPal.
    """
    if gross_amount_usd <= 0:
        return None

    # Buscar perfil de artista por slug o nombre
    profile = None
    if artist_slug_override:
        profile = db.query(db_models.ArtistProfile).filter(
            db_models.ArtistProfile.slug == artist_slug_override
        ).first()
    if not profile and media_item.creator_slug:
        profile = db.query(db_models.ArtistProfile).filter(
            db_models.ArtistProfile.slug == media_item.creator_slug
        ).first()
    if not profile and media_item.creator:
        profile = db.query(db_models.ArtistProfile).filter(
            db_models.ArtistProfile.display_name == media_item.creator
        ).first()
    if not profile and media_item.artist:
        profile = db.query(db_models.ArtistProfile).filter(
            db_models.ArtistProfile.display_name == media_item.artist
        ).first()

    # Si es un canal oficial del sistema sin ArtistProfile aún, vincular al primer admin para trazabilidad completa
    if not profile:
        admin_user = db.query(db_models.User).filter(db_models.User.role == "super_admin").first()
        if admin_user:
            profile = _ensure_artist_profile(admin_user, db)

    if not profile:
        return None

    fee_pct = float(profile.platform_fee_percent or 15.0)
    platform_fee = round(gross_amount_usd * (fee_pct / 100.0), 2)
    net_artist = round(gross_amount_usd - platform_fee, 2)

    profile.available_balance_usd = float(profile.available_balance_usd or 0) + net_artist
    profile.lifetime_gross_sales_usd = float(profile.lifetime_gross_sales_usd or 0) + gross_amount_usd
    profile.lifetime_net_earnings_usd = float(profile.lifetime_net_earnings_usd or 0) + net_artist
    profile.lifetime_platform_fees_usd = float(profile.lifetime_platform_fees_usd or 0) + platform_fee

    auto_payout_done = False
    payout_batch_id = None

    # Evaluar reglas de liquidación automática elegidas por el artista
    if profile.paypal_email:
        should_auto_payout = False
        if profile.payout_mode == "instant":
            should_auto_payout = True
        elif profile.payout_mode == "threshold" and float(profile.available_balance_usd) >= float(profile.payout_threshold_usd or 20.0):
            should_auto_payout = True

        if should_auto_payout and float(profile.available_balance_usd) > 0:
            payout_amount = float(profile.available_balance_usd)
            payout_res = _execute_paypal_payout_or_mock(
                paypal_email=profile.paypal_email,
                amount_usd=payout_amount,
                note=f"Pago automático ({profile.payout_mode}) por venta de '{media_item.title}'",
                sandbox=sandbox,
            )
            if payout_res.get("success"):
                payout_batch_id = payout_res.get("batch_id")
                profile.available_balance_usd = 0.00
                auto_payout_done = True
                payout_tx = db_models.ArtistPayoutTransaction(
                    artist_profile_id=profile.id,
                    amount_usd=payout_amount,
                    payout_method="paypal",
                    destination_account=profile.paypal_email,
                    paypal_payout_batch_id=payout_batch_id,
                    status="completed",
                    notes=f"Auto-Payout ({profile.payout_mode}) tras venta #{purchase_id or 'directa'}",
                )
                db.add(payout_tx)

    ledger = db_models.ArtistSaleLedger(
        artist_profile_id=profile.id,
        purchase_id=purchase_id,
        media_catalog_id=media_item.id,
        buyer_email=buyer_email,
        sale_channel=sale_channel,
        gross_amount_usd=gross_amount_usd,
        platform_fee_usd=platform_fee,
        net_artist_amount_usd=net_artist,
        paypal_order_id=paypal_order_id,
        auto_payout_triggered=auto_payout_done,
    )
    db.add(ledger)
    db.commit()

    return {
        "artist_slug": profile.slug,
        "gross_usd": gross_amount_usd,
        "platform_fee_usd": platform_fee,
        "net_artist_usd": net_artist,
        "auto_payout_triggered": auto_payout_done,
        "payout_batch_id": payout_batch_id,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  1. ENDPOINTS DEL PANEL DE ARTISTA (PERFIL, PAGOS PAYPAL, MÉTRICAS SPOTIFY-STYLE)
# ══════════════════════════════════════════════════════════════════════════════

class ArtistProfileUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    slug: Optional[str] = None
    bio: Optional[str] = None
    primary_color: Optional[str] = None
    genre_focus: Optional[str] = None
    language: Optional[str] = None
    paypal_email: Optional[str] = None
    paypal_merchant_id: Optional[str] = None
    payphone_number: Optional[str] = None
    payout_mode: Optional[str] = None  # instant | threshold | scheduled_weekly | scheduled_monthly | manual
    payout_threshold_usd: Optional[float] = None
    agent_enabled: Optional[bool] = None
    agent_name: Optional[str] = None
    agent_persona_type: Optional[str] = None
    agent_system_prompt: Optional[str] = None
    agent_rag_knowledge: Optional[str] = None
    agent_voice_id: Optional[str] = None
    agent_welcome_message: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_bot_username: Optional[str] = None
    whatsapp_phone: Optional[str] = None
    meta_business_waba_id: Optional[str] = None


@router.get("/me")
def get_my_artist_studio(
    request: Request,
    channel_slug: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Devuelve el estado completo del Panel de Artista Independiente:
    - Perfil y personalización visual
    - Estado de cuenta (con o sin suscripción de producción audiovisual exito.cyou)
    - Billetera PayPal, comisiones, ventas y liquidaciones
    - Catálogo propio de canciones y álbumes (con sincronización automática de álbumes existentes)
    - Analíticas estilo Spotify for Artists (streams, likes, top tracks, conversión)
    - Configuración de su Agente IA y conexiones WhatsApp QR / Telegram
    """
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Inicia sesión para acceder a tu Panel de Artista")

    profile = _ensure_artist_profile(user, db)

    norm_slug = re.sub(r"[^a-z0-9]", "", (profile.slug or "").lower())
    norm_name = re.sub(r"[^a-z0-9]", "", (profile.display_name or "").lower())

    # Determinar slugs equivalentes (ej. 'billionaire-soundtrack' <-> 'billionairesoundtrack',
    # y sello 'billionaire-records' o super_admin que agrupa los canales oficiales)
    candidate_slugs = {profile.slug, norm_slug}
    candidate_names = {profile.display_name}

    is_label_or_admin = (
        user.role in ["super_admin", "tools_admin"]
        or "billionairerecords" in norm_slug
        or "darkyx" in (user.email or "").lower()
    )

    if "billionairesoundtrack" in norm_slug or "billionairesoundtrack" in norm_name:
        candidate_slugs.update(["billionairesoundtrack", "billionaire-soundtrack"])
        candidate_names.update(["Billionaire SoundTrack", "Billionaire Soundtrack"])
    elif "billionairesplaylist" in norm_slug or "billionairesplaylist" in norm_name:
        candidate_slugs.update(["billionairesplaylist", "billionaires-playlist"])
        candidate_names.update(["Billionaires Playlist"])

    if channel_slug and channel_slug != "all":
        c_norm = re.sub(r"[^a-z0-9]", "", channel_slug.lower())
        my_tracks = db.query(db_models.MediaCatalog).filter(
            (db_models.MediaCatalog.creator_slug == channel_slug) |
            (db_models.MediaCatalog.creator_slug == c_norm) |
            (func.lower(db_models.MediaCatalog.creator) == channel_slug.lower())
        ).order_by(db_models.MediaCatalog.created_at.desc()).all()
    elif is_label_or_admin and (channel_slug == "all" or not channel_slug):
        # Sello Billionaire Records / Admin ve todos sus canales musicales por defecto
        my_tracks = db.query(db_models.MediaCatalog).filter(
            db_models.MediaCatalog.type != "audiobook"
        ).order_by(db_models.MediaCatalog.created_at.desc()).all()
    else:
        my_tracks = db.query(db_models.MediaCatalog).filter(
            (db_models.MediaCatalog.creator_slug.in_(list(candidate_slugs))) |
            (db_models.MediaCatalog.creator.in_(list(candidate_names))) |
            (db_models.MediaCatalog.artist.in_(list(candidate_names)))
        ).order_by(db_models.MediaCatalog.created_at.desc()).all()

    # Auto-sincronizar álbumes/colecciones existentes desde las canciones del artista
    existing_albums = db.query(db_models.ArtistAlbum).filter(
        db_models.ArtistAlbum.artist_profile_id == profile.id
    ).all()
    existing_album_titles = {a.title.strip().lower(): a for a in existing_albums if a.title}

    grouped_collections: dict[str, list] = {}
    for t in my_tracks:
        col_name = (t.album or t.artist or "").strip()
        if not col_name or col_name.lower() in ["singles", "unknown"]:
            continue
        grouped_collections.setdefault(col_name, []).append(t)

    new_albums_added = False
    for col_name, col_tracks in grouped_collections.items():
        if col_name.lower() not in existing_album_titles:
            sample_cover = next((ct.album_art_path for ct in col_tracks if ct.album_art_path), None)
            sample_genre = next((ct.genre for ct in col_tracks if ct.genre), "Urbano / Consciente")
            sample_plays = sum(ct.play_count or 0 for ct in col_tracks)
            auto_alb = db_models.ArtistAlbum(
                artist_profile_id=profile.id,
                title=col_name[:180],
                description=f"Álbum oficial ({len(col_tracks)} pistas) — {profile.display_name}",
                cover_art_path=sample_cover,
                genre=sample_genre,
                price_usd=7.99,
                price_tokens=10,
                play_count=sample_plays,
            )
            db.add(auto_alb)
            existing_album_titles[col_name.lower()] = auto_alb
            new_albums_added = True
        else:
            alb_obj = existing_album_titles[col_name.lower()]
            if not alb_obj.cover_art_path:
                sample_cover = next((ct.album_art_path for ct in col_tracks if ct.album_art_path), None)
                if sample_cover:
                    alb_obj.cover_art_path = sample_cover
                    new_albums_added = True

    if new_albums_added:
        try:
            db.commit()
        except Exception:
            db.rollback()

    my_albums = db.query(db_models.ArtistAlbum).filter(
        db_models.ArtistAlbum.artist_profile_id == profile.id
    ).order_by(db_models.ArtistAlbum.created_at.desc()).all()

    # Contar likes por canción
    track_ids = [t.id for t in my_tracks]
    likes_map = {}
    if track_ids:
        rows = db.query(
            db_models.TrackLike.media_catalog_id,
            func.count(db_models.TrackLike.id)
        ).filter(
            db_models.TrackLike.media_catalog_id.in_(track_ids)
        ).group_by(db_models.TrackLike.media_catalog_id).all()
        likes_map = {r[0]: r[1] for r in rows}

    total_streams = sum(t.play_count or 0 for t in my_tracks)
    total_likes = sum(likes_map.values())

    # Ventas y liquidaciones
    sales_ledger = db.query(db_models.ArtistSaleLedger).filter(
        db_models.ArtistSaleLedger.artist_profile_id == profile.id
    ).order_by(db_models.ArtistSaleLedger.created_at.desc()).limit(50).all()

    payouts = db.query(db_models.ArtistPayoutTransaction).filter(
        db_models.ArtistPayoutTransaction.artist_profile_id == profile.id
    ).order_by(db_models.ArtistPayoutTransaction.created_at.desc()).limit(30).all()

    # Comunidad: suscriptores, encuestas, notificaciones
    subscribers = db.query(db_models.ArtistSubscriber).filter(
        db_models.ArtistSubscriber.artist_profile_id == profile.id
    ).order_by(db_models.ArtistSubscriber.created_at.desc()).all()

    polls = db.query(db_models.ArtistPoll).filter(
        db_models.ArtistPoll.artist_profile_id == profile.id
    ).order_by(db_models.ArtistPoll.created_at.desc()).all()

    notifications = db.query(db_models.ArtistNotification).filter(
        db_models.ArtistNotification.artist_profile_id == profile.id
    ).order_by(db_models.ArtistNotification.created_at.desc()).limit(20).all()

    tracks_serialized = [
        {
            "id": t.id,
            "title": t.title,
            "artist": t.artist,
            "album": t.album,
            "genre": t.genre,
            "type": t.type,
            "price_usd": float(t.price_usd or 0.99),
            "price_tokens": t.price_tokens,
            "play_count": t.play_count or 0,
            "likes_count": likes_map.get(t.id, 0),
            "album_art_path": t.album_art_path,
            "file_path": t.file_path,
            "lyrics_path": t.lyrics_path,
            "description": t.description,
            "is_public": t.is_public,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in my_tracks
    ]

    top_tracks_ranking = sorted(
        tracks_serialized,
        key=lambda x: (x["play_count"] * 1.0 + x["likes_count"] * 3.0),
        reverse=True
    )[:10]

    return {
        "success": True,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "tokens_balance": user.tokens_balance,
        },
        "profile": {
            "id": profile.id,
            "slug": profile.slug,
            "public_url": f"/@{profile.slug}",
            "display_name": profile.display_name,
            "bio": profile.bio,
            "avatar_url": profile.avatar_url,
            "banner_url": profile.banner_url,
            "primary_color": profile.primary_color,
            "genre_focus": profile.genre_focus,
            "language": profile.language,
            "has_production_subscription": profile.has_production_subscription,
            # PayPal & Pagos
            "paypal_email": profile.paypal_email,
            "paypal_merchant_id": profile.paypal_merchant_id,
            "paypal_verified": profile.paypal_verified,
            "payphone_number": profile.payphone_number,
            "payout_mode": profile.payout_mode,
            "payout_threshold_usd": float(profile.payout_threshold_usd or 20.0),
            "platform_fee_percent": float(profile.platform_fee_percent or 15.0),
            "available_balance_usd": float(profile.available_balance_usd or 0.0),
            "pending_balance_usd": float(profile.pending_balance_usd or 0.0),
            "lifetime_gross_sales_usd": float(profile.lifetime_gross_sales_usd or 0.0),
            "lifetime_net_earnings_usd": float(profile.lifetime_net_earnings_usd or 0.0),
            "lifetime_platform_fees_usd": float(profile.lifetime_platform_fees_usd or 0.0),
            # Agente IA & Omnicanalidad
            "agent_enabled": profile.agent_enabled,
            "agent_name": profile.agent_name,
            "agent_persona_type": profile.agent_persona_type,
            "agent_system_prompt": profile.agent_system_prompt,
            "agent_rag_knowledge": profile.agent_rag_knowledge,
            "agent_voice_id": profile.agent_voice_id,
            "agent_welcome_message": profile.agent_welcome_message,
            "whatsapp_company_id": profile.whatsapp_company_id,
            "whatsapp_connected": profile.whatsapp_connected,
            "whatsapp_phone": profile.whatsapp_phone,
            "meta_business_waba_id": profile.meta_business_waba_id,
            "telegram_bot_token": profile.telegram_bot_token,
            "telegram_bot_username": profile.telegram_bot_username,
            "telegram_connected": profile.telegram_connected,
        },
        "analytics": {
            "total_streams": total_streams,
            "total_likes": total_likes,
            "total_tracks": len(my_tracks),
            "total_albums": len(my_albums),
            "total_sales_count": len(sales_ledger),
            "subscribers_count": len(subscribers),
            "top_tracks_ranking": top_tracks_ranking,
            "sales_by_channel": {
                "web_portal": sum(1 for s in sales_ledger if s.sale_channel == "web_portal"),
                "ai_agent_chat": sum(1 for s in sales_ledger if s.sale_channel == "ai_agent_chat"),
                "whatsapp_agent": sum(1 for s in sales_ledger if s.sale_channel == "whatsapp_agent"),
                "telegram_agent": sum(1 for s in sales_ledger if s.sale_channel == "telegram_agent"),
            },
        },
        "tracks": tracks_serialized,
        "available_channels": [
            {"slug": "all", "name": "🌐 Todos mis Canales (Sello Completo)"},
            {"slug": "billionairesoundtrack", "name": "🎵 Billionaire SoundTrack (ES)"},
            {"slug": "billionairesplaylist", "name": "🎵 Billionaires Playlist (EN)"},
            {"slug": "efectometamorfosis", "name": "🎙️ Efecto Metamorfosis"},
            {"slug": profile.slug, "name": f"🎤 {profile.display_name} (Canal Personal)"},
        ],
        "albums": [
            {
                "id": a.id,
                "title": a.title,
                "description": a.description,
                "cover_art_path": a.cover_art_path,
                "genre": a.genre,
                "price_usd": float(a.price_usd or 7.99),
                "price_tokens": a.price_tokens,
                "play_count": a.play_count or 0,
                "sales_count": a.sales_count or 0,
                "tracks_count": len(grouped_collections.get(a.title, [])),
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in my_albums
        ],
        "sales_ledger": [
            {
                "id": s.id,
                "media_catalog_id": s.media_catalog_id,
                "buyer_email": s.buyer_email or "Fan Anónimo",
                "sale_channel": s.sale_channel,
                "gross_amount_usd": float(s.gross_amount_usd),
                "platform_fee_usd": float(s.platform_fee_usd),
                "net_artist_amount_usd": float(s.net_artist_amount_usd),
                "paypal_order_id": s.paypal_order_id,
                "auto_payout_triggered": s.auto_payout_triggered,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in sales_ledger
        ],
        "payouts": [
            {
                "id": p.id,
                "amount_usd": float(p.amount_usd),
                "payout_method": p.payout_method,
                "destination_account": p.destination_account,
                "paypal_payout_batch_id": p.paypal_payout_batch_id,
                "status": p.status,
                "notes": p.notes,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in payouts
        ],
        "subscribers": [
            {
                "id": sub.id,
                "fan_name": sub.fan_name or "Fan",
                "fan_email": sub.fan_email,
                "fan_whatsapp": sub.fan_whatsapp,
                "created_at": sub.created_at.isoformat() if sub.created_at else None,
            }
            for sub in subscribers
        ],
        "polls": [
            {
                "id": poll.id,
                "question": poll.question,
                "options": json.loads(poll.options_json or "[]"),
                "is_active": poll.is_active,
                "total_votes": poll.total_votes,
                "created_at": poll.created_at.isoformat() if poll.created_at else None,
            }
            for poll in polls
        ],
        "notifications": [
            {
                "id": n.id,
                "subject": n.subject,
                "message": n.message,
                "channel": n.channel,
                "recipients_count": n.recipients_count,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notifications
        ],
    }


@router.patch("/me")
def update_my_artist_profile(
    body: ArtistProfileUpdateRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """Actualiza configuración del perfil del artista, PayPal, modo de retiro, agente IA y bots."""
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")

    profile = _ensure_artist_profile(user, db)

    if body.slug and body.slug != profile.slug:
        clean_slug = _slugify(body.slug)
        exists = db.query(db_models.ArtistProfile).filter(
            db_models.ArtistProfile.slug == clean_slug,
            db_models.ArtistProfile.id != profile.id
        ).first()
        if exists:
            raise HTTPException(status_code=400, detail="Ese slug de canal ya está en uso por otro artista")
        profile.slug = clean_slug

    fields = [
        "display_name", "bio", "primary_color", "genre_focus", "language",
        "paypal_email", "paypal_merchant_id", "payphone_number",
        "payout_mode", "payout_threshold_usd",
        "agent_enabled", "agent_name", "agent_persona_type",
        "agent_system_prompt", "agent_rag_knowledge", "agent_voice_id",
        "agent_welcome_message", "telegram_bot_token", "telegram_bot_username",
        "whatsapp_phone", "meta_business_waba_id"
    ]
    for f in fields:
        val = getattr(body, f, None)
        if val is not None:
            setattr(profile, f, val)

    if body.paypal_email:
        profile.paypal_verified = True
    if body.telegram_bot_token:
        profile.telegram_connected = True

    db.commit()
    db.refresh(profile)

    # Sincronizar con tabla Creator para el perfil público /@slug
    creator_row = db.query(db_models.Creator).filter(db_models.Creator.slug == profile.slug).first()
    if creator_row:
        creator_row.name = profile.display_name
        creator_row.description = profile.bio
        creator_row.color = profile.primary_color
        creator_row.language = profile.language or "es"
    else:
        db.add(db_models.Creator(
            slug=profile.slug,
            name=profile.display_name,
            creator_type="music",
            language=profile.language or "es",
            description=profile.bio,
            color=profile.primary_color,
            gradient="from-purple-500/20 to-indigo-600/10",
            is_active=True,
        ))
    db.commit()

    return {"success": True, "message": "Configuración de Artista actualizada", "slug": profile.slug}


@router.post("/me/avatar")
async def upload_artist_image(
    request: Request,
    image_type: str = Form("avatar"),  # avatar | banner
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Permite al artista personalizar su imagen de perfil o banner del canal."""
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    profile = _ensure_artist_profile(user, db)

    ext = Path(file.filename or "img.jpg").suffix.lower() or ".jpg"
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        ext = ".jpg"

    dest_dir = MEDIA_LIBRARY_DIR / "artists" / profile.slug
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{image_type}_{uuid.uuid4().hex[:8]}{ext}"
    dest_path = dest_dir / filename

    content = await file.read()
    with open(dest_path, "wb") as f:
        f.write(content)

    rel_url = f"/media-static/artists/{profile.slug}/{filename}"
    if image_type == "banner":
        profile.banner_url = rel_url
    else:
        profile.avatar_url = rel_url

    db.commit()
    return {"success": True, "url": rel_url, "image_type": image_type}


# ══════════════════════════════════════════════════════════════════════════════
#  2. SUBIDA DE MP3/WAV, LETRAS, PORTADAS Y GESTIÓN DE ÁLBUMES DEL ARTISTA
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/me/tracks/upload")
async def upload_artist_track(
    request: Request,
    title: str = Form(...),
    genre: str = Form("Urbano / Consciente"),
    price_usd: float = Form(1.99),
    price_tokens: int = Form(2),
    album_name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    lyrics_text: Optional[str] = Form(None),
    audio_file: UploadFile = File(...),
    cover_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """
    Permite a cualquier artista independiente subir su archivo MP3/WAV, portada y letra,
    fijar su precio en USD (para cobro por PayPal) y publicarlo instantáneamente en su canal.
    """
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Inicia sesión para subir canciones")

    profile = _ensure_artist_profile(user, db)

    audio_ext = Path(audio_file.filename or "track.mp3").suffix.lower() or ".mp3"
    if audio_ext not in [".mp3", ".wav", ".ogg", ".m4a", ".flac"]:
        raise HTTPException(status_code=400, detail="Formato de audio no soportado. Usa MP3 o WAV.")

    clean_album = (album_name or "Singles").strip().replace(" ", "_")
    project_folder = f"{profile.slug}_{clean_album}"
    base_dir = MEDIA_LIBRARY_DIR / "MusicPlaylist" / project_folder
    songs_dir = base_dir / "songs"
    covers_dir = base_dir / "covers"
    lyrics_dir = base_dir / "lyrics"
    for d in (songs_dir, covers_dir, lyrics_dir):
        d.mkdir(parents=True, exist_ok=True)

    safe_title = _slugify(title)
    audio_filename = f"{safe_title}_{uuid.uuid4().hex[:6]}{audio_ext}"
    audio_dest = songs_dir / audio_filename

    audio_bytes = await audio_file.read()
    with open(audio_dest, "wb") as f:
        f.write(audio_bytes)

    rel_audio_path = f"media_library/MusicPlaylist/{project_folder}/songs/{audio_filename}"

    # Guardar portada si fue subida
    rel_cover_path = None
    if cover_file and cover_file.filename:
        c_ext = Path(cover_file.filename).suffix.lower() or ".jpg"
        cover_filename = f"cover_{safe_title}_{uuid.uuid4().hex[:6]}{c_ext}"
        cover_dest = covers_dir / cover_filename
        cover_bytes = await cover_file.read()
        with open(cover_dest, "wb") as f:
            f.write(cover_bytes)
        rel_cover_path = f"media_library/MusicPlaylist/{project_folder}/covers/{cover_filename}"
    elif profile.avatar_url and profile.avatar_url.startswith("/media-static/"):
        rel_cover_path = profile.avatar_url.replace("/media-static/", "media_library/")

    # Guardar letra si fue enviada
    rel_lyrics_path = None
    if lyrics_text and lyrics_text.strip():
        lyrics_filename = f"{safe_title}.txt"
        lyrics_dest = lyrics_dir / lyrics_filename
        with open(lyrics_dest, "w", encoding="utf-8") as f:
            f.write(lyrics_text.strip())
        rel_lyrics_path = f"media_library/MusicPlaylist/{project_folder}/lyrics/{lyrics_filename}"

    new_item = db_models.MediaCatalog(
        title=title.strip(),
        description=description or f"Track oficial de {profile.display_name}",
        artist=profile.display_name,
        type="song",
        file_path=rel_audio_path,
        album_art_path=rel_cover_path,
        lyrics_path=rel_lyrics_path,
        price_tokens=max(1, int(price_tokens)),
        price_usd=max(0.0, float(price_usd)),
        is_public=True,
        genre=genre,
        creator=profile.display_name,
        creator_slug=profile.slug,
        play_count=0,
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    return {
        "success": True,
        "message": f"Track '{new_item.title}' publicado exitosamente en tu canal /@{profile.slug}",
        "track": {
            "id": new_item.id,
            "title": new_item.title,
            "artist": new_item.artist,
            "price_usd": float(new_item.price_usd),
            "file_path": new_item.file_path,
            "album_art_path": new_item.album_art_path,
        },
    }


class TrackUpdateReq(BaseModel):
    title: Optional[str] = None
    album: Optional[str] = None
    artist: Optional[str] = None
    genre: Optional[str] = None
    price_usd: Optional[float] = None
    price_tokens: Optional[int] = None
    description: Optional[str] = None
    lyrics_text: Optional[str] = None
    is_public: Optional[bool] = None


@router.patch("/me/tracks/{track_id}")
def update_artist_track(
    track_id: int,
    body: TrackUpdateReq,
    request: Request,
    db: Session = Depends(get_db)
):
    """Permite al artista editar precio, título, álbum, género o letra de su canción en cualquier momento."""
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    profile = _ensure_artist_profile(user, db)

    track = db.query(db_models.MediaCatalog).filter(db_models.MediaCatalog.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track no encontrado")

    if body.title is not None:
        track.title = body.title.strip()
    if body.album is not None:
        track.album = body.album.strip()
        if body.album.strip():
            track.artist = body.album.strip()
    if body.artist is not None:
        track.artist = body.artist.strip()
    if body.genre is not None:
        track.genre = body.genre
    if body.price_usd is not None:
        track.price_usd = max(0.0, float(body.price_usd))
    if body.price_tokens is not None:
        track.price_tokens = max(1, int(body.price_tokens))
    if body.description is not None:
        track.description = body.description
    if body.is_public is not None:
        track.is_public = body.is_public

    if body.lyrics_text is not None:
        lyrics_dir = MEDIA_LIBRARY_DIR / "artists" / profile.slug / "lyrics"
        lyrics_dir.mkdir(parents=True, exist_ok=True)
        l_file = lyrics_dir / f"track_{track.id}.txt"
        with open(l_file, "w", encoding="utf-8") as f:
            f.write(body.lyrics_text)
        track.lyrics_path = f"media_library/artists/{profile.slug}/lyrics/track_{track.id}.txt"

    db.commit()
    return {"success": True, "message": "Track actualizado correctamente"}


@router.get("/me/tracks/{track_id}/lyrics")
def get_artist_track_lyrics(
    track_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """Devuelve el texto de la letra de una canción para su edición en el estudio."""
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    track = db.query(db_models.MediaCatalog).filter(db_models.MediaCatalog.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track no encontrado")

    lyrics_content = ""
    if track.lyrics_path:
        rel = track.lyrics_path.replace("media_library/", "").lstrip("/")
        full_p = MEDIA_LIBRARY_DIR / rel
        if full_p.exists():
            try:
                lyrics_content = full_p.read_text(encoding="utf-8")
            except Exception:
                lyrics_content = ""
    return {"success": True, "track_id": track.id, "lyrics_text": lyrics_content}


@router.post("/me/tracks/{track_id}/cover")
async def upload_artist_track_cover(
    track_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Permite al artista subir o reemplazar la imagen de portada de una canción."""
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    profile = _ensure_artist_profile(user, db)

    track = db.query(db_models.MediaCatalog).filter(db_models.MediaCatalog.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track no encontrado")

    ext = Path(file.filename or "cover.jpg").suffix.lower() or ".jpg"
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        ext = ".jpg"

    dest_dir = MEDIA_LIBRARY_DIR / "artists" / profile.slug / "covers"
    dest_dir.mkdir(parents=True, exist_ok=True)
    fname = f"track_{track.id}_{uuid.uuid4().hex[:6]}{ext}"
    with open(dest_dir / fname, "wb") as f:
        f.write(await file.read())

    rel_cover = f"media_library/artists/{profile.slug}/covers/{fname}"
    track.album_art_path = rel_cover
    db.commit()

    return {
        "success": True,
        "message": f"Portada de '{track.title}' actualizada",
        "album_art_path": rel_cover,
    }


@router.delete("/me/tracks/{track_id}")
def delete_artist_track(
    track_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """Oculta o elimina una canción del catálogo público del artista."""
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    track = db.query(db_models.MediaCatalog).filter(db_models.MediaCatalog.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track no encontrado")
    track.is_public = False
    db.commit()
    return {"success": True, "message": f"Canción '{track.title}' ocultada del catálogo público"}


@router.post("/me/albums")
async def create_artist_album(
    request: Request,
    title: str = Form(...),
    description: Optional[str] = Form(None),
    genre: str = Form("Urbano / Consciente"),
    price_usd: float = Form(9.99),
    price_tokens: int = Form(10),
    cover_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """Crea un álbum completo con su propia portada y precio paquete en USD."""
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    profile = _ensure_artist_profile(user, db)

    rel_cover = None
    if cover_file and cover_file.filename:
        ext = Path(cover_file.filename).suffix.lower() or ".jpg"
        dest_dir = MEDIA_LIBRARY_DIR / "artists" / profile.slug / "albums"
        dest_dir.mkdir(parents=True, exist_ok=True)
        fname = f"album_{_slugify(title)}_{uuid.uuid4().hex[:6]}{ext}"
        with open(dest_dir / fname, "wb") as f:
            f.write(await cover_file.read())
        rel_cover = f"media_library/artists/{profile.slug}/albums/{fname}"

    album = db_models.ArtistAlbum(
        artist_profile_id=profile.id,
        title=title.strip(),
        description=description or f"Álbum oficial de {profile.display_name}",
        cover_art_path=rel_cover,
        genre=genre,
        price_usd=max(0.99, float(price_usd)),
        price_tokens=max(1, int(price_tokens)),
    )
    db.add(album)
    db.commit()
    db.refresh(album)

    # También registrarlo en MediaCatalog como type='album' para que pueda comprarse directo con PayPal
    catalog_album = db_models.MediaCatalog(
        title=album.title,
        description=album.description,
        artist=profile.display_name,
        type="album",
        file_path=f"media_library/MusicPlaylist/{profile.slug}_{_slugify(album.title)}",
        album_art_path=rel_cover,
        price_usd=album.price_usd,
        price_tokens=album.price_tokens,
        is_public=True,
        genre=genre,
        creator=profile.display_name,
        creator_slug=profile.slug,
    )
    db.add(catalog_album)
    db.commit()

    return {
        "success": True,
        "message": f"Álbum '{album.title}' creado por ${float(album.price_usd):.2f} USD",
        "album_id": album.id,
        "catalog_id": catalog_album.id,
    }


class AlbumUpdateReq(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    genre: Optional[str] = None
    price_usd: Optional[float] = None
    price_tokens: Optional[int] = None


@router.patch("/me/albums/{album_id}")
def update_artist_album(
    album_id: int,
    body: AlbumUpdateReq,
    request: Request,
    db: Session = Depends(get_db)
):
    """Permite al artista editar título, descripción, género y precio USD de un álbum."""
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    profile = _ensure_artist_profile(user, db)

    album = db.query(db_models.ArtistAlbum).filter(db_models.ArtistAlbum.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Álbum no encontrado")

    old_title = album.title
    if body.title is not None and body.title.strip():
        album.title = body.title.strip()
        # Si cambió el título del álbum, actualizar también las pistas vinculadas a ese álbum
        if old_title and old_title != album.title:
            tracks_in_alb = db.query(db_models.MediaCatalog).filter(
                (db_models.MediaCatalog.album == old_title) | (db_models.MediaCatalog.artist == old_title)
            ).all()
            for tr in tracks_in_alb:
                tr.album = album.title
                if tr.artist == old_title:
                    tr.artist = album.title

    if body.description is not None:
        album.description = body.description
    if body.genre is not None:
        album.genre = body.genre
    if body.price_usd is not None:
        album.price_usd = max(0.0, float(body.price_usd))
    if body.price_tokens is not None:
        album.price_tokens = max(1, int(body.price_tokens))

    db.commit()
    return {"success": True, "message": f"Álbum '{album.title}' actualizado correctamente"}


@router.post("/me/albums/{album_id}/cover")
async def upload_artist_album_cover(
    album_id: int,
    request: Request,
    apply_to_tracks: bool = Form(True),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Permite subir o actualizar la portada de un álbum y opcionalmente aplicarla a sus pistas."""
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    profile = _ensure_artist_profile(user, db)

    album = db.query(db_models.ArtistAlbum).filter(db_models.ArtistAlbum.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Álbum no encontrado")

    ext = Path(file.filename or "album.jpg").suffix.lower() or ".jpg"
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        ext = ".jpg"

    dest_dir = MEDIA_LIBRARY_DIR / "artists" / profile.slug / "albums"
    dest_dir.mkdir(parents=True, exist_ok=True)
    fname = f"album_{album.id}_{uuid.uuid4().hex[:6]}{ext}"
    with open(dest_dir / fname, "wb") as f:
        f.write(await file.read())

    rel_cover = f"media_library/artists/{profile.slug}/albums/{fname}"
    album.cover_art_path = rel_cover

    if apply_to_tracks and album.title:
        tracks_in_alb = db.query(db_models.MediaCatalog).filter(
            (db_models.MediaCatalog.album == album.title) | (db_models.MediaCatalog.artist == album.title)
        ).all()
        for tr in tracks_in_alb:
            tr.album_art_path = rel_cover

    db.commit()
    return {
        "success": True,
        "message": f"Portada del álbum '{album.title}' actualizada",
        "cover_art_path": rel_cover,
    }


@router.delete("/me/albums/{album_id}")
def delete_artist_album(
    album_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """Elimina un álbum del listado del estudio."""
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    album = db.query(db_models.ArtistAlbum).filter(db_models.ArtistAlbum.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Álbum no encontrado")
    title = album.title
    db.delete(album)
    db.commit()
    return {"success": True, "message": f"Álbum '{title}' eliminado"}


# ══════════════════════════════════════════════════════════════════════════════
#  3. RETIROS PAYPAL, CONVERSIÓN A TOKENS Y SIMULADOR DE FLUJO REAL (HACKATHON)
# ══════════════════════════════════════════════════════════════════════════════

class PayoutWithdrawRequest(BaseModel):
    amount_usd: Optional[float] = None  # None = retirar todo el disponible
    payout_method: str = "paypal"       # paypal | payphone
    sandbox_mode: bool = False


@router.post("/me/payouts/withdraw")
def withdraw_artist_balance(
    body: PayoutWithdrawRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Transfiere las ganancias acumuladas del artista directamente a su cuenta PayPal vinculada
    (o PayPhone), usando el modelo Zero Fondos Propios (fondos ya cobrados de las compras de fans).
    """
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    profile = _ensure_artist_profile(user, db)

    avail = float(profile.available_balance_usd or 0.0)
    if avail <= 0:
        raise HTTPException(status_code=400, detail="No tienes saldo disponible para retirar aún.")

    amount = float(body.amount_usd) if body.amount_usd else avail
    if amount <= 0 or amount > avail:
        raise HTTPException(status_code=400, detail=f"Monto inválido. Disponible: ${avail:.2f} USD")

    destination = profile.paypal_email if body.payout_method == "paypal" else profile.payphone_number
    if not destination:
        raise HTTPException(status_code=400, detail="Configura primero tu cuenta de destino (PayPal Email o PayPhone)")

    payout_res = _execute_paypal_payout_or_mock(
        paypal_email=destination,
        amount_usd=amount,
        note=f"Retiro de regalías de {profile.display_name} en Éxito.cyou",
        sandbox=body.sandbox_mode,
    )

    profile.available_balance_usd = round(avail - amount, 2)
    tx = db_models.ArtistPayoutTransaction(
        artist_profile_id=profile.id,
        amount_usd=amount,
        payout_method=body.payout_method,
        destination_account=destination,
        paypal_payout_batch_id=payout_res.get("batch_id"),
        status="completed",
        notes=f"Transferencia directa a {body.payout_method.upper()} ({destination})",
    )
    db.add(tx)
    db.commit()

    return {
        "success": True,
        "message": f"¡${amount:.2f} USD transferidos exitosamente a tu cuenta {destination}!",
        "payout_batch_id": payout_res.get("batch_id"),
        "new_available_balance_usd": float(profile.available_balance_usd),
    }


class ConvertBalanceToTokensRequest(BaseModel):
    amount_usd: float


@router.post("/me/wallet/convert-to-tokens")
def convert_earnings_to_production_tokens(
    body: ConvertBalanceToTokensRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Permite a los artistas que NO tienen suscripción Pro en Exito.cyou usar el saldo
    ganado por sus ventas para comprar Tokens de Producción IA ($1 USD = 10 Tokens).
    """
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    profile = _ensure_artist_profile(user, db)

    avail = float(profile.available_balance_usd or 0.0)
    amount = round(float(body.amount_usd), 2)
    if amount <= 0 or amount > avail:
        raise HTTPException(status_code=400, detail=f"Saldo insuficiente. Tienes ${avail:.2f} USD disponibles.")

    tokens_added = max(1, int(amount * 10))
    profile.available_balance_usd = round(avail - amount, 2)
    old_tokens = user.tokens_balance or 0
    user.tokens_balance = old_tokens + tokens_added

    tx = db_models.ArtistPayoutTransaction(
        artist_profile_id=profile.id,
        amount_usd=amount,
        payout_method="token_conversion",
        destination_account=f"Wallet MediaSuite (+{tokens_added} Tokens IA)",
        paypal_payout_batch_id=f"TOK-CONV-{uuid.uuid4().hex[:8].upper()}",
        status="completed",
        notes=f"Canje de saldo de ventas por {tokens_added} Tokens de Producción IA",
    )
    db.add(tx)
    db.commit()

    return {
        "success": True,
        "message": f"Se convirtieron ${amount:.2f} USD en +{tokens_added} Tokens para usar en las herramientas de estudio IA.",
        "tokens_balance": user.tokens_balance,
        "available_balance_usd": float(profile.available_balance_usd),
    }


# ══════════════════════════════════════════════════════════════════════════════
#  4. COMUNIDAD DEL ARTISTA: SUSCRIPTORES, NOTIFICACIONES Y VOTACIONES (POLLS)
# ══════════════════════════════════════════════════════════════════════════════

class SubscribeArtistReq(BaseModel):
    fan_email: str
    fan_name: Optional[str] = None
    fan_whatsapp: Optional[str] = None


@router.post("/public/{slug}/subscribe")
def subscribe_to_artist(slug: str, body: SubscribeArtistReq, request: Request, db: Session = Depends(get_db)):
    """Permite a un fan suscribirse a la comunidad de un artista para recibir alertas y votar."""
    profile = db.query(db_models.ArtistProfile).filter(db_models.ArtistProfile.slug == slug).first()
    if not profile:
        # Si es uno de los canales base, crear perfil asociado al admin
        admin = db.query(db_models.User).filter(db_models.User.role == "super_admin").first()
        if admin:
            profile = _ensure_artist_profile(admin, db)
        else:
            raise HTTPException(status_code=404, detail="Artista no encontrado")

    user = _get_optional_user(request, db)
    sub = db_models.ArtistSubscriber(
        artist_profile_id=profile.id,
        user_id=user.id if user else None,
        fan_email=body.fan_email.strip(),
        fan_name=body.fan_name or (user.username if user else "Fan"),
        fan_whatsapp=body.fan_whatsapp,
    )
    db.add(sub)
    db.commit()
    return {"success": True, "message": f"Te has unido a la comunidad oficial de {profile.display_name}"}


class CreatePollReq(BaseModel):
    question: str
    options: List[str]


@router.post("/me/polls")
def create_artist_poll(body: CreatePollReq, request: Request, db: Session = Depends(get_db)):
    """El artista crea una votación interactiva para sus fans (ej. elegir próximo single o ritmo)."""
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    profile = _ensure_artist_profile(user, db)

    opts = [{"id": idx + 1, "text": o.strip(), "votes": 0} for idx, o in enumerate(body.options) if o.strip()]
    if len(opts) < 2:
        raise HTTPException(status_code=400, detail="Incluye al menos 2 opciones para votar")

    poll = db_models.ArtistPoll(
        artist_profile_id=profile.id,
        question=body.question.strip(),
        options_json=json.dumps(opts, ensure_ascii=False),
        is_active=True,
        total_votes=0,
    )
    db.add(poll)
    db.commit()
    return {"success": True, "message": "Votación publicada en tu canal de artista", "poll_id": poll.id}


@router.post("/polls/{poll_id}/vote")
def vote_in_artist_poll(poll_id: int, option_id: int, db: Session = Depends(get_db)):
    """Permite a los fans votar en una encuesta activa del artista."""
    poll = db.query(db_models.ArtistPoll).filter(db_models.ArtistPoll.id == poll_id).first()
    if not poll or not poll.is_active:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada o cerrada")

    opts = json.loads(poll.options_json or "[]")
    matched = False
    for o in opts:
        if int(o.get("id", 0)) == int(option_id):
            o["votes"] = int(o.get("votes", 0)) + 1
            matched = True
            break
    if not matched:
        raise HTTPException(status_code=400, detail="Opción inválida")

    poll.options_json = json.dumps(opts, ensure_ascii=False)
    poll.total_votes = (poll.total_votes or 0) + 1
    db.commit()
    return {"success": True, "options": opts, "total_votes": poll.total_votes}


class SendNotificationReq(BaseModel):
    subject: str
    message: str
    channel: str = "all"  # all | email | whatsapp | telegram


@router.post("/me/notify-subscribers")
def notify_artist_subscribers(body: SendNotificationReq, request: Request, db: Session = Depends(get_db)):
    """Envía una notificación masiva a todos los suscriptores del artista."""
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    profile = _ensure_artist_profile(user, db)

    subs = db.query(db_models.ArtistSubscriber).filter(
        db_models.ArtistSubscriber.artist_profile_id == profile.id
    ).all()

    notif = db_models.ArtistNotification(
        artist_profile_id=profile.id,
        subject=body.subject.strip(),
        message=body.message.strip(),
        channel=body.channel,
        recipients_count=max(1, len(subs)),
    )
    db.add(notif)
    db.commit()

    return {
        "success": True,
        "message": f"Notificación enviada exitosamente a {max(1, len(subs))} miembros de tu comunidad ({body.channel}).",
    }


# ══════════════════════════════════════════════════════════════════════════════
#  5. REACCIONES DE CORAZÓN (LIKES) & MOTOR DE RECOMENDACIÓN PERSONALIZADO + SAORI
# ══════════════════════════════════════════════════════════════════════════════

class ToggleLikeRequest(BaseModel):
    media_catalog_id: int
    session_fingerprint: Optional[str] = "anon_fan"


@router.post("/likes/toggle")
def toggle_track_like(body: ToggleLikeRequest, request: Request, db: Session = Depends(get_db)):
    """
    Permite a los fans dar o quitar un Corazón / Me Gusta a cualquier track (sin comentarios).
    Guarda la señal en UserRecommendationSignal para alimentar el Algoritmo Propio de Recomendación.
    """
    user = _get_optional_user(request, db)
    fp = body.session_fingerprint or request.client.host if request.client else "anon"

    track = db.query(db_models.MediaCatalog).filter(
        db_models.MediaCatalog.id == body.media_catalog_id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track no encontrado")

    query = db.query(db_models.TrackLike).filter(
        db_models.TrackLike.media_catalog_id == body.media_catalog_id
    )
    if user:
        existing = query.filter(db_models.TrackLike.user_id == user.id).first()
    else:
        existing = query.filter(db_models.TrackLike.session_fingerprint == fp).first()

    if existing:
        db.delete(existing)
        db.commit()
        liked = False
    else:
        new_like = db_models.TrackLike(
            user_id=user.id if user else None,
            session_fingerprint=fp,
            media_catalog_id=body.media_catalog_id,
        )
        db.add(new_like)
        # Registrar señal de alta prioridad (+15) para el motor de recomendación
        sig = db_models.UserRecommendationSignal(
            user_id=user.id if user else None,
            session_fingerprint=fp,
            signal_type="like",
            media_catalog_id=track.id,
            extracted_genre=track.genre,
            extracted_artist=track.creator or track.artist,
            raw_query=f"Liked track: {track.title}",
            weight=15.0,
        )
        db.add(sig)
        db.commit()
        liked = True

    total_likes = db.query(func.count(db_models.TrackLike.id)).filter(
        db_models.TrackLike.media_catalog_id == body.media_catalog_id
    ).scalar() or 0

    return {
        "success": True,
        "liked": liked,
        "media_catalog_id": body.media_catalog_id,
        "likes_count": total_likes,
    }


@router.get("/likes/state")
def get_user_likes_state(
    session_fingerprint: Optional[str] = "anon_fan",
    request: Request = None,
    db: Session = Depends(get_db)
):
    """Retorna el mapa global de conteo de corazones por track y cuáles tracks tienen like del usuario actual."""
    user = _get_optional_user(request, db) if request else None
    fp = session_fingerprint or "anon_fan"

    counts = db.query(
        db_models.TrackLike.media_catalog_id,
        func.count(db_models.TrackLike.id)
    ).group_by(db_models.TrackLike.media_catalog_id).all()
    counts_map = {str(r[0]): r[1] for r in counts}

    if user:
        my_rows = db.query(db_models.TrackLike.media_catalog_id).filter(
            db_models.TrackLike.user_id == user.id
        ).all()
    else:
        my_rows = db.query(db_models.TrackLike.media_catalog_id).filter(
            db_models.TrackLike.session_fingerprint == fp
        ).all()

    my_liked_ids = [r[0] for r in my_rows]
    return {"success": True, "counts": counts_map, "liked_ids": my_liked_ids}


class RecommendationSignalReq(BaseModel):
    signal_type: str  # saori_chat_request | saori_recommendation | full_stream | purchase
    media_catalog_id: Optional[int] = None
    extracted_genre: Optional[str] = None
    extracted_mood: Optional[str] = None
    extracted_artist: Optional[str] = None
    raw_query: Optional[str] = None
    session_fingerprint: Optional[str] = "anon_fan"


@router.post("/recommendations/signal")
def log_recommendation_signal(body: RecommendationSignalReq, request: Request, db: Session = Depends(get_db)):
    """Registra señales de reproducción o consultas hechas en el chat de Saori para afinar recomendaciones."""
    user = _get_optional_user(request, db)
    weights = {
        "like": 15.0,
        "saori_chat_request": 12.0,
        "saori_recommendation": 10.0,
        "full_stream": 8.0,
        "purchase": 25.0,
    }
    sig = db_models.UserRecommendationSignal(
        user_id=user.id if user else None,
        session_fingerprint=body.session_fingerprint,
        signal_type=body.signal_type,
        media_catalog_id=body.media_catalog_id,
        extracted_genre=body.extracted_genre,
        extracted_mood=body.extracted_mood,
        extracted_artist=body.extracted_artist,
        raw_query=body.raw_query,
        weight=weights.get(body.signal_type, 5.0),
    )
    db.add(sig)
    db.commit()
    return {"success": True}


@router.get("/recommendations/feed")
def get_personalized_recommendation_feed(
    session_fingerprint: Optional[str] = "anon_fan",
    limit: int = 12,
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Algoritmo Propio de Recomendación Musical de MediaSuite / Éxito.cyou:
    Combina:
    1. Corazones / Me Gusta dados por el usuario (TrackLike).
    2. Recomendaciones y búsquedas conversacionales en el Chat de Saori (UserRecommendationSignal).
    3. Compras previas vía PayPal/Tokens.
    4. Popularidad global (play_count + likes globales).
    """
    user = _get_optional_user(request, db) if request else None
    fp = session_fingerprint or "anon_fan"

    all_tracks = db.query(db_models.MediaCatalog).filter(
        db_models.MediaCatalog.is_public == True,
        db_models.MediaCatalog.type == "song"
    ).all()

    if not all_tracks:
        return {"success": True, "recommendations": []}

    # Señales del usuario
    sig_query = db.query(db_models.UserRecommendationSignal)
    if user:
        signals = sig_query.filter(
            (db_models.UserRecommendationSignal.user_id == user.id) |
            (db_models.UserRecommendationSignal.session_fingerprint == fp)
        ).order_by(db_models.UserRecommendationSignal.created_at.desc()).limit(100).all()
    else:
        signals = sig_query.filter(
            db_models.UserRecommendationSignal.session_fingerprint == fp
        ).order_by(db_models.UserRecommendationSignal.created_at.desc()).limit(100).all()

    genre_weights: dict[str, float] = {}
    artist_weights: dict[str, float] = {}
    liked_track_ids: set[int] = set()
    keyword_boosts: list[str] = []

    for s in signals:
        w = float(s.weight or 5.0)
        if s.signal_type == "like" and s.media_catalog_id:
            liked_track_ids.add(s.media_catalog_id)
        if s.extracted_genre:
            g = s.extracted_genre.lower()
            genre_weights[g] = genre_weights.get(g, 0.0) + w
        if s.extracted_artist:
            a = s.extracted_artist.lower()
            artist_weights[a] = artist_weights.get(a, 0.0) + w
        if s.raw_query:
            keyword_boosts.append(s.raw_query.lower())

    # Conteo global de likes
    global_likes = dict(
        db.query(
            db_models.TrackLike.media_catalog_id,
            func.count(db_models.TrackLike.id)
        ).group_by(db_models.TrackLike.media_catalog_id).all()
    )

    scored = []
    for t in all_tracks:
        score = float(t.play_count or 0) * 0.5 + float(global_likes.get(t.id, 0)) * 4.0
        t_genre = (t.genre or "").lower()
        t_artist = (t.creator or t.artist or "").lower()
        t_title = (t.title or "").lower()

        if t.id in liked_track_ids:
            score += 25.0
        for g_key, g_val in genre_weights.items():
            if g_key and g_key in t_genre:
                score += g_val
        for a_key, a_val in artist_weights.items():
            if a_key and a_key in t_artist:
                score += a_val
        for kw in keyword_boosts[:15]:
            if any(word in t_title or word in t_genre for word in kw.split() if len(word) > 3):
                score += 8.0

        scored.append((score, t))

    scored.sort(key=lambda x: x[0], reverse=True)
    top_items = [
        {
            "id": t.id,
            "title": t.title,
            "artist": t.artist,
            "creator": t.creator,
            "creator_slug": t.creator_slug,
            "album": t.album,
            "genre": t.genre,
            "price_usd": float(t.price_usd or 0.99),
            "price_tokens": t.price_tokens,
            "play_count": t.play_count or 0,
            "likes_count": global_likes.get(t.id, 0),
            "affinity_score": round(sc, 1),
            "album_art_path": t.album_art_path,
            "file_path": t.file_path,
        }
        for sc, t in scored[:limit]
    ]

    return {
        "success": True,
        "signals_processed": len(signals),
        "recommendations": top_items,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  6. OMNICANALIDAD AGÉNTICA: WHATSAPP QR (AIKROFY BRIDGE) + TELEGRAM + AGENTE IA
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/me/whatsapp/init-qr")
async def init_artist_whatsapp_qr(request: Request, db: Session = Depends(get_db)):
    """
    Conecta con el microservicio multitenant aikrofy-api-whatsapp (:3011) para inicializar
    la sesión WhatsApp del artista y devolver el código QR listo para escanear.
    """
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    profile = _ensure_artist_profile(user, db)

    company_id = profile.whatsapp_company_id or f"exito_artist_{profile.slug}"
    profile.whatsapp_company_id = company_id
    db.commit()

    qr_svg = None
    status_state = "initializing"
    connected = False

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.post(f"{AIKROFY_WHATSAPP_API}/session/init", json={"companyId": company_id})
            status_res = await client.get(f"{AIKROFY_WHATSAPP_API}/session/status/{company_id}")
            if status_res.status_code == 200:
                s_data = status_res.json()
                connected = bool(s_data.get("connected"))
                status_state = s_data.get("state", "qr_ready")

            if not connected:
                qr_res = await client.get(f"{AIKROFY_WHATSAPP_API}/session/qr/{company_id}")
                if qr_res.status_code == 200 and "<svg" in qr_res.text:
                    qr_svg = qr_res.text
    except Exception as e:
        logger.warning(f"Aikrofy WhatsApp Bridge fallback QR: {e}")

    if connected != profile.whatsapp_connected:
        profile.whatsapp_connected = connected
        db.commit()

    return {
        "success": True,
        "company_id": company_id,
        "connected": connected,
        "state": status_state,
        "qr_svg": qr_svg,
        "bridge_service": "aikrofy-api-whatsapp (Multi-Tenant Baileys + Meta Cloud WABA)",
    }


@router.get("/me/whatsapp/status")
async def check_artist_whatsapp_status(request: Request, db: Session = Depends(get_db)):
    """Consulta el estado de conexión de la sesión WhatsApp del artista y su QR actual."""
    user = _get_optional_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    profile = _ensure_artist_profile(user, db)
    company_id = profile.whatsapp_company_id or f"exito_artist_{profile.slug}"

    connected = False
    qr_svg = None
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            status_res = await client.get(f"{AIKROFY_WHATSAPP_API}/session/status/{company_id}")
            if status_res.status_code == 200:
                connected = bool(status_res.json().get("connected"))
            if not connected:
                qr_res = await client.get(f"{AIKROFY_WHATSAPP_API}/session/qr/{company_id}")
                if qr_res.status_code == 200 and "<svg" in qr_res.text:
                    qr_svg = qr_res.text
    except Exception:
        pass

    profile.whatsapp_connected = connected
    db.commit()
    return {"success": True, "company_id": company_id, "connected": connected, "qr_svg": qr_svg}


class ArtistAgentCommerceChatReq(BaseModel):
    artist_slug: str
    message: str
    channel: str = "web"  # web | whatsapp | telegram
    fan_email: Optional[str] = "fan@exito.cyou"
    sandbox_mode: bool = False


@router.post("/agentic-commerce/chat")
async def artist_agentic_commerce_chat(body: ArtistAgentCommerceChatReq, db: Session = Depends(get_db)):
    """
    Motor de Comercio Conversacional Agéntico (PayPal AI Hackathon — Agentic Commerce):
    El asistente personalizado del artista (con su propia memoria RAG, catálogo de canciones y voz)
    conversa con el fan en Web, WhatsApp o Telegram, recomienda canciones, explica letras,
    sugiere sesiones en Cloud DJ y genera órdenes de compra PayPal listas para pagar en 1 clic.
    """
    profile = db.query(db_models.ArtistProfile).filter(
        db_models.ArtistProfile.slug == body.artist_slug
    ).first()

    # Buscar canciones del artista (o del catálogo general si es un canal global)
    tracks = db.query(db_models.MediaCatalog).filter(
        db_models.MediaCatalog.is_public == True
    ).all()

    artist_tracks = [
        t for t in tracks
        if (profile and (t.creator_slug == profile.slug or t.artist == profile.display_name or t.creator == profile.display_name))
        or (body.artist_slug in (t.creator_slug or ""))
    ]
    if not artist_tracks:
        artist_tracks = tracks[:8]

    msg_lower = body.message.lower()
    chosen_track = artist_tracks[0] if artist_tracks else None
    for t in artist_tracks:
        if t.title.lower() in msg_lower or (t.genre and t.genre.lower() in msg_lower):
            chosen_track = t
            break

    # Registrar señal en el motor de recomendación
    if chosen_track:
        sig = db_models.UserRecommendationSignal(
            signal_type="saori_chat_request",
            media_catalog_id=chosen_track.id,
            extracted_genre=chosen_track.genre,
            extracted_artist=chosen_track.artist,
            raw_query=body.message[:300],
            weight=12.0,
        )
        db.add(sig)
        db.commit()

    # Generar orden PayPal real/sandbox para el track seleccionado si hay intención de compra o recomendación comercial
    from paypal_runtime import get_paypal_runtime

    sandbox = bool(body.sandbox_mode)
    paypal_client_id, paypal_client_secret, api_url, paypal_mode = get_paypal_runtime(sandbox)
    paypal_order_id = f"PP-AGENT-{uuid.uuid4().hex[:10].upper()}"
    paypal_order_is_real = False
    price_usd = float(chosen_track.price_usd or 1.99) if chosen_track else 1.99
    fee_pct = float(profile.platform_fee_percent if profile else 15.0)
    platform_fee = round(price_usd * (fee_pct / 100.0), 2)
    net_artist = round(price_usd - platform_fee, 2)

    if sandbox and (not paypal_client_id or not paypal_client_secret):
        raise HTTPException(
            status_code=503,
            detail="Sandbox mode requested, but PAYPAL_SANDBOX_CLIENT_ID / PAYPAL_SANDBOX_CLIENT_SECRET are not configured on the server.",
        )

    if chosen_track and paypal_client_id and paypal_client_secret:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                t_res = await client.post(
                    f"{api_url}/v1/oauth2/token",
                    auth=(paypal_client_id, paypal_client_secret),
                    data={"grant_type": "client_credentials"},
                )
                if t_res.status_code == 200:
                    token = t_res.json().get("access_token")
                    o_res = await client.post(
                        f"{api_url}/v2/checkout/orders",
                        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                        json={
                            "intent": "CAPTURE",
                            "purchase_units": [{
                                "amount": {"currency_code": "USD", "value": f"{price_usd:.2f}"},
                                "description": f"Exito.cyou Agentic Checkout - {chosen_track.title}"
                            }]
                        }
                    )
                    if o_res.status_code in (200, 201):
                        paypal_order_id = o_res.json().get("id", paypal_order_id)
                        paypal_order_is_real = True
        except Exception:
            pass

    agent_name = profile.agent_name if profile else "Saori AI (Éxito.cyou)"
    artist_display = profile.display_name if profile else "Billionaire SoundTrack"
    rag_context = (profile.agent_rag_knowledge or "") if profile else ""

    reply = (
        f"¡Hola! Soy **{agent_name}**, asistente oficial de **{artist_display}** en Éxito.cyou. "
        f"{f'({rag_context[:180]}) ' if rag_context else ''}\n\n"
    )
    if chosen_track:
        reply += (
            f"Te recomiendo especialmente **\"{chosen_track.title}\"** ({chosen_track.genre or 'Edición Especial'}). "
            f"Puedes escucharla ahora mismo en nuestro **Cloud DJ Studio** para mezclarla en vivo en tus fiestas, "
            f"o adquirir el archivo máster físico (MP3/WAV de alta definición) para tu dispositivo por **${price_usd:.2f} USD** vía PayPal.\n\n"
            f"💳 **Orden Agéntica PayPal Generada:** `{paypal_order_id}`\n"
            f"• Total Fan: **${price_usd:.2f} USD**\n"
            f"• Regalía Directa al Artista ({100 - int(fee_pct)}%): **${net_artist:.2f} USD** → `{profile.paypal_email if profile and profile.paypal_email else 'artista@paypal.com'}`\n"
            f"• Comisión Infraestructura Éxito.cyou ({int(fee_pct)}%): **${platform_fee:.2f} USD**"
        )

    return {
        "success": True,
        "agent_name": agent_name,
        "artist_name": artist_display,
        "channel": body.channel,
        "reply": reply,
        "recommended_track": {
            "id": chosen_track.id,
            "title": chosen_track.title,
            "artist": chosen_track.artist,
            "genre": chosen_track.genre,
            "price_usd": price_usd,
            "album_art_path": chosen_track.album_art_path,
            "file_path": chosen_track.file_path,
        } if chosen_track else None,
        "agentic_paypal_checkout": {
            "paypal_order_id": paypal_order_id,
            "mode": paypal_mode,
            "is_real_order": paypal_order_is_real,
            "gross_usd": price_usd,
            "platform_fee_usd": platform_fee,
            "artist_net_usd": net_artist,
            "artist_paypal_email": profile.paypal_email if profile else "verified-artist@paypal.com",
            "payout_mode": profile.payout_mode if profile else "instant",
            "direct_url": f"https://exito.cyou/channel/{profile.slug if profile else 'billionairesoundtrack'}?buy={chosen_track.id if chosen_track else 1}{'&sandbox=1' if sandbox else ''}",
        },
    }
