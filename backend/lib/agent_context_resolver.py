# -*- coding: utf-8 -*-
"""
Agent Context Resolver — scope, tipo de contenido y búsqueda acotada para Aurora.
Jerarquía: creador activo → tipo de contenido (global por tipo) → plataforma global.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, Optional

from lib.creator_registry import (
    CREATOR_ALIASES,
    CREATOR_META,
    SLUG_TO_CREATOR,
    creator_name_to_slug,
    get_creator_meta_by_slug,
    resolve_creator_slug,
)

# ─── Normalización y tokens ───────────────────────────────────────────────────

STOPWORDS = {
    "the", "a", "an", "of", "in", "is", "it", "to", "and", "or",
    "que", "un", "una", "los", "las", "del", "con", "por", "para",
    "se", "me", "te", "le", "su", "mi", "tu", "al", "en", "si",
    "algo", "escuchar", "reproducir", "reproduce", "pon", "play",
    "hola", "quiero", "quieor", "esuchar", "de", "la", "el",
}

TRANSLATION_MAP = {
    "llama": ["flame", "lama", "violet flame"],
    "violeta": ["violet", "purple"],
    "jardin": ["garden"],
    "cosecha": ["harvest"],
    "creencia": ["belief"],
    "millonario": ["millionaire"],
    "millonarios": ["millionaires"],
    "subconsciente": ["subconscious"],
    "oro": ["gold", "golden"],
    "imperio": ["empire"],
    "dinero": ["money"],
    "abundancia": ["abundance"],
    "flame": ["llama"],
    "violet": ["violeta"],
    "garden": ["jardin"],
    "harvest": ["cosecha"],
    "belief": ["creencia"],
    "millionaire": ["millonario"],
    "millionaires": ["millonarios"],
    "subconscious": ["subconsciente"],
    "gold": ["oro", "dorada", "dorado"],
    "empire": ["imperio"],
    "money": ["dinero"],
}


def normalize(text: str) -> str:
    text = (text or "").lower().strip()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def slugify_name(text: str) -> str:
    return normalize(text).replace(" ", "").replace("_", "")


def tokenize(text: str) -> list[str]:
    return [w for w in normalize(text).split() if len(w) >= 2 and w not in STOPWORDS]


def expand_with_translations(tokens: list[str], *, allow_cross_language: bool) -> list[str]:
    if not allow_cross_language:
        return list(tokens)
    expanded = list(tokens)
    for token in tokens:
        if token in TRANSLATION_MAP:
            expanded.extend(TRANSLATION_MAP[token])
    return expanded


def score_match(
    query_tokens_expanded: list[str],
    candidate_text: str,
    original_query: str = "",
) -> float:
    norm_candidate = normalize(candidate_text)
    cand_tokens = tokenize(candidate_text)
    if not cand_tokens or not query_tokens_expanded:
        return 0.0

    norm_query_full = " ".join(query_tokens_expanded)
    substring_bonus = 0.0
    if len(norm_query_full) >= 4 and norm_query_full in norm_candidate:
        substring_bonus = 0.4
    if original_query:
        norm_orig = normalize(original_query)
        if len(norm_orig) >= 4 and norm_orig in norm_candidate:
            substring_bonus = 0.6

    matched_qt: set[int] = set()
    for qi, qt in enumerate(query_tokens_expanded):
        for ct in cand_tokens:
            if qt == ct or qt in ct or ct in qt or SequenceMatcher(None, qt, ct).ratio() > 0.82:
                matched_qt.add(qi)
                break

    overlap_score = len(matched_qt) / max(len(query_tokens_expanded), len(cand_tokens))
    seq_score = SequenceMatcher(None, norm_query_full, norm_candidate).ratio()
    return min(1.0, overlap_score * 0.55 + seq_score * 0.20 + substring_bonus)


# ─── Dataclass de contexto ────────────────────────────────────────────────────

@dataclass
class AgentContext:
    active_creator_slug: Optional[str] = None
    active_creator_name: Optional[str] = None
    active_creator_meta: dict[str, Any] = field(default_factory=dict)
    scope: str = "global"  # creator | type | global
    content_type: str = "all"  # song | audiobook | all
    scope_label: str = "toda la plataforma"
    catalog_subset: list[dict] = field(default_factory=list)
    global_catalog: list[dict] = field(default_factory=list)
    expand_reason: Optional[str] = None


# ─── Detección de intención / scope ──────────────────────────────────────────

GLOBAL_SCOPE_KEYWORDS = [
    "toda la plataforma", "en toda la plataforma", "global", "cualquier canal",
    "todos los canales", "busca en todos", "buscar en todos", "en cualquier creador",
    "cualquier canal", "de todos los canales", "de toda la plataforma",
]

# Palabras que indican búsqueda cross-idioma → forzar scope global
CROSS_LANG_KEYWORDS = [
    "en espanol", "en español", "en ingles", "en inglés", "en castellano",
    "espanol", "español", "ingles", "inglés", "english",
    "que sea en", "que este en", "pero en", "pero que sea en",
    "epsnaol", "epsnol", "espan", "spañ", "castel"
]

AUDIOBOOK_KEYWORDS = [
    "audiolibro", "audiolibros", "audiobook", "audiobooks", "libro", "libros",
    "narracion", "narración", "podcast",
]

DOCUMENTARY_KEYWORDS = [
    "documental", "documentales", "biografia", "biografía", "reportaje",
]

MUSIC_KEYWORDS = [
    "cancion", "canción", "canciones", "musica", "música", "track", "pista", "album", "álbum",
]

PLAY_KEYWORDS = [
    "reproduce", "pon", "escuchar", "reproducir", "play", "quiero escuchar",
    "ponme", "toca", "escúchame", "ponme a", "que suene", "quiero oir",
    "quiero la que", "quiero escuchar la", "quiero esa", "esa cancion",
]


def detect_content_type(message_lower: str) -> str:
    if any(k in message_lower for k in AUDIOBOOK_KEYWORDS):
        return "audiobook"
    if any(k in message_lower for k in DOCUMENTARY_KEYWORDS):
        return "audiobook"  # documentales también viven como audiobook en catálogo
    if any(k in message_lower for k in MUSIC_KEYWORDS):
        return "song"
    return "all"


def wants_global_scope(message_lower: str) -> bool:
    return any(k in message_lower for k in GLOBAL_SCOPE_KEYWORDS)


def wants_cross_language(message_lower: str) -> bool:
    """Detecta si el usuario pide contenido en un idioma distinto al canal activo."""
    return any(k in message_lower for k in CROSS_LANG_KEYWORDS)


def resolve_agent_context(
    message: str,
    catalog: list[dict],
    *,
    current_path: Optional[str] = None,
    creator_slug: Optional[str] = None,
    creator_name: Optional[str] = None,
    creator_type: Optional[str] = None,
) -> AgentContext:
    message_lower = message.lower()
    content_type = detect_content_type(message_lower)

    active_slug = resolve_creator_slug(
        explicit_slug=creator_slug,
        current_path=current_path,
        message=None,  # no resolver creador destino desde mensaje para scope activo
    )
    if not active_slug and creator_name:
        active_slug = creator_name_to_slug(creator_name)

    active_name = SLUG_TO_CREATOR.get(active_slug) if active_slug else None
    active_meta = get_creator_meta_by_slug(active_slug) if active_slug else {}

    if creator_type and active_meta:
        active_meta = {**active_meta, "creator_type": creator_type}

    # Determinar scope
    scope = "creator"
    scope_label = active_meta.get("name", active_name or "este canal")
    expand_reason = None

    if wants_global_scope(message_lower):
        scope = "global"
        scope_label = "toda la plataforma"
    elif wants_cross_language(message_lower) and active_name:
        # Si pide contenido en otro idioma, forzar búsqueda global
        scope = "global"
        scope_label = "toda la plataforma (búsqueda multi-idioma)"
        expand_reason = f"El usuario pidió contenido en un idioma potencialmente distinto al de {active_name}; expandiendo a toda la plataforma."
    elif content_type == "audiobook":
        # Audiolibros: primero del creador activo si tiene; si no, tipo global
        creator_audiobooks = [
            i for i in catalog
            if i.get("type") == "audiobook"
            and (not active_name or i.get("creator") == active_name)
        ]
        if creator_audiobooks and active_name:
            scope = "creator"
            scope_label = f"audiolibros de {active_name}"
        else:
            scope = "type"
            scope_label = "audiolibros de toda la plataforma"
            expand_reason = "El canal activo no tiene audiolibros; buscando en toda la plataforma."
    elif content_type == "song" and active_name:
        scope = "creator"
        scope_label = active_name
    elif active_name and not wants_global_scope(message_lower):
        scope = "creator"
        scope_label = active_name
    else:
        scope = "global"
        scope_label = "toda la plataforma"

    subset = filter_catalog(
        catalog,
        scope=scope,
        content_type=content_type,
        active_creator_name=active_name,
        active_creator_slug=active_slug,
    )

    # Fallback: si scope creator queda vacío, expandir a type o global
    if scope == "creator" and not subset and active_name:
        subset = filter_catalog(
            catalog,
            scope="type" if content_type != "all" else "global",
            content_type=content_type,
            active_creator_name=active_name,
            active_creator_slug=active_slug,
        )
        if content_type == "audiobook":
            scope = "type"
            scope_label = "audiolibros de toda la plataforma"
        else:
            scope = "global"
            scope_label = "toda la plataforma"
        expand_reason = expand_reason or f"No hay resultados en {active_name}; ampliando búsqueda."

    return AgentContext(
        active_creator_slug=active_slug,
        active_creator_name=active_name,
        active_creator_meta=active_meta,
        scope=scope,
        content_type=content_type,
        scope_label=scope_label,
        catalog_subset=subset if subset else list(catalog),
        global_catalog=list(catalog),
        expand_reason=expand_reason,
    )


def filter_catalog(
    catalog: list[dict],
    *,
    scope: str,
    content_type: str = "all",
    active_creator_name: Optional[str] = None,
    active_creator_slug: Optional[str] = None,
) -> list[dict]:
    items = list(catalog)

    if scope == "creator" and active_creator_name:
        items = [
            i for i in items
            if i.get("creator") == active_creator_name
            or (active_creator_slug and i.get("creator_slug") == active_creator_slug)
        ]
    elif scope == "type":
        if content_type == "audiobook":
            items = [i for i in items if i.get("type") == "audiobook"]
        elif content_type == "song":
            items = [i for i in items if i.get("type") == "song"]
        else:
            pass  # global all types
    # scope global: no filter by creator

    if content_type == "audiobook":
        items = [i for i in items if i.get("type") == "audiobook"]
    elif content_type == "song":
        items = [i for i in items if i.get("type") == "song"]

    return items


def prioritize_catalog(catalog: list[dict], ctx: AgentContext) -> list[dict]:
    """Ordena catálogo poniendo primero el creador activo."""
    if not ctx.active_creator_name:
        return list(catalog)

    def sort_key(item: dict) -> tuple[int, str]:
        is_active = (
            item.get("creator") == ctx.active_creator_name
            or item.get("creator_slug") == ctx.active_creator_slug
        )
        return (0 if is_active else 1, normalize(item.get("title", "")))

    return sorted(catalog, key=sort_key)


def resolve_creator_from_message(message: str) -> Optional[str]:
    """Detecta si el usuario pide navegar/reproducir de un creador concreto."""
    msg = message.lower()
    for alias, slug in CREATOR_ALIASES:
        if alias in msg:
            return slug
        key_words = alias.split()
        query_words = msg.split()
        matched = sum(
            1 for kw in key_words
            if any(SequenceMatcher(None, kw, qw).ratio() > 0.75 for qw in query_words)
        )
        if matched == len(key_words) and key_words:
            return slug
    return None


def scoped_fuzzy_search(
    query: str,
    catalog: list[dict],
    ctx: AgentContext,
    *,
    top_n: int = 5,
    threshold: float = 0.18,
    read_lyrics_fn=None,
) -> list[dict]:
    """Búsqueda fuzzy acotada al scope; traducción ES↔EN solo en scope global."""
    query_tokens = tokenize(query)
    if not query_tokens:
        return []

    allow_cross = ctx.scope == "global"
    query_expanded = expand_with_translations(query_tokens, allow_cross_language=allow_cross)

    scored: list[tuple[float, dict]] = []
    for item in catalog:
        title_score = score_match(query_expanded, item.get("title", ""), query)
        album_score = score_match(query_expanded, item.get("album", "") or item.get("artist", ""), query) * 0.55
        creator_score = score_match(query_expanded, item.get("creator", ""), query) * 0.45

        lyrics_score = 0.0
        if read_lyrics_fn and item.get("lyrics_path"):
            lyrics_content = read_lyrics_fn(item.get("lyrics_path"), max_chars=3000)
            if lyrics_content:
                lyrics_score = score_match(query_expanded, lyrics_content, query) * 0.90

        best = max(title_score, album_score, creator_score, lyrics_score)
        if lyrics_score > 0.45:
            best = max(best, lyrics_score * 1.15)

        # Boost por idioma del creador activo
        if ctx.active_creator_meta.get("language") == "es":
            title_norm = normalize(item.get("title", ""))
            if any(w in title_norm for w in ["llama", "violeta", "millonarios", "jardin", "cosecha"]):
                best = min(1.0, best * 1.15)
        elif ctx.active_creator_meta.get("language") == "en":
            title_norm = normalize(item.get("title", ""))
            if any(w in title_norm for w in ["garden", "belief", "millionaire", "billionaire"]):
                best = min(1.0, best * 1.15)

        # Penalizar items fuera del creador activo cuando scope es creator
        if ctx.scope == "creator" and ctx.active_creator_name:
            if item.get("creator") != ctx.active_creator_name:
                best *= 0.05

        if best >= threshold:
            scored.append((best, item))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:top_n]]


def build_creator_prompt_section(ctx: AgentContext) -> str:
    if not ctx.active_creator_name:
        return "CANAL ACTIVO: Global / inicio (sin creador específico en la URL)."

    meta = ctx.active_creator_meta
    lines = [
        f"CANAL ACTIVO: {ctx.active_creator_name}",
        f"  Slug URL: {ctx.active_creator_slug}",
        f"  Tipo: {meta.get('type', 'desconocido')} ({meta.get('creator_type', 'general')})",
        f"  Idioma: {meta.get('language', 'es')}",
        f"  ÁLBUMES/SERIES DE ESTE CANAL (campo artist/album, NO son otros canales):",
    ]
    albums = meta.get("albums") or []
    if albums:
        for album in albums:
            lines.append(f"    - {album}")
    else:
        lines.append("    - (contenido principalmente de audiolibros/documentales)")

    # Advertencia anti-confusión bilingüe
    if ctx.active_creator_slug == "billionairesoundtrack":
        lines.append(
            "  IMPORTANTE: NO confundir con el canal INGLÉS 'Billionaires Playlist' "
            "ni con álbumes como 'Dancehall for Billionaires' (pertenecen al otro canal)."
        )
    elif ctx.active_creator_slug == "billionairesplaylist":
        lines.append(
            "  IMPORTANTE: NO confundir con el canal ESPAÑOL 'Billionaire SoundTrack' "
            "ni con álbumes como 'Afrobeats para Millonarios'."
        )

    lines.append(f"ÁMBITO DE BÚSQUEDA ACTUAL: {ctx.scope_label} (scope={ctx.scope}).")
    if ctx.expand_reason:
        lines.append(f"NOTA DE EXPANSIÓN: {ctx.expand_reason}")

    return "\n".join(lines)


def build_catalog_prompt_lines(
    catalog: list[dict],
    *,
    limit: int = 20,
    read_lyrics_fn=None,
) -> str:
    lines = []
    for item in catalog[:limit]:
        lyrics_snippet = ""
        if read_lyrics_fn and item.get("lyrics_path"):
            content = read_lyrics_fn(item.get("lyrics_path"), max_chars=400)
            if content:
                lyrics_snippet = f"\n  Letra (fragmento): {content[:250]}..."
        album = item.get("album") or item.get("artist") or ""
        lang_label = {"es": "Español", "en": "Inglés"}.get(item.get("language", "es"), item.get("language", "es"))
        lines.append(
            f"- ID: {item.get('id')} | Título: {item.get('title')} | "
            f"Álbum/Serie: {album} | Canal: {item.get('creator')} | "
            f"Slug: {item.get('creator_slug', '')} | Tipo: {item.get('type')} | "
            f"Género: {item.get('genre')} | Idioma: {lang_label} | "
            f"Descripción: {item.get('description', '')}{lyrics_snippet}"
        )
    return "\n".join(lines)


def get_rag_namespaces(ctx: AgentContext) -> list[str]:
    """Namespaces Pinecone a consultar, en orden de prioridad."""
    namespaces: list[str] = []
    if ctx.active_creator_slug:
        namespaces.append(f"creator:{ctx.active_creator_slug}")
    if ctx.content_type == "audiobook":
        namespaces.append("type:audiobook")
    elif ctx.content_type == "song":
        namespaces.append("type:song")
    namespaces.append("global")
    # dedupe preserving order
    seen: set[str] = set()
    result = []
    for ns in namespaces:
        if ns not in seen:
            seen.add(ns)
            result.append(ns)
    return result
