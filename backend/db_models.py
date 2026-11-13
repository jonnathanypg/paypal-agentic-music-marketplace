# -*- coding: utf-8 -*-
"""
MediaSuite 2.0 — Modelos de Base de Datos SQLAlchemy
===================================================
Define los esquemas para Roles de Acceso, Comercio Electrónico,
Suscripciones y Trazabilidad DRM (IAGS Protocol compliant).
"""

import datetime
from sqlalchemy import Column, Integer, String, Enum, ForeignKey, Boolean, DateTime, Numeric
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(80), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum("super_admin", "tools_admin", "client", name="user_roles"), default="client", nullable=False)
    tokens_balance = Column(Integer, default=0, nullable=False)
    dev_tokens_balance = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    subscriptions = relationship("Subscription", back_populates="user", cascade="all, delete-orphan")
    purchases = relationship("Purchase", back_populates="user")

    def __repr__(self):
        return f"<User {self.username} (Role: {self.role})>"


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    plan_name = Column(String(50), nullable=False)  # e.g., 'Starter', 'Pro', 'Enterprise'
    tokens_per_month = Column(Integer, nullable=False)
    file_types_allowed = Column(String(255), nullable=False)  # e.g., 'mp3,wav,lyrics,stems'
    status = Column(Enum("active", "cancelled", "expired", name="sub_statuses"), default="active", nullable=False)
    current_period_end = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="subscriptions")


class Creator(Base):
    """Canales/creadores de la plataforma multitenant."""
    __tablename__ = "creators"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(150), unique=True, nullable=False)
    creator_type = Column(
        Enum("music", "audiobook", "documentary", "educational", name="creator_types"),
        nullable=False,
        default="music",
    )
    language = Column(String(10), default="es", nullable=False)
    description = Column(String(500), nullable=True)
    color = Column(String(20), nullable=True)
    gradient = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class MediaCatalog(Base):
    __tablename__ = "media_catalog"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=False, index=True)
    description = Column(String(255), nullable=True)
    artist = Column(String(100), default="IA / Enterprise Artist", nullable=False)
    type = Column(Enum("song", "album", "audiobook", "video", "project_zip", name="media_types"), nullable=False)
    file_path = Column(String(255), nullable=False)  # Ruta dentro de media_library
    album_art_path = Column(String(255), nullable=True)
    price_tokens = Column(Integer, default=1, nullable=False)
    price_usd = Column(Numeric(10, 2), default=0.00, nullable=False)
    is_public = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    lyrics_path = Column(String(255), nullable=True)
    stream_url = Column(String(500), nullable=True)
    genre = Column(String(100), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    play_count = Column(Integer, default=0, nullable=False)
    creator = Column(String(100), nullable=True, index=True)
    creator_slug = Column(String(100), nullable=True, index=True)

    purchases = relationship("Purchase", back_populates="media_item")

    @property
    def album(self):
        if not self.file_path:
            return None
        parts = self.file_path.replace("\\", "/").split("/")
        if "MusicPlaylist" in parts:
            idx = parts.index("MusicPlaylist")
            if idx + 1 < len(parts):
                return parts[idx + 1].replace("_", " ")
        elif "Audiobooks" in parts:
            if "output" in parts:
                idx = parts.index("output")
                if idx + 1 < len(parts):
                    return parts[idx + 1].replace("_", " ")
            else:
                idx = parts.index("Audiobooks")
                if idx + 1 < len(parts):
                    return parts[idx + 1].replace("_", " ")
        return "Single"


class UserPlaylist(Base):
    __tablename__ = "user_playlists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(150), nullable=False)
    description = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", backref="playlists")
    items = relationship("UserPlaylistItem", back_populates="playlist", cascade="all, delete-orphan", order_by="UserPlaylistItem.position")


class UserPlaylistItem(Base):
    __tablename__ = "user_playlist_items"

    id = Column(Integer, primary_key=True, index=True)
    playlist_id = Column(Integer, ForeignKey("user_playlists.id"), nullable=False)
    media_catalog_id = Column(Integer, ForeignKey("media_catalog.id"), nullable=False)
    position = Column(Integer, default=0, nullable=False)
    added_at = Column(DateTime, default=datetime.datetime.utcnow)

    playlist = relationship("UserPlaylist", back_populates="items")
    media_item = relationship("MediaCatalog")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    key_hash = Column(String(128), nullable=False)
    key_prefix = Column(String(20), nullable=False)
    name = Column(String(100), default="Default")
    permissions = Column(String(255), default="*")
    last_used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", backref="api_keys")


class UsageRecord(Base):
    __tablename__ = "usage_records"

    id = Column(Integer, primary_key=True, index=True)
    api_key_id = Column(Integer, ForeignKey("api_keys.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tool_name = Column(String(100), nullable=False)
    requests_count = Column(Integer, default=0)
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class DevSubscription(Base):
    __tablename__ = "dev_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    plan_name = Column(String(50), nullable=False)
    status = Column(Enum("active", "cancelled", "expired", "trialing", name="dev_sub_statuses"), default="trialing")
    paypal_subscription_id = Column(String(100), nullable=True)
    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    mrc = Column(Numeric(10, 2), default=0.00)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", backref="dev_subscriptions")


class TokenTransaction(Base):
    __tablename__ = "token_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Integer, nullable=False)  # positive = credit, negative = debit
    type = Column(String(50), nullable=False)  # "purchase", "subscription_credit", "api_usage", "admin_adjustment"
    description = Column(String(255), nullable=True)
    balance_before = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", backref="token_transactions")


class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL para compras Guest
    # Almacena el email de invitado CIFRADO con Fernet (token base64). Un email
    # valido puede producir tokens de hasta ~420 caracteres, por lo que 120 era
    # insuficiente y provocaba DataError 1406 en MySQL en checkouts de invitado.
    guest_email = Column(String(512), nullable=True)
    media_catalog_id = Column(Integer, ForeignKey("media_catalog.id"), nullable=False)
    payment_method = Column(Enum("paypal", "tokens", "stripe", name="payment_methods"), nullable=False)
    transaction_id = Column(String(100), unique=True, nullable=True, index=True)
    amount_paid = Column(Numeric(10, 2), default=0.00, nullable=False)
    purchased_at = Column(DateTime, default=datetime.datetime.utcnow)
    download_count = Column(Integer, default=0, nullable=False)

    user = relationship("User", back_populates="purchases")
    media_item = relationship("MediaCatalog", back_populates="purchases")


class ContentSchedule(Base):
    __tablename__ = "content_schedules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    channel_name = Column(String(100), nullable=False)
    content_type = Column(String(50), nullable=False) # e.g. "viral_narrative", "music_playlist", "audiobook"
    topic = Column(String(255), nullable=False)
    frequency = Column(String(50), default="weekly", nullable=False) # "weekly", "biweekly_2x", "daily", "monthly"
    config = Column(String(2000), nullable=True) # JSON config string
    status = Column(String(50), default="scheduled", nullable=False) # "scheduled", "running", "paused", "completed"
    next_execution = Column(DateTime, nullable=False)
    last_execution = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def __repr__(self):
        return f"<ContentSchedule {self.name} (Type: {self.content_type}, Status: {self.status})>"


class ChannelContentHistory(Base):
    __tablename__ = "channel_content_histories"

    id = Column(Integer, primary_key=True, index=True)
    channel_name = Column(String(100), nullable=False, index=True)
    schedule_id = Column(Integer, nullable=True)
    title = Column(String(255), nullable=False)
    topic = Column(String(255), nullable=False)
    summary_angle = Column(String(500), nullable=True)
    script_snippet = Column(String(1000), nullable=True)
    style_used = Column(String(150), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def __repr__(self):
        return f"<ChannelContentHistory channel={self.channel_name} title='{self.title}'>"


# ══════════════════════════════════════════════════════════════
#  24/7 STREAMING & CLOUDFLARE R2 INTEGRATION
# ══════════════════════════════════════════════════════════════

class CloudflareAccount(Base):
    __tablename__ = "cloudflare_accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False) # e.g. "Cuenta R2 Canal Musica"
    account_id = Column(String(120), nullable=False)
    access_key_id = Column(String(120), nullable=False)
    secret_access_key = Column(String(150), nullable=False)
    bucket_name = Column(String(120), nullable=False)
    public_url_or_domain = Column(String(255), nullable=True) # e.g. https://pub-xxx.r2.dev or custom domain
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    sessions = relationship("LiveStreamSession", back_populates="cloudflare_account")

    def __repr__(self):
        return f"<CloudflareAccount {self.name} bucket={self.bucket_name}>"


class StreamChannel(Base):
    __tablename__ = "stream_channels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False) # e.g. "Canal YouTube Relax 24/7"
    platform = Column(String(50), default="youtube", nullable=False) # youtube, twitch, kick, facebook, custom
    rtmp_url = Column(String(255), default="rtmp://a.rtmp.youtube.com/live2", nullable=False)
    stream_key = Column(String(255), nullable=False)
    youtube_live_chat_id = Column(String(255), nullable=True)
    youtube_video_id = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    sessions = relationship("LiveStreamSession", back_populates="channel")

    def __repr__(self):
        return f"<StreamChannel {self.name} ({self.platform})>"


class LiveStreamSession(Base):
    __tablename__ = "live_stream_sessions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=False)
    channel_id = Column(Integer, ForeignKey("stream_channels.id"), nullable=False)
    cloudflare_account_id = Column(Integer, ForeignKey("cloudflare_accounts.id"), nullable=True)
    video_source_type = Column(String(50), default="r2", nullable=False) # r2, local, direct_url
    video_key = Column(String(500), nullable=False) # R2 object key or local path or URL
    status = Column(String(50), default="idle", nullable=False) # idle, starting, running, error, stopped
    pm2_process_name = Column(String(100), nullable=True)
    fps = Column(Integer, default=30, nullable=True)
    bitrate_kbps = Column(Integer, default=4000, nullable=True)
    restart_count = Column(Integer, default=0, nullable=False)
    last_ping = Column(DateTime, nullable=True)
    log_snippet = Column(String(2000), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    channel = relationship("StreamChannel", back_populates="sessions")
    cloudflare_account = relationship("CloudflareAccount", back_populates="sessions")

    def __repr__(self):
        return f"<LiveStreamSession {self.title} (Status: {self.status})>"


class LiveRoom(Base):
    """Sala Live Studio multidispositivo (director + invitados WHIP)."""
    __tablename__ = "live_rooms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    status = Column(String(50), default="idle", nullable=False)  # idle, live, stopped
    width = Column(Integer, default=1920, nullable=False)
    height = Column(Integer, default=1080, nullable=False)
    bitrate_kbps = Column(Integer, default=6000, nullable=False)
    invite_code = Column(String(20), unique=True, nullable=False, index=True)
    program_path = Column(String(255), nullable=True)  # live/<slug>/program
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    destinations = relationship("LiveRoomDestination", back_populates="room", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<LiveRoom {self.name} ({self.status})>"


class LiveRoomDestination(Base):
    """Destino multistream de una sala (se vincula/desvincula en vivo)."""
    __tablename__ = "live_room_destinations"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("live_rooms.id"), nullable=False)
    platform = Column(String(50), default="youtube", nullable=False)
    label = Column(String(150), nullable=True)
    rtmp_url = Column(String(255), nullable=False)
    stream_key = Column(String(255), nullable=False)
    mode = Column(String(20), default="copy", nullable=False)  # copy | transcode
    orientation = Column(String(20), default="horizontal", nullable=False)  # horizontal | vertical
    bitrate_kbps = Column(Integer, default=6000, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)  # vinculado al live
    pm2_process_name = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    room = relationship("LiveRoom", back_populates="destinations")


class LiveScene(Base):
    """Escena del director persistida en servidor (layout + slots de fuentes)."""
    __tablename__ = "live_scenes"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("live_rooms.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    layout = Column(String(20), default="pip", nullable=False)  # fullscreen|pip|split2|interview|screen-cam
    slots_json = Column(String(2000), nullable=True)  # ["<source-id>", ...] (ids efímeros del director)
    is_program = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    room = relationship("LiveRoom", backref="scenes")

    def __repr__(self):
        return f"<LiveRoomDestination {self.platform} room={self.room_id} active={self.is_active}>"


class YouTubeAccount(Base):
    """Cuenta / Canal de YouTube vinculado vía OAuth2."""
    __tablename__ = "youtube_accounts"

    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(String(100), unique=True, nullable=False, index=True)
    channel_title = Column(String(200), nullable=False)
    channel_description = Column(String(1000), nullable=True)
    custom_url = Column(String(100), nullable=True)
    thumbnail_url = Column(String(500), nullable=True)
    account_email = Column(String(150), nullable=True)
    refresh_token = Column(String(1000), nullable=False)
    token_uri = Column(String(255), default="https://oauth2.googleapis.com/token", nullable=False)
    client_id = Column(String(255), nullable=True)
    client_secret = Column(String(255), nullable=True)
    scopes_json = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    bindings = relationship("ProjectChannelBinding", back_populates="channel", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<YouTubeAccount {self.channel_title} ({self.channel_id})>"


class ProjectChannelBinding(Base):
    """Vinculación entre una carpeta/proyecto y un canal de YouTube específico."""
    __tablename__ = "project_channel_bindings"

    id = Column(Integer, primary_key=True, index=True)
    project_path = Column(String(500), unique=True, nullable=False, index=True)  # Ej: "MusicPlaylist/Afrobeats_para_Millonarios"
    project_name = Column(String(200), nullable=False)
    channel_id = Column(String(100), ForeignKey("youtube_accounts.channel_id", ondelete="CASCADE"), nullable=False, index=True)
    default_language = Column(String(10), default="es", nullable=False)  # es | en
    default_category_id = Column(String(10), default="10", nullable=False)  # 10=Music, 24=Entertainment, etc.
    default_privacy = Column(String(20), default="private", nullable=False)  # private (borrador)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    channel = relationship("YouTubeAccount", back_populates="bindings")

    def __repr__(self):
        return f"<ProjectChannelBinding {self.project_path} -> {self.channel_id}>"


# ══════════════════════════════════════════════════════════════════════════════
#  ARTIST MARKETPLACE, AGENTIC COMMERCE & PAYPAL AI HACKATHON EXTENSIONS
# ══════════════════════════════════════════════════════════════════════════════

class ArtistProfile(Base):
    """
    Perfil extendido de Artista Independiente o Sello Musical en MediaSuite / Éxito.cyou.
    Incluye configuración de monetización con PayPal, Billetera Virtual (Zero Fondos Propios),
    Personalización de Canal, Agente IA de Comercio Conversacional y enlaces Omnicanal (WhatsApp/Telegram).
    """
    __tablename__ = "artist_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    display_name = Column(String(150), nullable=False)
    bio = Column(String(1000), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    banner_url = Column(String(500), nullable=True)
    primary_color = Column(String(20), default="#8b5cf6")
    genre_focus = Column(String(100), default="Urbano / Electrónica / Consciente")
    language = Column(String(10), default="es")
    has_production_subscription = Column(Boolean, default=False)  # Suscripción activa de herramientas IA en exito.cyou

    # ── Configuración de Pagos PayPal & Billetera ──
    paypal_email = Column(String(150), nullable=True)
    paypal_merchant_id = Column(String(100), nullable=True)
    paypal_verified = Column(Boolean, default=False)
    payphone_number = Column(String(50), nullable=True)
    payout_mode = Column(String(30), default="manual")  # instant | threshold | scheduled_weekly | scheduled_monthly | manual
    payout_threshold_usd = Column(Numeric(10, 2), default=20.00)
    platform_fee_percent = Column(Numeric(5, 2), default=15.00)  # 15% margen de plataforma MediaSuite

    # ── Balances Financieros (USD) ──
    available_balance_usd = Column(Numeric(10, 2), default=0.00, nullable=False)
    pending_balance_usd = Column(Numeric(10, 2), default=0.00, nullable=False)
    lifetime_gross_sales_usd = Column(Numeric(10, 2), default=0.00, nullable=False)
    lifetime_net_earnings_usd = Column(Numeric(10, 2), default=0.00, nullable=False)
    lifetime_platform_fees_usd = Column(Numeric(10, 2), default=0.00, nullable=False)

    # ── Agente IA Personalizado del Artista (Agentic Commerce + RAG Multitenant) ──
    agent_enabled = Column(Boolean, default=True)
    agent_name = Column(String(100), default="Asistente IA del Artista")
    agent_persona_type = Column(String(50), default="artist_clone")  # artist_clone | virtual_manager
    agent_system_prompt = Column(String(2000), nullable=True)
    agent_rag_knowledge = Column(String(5000), nullable=True)  # Historia, letras, próximos conciertos, ofertas exclusivas
    agent_voice_id = Column(String(50), default="ef_dora")
    agent_welcome_message = Column(String(500), nullable=True)

    # ── Omnicanalidad: WhatsApp QR (Aikrofy Bridge / Meta Cloud Tech Provider) & Telegram Bot ──
    whatsapp_company_id = Column(String(100), nullable=True)  # ID de sesión multitenant en aikrofy-api-whatsapp
    whatsapp_connected = Column(Boolean, default=False)
    whatsapp_phone = Column(String(50), nullable=True)
    meta_business_waba_id = Column(String(100), nullable=True)
    telegram_bot_token = Column(String(200), nullable=True)
    telegram_bot_username = Column(String(100), nullable=True)
    telegram_connected = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", backref="artist_profile")


class ArtistAlbum(Base):
    """Álbum creado por un artista independiente con precio de álbum completo y portada propia."""
    __tablename__ = "artist_albums"

    id = Column(Integer, primary_key=True, index=True)
    artist_profile_id = Column(Integer, ForeignKey("artist_profiles.id"), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    description = Column(String(1000), nullable=True)
    cover_art_path = Column(String(500), nullable=True)
    genre = Column(String(100), nullable=True)
    price_usd = Column(Numeric(10, 2), default=7.99, nullable=False)
    price_tokens = Column(Integer, default=10, nullable=False)
    release_date = Column(DateTime, default=datetime.datetime.utcnow)
    is_public = Column(Boolean, default=True)
    play_count = Column(Integer, default=0)
    sales_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ArtistPayoutTransaction(Base):
    """Registro de liquidaciones / retiros del artista (PayPal Payouts / Instant Split / Uso en Tokens)."""
    __tablename__ = "artist_payout_transactions"

    id = Column(Integer, primary_key=True, index=True)
    artist_profile_id = Column(Integer, ForeignKey("artist_profiles.id"), nullable=False, index=True)
    amount_usd = Column(Numeric(10, 2), nullable=False)
    payout_method = Column(String(50), default="paypal")  # paypal | payphone | token_conversion
    destination_account = Column(String(150), nullable=True)
    paypal_payout_batch_id = Column(String(120), nullable=True)
    status = Column(String(30), default="completed")  # pending | processing | completed | failed
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ArtistSaleLedger(Base):
    """Libro mayor de cada venta de track/álbum con desglose transparente de comisión de plataforma."""
    __tablename__ = "artist_sales_ledger"

    id = Column(Integer, primary_key=True, index=True)
    artist_profile_id = Column(Integer, ForeignKey("artist_profiles.id"), nullable=False, index=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"), nullable=True)
    media_catalog_id = Column(Integer, ForeignKey("media_catalog.id"), nullable=True)
    album_id = Column(Integer, ForeignKey("artist_albums.id"), nullable=True)
    buyer_email = Column(String(150), nullable=True)
    sale_channel = Column(String(50), default="web_portal")  # web_portal | ai_agent_chat | whatsapp_agent | telegram_agent
    gross_amount_usd = Column(Numeric(10, 2), nullable=False)
    platform_fee_usd = Column(Numeric(10, 2), nullable=False)
    net_artist_amount_usd = Column(Numeric(10, 2), nullable=False)
    paypal_order_id = Column(String(120), nullable=True)
    auto_payout_triggered = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class TrackLike(Base):
    """Reacción de Corazón / Me Gusta de los fans en tracks (sin comentarios, señal pura de afinidad)."""
    __tablename__ = "track_likes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    session_fingerprint = Column(String(100), nullable=True, index=True)  # Para visitantes sin login
    media_catalog_id = Column(Integer, ForeignKey("media_catalog.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ArtistSubscriber(Base):
    """Seguidores / Comunidad suscrita al canal de un artista para recibir notificaciones y votar."""
    __tablename__ = "artist_subscribers"

    id = Column(Integer, primary_key=True, index=True)
    artist_profile_id = Column(Integer, ForeignKey("artist_profiles.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    fan_email = Column(String(150), nullable=True)
    fan_name = Column(String(100), nullable=True)
    fan_whatsapp = Column(String(50), nullable=True)
    notify_new_releases = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ArtistPoll(Base):
    """Encuestas y votaciones interactivas creadas por el artista para su comunidad."""
    __tablename__ = "artist_polls"

    id = Column(Integer, primary_key=True, index=True)
    artist_profile_id = Column(Integer, ForeignKey("artist_profiles.id"), nullable=False, index=True)
    question = Column(String(300), nullable=False)
    options_json = Column(String(2000), nullable=False)  # JSON list: [{"id": 1, "text": "...", "votes": 12}]
    is_active = Column(Boolean, default=True)
    total_votes = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ArtistNotification(Base):
    """Historial de boletines / notificaciones enviadas por el artista a su lista de suscriptores."""
    __tablename__ = "artist_notifications"

    id = Column(Integer, primary_key=True, index=True)
    artist_profile_id = Column(Integer, ForeignKey("artist_profiles.id"), nullable=False, index=True)
    subject = Column(String(200), nullable=False)
    message = Column(String(2000), nullable=False)
    channel = Column(String(50), default="all")  # all | email | whatsapp | telegram | in_app
    recipients_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class UserRecommendationSignal(Base):
    """
    Señales capturadas en tiempo real para el Algoritmo Propio de Recomendación Musical:
    - Likes / Corazones (peso +15)
    - Solicitudes y recomendaciones pedidas en el Chat de Saori / Agente del Artista (peso +12)
    - Reproducciones completas >80% (peso +8)
    - Compras en PayPal / Tokens (peso +25)
    """
    __tablename__ = "user_recommendation_signals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    session_fingerprint = Column(String(100), nullable=True, index=True)
    signal_type = Column(String(50), nullable=False)  # like | saori_chat_request | saori_recommendation | full_stream | purchase
    media_catalog_id = Column(Integer, ForeignKey("media_catalog.id"), nullable=True, index=True)
    extracted_genre = Column(String(100), nullable=True)
    extracted_mood = Column(String(100), nullable=True)
    extracted_artist = Column(String(150), nullable=True)
    raw_query = Column(String(500), nullable=True)
    weight = Column(Numeric(5, 2), default=5.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)





