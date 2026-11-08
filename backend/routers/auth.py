# -*- coding: utf-8 -*-
"""
Auth Router — Login JWT (DB + env fallback)
==========================================
Autenticación multinivel:
  1. Busca el usuario en la base de datos MySQL/SQLite
  2. Si no existe (primera instalación), usa credenciales del .env
"""

import datetime
import hashlib
import secrets
from fastapi import APIRouter, HTTPException, Response, Request, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
import jwt

from config import SECRET_KEY, MEDIASUITE_USER, MEDIASUITE_PASSWORD, JWT_ALGORITHM, JWT_EXPIRATION_DAYS
from database import get_db

router = APIRouter()

# ── Almacén en memoria para tokens de recuperación ──
# En producción, usar Redis
_reset_tokens: dict[str, dict] = {}


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    role: Optional[str] = None
    message: str = ""


def verify_token(token: str) -> Optional[dict]:
    """Verifica y decodifica un JWT token."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def get_current_user(request: Request) -> dict:
    token = request.cookies.get("mediasuite_session")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    return payload


def _issue_jwt(username: str, role: str) -> str:
    return jwt.encode(
        {
            "user": username,
            "role": role,
            "exp": datetime.datetime.utcnow() + datetime.timedelta(days=JWT_EXPIRATION_DAYS),
        },
        SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, response: Response):
    role = "super_admin"
    token = None
    try:
        from database import SessionLocal
        import db_models
        from auth_utils import verify_password

        db = SessionLocal()
        try:
            db_user = db.query(db_models.User).filter(
                (db_models.User.username == body.username) | (db_models.User.email == body.username)
            ).first()
            if db_user and verify_password(body.password, db_user.password_hash):
                role = db_user.role
                token = _issue_jwt(db_user.username, role)
            elif db_user:
                raise HTTPException(status_code=401, detail="Contraseña incorrecta")
        finally:
            db.close()
    except HTTPException:
        raise
    except Exception:
        pass

    if not token:
        if body.username == MEDIASUITE_USER and body.password == MEDIASUITE_PASSWORD:
            role = "super_admin"
            token = _issue_jwt(body.username, role)
        else:
            raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    response.set_cookie(
        "mediasuite_session", token,
        httponly=True, samesite="lax",
        max_age=JWT_EXPIRATION_DAYS * 24 * 3600,
    )
    return LoginResponse(success=True, token=token, role=role, message="Login exitoso")


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("mediasuite_session")
    return {"success": True, "message": "Sesión cerrada"}


@router.get("/me")
async def me(request: Request, db: Session = Depends(get_db)):
    """Devuelve el usuario actual, su rol y datos completos."""
    import db_models
    payload = get_current_user(request)
    user = db.query(db_models.User).filter(
        db_models.User.username == payload.get("user")
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    sub = None
    if user.subscriptions:
        s = user.subscriptions[0]
        sub = {"plan": s.plan_name, "tokens_per_month": s.tokens_per_month, "status": s.status, "period_end": s.current_period_end.isoformat() if s.current_period_end else None}
    return {
        "success": True,
        "user": user.username,
        "email": user.email,
        "role": user.role,
        "tokens_balance": user.tokens_balance,
        "subscription": sub,
        "id": user.id,
    }


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


@router.post("/register")
async def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    from auth_utils import hash_password
    import db_models

    exists = db.query(db_models.User).filter(
        (db_models.User.username == body.username) | (db_models.User.email == body.email)
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="El nombre de usuario o correo ya está registrado")

    new_user = db_models.User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        role="client",
        tokens_balance=5
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = _issue_jwt(new_user.username, new_user.role)
    response.set_cookie(
        "mediasuite_session", token,
        httponly=True, samesite="lax",
        max_age=JWT_EXPIRATION_DAYS * 24 * 3600,
    )
    return {"success": True, "user": new_user.username, "role": new_user.role, "tokens": new_user.tokens_balance}


# ══════════════════════════════════════════════════════════════
#  RECUPERACIÓN DE CONTRASEÑA
# ══════════════════════════════════════════════════════════════

class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Genera un token de recuperación para el email dado."""
    import db_models
    user = db.query(db_models.User).filter(db_models.User.email == body.email).first()
    if not user:
        return {"success": True, "message": "Si el correo existe, recibirás instrucciones"}
    reset_token = secrets.token_urlsafe(32)
    _reset_tokens[reset_token] = {
        "user_id": user.id,
        "expires": (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).timestamp(),
    }
    # En producción enviar email. Por ahora devolvemos el token para desarrollo
    return {"success": True, "reset_token": reset_token, "message": "Token generado correctamente"}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Resetea la contraseña usando un token válido."""
    from auth_utils import hash_password
    import db_models

    data = _reset_tokens.get(body.token)
    if not data:
        raise HTTPException(status_code=400, detail="Token inválido")
    if data["expires"] < datetime.datetime.utcnow().timestamp():
        _reset_tokens.pop(body.token, None)
        raise HTTPException(status_code=400, detail="Token expirado")

    user = db.query(db_models.User).filter(db_models.User.id == data["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    user.password_hash = hash_password(body.new_password)
    db.commit()
    _reset_tokens.pop(body.token, None)
    return {"success": True, "message": "Contraseña actualizada correctamente"}


# ══════════════════════════════════════════════════════════════
#  PERFIL DE USUARIO (para portal client)
# ══════════════════════════════════════════════════════════════

@router.get("/profile")
async def get_profile(request: Request, db: Session = Depends(get_db)):
    """Perfil completo del usuario autenticado."""
    payload = get_current_user(request)
    import db_models
    user = db.query(db_models.User).filter(
        db_models.User.username == payload.get("user")
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    purchases = db.query(db_models.Purchase).filter(
        db_models.Purchase.user_id == user.id
    ).order_by(db_models.Purchase.purchased_at.desc()).all()

    sub = None
    if user.subscriptions:
        s = user.subscriptions[0]
        sub = {
            "plan": s.plan_name,
            "tokens_per_month": s.tokens_per_month,
            "status": s.status,
            "period_end": s.current_period_end.isoformat() if s.current_period_end else None,
            "created_at": s.created_at.isoformat(),
        }

    return {
        "success": True,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "tokens_balance": user.tokens_balance,
            "created_at": user.created_at.isoformat(),
            "subscription": sub,
            "purchases": [
                {
                    "id": p.id,
                    "media_title": p.media_item.title if p.media_item else "Unknown",
                    "media_type": p.media_item.type if p.media_item else None,
                    "payment_method": p.payment_method,
                    "amount_paid": float(p.amount_paid),
                    "purchased_at": p.purchased_at.isoformat(),
                    "download_count": p.download_count,
                    "download_link": f"/api/ecommerce/download-link/{p.id}",
                }
                for p in purchases
            ],
            "purchases_count": len(purchases),
        }
    }


@router.patch("/profile")
async def update_profile(request: Request, db: Session = Depends(get_db)):
    """Actualizar perfil del usuario autenticado."""
    payload = get_current_user(request)
    import db_models
    user = db.query(db_models.User).filter(
        db_models.User.username == payload.get("user")
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    body = await request.json()
    from auth_utils import hash_password

    if "email" in body and body["email"]:
        existing = db.query(db_models.User).filter(
            db_models.User.email == body["email"],
            db_models.User.id != user.id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="El email ya está en uso")
        user.email = body["email"]

    if "username" in body and body["username"]:
        existing_username = db.query(db_models.User).filter(
            db_models.User.username == body["username"],
            db_models.User.id != user.id,
        ).first()
        if existing_username:
            raise HTTPException(status_code=400, detail="El nombre de usuario ya está en uso")
        user.username = body["username"]

    if "password" in body and body["password"]:
        user.password_hash = hash_password(body["password"])

    db.commit()
    return {"success": True, "message": "Perfil actualizado correctamente"}


