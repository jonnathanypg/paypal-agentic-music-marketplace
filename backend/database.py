# -*- coding: utf-8 -*-
"""
MediaSuite 2.0 — Módulo de Base de Datos
========================================
Soporte para MySQL/MariaDB (vía PyMySQL) y fallback automático a SQLite
para garantizar la resiliencia en entornos locales o de test.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pathlib import Path

# Importar desde config central (única fuente de verdad — IAGS)
from config import DATABASE_URL


# Configuración del motor de base de datos
db_url = DATABASE_URL
if not db_url or not db_url.strip():
    db_url = f"sqlite:///{Path(__file__).resolve().parent.parent / 'mediasuite.db'}"

if db_url.startswith("sqlite"):
    # SQLite requiere flags especiales para hilos paralelos en FastAPI
    engine = create_engine(
        db_url, connect_args={"check_same_thread": False}
    )
else:
    # Configuración de connection pool para MySQL remoto (ej: Hostinger)
    # - pool_recycle=280: reciclar conexiones cada ~4.5 min (antes del timeout del servidor ~600s)
    # - pool_pre_ping=True: verificar conexión antes de usarla
    # - pool_timeout=30: esperar max 30s por una conexión disponible
    # - connect_args ssl_disabled=True: evitar SSLEOFError en servidores con SSL inestable
    engine = create_engine(
        DATABASE_URL,
        pool_size=5,
        max_overflow=10,
        pool_recycle=280,
        pool_pre_ping=True,
        pool_timeout=30,
        connect_args={
            "ssl_disabled": True,
            "connect_timeout": 10,
        }
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """Dependency para inyectar la sesión de base de datos en los endpoints de FastAPI."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
