# -*- coding: utf-8 -*-
"""
Registro central de creadores/canales de MediaSuite.
Única fuente de verdad para slugs, tipos, idioma y metadatos de UI.
"""

from __future__ import annotations

from typing import Any, Optional

# slug → nombre canónico en DB (campo media_catalog.creator)
SLUG_TO_CREATOR: dict[str, str] = {
    "billionairesplaylist": "Billionaires Playlist",
    "billionairesoundtrack": "Billionaire SoundTrack",
    "audiolibrosmetafisica": "Audiolibros de Metafísica",
    "mentalidadhbl": "Mentalidad HBL",
    "efectometamorfosis": "Efecto Metamorfosis",
}

CREATOR_SLUGS: dict[str, str] = {v: k for k, v in SLUG_TO_CREATOR.items()}

CREATOR_META: dict[str, dict[str, Any]] = {
    "Billionaires Playlist": {
        "slug": "billionairesplaylist",
        "name": "Billionaires Playlist",
        "description": (
            "Premium English music tracks focused on wealth, success and abundance. "
            "Curated for the entrepreneurial mindset."
        ),
        "color": "#06b6d4",
        "gradient": "from-cyan-500/20 to-blue-600/10",
        "type": "Music Channel",
        "creator_type": "music",
        "language": "en",
        "albums": [
            "Dancehall for Billionaires",
            "Deep House for Billionaires",
            "Afrobeats for Billionaires",
            "Blues for Billionaires",
            "Rap for Billionaires",
        ],
    },
    "Billionaire SoundTrack": {
        "slug": "billionairesoundtrack",
        "name": "Billionaire SoundTrack",
        "description": (
            "Música premium en español enfocada en riqueza, mentalidad empresarial y abundancia. "
            "Producción de alto nivel para mentes millonarias."
        ),
        "color": "#f59e0b",
        "gradient": "from-yellow-500/20 to-amber-600/10",
        "type": "Canal Musical",
        "creator_type": "music",
        "language": "es",
        "albums": [
            "Afrobeats para Millonarios",
            "Rap para Millonarios",
        ],
    },
    "Audiolibros de Metafísica": {
        "slug": "audiolibrosmetafisica",
        "name": "Audiolibros de Metafísica",
        "description": (
            "Narraciones premium de los grandes textos de metafísica, ley de atracción y "
            "pensamiento positivo. Florence Scovel Shinn, Conny Méndez, Kybalión y más."
        ),
        "color": "#a78bfa",
        "gradient": "from-purple-500/20 to-pink-600/10",
        "type": "Canal de Audiolibros",
        "creator_type": "audiobook",
        "language": "es",
        "albums": [],
    },
    "Mentalidad HBL": {
        "slug": "mentalidadhbl",
        "name": "Mentalidad HBL",
        "description": (
            "Lecciones de vida, mentalidad de red y crecimiento personal por Eduardo Salazar. "
            "Transforma tu manera de pensar y actuar."
        ),
        "color": "#10b981",
        "gradient": "from-emerald-500/20 to-teal-600/10",
        "type": "Canal Educativo",
        "creator_type": "educational",
        "language": "es",
        "albums": [],
    },
    "Efecto Metamorfosis": {
        "slug": "efectometamorfosis",
        "name": "Efecto Metamorfosis",
        "description": (
            "Reportajes analíticos y biográficos sobre las personalidades más influyentes del mundo: "
            "empresarios, deportistas y líderes globales."
        ),
        "color": "#f43f5e",
        "gradient": "from-rose-500/20 to-red-600/10",
        "type": "Canal Documental",
        "creator_type": "documentary",
        "language": "es",
        "albums": [],
    },
}

# Alias conversacionales → slug (orden: frases largas primero)
CREATOR_ALIASES: list[tuple[str, str]] = [
    ("billionaire soundtrack", "billionairesoundtrack"),
    ("billionaires soundtrack", "billionairesoundtrack"),
    ("billionaires playlist", "billionairesplaylist"),
    ("audiolibros metafisica", "audiolibrosmetafisica"),
    ("audiolibros metafísica", "audiolibrosmetafisica"),
    ("billionairesoundtrack", "billionairesoundtrack"),
    ("billionairesplaylist", "billionairesplaylist"),
    ("audiolibrosmetafisica", "audiolibrosmetafisica"),
    ("mentalidad hbl", "mentalidadhbl"),
    ("mentalidadhbl", "mentalidadhbl"),
    ("efecto metamorfosis", "efectometamorfosis"),
    ("efectometamorfosis", "efectometamorfosis"),
    ("metafísica", "audiolibrosmetafisica"),
    ("metafisica", "audiolibrosmetafisica"),
    ("metamorfosis", "efectometamorfosis"),
    ("hbl", "mentalidadhbl"),
    ("salazar", "mentalidadhbl"),
    ("soundtrack", "billionairesoundtrack"),
    ("billionaire", "billionairesoundtrack"),
    ("playlist", "billionairesplaylist"),
]


def slug_to_creator_name(slug: Optional[str]) -> Optional[str]:
    if not slug:
        return None
    return SLUG_TO_CREATOR.get(slug.strip().lower())


def creator_name_to_slug(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    return CREATOR_SLUGS.get(name)


def get_creator_meta_by_slug(slug: Optional[str]) -> dict[str, Any]:
    name = slug_to_creator_name(slug)
    if not name:
        return {}
    return CREATOR_META.get(name, {})


def get_creator_meta_by_name(name: Optional[str]) -> dict[str, Any]:
    if not name:
        return {}
    return CREATOR_META.get(name, {})


def resolve_creator_slug(
    *,
    explicit_slug: Optional[str] = None,
    current_path: Optional[str] = None,
    message: Optional[str] = None,
) -> Optional[str]:
    """Resuelve slug de creador desde request explícito, URL o mensaje del usuario."""
    if explicit_slug:
        slug = explicit_slug.strip().lower()
        if slug in SLUG_TO_CREATOR:
            return slug

    if current_path:
        import re

        match = re.search(r"(?:/@|/channel/)([a-zA-Z0-9_-]+)", current_path)
        if match:
            slug = match.group(1).lower()
            if slug in SLUG_TO_CREATOR:
                return slug

    if message:
        msg = message.lower()
        for alias, slug in CREATOR_ALIASES:
            if alias in msg:
                return slug

    return None
