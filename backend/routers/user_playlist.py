# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException, Request, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from database import get_db
import db_models
from routers.auth import get_current_user, verify_token

router = APIRouter()


class CreatePlaylistRequest(BaseModel):
    name: str
    description: Optional[str] = None


class AddItemRequest(BaseModel):
    media_catalog_id: int


@router.get("/user-playlists")
def list_my_playlists(request: Request, db: Session = Depends(get_db)):
    payload = get_current_user(request)
    user = db.query(db_models.User).filter(db_models.User.username == payload.get("user")).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    playlists = db.query(db_models.UserPlaylist).filter(
        db_models.UserPlaylist.user_id == user.id
    ).order_by(db_models.UserPlaylist.updated_at.desc()).all()

    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "item_count": len(p.items),
            "created_at": p.created_at.isoformat(),
            "updated_at": p.updated_at.isoformat(),
        }
        for p in playlists
    ]


@router.post("/user-playlists")
def create_playlist(body: CreatePlaylistRequest, request: Request, db: Session = Depends(get_db)):
    payload = get_current_user(request)
    user = db.query(db_models.User).filter(db_models.User.username == payload.get("user")).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    playlist = db_models.UserPlaylist(
        user_id=user.id,
        name=body.name,
        description=body.description,
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)

    return {
        "success": True,
        "playlist": {
            "id": playlist.id,
            "name": playlist.name,
            "description": playlist.description,
            "created_at": playlist.created_at.isoformat(),
        }
    }


@router.delete("/user-playlists/{playlist_id}")
def delete_playlist(playlist_id: int, request: Request, db: Session = Depends(get_db)):
    payload = get_current_user(request)
    user = db.query(db_models.User).filter(db_models.User.username == payload.get("user")).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    playlist = db.query(db_models.UserPlaylist).filter(
        db_models.UserPlaylist.id == playlist_id,
        db_models.UserPlaylist.user_id == user.id,
    ).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Lista no encontrada")

    db.delete(playlist)
    db.commit()
    return {"success": True, "message": "Lista eliminada"}


@router.get("/user-playlists/{playlist_id}")
def get_playlist_detail(playlist_id: int, request: Request, db: Session = Depends(get_db)):
    payload = get_current_user(request)
    user = db.query(db_models.User).filter(db_models.User.username == payload.get("user")).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    playlist = db.query(db_models.UserPlaylist).filter(
        db_models.UserPlaylist.id == playlist_id,
        db_models.UserPlaylist.user_id == user.id,
    ).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Lista no encontrada")

    return {
        "id": playlist.id,
        "name": playlist.name,
        "description": playlist.description,
        "created_at": playlist.created_at.isoformat(),
        "updated_at": playlist.updated_at.isoformat(),
        "items": [
            {
                "id": item.id,
                "media_catalog_id": item.media_catalog_id,
                "title": item.media_item.title if item.media_item else "Unknown",
                "artist": item.media_item.artist if item.media_item else "Unknown",
                "type": item.media_item.type if item.media_item else None,
                "duration_seconds": item.media_item.duration_seconds if item.media_item else None,
                "album_art_path": item.media_item.album_art_path if item.media_item else None,
                "file_path": item.media_item.file_path if item.media_item else None,
                "genre": item.media_item.genre if item.media_item else None,
                "language": "es",
                "price_tokens": item.media_item.price_tokens if item.media_item else 1,
                "price_usd": float(item.media_item.price_usd) if item.media_item and item.media_item.price_usd else 0.99,
                "creator": item.media_item.creator if item.media_item else None,
                "creator_slug": item.media_item.creator_slug if item.media_item else None,
                "album": item.media_item.album if item.media_item else None,
                "lyrics_path": item.media_item.lyrics_path if item.media_item else None,
                "position": item.position,
                "added_at": item.added_at.isoformat(),
            }
            for item in sorted(playlist.items, key=lambda x: x.position)
        ],
    }


@router.post("/user-playlists/{playlist_id}/items")
def add_item_to_playlist(playlist_id: int, body: AddItemRequest, request: Request, db: Session = Depends(get_db)):
    payload = get_current_user(request)
    user = db.query(db_models.User).filter(db_models.User.username == payload.get("user")).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    playlist = db.query(db_models.UserPlaylist).filter(
        db_models.UserPlaylist.id == playlist_id,
        db_models.UserPlaylist.user_id == user.id,
    ).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Lista no encontrada")

    media = db.query(db_models.MediaCatalog).filter(db_models.MediaCatalog.id == body.media_catalog_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media no encontrado")

    existing_items = len(playlist.items)
    item = db_models.UserPlaylistItem(
        playlist_id=playlist.id,
        media_catalog_id=body.media_catalog_id,
        position=existing_items,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "success": True,
        "item": {
            "id": item.id,
            "media_catalog_id": item.media_catalog_id,
            "position": item.position,
            "added_at": item.added_at.isoformat(),
        }
    }


@router.delete("/user-playlists/{playlist_id}/items/{item_id}")
def remove_item_from_playlist(playlist_id: int, item_id: int, request: Request, db: Session = Depends(get_db)):
    payload = get_current_user(request)
    user = db.query(db_models.User).filter(db_models.User.username == payload.get("user")).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    playlist = db.query(db_models.UserPlaylist).filter(
        db_models.UserPlaylist.id == playlist_id,
        db_models.UserPlaylist.user_id == user.id,
    ).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Lista no encontrada")

    item = db.query(db_models.UserPlaylistItem).filter(
        db_models.UserPlaylistItem.id == item_id,
        db_models.UserPlaylistItem.playlist_id == playlist_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado en la lista")

    db.delete(item)
    db.commit()
    return {"success": True, "message": "Item eliminado de la lista"}
