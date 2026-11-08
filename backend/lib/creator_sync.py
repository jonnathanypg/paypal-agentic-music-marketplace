# -*- coding: utf-8 -*-
"""
Sincroniza tabla creators y backfill de creator_slug en media_catalog.
"""

from __future__ import annotations

import logging

from lib.creator_registry import CREATOR_META, CREATOR_SLUGS

logger = logging.getLogger(__name__)


def sync_creators_table(db) -> None:
    """Inserta/actualiza filas en creators desde CREATOR_META."""
    import db_models

    for name, meta in CREATOR_META.items():
        slug = meta["slug"]
        existing = db.query(db_models.Creator).filter(db_models.Creator.slug == slug).first()
        payload = {
            "slug": slug,
            "name": name,
            "creator_type": meta.get("creator_type", "music"),
            "language": meta.get("language", "es"),
            "description": meta.get("description"),
            "color": meta.get("color"),
            "gradient": meta.get("gradient"),
            "is_active": True,
        }
        if existing:
            for key, val in payload.items():
                setattr(existing, key, val)
        else:
            db.add(db_models.Creator(**payload))
    db.commit()
    logger.info("Tabla creators sincronizada desde CREATOR_META.")


def backfill_catalog_creator_slugs(db) -> int:
    """Rellena creator_slug en media_catalog a partir del nombre de creador."""
    import db_models

    updated = 0
    items = db.query(db_models.MediaCatalog).filter(
        db_models.MediaCatalog.creator.isnot(None)
    ).all()
    for item in items:
        slug = CREATOR_SLUGS.get(item.creator)
        if slug and item.creator_slug != slug:
            item.creator_slug = slug
            updated += 1
    if updated:
        db.commit()
        logger.info("Backfill creator_slug: %d items actualizados.", updated)
    return updated


def run_creator_sync(db) -> None:
    sync_creators_table(db)
    backfill_catalog_creator_slugs(db)
