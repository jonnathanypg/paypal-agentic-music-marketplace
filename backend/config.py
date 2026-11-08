# -*- coding: utf-8 -*-
"""
MediaSuite 2.0 — Configuración Central
=======================================
UN solo archivo de configuración para TODO el backend.
Reemplaza los 6+ archivos config.py dispersos en los microservicios.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# ── Cargar .env ──
# Busca el .env en la raíz de MediaSuite
BACKEND_DIR = Path(__file__).resolve().parent               # MediaSuite/backend/
ROOT_DIR = BACKEND_DIR.parent                               # MediaSuite/

load_dotenv(ROOT_DIR / ".env")

# ══════════════════════════════════════════════════════════════
#  AUTHENTICATION
# ══════════════════════════════════════════════════════════════
SECRET_KEY = os.getenv("SECRET_KEY", "mediasuite-change-me-in-production")
MEDIASUITE_USER = os.getenv("MEDIASUITE_USER", "admin")
MEDIASUITE_PASSWORD = os.getenv("MEDIASUITE_PASSWORD", "admin")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 30

# ══════════════════════════════════════════════════════════════
#  DATABASE
# ══════════════════════════════════════════════════════════════
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{ROOT_DIR / 'mediasuite.db'}"
)

# ══════════════════════════════════════════════════════════════
#  PAYPAL (E-commerce)
# ══════════════════════════════════════════════════════════════
PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID", "")
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET", "")
PAYPAL_MODE = os.getenv("PAYPAL_MODE", "sandbox")  # "sandbox" | "live"


# ══════════════════════════════════════════════════════════════
#  DEV PLATFORM (MCP/API Portal) — Token Economy
# ══════════════════════════════════════════════════════════════
DEV_JWT_SECRET = os.getenv("DEV_JWT_SECRET", "dev-platform-change-me")
DEV_JWT_EXPIRATION_DAYS = 30
DEV_API_KEY_PREFIX = "ms_dev_"
DEV_API_KEY_BYTES = 32
USAGE_REDIS_PREFIX = "dev_usage:"

# Token cost per tool (each request deducts these tokens)
# Calculados desde cost_model.py con 85% margen mínimo (80-90% objetivo)
# y server overhead Contabo $17/mes incluido.
TOKEN_COSTS = {
    # ═══ Macro Operations ═══
    "list_catalog":           1,
    "search_pexels":          1,
    "analyze_media":          1,
    "generate_covers":        1,
    "transcribe_audio":       1,
    "generate_music":        47,   # Suno $0.07 + server
    "generate_shorts":       55,   # Pipeline completo
    "generate_animation":    34,   # Pipeline completo
    "generate_audiobook":    64,   # Pipeline completo

    # ═══ Micro — Audio ═══
    "audio_info":             1,
    "audio_convert":          1,
    "audio_normalize":        1,
    "audio_transcribe":       1,
    "audio_tts":              1,
    "audio_mix":              1,
    "audio_speed":            1,
    "audio_fade":             1,
    "audio_equalize":         1,
    "audio_remove_silence":   1,
    "audio_clean_tail":       1,
    "audio_pitch":            1,
    "audio_reverse":          1,
    "audio_stereo_to_mono":   1,
    "audio_delay":            1,
    "audio_reverb":           1,
    "audio_compress":         1,
    "audio_spectrum":         1,
    "audio_split":            1,
    "audio_strip_metadata":   1,

    # ═══ Micro — Video ═══
    "video_info":             1,
    "video_standardize":      1,
    "video_extract_frame":    1,
    "video_concat":           3,
    "video_crop":             1,
    "video_stabilize":        3,
    "video_chroma_key":       1,
    "video_slideshow":        1,
    "video_pip":              1,
    "video_rotate":           1,
    "video_flip":             1,
    "video_blur":             1,
    "video_reverse":          1,
    "video_change_speed":     1,
    "video_color_balance":    1,
    "video_brightness_contrast": 1,
    "video_apply_lut":        1,
    "video_generate_waveform": 1,
    "video_generate_ken_burns": 1,
    "video_pad":              1,
    "video_timelapse":        1,
    "video_burn_subtitles":   1,
    "video_detect_scenes":    1,
    "video_extract_audio":    1,
    "video_transition":       3,
    "video_remove_letterbox": 1,

    # ═══ Generative / AI ═══
    "generate_image_dalle2":  27,   # DALL-E 2 $0.040 + server
    "generate_image_dalle3":  54,   # DALL-E 3 $0.080 + server
    "analyze_video_gemini":    4,   # Gemini video $0.005 + server
    "generate_grain_loop":    1,
    "generate_vignette":      1,
    "generate_video_gemini_omni": 134,  # Gemini Omni Flash — default video gen
}

# One-time token packages (pay-as-you-go — slider from $5 to $500, $1 steps)
TOKEN_UNIT_PRICE = 0.01  # 1 token = $0.01 USD
PAY_AS_YOU_GO_MIN = 5    # $5 minimum
PAY_AS_YOU_GO_MAX = 500  # $500 maximum
PAY_AS_YOU_GO_STEP = 1   # $1 increments

# Monthly subscription plans with annual (default) and monthly billing
DEV_PLANS = {
    "starter": {
        "name": "Starter",
        "annual_monthly_price": 19.99,
        "monthly_price": 24.99,
        "tokens_monthly": 2500,         # base monthly = $0.0100/tok
        "tokens_annual": 3000,          # annual monthly = $0.0067/tok
        "max_keys": 5,
        "color": "#06b6d4",
        "support": ["email", "ai_agent"],
        "support_label": "Email + AI Agent",
    },
    "pro": {
        "name": "Pro",
        "annual_monthly_price": 79.0,
        "monthly_price": 99.0,
        "tokens_monthly": 10000,        # base = $0.0099/tok
        "tokens_annual": 13000,         # +3,000 = 13,000 total ($0.0061/tok)
        "max_keys": 25,
        "color": "#7c3aed",
        "support": ["email", "ai_agent", "whatsapp"],
        "support_label": "Email + AI Agent + WhatsApp (humano limitado)",
    },
    "enterprise": {
        "name": "Enterprise",
        "annual_monthly_price": None,
        "monthly_price": None,
        "tokens_monthly": None,
        "tokens_annual": None,
        "max_keys": None,
        "color": "#f59e0b",
        "contact_us": True,
        "support": ["email", "ai_agent", "whatsapp", "forward_deployed_engineer"],
        "support_label": "Todo incluido + Forward Deployed AI Engineer",
    },
}

# ══════════════════════════════════════════════════════════════
#  API KEYS
# ══════════════════════════════════════════════════════════════
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "https://media.weblifetech.com/api/youtube/callback")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY", "")
PIXABAY_API_KEY = os.getenv("PIXABAY_API_KEY", "55825984-3627585b6e69c4960d7f30b48")
FREESOUND_API_KEY = os.getenv("FREESOUND_API_KEY", "")  # https://freesound.org/apiv2/apply
SUNO_API_KEY = os.getenv("SUNO_API_KEY", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
HF_TOKEN = os.getenv("HF_TOKEN", "")
SUNO_COOKIE = os.getenv("SUNO_COOKIE", "")
EXTERNAL_API_KEY = os.getenv("EXTERNAL_API_KEY", "")

# ══════════════════════════════════════════════════════════════
#  TTS CONFIG (Audiobooks engine & Global Services)
# ══════════════════════════════════════════════════════════════
TTS_METHOD = os.getenv("TTS_METHOD", "kokoro")
OPENAI_DEFAULT_VOICE = os.getenv("OPENAI_DEFAULT_VOICE", "alloy")
KOKORO_MODELS_DIR = str(ROOT_DIR / "media_library" / "models" / "kokoro")
KOKORO_MODEL_PATH = os.getenv("KOKORO_MODEL_PATH", os.path.join(KOKORO_MODELS_DIR, "kokoro-v1.0.onnx"))
KOKORO_VOICES_PATH = os.getenv("KOKORO_VOICES_PATH", os.path.join(KOKORO_MODELS_DIR, "voices-v1.0.bin"))
KOKORO_DEFAULT_VOICE = os.getenv("KOKORO_DEFAULT_VOICE", "ef_dora")
# Piper binario y modelos ahora en media_library
PIPER_DIR = str(BACKEND_DIR / "bin" / "piper")
PIPER_BINARY_PATH = os.path.join(PIPER_DIR, "sherpa-onnx-offline-tts")
PIPER_MODELS_DIR = str(ROOT_DIR / "media_library" / "Audiobooks" / "models" / "piper")
PIPER_DEFAULT_VOICE = os.getenv("PIPER_DEFAULT_VOICE", "es_MX-claude-high")

# ══════════════════════════════════════════════════════════════
#  REDIS / CELERY — UNA sola conexión para todo
# ══════════════════════════════════════════════════════════════
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)

# ══════════════════════════════════════════════════════════════
#  STORAGE — Rutas centralizadas en MEDIA_LIBRARY
# ══════════════════════════════════════════════════════════════

# Shared media library — MUST match storage.py's MEDIA_ROOT
# Uses ROOT_DIR (project root) so generators and Media Explorer share the same directory
MEDIA_LIBRARY_DIR = ROOT_DIR / "media_library"
MEDIA_LIBRARY_DIR.mkdir(parents=True, exist_ok=True)

# Timeline Studio — Borradores de proyectos multitrack (guardados como JSON)
TIMELINE_PROJECTS_DIR = MEDIA_LIBRARY_DIR / "TimelineProjects"
TIMELINE_PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

# Shorts
SHORTS_DIR = MEDIA_LIBRARY_DIR / "Shorts"
SHORTS_INPUT_AUDIO = SHORTS_DIR / "input_audio"
SHORTS_OUTPUT_VIDEOS = SHORTS_DIR / "output_videos"
SHORTS_ASSETS = SHORTS_DIR / "assets"

# Audiobooks
AUDIOBOOKS_DIR = MEDIA_LIBRARY_DIR / "Audiobooks"
AUDIOBOOKS_SCRIPTS = AUDIOBOOKS_DIR / "scripts"
AUDIOBOOKS_NARRATIONS = AUDIOBOOKS_DIR / "narrations"
AUDIOBOOKS_SONGS = AUDIOBOOKS_DIR / "songs"
AUDIOBOOKS_OUTPUT = AUDIOBOOKS_DIR / "output"
AUDIOBOOKS_BOOKS = AUDIOBOOKS_DIR / "books"
AUDIOBOOKS_IMAGES = AUDIOBOOKS_DIR / "images"

# Helper for project-specific subdirs
def get_audiobook_project_dir(project_name: str) -> Path:
    return AUDIOBOOKS_NARRATIONS / project_name

def get_audiobook_lyrics_dir(project_name: str) -> Path:
    return get_audiobook_project_dir(project_name) / "lyrics"

# Music Playlist
PLAYLIST_DIR = MEDIA_LIBRARY_DIR / "MusicPlaylist"
PLAYLIST_LYRICS = PLAYLIST_DIR / "lyrics"
PLAYLIST_SONGS = PLAYLIST_DIR / "songs"
PLAYLIST_OUTPUT = PLAYLIST_DIR / "output"
PLAYLIST_METADATA = PLAYLIST_DIR / "metadata"

def get_playlist_project_dir(project_name: str) -> Path:
    return PLAYLIST_DIR / project_name

def get_playlist_lyrics_dir(project_name: str) -> Path:
    return get_playlist_project_dir(project_name) / "lyrics"

def get_playlist_songs_dir(project_name: str) -> Path:
    return get_playlist_project_dir(project_name) / "songs"

# Pexels
PEXELS_DOWNLOADS = MEDIA_LIBRARY_DIR / "Pexels"

# Pixabay
PIXABAY_DOWNLOADS = MEDIA_LIBRARY_DIR / "Pixabay"
PIXABAY_DOWNLOADS.mkdir(parents=True, exist_ok=True)

# Sound Library (Freesound + efectos de sonido locales)
SOUND_LIBRARY_DIR = MEDIA_LIBRARY_DIR / "SoundLibrary"
SOUND_LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
# Subcategorías de la biblioteca de sonidos
for _sfx_cat in ["sfx", "ambient", "music", "transition", "sports", "nature"]:
    (SOUND_LIBRARY_DIR / _sfx_cat).mkdir(parents=True, exist_ok=True)

# Studio Music
STUDIO_DIR = MEDIA_LIBRARY_DIR / "StudioMusic"
STUDIO_UPLOADS = STUDIO_DIR / "Uploads"

# Animations (Remotion Studio — videos MP4 generados por IA)
ANIMATIONS_DIR = MEDIA_LIBRARY_DIR / "animations"
ANIMATIONS_DIR.mkdir(parents=True, exist_ok=True)

# Shared uploads (for v2 file uploads)
UPLOADS_DIR = BACKEND_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# ══════════════════════════════════════════════════════════════
#  MEDIA EXPLORER — Directorios para escanear
# ══════════════════════════════════════════════════════════════
OUTPUT_DIRS = {
    "Library Root": str(MEDIA_LIBRARY_DIR),
    "Generator Shorts": str(SHORTS_OUTPUT_VIDEOS),
    "Generator Audiobooks": str(AUDIOBOOKS_OUTPUT),
    "Generator MusicPlaylist": str(PLAYLIST_OUTPUT),
    "Generator Animations": str(MEDIA_LIBRARY_DIR / "animations"),
    "Service Pexels": str(PEXELS_DOWNLOADS),
    "Service Pixabay": str(PIXABAY_DOWNLOADS),
    "Sound Library": str(SOUND_LIBRARY_DIR),
    "Studio Music": str(STUDIO_UPLOADS),
    "Backgrounds": str(MEDIA_LIBRARY_DIR / "Backgrounds"),
}

# ══════════════════════════════════════════════════════════════
#  VIDEO CONFIG (from shorts/config.py)
# ══════════════════════════════════════════════════════════════
FFMPEG_PATH = os.getenv("FFMPEG_PATH", "ffmpeg")
FFPROBE_PATH = os.getenv("FFPROBE_PATH", "ffprobe")

RESOLUTION_PRESETS = {
    "sd":  {"label": "SD (480p)",       "base": 480,  "bitrate": "1500k"},
    "hd":  {"label": "HD (720p)",       "base": 720,  "bitrate": "3000k"},
    "fhd": {"label": "Full HD (1080p)", "base": 1080, "bitrate": "5000k"},
    "2k":  {"label": "2K (1440p)",      "base": 1440, "bitrate": "8000k"},
    "4k":  {"label": "4K (2160p)",      "base": 2160, "bitrate": "15000k"},
}

# ── Server ──
PORT = int(os.getenv("PORT", 8000))

# === Aspect Ratios ===
ASPECT_RATIOS = {
    "vertical":   {"ratio": (9, 16), "label": "9:16 (Shorts/Reels)"},
    "horizontal": {"ratio": (16, 9), "label": "16:9 (YouTube)"},
    "square":     {"ratio": (1, 1),  "label": "1:1 (Instagram)"},
}

_STANDARD_DIMENSIONS = {
    "vertical": {
        "sd":  (360,  640),
        "hd":  (720,  1280),
        "fhd": (1080, 1920),
        "2k":  (1440, 2560),
        "4k":  (2160, 3840),
        "8k":  (4320, 7680),
    },
    "horizontal": {
        "sd":  (640,  360),
        "hd":  (1280, 720),
        "fhd": (1920, 1080),
        "2k":  (2560, 1440),
        "4k":  (3840, 2160),
        "8k":  (7680, 4320),
    },
    "square": {
        "sd":  (480,  480),
        "hd":  (720,  720),
        "fhd": (1080, 1080),
        "2k":  (1440, 1440),
        "4k":  (2160, 2160),
        "8k":  (4320, 4320),
    },
}

def get_video_dimensions(video_format: str = "vertical", resolution: str = "fhd") -> dict:
    ar = ASPECT_RATIOS.get(video_format, ASPECT_RATIOS["vertical"])
    res = RESOLUTION_PRESETS.get(resolution, RESOLUTION_PRESETS["fhd"])

    fmt_table = _STANDARD_DIMENSIONS.get(video_format, _STANDARD_DIMENSIONS["vertical"])
    dims = fmt_table.get(resolution, fmt_table["fhd"])
    width, height = dims

    width = width & ~1
    height = height & ~1

    return {
        "width": width,
        "height": height,
        "label": f"{ar['label']} @ {res['label']}",
        "bitrate": res["bitrate"],
    }

VIDEO_FORMATS = {
    "vertical":   get_video_dimensions("vertical", "fhd"),
    "horizontal": get_video_dimensions("horizontal", "fhd"),
    "square":     get_video_dimensions("square", "fhd"),
}

SUBTITLE_POSITIONS = {
    "bottom": {"alignment": 2, "margin_v": 290},
    "center": {"alignment": 5, "margin_v": 0},
    "top":    {"alignment": 8, "margin_v": 60},
}

WAVE_POSITION_MAP = {
    "bottom": "center",
    "center": "bottom",
    "top":    "center",
}

# Compatibility aliases for shorts_engine
INPUT_AUDIO_DIR = SHORTS_INPUT_AUDIO
OUTPUT_VIDEOS_DIR = SHORTS_OUTPUT_VIDEOS
ASSETS_DIR = SHORTS_ASSETS
ASSETS_VIDEOS_DIR = SHORTS_ASSETS / "videos"
ASSETS_PHOTOS_DIR = SHORTS_ASSETS / "photos"
ASSETS_PROCESSED_DIR = SHORTS_ASSETS / "processed"

# === Thumbnail Platform Presets ===
THUMBNAIL_PRESETS = {
    "youtube":        {"width": 1280, "height": 720,  "ratio": "16:9", "label": "YouTube (1280x720)"},
    "youtube_shorts": {"width": 1080, "height": 1920, "ratio": "9:16", "label": "YT Shorts (1080x1920)"},
    "tiktok":         {"width": 1080, "height": 1920, "ratio": "9:16", "label": "TikTok (1080x1920)"},
    "instagram_post": {"width": 1080, "height": 1350, "ratio": "4:5",  "label": "IG Post (1080x1350)"},
    "instagram_square": {"width": 1080, "height": 1080, "ratio": "1:1", "label": "IG Square (1080x1080)"},
    "instagram_reels": {"width": 1080, "height": 1920, "ratio": "9:16", "label": "IG Reels (1080x1920)"},
}

# === Thumbnail Styles ===
THUMBNAIL_STYLES = {
    "japanese_news": {"label": "🇯🇵 Japanese News", "desc": "Franjas de color arriba y abajo con texto bold"},
    "comparison":    {"label": "⚔️ Comparison",     "desc": "Pantalla dividida VS / Before-After"},
    "viral_mystery": {"label": "🔴 Viral Mystery",  "desc": "Flechas y círculos rojos sobre la imagen"},
    "minimalist":    {"label": "✨ Minimalist",      "desc": "Desenfoque en bordes, tipografía elegante"},
    "bold_impact":   {"label": "💥 Bold Impact",     "desc": "Palabra ancla gigante con sombra 3D"},
}


# Compatibility aliases for audiobooks_engine
SCRIPTS_DIR = str(AUDIOBOOKS_SCRIPTS)
NARRATIONS_DIR = str(AUDIOBOOKS_NARRATIONS)
BOOKS_DIR = str(AUDIOBOOKS_BOOKS)
IMAGES_DIR = str(AUDIOBOOKS_IMAGES)

# Compatibility aliases for playlist_engine (use string paths for LangGraph compat)
LYRICS_DIR = str(PLAYLIST_LYRICS)
SONGS_DIR = str(PLAYLIST_SONGS)
CLIPS_DIR = str(PLAYLIST_DIR / "clips")
METADATA_DIR = str(PLAYLIST_METADATA)
PUBLICATION_REPORTS_DIR = str(PLAYLIST_DIR / "reports")
VIDEO_OUTPUT_PATH = str(PLAYLIST_OUTPUT / "final_video.mp4")
CLIENT_SECRETS_FILE = str(ROOT_DIR / "client_secrets.json")

# Audiobooks script generation config
SCRIPT_GENERATION_PROVIDER = os.getenv("SCRIPT_GENERATION_PROVIDER", "openai")
SCRIPT_GENERATION_MODEL = os.getenv("SCRIPT_GENERATION_MODEL", "gpt-5-nano")

# Make sure ALL directories exist
_all_dirs = [
    INPUT_AUDIO_DIR, OUTPUT_VIDEOS_DIR, ASSETS_VIDEOS_DIR, ASSETS_PHOTOS_DIR, ASSETS_PROCESSED_DIR,
    AUDIOBOOKS_SCRIPTS, AUDIOBOOKS_NARRATIONS, AUDIOBOOKS_SONGS, AUDIOBOOKS_OUTPUT, AUDIOBOOKS_BOOKS, AUDIOBOOKS_IMAGES,
    PLAYLIST_LYRICS, PLAYLIST_SONGS, PLAYLIST_OUTPUT, PLAYLIST_METADATA,
]
for d in _all_dirs:
    Path(d).mkdir(parents=True, exist_ok=True)

