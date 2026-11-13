#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seed a local demo database so the marketplace is testable offline.

The public repository intentionally does not ship the production MySQL catalog
nor copyrighted audio masters. However, the Next.js UI falls back to a hardcoded
demo catalog (ids 1..6) when the API returns an empty list, and PayPal order
creation requires those ids to exist in ``media_catalog``. This script inserts
exactly those demo rows (plus the documented demo accounts) so a judge can run
the full sandbox checkout locally.

It is idempotent: run it as many times as you want.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/seed_demo.py

The database is selected by ``DATABASE_URL`` (SQLite by default, see
``.env.example``). Tables are created automatically if missing.
"""

import math
import os
import re
import struct
import sys
import wave
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from config import ROOT_DIR  # noqa: E402
from database import Base, engine, SessionLocal  # noqa: E402
import db_models  # noqa: E402
from auth_utils import hash_password  # noqa: E402


DEMO_PASSWORD = "PayPalDemo2026!"

DEMO_TRACKS = [
    {
        "id": 1,
        "title": "Cyberpunk Sunrise",
        "artist": "Billionaires Playlist",
        "type": "song",
        "price_tokens": 1,
        "price_usd": 0.99,
        "genre": "Electronic",
        "duration_seconds": 210,
        "creator": "Billionaires Playlist",
        "album_art_path": "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80",
    },
    {
        "id": 2,
        "title": "Ecos del Futuro",
        "artist": "Elena Ramos",
        "type": "audiobook",
        "price_tokens": 3,
        "price_usd": 4.99,
        "genre": "Ficción",
        "duration_seconds": 3600,
        "creator": "Efecto Metamorfosis",
        "album_art_path": "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80",
        "description": "Un viaje al futuro narrado con voces de alta fidelidad.",
    },
    {
        "id": 3,
        "title": "Chill Lofi Beats",
        "artist": "Billionaires Playlist",
        "type": "album",
        "price_tokens": 5,
        "price_usd": 7.99,
        "genre": "Lo-Fi",
        "duration_seconds": 2400,
        "creator": "Billionaires Playlist",
        "album_art_path": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
    },
    {
        "id": 4,
        "title": "Meditación Cósmica",
        "artist": "Billionaire SoundTrack",
        "type": "song",
        "price_tokens": 1,
        "price_usd": 0.99,
        "genre": "Ambient",
        "duration_seconds": 480,
        "creator": "Billionaire SoundTrack",
        "album_art_path": "https://images.unsplash.com/photo-1536152470836-b943b246224c?w=400&q=80",
    },
    {
        "id": 5,
        "title": "El Poder de la Mente",
        "artist": "Metafísica & Ley de Atracción",
        "type": "audiobook",
        "price_tokens": 4,
        "price_usd": 5.99,
        "genre": "Autoayuda",
        "duration_seconds": 5400,
        "creator": "Audiolibros de Metafísica",
        "album_art_path": "https://images.unsplash.com/photo-1490633874781-1c63cc424610?w=400&q=80",
        "description": "Audiolibro sobre psicología positiva y mentalidad ganadora.",
    },
    {
        "id": 6,
        "title": "Neon Dreamer",
        "artist": "Billionaires Playlist",
        "type": "song",
        "price_tokens": 1,
        "price_usd": 0.99,
        "genre": "Synthwave",
        "duration_seconds": 265,
        "creator": "Billionaires Playlist",
        "album_art_path": "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&q=80",
    },
]

DEMO_USERS = [
    {"username": "demojudge", "email": "demojudge@example.com", "role": "client"},
    {"username": "demobuyer", "email": "demobuyer@example.com", "role": "client"},
    {"username": "demoartist", "email": "demoartist@example.com", "role": "client"},
]

ARTIST_SLUG = "billionaire-records-demo"
SANDBOX_PAYOUT_EMAIL = "sb-ogswn53856031@personal.example.com"


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _ensure_audio(track: dict) -> str:
    """Return a catalog ``file_path`` and generate a short playable WAV.

    Uses only the Python standard library so the demo audio works even when
    ``ffmpeg`` is not installed on the judge's machine.
    """
    seed_dir = Path(ROOT_DIR) / "media_library" / "seed"
    filename = f"{track['id']}_{_slugify(track['title'])}.wav"
    target = seed_dir / filename
    if not target.exists():
        seed_dir.mkdir(parents=True, exist_ok=True)
        sample_rate = 22050
        duration = 3
        total = sample_rate * duration
        frequency = 220 + (track["id"] * 55)
        frames = bytearray()
        for i in range(total):
            envelope = min(1.0, i / 800, (total - i) / 800)
            value = int(0.25 * 32767 * envelope * math.sin(2 * math.pi * frequency * i / sample_rate))
            frames += struct.pack("<h", value)
        with wave.open(str(target), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes(bytes(frames))
    return f"media_library/seed/{filename}"


def _upsert_user(db, username: str, email: str, role: str):
    user = db.query(db_models.User).filter(db_models.User.username == username).first()
    if user is None:
        user = db_models.User(
            username=username,
            email=email,
            password_hash=hash_password(DEMO_PASSWORD),
            role=role,
            tokens_balance=10,
        )
        db.add(user)
        db.flush()
        print(f"  + user {username} ({role})")
    else:
        print(f"  = user {username} (already exists)")
    return user


def _upsert_track(db, track: dict):
    item = db.query(db_models.MediaCatalog).filter(
        db_models.MediaCatalog.id == track["id"]
    ).first()
    data = {
        "title": track["title"],
        "artist": track["artist"],
        "type": track["type"],
        "price_tokens": track["price_tokens"],
        "price_usd": track["price_usd"],
        "genre": track.get("genre"),
        "duration_seconds": track.get("duration_seconds"),
        "creator": track.get("creator"),
        # Attribute demo sales to the seeded demo label so the 85/15 artist
        # ledger is populated when a judge buys any catalog item.
        "creator_slug": ARTIST_SLUG,
        "album_art_path": track.get("album_art_path"),
        "description": track.get("description"),
        "is_public": True,
    }
    if item is None:
        item = db_models.MediaCatalog(id=track["id"], file_path=_ensure_audio(track), **data)
        db.add(item)
        print(f"  + track {track['id']}: {track['title']}")
    else:
        # Keep counts/purchases intact; refresh the display/price fields.
        for key, value in data.items():
            setattr(item, key, value)
        if not item.file_path:
            item.file_path = _ensure_audio(track)
        print(f"  = track {track['id']}: {track['title']} (updated)")
    return item


def _upsert_artist_profile(db, user):
    profile = db.query(db_models.ArtistProfile).filter(
        (db_models.ArtistProfile.slug == ARTIST_SLUG)
        | (db_models.ArtistProfile.user_id == user.id)
    ).first()
    if profile is None:
        profile = db_models.ArtistProfile(
            user_id=user.id,
            slug=ARTIST_SLUG,
            display_name="Billionaire Records (Demo)",
            bio="Demo label profile seeded for local PayPal Sandbox testing.",
            paypal_email=SANDBOX_PAYOUT_EMAIL,
            paypal_verified=True,
            payout_mode="manual",
            platform_fee_percent=15.00,
            language="es",
        )
        db.add(profile)
        print(f"  + artist profile {ARTIST_SLUG} -> {user.username}")
    else:
        profile.user_id = user.id
        profile.slug = ARTIST_SLUG
        profile.paypal_email = profile.paypal_email or SANDBOX_PAYOUT_EMAIL
        print(f"  = artist profile {ARTIST_SLUG} (already exists)")
    return profile


def main() -> int:
    print("Seeding demo data for local marketplace testing...")
    print(f"  database: {engine.url}")

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("- Catalog")
        for track in DEMO_TRACKS:
            _upsert_track(db, track)

        print("- Demo accounts")
        users = {}
        for spec in DEMO_USERS:
            users[spec["username"]] = _upsert_user(
                db, spec["username"], spec["email"], spec["role"]
            )

        print("- Artist profile")
        _upsert_artist_profile(db, users["demojudge"])

        db.commit()
        print("\nDone. Demo credentials:")
        print(f"  artist/evaluator : demojudge / {DEMO_PASSWORD}")
        print(f"  buyer/fan        : demobuyer / {DEMO_PASSWORD}")
        print(f"  secondary artist : demoartist / {DEMO_PASSWORD}")
        print("\nStart the backend and frontend, then open http://localhost:3000/?sandbox=1")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"ERROR seeding demo data: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
