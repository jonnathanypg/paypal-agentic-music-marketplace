# -*- coding: utf-8 -*-
"""
PayPal Agentic Music Marketplace (Éxito.cyou Edition) — FastAPI Backend
=======================================================================
Mounts Auth, E-commerce (PayPal Orders v2), Artist Studio (PayPal Payouts v1,
85/15 Split Engine, Omnichannel WhatsApp QR & Telegram AI Agent) and Saori AI Chat.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import engine, Base
import db_models
from config import MEDIA_LIBRARY_DIR, UPLOADS_DIR
from routers import auth, ecommerce, tts_chat, user_playlist, artist_studio, covers

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="PayPal Agentic Music Marketplace API (Exito.cyou)",
    version="2.5.0",
    description="Direct-to-Fan AI Streaming, Cloud DJ & Agentic PayPal Marketplace for Independent Artists",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://exito.cyou", "https://www.exito.cyou", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,          prefix="/api/auth",          tags=["Auth"])
app.include_router(ecommerce.router,     prefix="/api/ecommerce",     tags=["PayPal Checkout & Catalog"])
app.include_router(artist_studio.router, prefix="/api/artist-studio", tags=["Artist Studio & PayPal Agentic Marketplace"])
app.include_router(tts_chat.router,      prefix="/api/tts",           tags=["Saori AI & Voice Agent"])
app.include_router(user_playlist.router, prefix="/api",               tags=["User Playlists"])
app.include_router(covers.router,        prefix="/api/covers",        tags=["Auto Covers"])

# Serve uploaded/marketplace media locally. In production nginx handles
# /media-static, but a self-hosted clone must serve it from the backend so the
# player and downloads work without any external MediaSuite deployment.
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
app.mount("/media-static", StaticFiles(directory=str(MEDIA_LIBRARY_DIR)), name="media-static")
