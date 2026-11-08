# -*- coding: utf-8 -*-
"""
MediaSuite 2.0 — Utilidades de Autenticación y Criptografía
==========================================================
Provee funciones para hash seguro de contraseñas (SHA-256 + Salt)
y cifrado simétrico (AES/Fernet) para datos sensibles de compras (IAGS).
"""

import hashlib
import os
from cryptography.fernet import Fernet
from config import SECRET_KEY

# Asegurar una llave de 32 bytes para Fernet derivada de SECRET_KEY
# Usamos un hash SHA-256 de SECRET_KEY para obtener exactamente 32 bytes en formato base64
derived_key = hashlib.sha256(SECRET_KEY.encode()).digest()
import base64
FERNET_KEY = base64.urlsafe_b64encode(derived_key)
cipher = Fernet(FERNET_KEY)

def hash_password(password: str) -> str:
    """Genera un hash SHA-256 seguro con sal para almacenar contraseñas."""
    salt = os.urandom(16)
    db_val = salt + hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
    return db_val.hex()

def verify_password(password: str, hashed_password: str) -> bool:
    """Verifica si una contraseña coincide con el hash almacenado."""
    try:
        db_val = bytes.fromhex(hashed_password)
        salt = db_val[:16]
        key = db_val[16:]
        new_key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
        return new_key == key
    except Exception:
        return False

def encrypt_data(plain_text: str) -> str:
    """Cifra datos sensibles (blobs) antes de insertarlos en SQL (IAGS Compliance)."""
    if not plain_text:
        return ""
    return cipher.encrypt(plain_text.encode()).decode()

def decrypt_data(cipher_text: str) -> str:
    """Descifra datos sensibles extraídos de SQL."""
    if not cipher_text:
        return ""
    try:
        return cipher.decrypt(cipher_text.encode()).decode()
    except Exception:
        return "[ERROR: Decryption Failed]"
