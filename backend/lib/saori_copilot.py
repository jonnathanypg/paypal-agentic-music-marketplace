# -*- coding: utf-8 -*-
"""
Saori Copilot — contexto de cuenta, ubicación y datos verificados.

Objetivo:
- Dar a Saori memoria real de QUIÉN es el usuario (fan o artista autenticado).
- Saber EN QUÉ página / módulo / sección está para actuar como copiloto.
- Inyectar datos financieros y de audiencia verificados desde la base de datos,
  de modo que el agente nunca invente cifras.
- Mantener la plataforma estrictamente musical (sin audiolibros).
"""

from __future__ import annotations

import re
from typing import Any, Optional

MUSIC_TYPES = {"song", "album", "single", "instrumental", "beat", "podcast"}

ARTIST_SECTIONS = {
    "overview": "Estudio & Analítica",
    "catalog": "Mi Catálogo",
    "paypal": "PayPal Marketplace & Retiros",
    "agent": "Agente IA + WhatsApp & Telegram",
    "community": "Comunidad, Votaciones & Fans",
}


# ─────────────────────────────────────────────────────────────────────────────
#  Catálogo / plataforma
# ─────────────────────────────────────────────────────────────────────────────

def music_only(catalog: list[dict]) -> list[dict]:
    """La plataforma es exclusivamente musical: excluye audiolibros por completo."""
    return [item for item in (catalog or []) if (item or {}).get("type") != "audiobook"]


def mask_email(email: Optional[str]) -> str:
    email = (email or "").strip()
    if "@" not in email:
        return email
    name, domain = email.split("@", 1)
    if len(name) <= 2:
        return f"***@{domain}"
    return f"{name[:2]}***@{domain}"


def _money(value: Any) -> str:
    try:
        return f"{float(value or 0):,.2f}"
    except (TypeError, ValueError):
        return "0.00"


def _fmt_date(value: Any) -> str:
    try:
        return value.strftime("%Y-%m-%d")
    except Exception:
        text = str(value or "")
        return text[:10] if text else "sin fecha"


# ─────────────────────────────────────────────────────────────────────────────
#  Usuario autenticado (cookie mediasuite_session / Bearer)
# ─────────────────────────────────────────────────────────────────────────────

def resolve_optional_user(request, db):
    try:
        from routers.auth import verify_token
        import db_models

        token = request.cookies.get("mediasuite_session") if request is not None else None
        if not token and request is not None:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
        if not token:
            return None
        payload = verify_token(token)
        if not payload:
            return None
        return (
            db.query(db_models.User)
            .filter(db_models.User.username == payload.get("user"))
            .first()
        )
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
#  Construcción de contexto de cuenta
# ─────────────────────────────────────────────────────────────────────────────

def build_account_context(
    request,
    db,
    page_context: Optional[dict] = None,
    role_hint: Optional[str] = None,
) -> dict[str, Any]:
    """Devuelve un diccionario con rol, datos verificados y bloque para el prompt."""
    import db_models
    from sqlalchemy import func, or_

    page = page_context if isinstance(page_context, dict) else {}
    user = resolve_optional_user(request, db)

    ctx: dict[str, Any] = {
        "authenticated": bool(user),
        "role": "guest",
        "user_id": None,
        "name": "",
        "email": "",
        "is_artist": False,
        "artist": {},
        "fan": {},
        "page": page,
        "page_line": build_page_line(page),
        "prompt_block": "",
    }

    if not user:
        ctx["prompt_block"] = (
            "USUARIO: visitante no autenticado (modo fan). No tienes acceso a datos privados "
            "de ninguna cuenta. Si te piden ingresos, ventas, retiros o compras, invita a iniciar "
            "sesión en /login y ofrece abrir la sección correspondiente."
        )
        return ctx

    ctx["user_id"] = user.id
    ctx["name"] = user.username or ""
    ctx["email"] = user.email or ""
    ctx["user_role"] = user.role or "client"

    profile = (
        db.query(db_models.ArtistProfile)
        .filter(db_models.ArtistProfile.user_id == user.id)
        .first()
    )

    # ¿Es artista? Perfil con catálogo/ventas, o está dentro del Artist Studio.
    module = str(page.get("module") or "").lower()
    is_artist = False
    if profile is not None:
        try:
            has_sales = float(profile.lifetime_gross_sales_usd or 0) > 0
        except Exception:
            has_sales = False
        has_tracks = (
            db.query(db_models.MediaCatalog)
            .filter(
                or_(
                    db_models.MediaCatalog.creator_slug == profile.slug,
                    db_models.MediaCatalog.creator == profile.display_name,
                    db_models.MediaCatalog.artist == profile.display_name,
                )
            )
            .count()
            > 0
        )
        is_artist = (
            has_sales
            or has_tracks
            or module == "artist-studio"
            or str(role_hint or "").lower() == "artist"
            or user.role in ("super_admin", "tools_admin")
        )

    if is_artist and profile is not None:
        ctx["role"] = "artist"
        ctx["is_artist"] = True
        norm_slug = re.sub(r"[^a-z0-9]", "", (profile.slug or "").lower())
        norm_name = re.sub(r"[^a-z0-9]", "", (profile.display_name or "").lower())
        is_label = (
            user.role in ("super_admin", "tools_admin")
            or "billionairerecords" in norm_slug
            or "billionairerecords" in norm_name
        )
        artist = _artist_facts(db, profile, db_models, func, or_, is_label=is_label)
        ctx["artist"] = artist
        ctx["prompt_block"] = _artist_prompt_block(artist, ctx["page_line"])
    else:
        ctx["role"] = "fan"
        fan = _fan_facts(db, user, db_models, func)
        ctx["fan"] = fan
        ctx["prompt_block"] = _fan_prompt_block(fan, ctx["page_line"])

    return ctx


def _artist_facts(db, profile, db_models, func, or_, is_label: bool = False) -> dict[str, Any]:
    norm_slug = re.sub(r"[^a-z0-9]", "", (profile.slug or "").lower())
    norm_name = re.sub(r"[^a-z0-9]", "", (profile.display_name or "").lower())
    candidate_slugs = {profile.slug or "", norm_slug}
    candidate_names = {profile.display_name or ""}

    if is_label:
        track_filter = db_models.MediaCatalog.type != "audiobook"
    else:
        track_filter = or_(
            db_models.MediaCatalog.creator_slug.in_(list(candidate_slugs)),
            db_models.MediaCatalog.creator.in_(list(candidate_names)),
            db_models.MediaCatalog.artist.in_(list(candidate_names)),
        )

    tracks_count = db.query(db_models.MediaCatalog).filter(track_filter).count()
    streams = (
        db.query(func.coalesce(func.sum(db_models.MediaCatalog.play_count), 0))
        .filter(track_filter)
        .scalar()
        or 0
    )
    albums_count = (
        db.query(func.count(db_models.ArtistAlbum.id))
        .filter(db_models.ArtistAlbum.artist_profile_id == profile.id)
        .scalar()
        or 0
    )
    sales_count = (
        db.query(func.count(db_models.ArtistSaleLedger.id))
        .filter(db_models.ArtistSaleLedger.artist_profile_id == profile.id)
        .scalar()
        or 0
    )
    subscribers = (
        db.query(func.count(db_models.ArtistSubscriber.id))
        .filter(db_models.ArtistSubscriber.artist_profile_id == profile.id)
        .scalar()
        or 0
    )

    recent_sales = (
        db.query(db_models.ArtistSaleLedger, db_models.MediaCatalog.title)
        .outerjoin(
            db_models.MediaCatalog,
            db_models.ArtistSaleLedger.media_catalog_id == db_models.MediaCatalog.id,
        )
        .filter(db_models.ArtistSaleLedger.artist_profile_id == profile.id)
        .order_by(db_models.ArtistSaleLedger.id.desc())
        .limit(3)
        .all()
    )
    recent_payouts = (
        db.query(db_models.ArtistPayoutTransaction)
        .filter(db_models.ArtistPayoutTransaction.artist_profile_id == profile.id)
        .order_by(db_models.ArtistPayoutTransaction.id.desc())
        .limit(3)
        .all()
    )
    top_tracks = (
        db.query(db_models.MediaCatalog)
        .filter(track_filter)
        .order_by(db_models.MediaCatalog.play_count.desc())
        .limit(3)
        .all()
    )

    return {
        "slug": profile.slug,
        "display_name": profile.display_name,
        "public_url": f"/channel/{profile.slug}",
        "paypal_email": mask_email(profile.paypal_email),
        "paypal_verified": bool(profile.paypal_verified),
        "payout_mode": profile.payout_mode or "manual",
        "payout_threshold_usd": float(profile.payout_threshold_usd or 0),
        "fee_percent": float(profile.platform_fee_percent or 15),
        "available_balance_usd": float(profile.available_balance_usd or 0),
        "pending_balance_usd": float(profile.pending_balance_usd or 0),
        "lifetime_gross_usd": float(profile.lifetime_gross_sales_usd or 0),
        "lifetime_net_usd": float(profile.lifetime_net_earnings_usd or 0),
        "lifetime_fees_usd": float(profile.lifetime_platform_fees_usd or 0),
        "tracks_count": tracks_count,
        "albums_count": albums_count,
        "streams": int(streams or 0),
        "sales_count": int(sales_count or 0),
        "subscribers": int(subscribers or 0),
        "agent_enabled": bool(profile.agent_enabled),
        "whatsapp_connected": bool(profile.whatsapp_connected),
        "telegram_connected": bool(profile.telegram_connected),
        "recent_sales": [
            {
                "title": title or "Pista",
                "gross": float(row.gross_amount_usd or 0),
                "net": float(row.net_artist_amount_usd or 0),
                "date": _fmt_date(row.created_at),
            }
            for row, title in recent_sales
        ],
        "recent_payouts": [
            {
                "amount": float(po.amount_usd or 0),
                "status": po.status or "",
                "batch": po.paypal_payout_batch_id or "",
                "date": _fmt_date(po.created_at),
            }
            for po in recent_payouts
        ],
        "top_tracks": [
            {"title": t.title, "plays": int(t.play_count or 0)} for t in top_tracks
        ],
    }


def _fan_facts(db, user, db_models, func) -> dict[str, Any]:
    rows = (
        db.query(db_models.Purchase, db_models.MediaCatalog.title)
        .outerjoin(
            db_models.MediaCatalog,
            db_models.Purchase.media_catalog_id == db_models.MediaCatalog.id,
        )
        .filter(db_models.Purchase.user_id == user.id)
        .order_by(db_models.Purchase.purchased_at.desc())
        .limit(5)
        .all()
    )
    total = (
        db.query(
            func.coalesce(func.count(db_models.Purchase.id), 0),
            func.coalesce(func.sum(db_models.Purchase.amount_paid), 0),
            func.coalesce(func.sum(db_models.Purchase.download_count), 0),
        )
        .filter(db_models.Purchase.user_id == user.id)
        .one()
    )
    return {
        "purchases_count": int(total[0] or 0),
        "total_spent_usd": float(total[1] or 0),
        "downloads": int(total[2] or 0),
        "recent_purchases": [
            {
                "title": title or "Pista",
                "amount": float(row.amount_paid or 0),
                "date": _fmt_date(row.purchased_at),
            }
            for row, title in rows[:3]
        ],
        "tokens_balance": int(getattr(user, "tokens_balance", 0) or 0),
    }


# ─────────────────────────────────────────────────────────────────────────────
#  Bloques de prompt (datos verificados, sin invención)
# ─────────────────────────────────────────────────────────────────────────────

def _artist_prompt_block(artist: dict, page_line: str) -> str:
    sales_lines = (
        "\n".join(
            f"- {s['date']}: {s['title']} | bruto ${_money(s['gross'])} | neto artista ${_money(s['net'])}"
            for s in artist["recent_sales"]
        )
        or "- Sin ventas registradas todavía."
    )
    payout_lines = (
        "\n".join(
            f"- {p['date']}: ${_money(p['amount'])} | estado {p['status']} | lote {p['batch'] or 'N/A'}"
            for p in artist["recent_payouts"]
        )
        or "- Sin retiros registrados todavía."
    )
    top_lines = (
        "\n".join(f"- {t['title']} ({t['plays']} reproducciones)" for t in artist["top_tracks"])
        or "- Sin datos de reproducción."
    )
    return (
        "ROL DEL USUARIO: ARTISTA AUTENTICADO (dueño de este panel).\n"
        f"{page_line}\n"
        "DATOS VERIFICADOS DE SU CUENTA (úsalos tal cual; nunca inventes cifras):\n"
        f"- Nombre artístico: {artist['display_name']} (slug: {artist['slug']}).\n"
        f"- Saldo disponible para retirar: ${_money(artist['available_balance_usd'])} USD.\n"
        f"- Saldo pendiente: ${_money(artist['pending_balance_usd'])} USD.\n"
        f"- Ventas históricas: ${_money(artist['lifetime_gross_usd'])} brutos, "
        f"${_money(artist['lifetime_net_usd'])} netos, ${_money(artist['lifetime_fees_usd'])} de comisión "
        f"({artist['fee_percent']:.0f}% plataforma).\n"
        f"- Catálogo: {artist['tracks_count']} canciones y {artist['albums_count']} álbumes; "
        f"{artist['streams']} reproducciones acumuladas.\n"
        f"- Ventas registradas: {artist['sales_count']}. Suscriptores: {artist['subscribers']}.\n"
        f"- Modo de retiro: {artist['payout_mode']} | umbral ${_money(artist['payout_threshold_usd'])} | "
        f"PayPal verificado: {'sí' if artist['paypal_verified'] else 'no'} ({artist['paypal_email']}).\n"
        f"- Agente IA: {'activo' if artist['agent_enabled'] else 'inactivo'} | "
        f"WhatsApp {'conectado' if artist['whatsapp_connected'] else 'no conectado'} | "
        f"Telegram {'conectado' if artist['telegram_connected'] else 'no conectado'}.\n"
        "ÚLTIMAS VENTAS:\n"
        f"{sales_lines}\n"
        "ÚLTIMOS RETIROS:\n"
        f"{payout_lines}\n"
        "TOP CANCIONES:\n"
        f"{top_lines}\n"
        "Puedes ayudar al artista a gestionar su cuenta, ingresos, retiros, catálogo, audiencia y agente. "
        "Si pide una acción, además de explicarla, abre la sección correcta con la acción navigate.\n"
    )


def _fan_prompt_block(fan: dict, page_line: str) -> str:
    purchases = (
        "\n".join(
            f"- {p['date']}: {p['title']} | ${_money(p['amount'])}" for p in fan["recent_purchases"]
        )
        or "- Sin compras registradas todavía."
    )
    return (
        "ROL DEL USUARIO: FAN AUTENTICADO.\n"
        f"{page_line}\n"
        "DATOS VERIFICADOS DE SU CUENTA (úsalos tal cual; nunca inventes cifras):\n"
        f"- Compras: {fan['purchases_count']} | Total gastado ${_money(fan['total_spent_usd'])} USD | "
        f"Descargas: {fan['downloads']} | Tokens IA: {fan['tokens_balance']}.\n"
        "ÚLTIMAS COMPRAS:\n"
        f"{purchases}\n"
        "Ayuda al fan con su experiencia de escucha, recomendaciones, compras, descargas y biblioteca. "
        "Puedes abrir su portal en /portal con la acción navigate.\n"
    )


def build_page_line(page: dict) -> str:
    module = str(page.get("module") or "").strip()
    section = str(page.get("section") or "").strip()
    path = str(page.get("path") or "").strip()
    title = str(page.get("title") or "").strip()

    labels = {
        "home": "Inicio / Descubrimiento musical",
        "artist-studio": "Artist Studio & PayPal Marketplace",
        "portal": "Portal del Fan (biblioteca y compras)",
        "channel": "Canal público de artista",
        "login": "Inicio de sesión",
        "shop": "Tienda",
    }
    module_label = labels.get(module, module or "plataforma")
    section_label = ARTIST_SECTIONS.get(section, section)
    parts = [f"UBICACIÓN ACTUAL DEL USUARIO: módulo {module_label}"]
    if section_label:
        parts.append(f"sección {section_label}")
    if title and title not in (module_label, section_label):
        parts.append(f"contexto {title}")
    if path:
        parts.append(f"ruta {path}")
    return ", ".join(parts) + "."


# ─────────────────────────────────────────────────────────────────────────────
#  Respuestas deterministas (análisis de cuenta)
# ─────────────────────────────────────────────────────────────────────────────

def artist_analysis_text(artist: dict) -> str:
    last_sale = artist["recent_sales"][0] if artist["recent_sales"] else None
    last_payout = artist["recent_payouts"][0] if artist["recent_payouts"] else None
    top = artist["top_tracks"][0] if artist["top_tracks"] else None

    lines = [
        f"Este es el estado real de tu cuenta de artista ({artist['display_name']}):",
        f"• Saldo disponible para retirar: ${_money(artist['available_balance_usd'])} USD.",
        f"• Ingresos históricos: ${_money(artist['lifetime_gross_usd'])} brutos, "
        f"${_money(artist['lifetime_net_usd'])} netos para ti y "
        f"${_money(artist['lifetime_fees_usd'])} de comisión de plataforma ({artist['fee_percent']:.0f}%).",
        f"• Catálogo: {artist['tracks_count']} canciones, {artist['albums_count']} álbumes y "
        f"{artist['streams']} reproducciones acumuladas.",
        f"• Ventas registradas: {artist['sales_count']}. Suscriptores: {artist['subscribers']}.",
        f"• Modo de retiro: {artist['payout_mode']}, umbral ${_money(artist['payout_threshold_usd'])} USD, "
        f"PayPal {'verificado' if artist['paypal_verified'] else 'sin verificar'}.",
    ]
    if last_sale:
        lines.append(
            f"• Última venta: {last_sale['title']} el {last_sale['date']} "
            f"(${_money(last_sale['gross'])} brutos, ${_money(last_sale['net'])} netos)."
        )
    if last_payout:
        lines.append(
            f"• Último retiro: ${_money(last_payout['amount'])} USD el {last_payout['date']} "
            f"({last_payout['status']})."
        )
    if top:
        lines.append(
            f"• Tu canción con más reproducciones es {top['title']} con {top['plays']} reproducciones."
        )

    recommendations = []
    if artist["available_balance_usd"] >= max(artist["payout_threshold_usd"], 0.01):
        recommendations.append(
            "puedes retirar tu saldo ahora desde la sección PayPal Marketplace"
        )
    if artist["subscribers"] == 0:
        recommendations.append(
            "aún no tienes suscriptores: publica una votación o un aviso en la sección Comunidad"
        )
    if not artist["whatsapp_connected"]:
        recommendations.append(
            "conecta tu WhatsApp en la sección Agente IA para vender por chat"
        )
    if recommendations:
        lines.append("Siguiente paso recomendado: " + "; ".join(recommendations) + ".")
    return "\n".join(lines)


def fan_analysis_text(fan: dict) -> str:
    lines = [
        "Este es el resumen real de tu cuenta:",
        f"• Compras realizadas: {fan['purchases_count']} por ${_money(fan['total_spent_usd'])} USD.",
        f"• Descargas disponibles: {fan['downloads']}. Tokens IA: {fan['tokens_balance']}.",
    ]
    if fan["recent_purchases"]:
        lines.append(
            "• Tu compra más reciente: "
            f"{fan['recent_purchases'][0]['title']} ({fan['recent_purchases'][0]['date']})."
        )
    else:
        lines.append("• Todavía no has comprado ninguna pista; puedo recomendarte una según tu gusto.")
    lines.append("Puedes abrir tu portal para ver tus compras, descargas y biblioteca.")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
#  Intenciones de cuenta / navegación
# ─────────────────────────────────────────────────────────────────────────────

def detect_navigation_intent(message: str, role: str) -> Optional[dict[str, str]]:
    """Detecta órdenes de navegación (copiloto) y devuelve path/section."""
    text = (message or "").lower()
    artist = role == "artist"

    wants_nav = any(
        k in text
        for k in [
            "abre", "abrir", "ve a", "ir a", "llévame", "llevame", "muéstrame",
            "muestrame", "llévame", "pantalla", "sección", "seccion", "panel",
            "estudio", "portal", "inicio", "explorar", "sandbox", "modo demo",
        ]
    )
    if not wants_nav:
        return None

    if artist:
        if any(k in text for k in ["retiro", "retirar", "payout", "cobrar", "pago", "paypal", "balance", "saldo", "ingreso", "ganancia", "venta"]):
            return {"path": "/artist-studio", "section": "paypal"}
        if any(k in text for k in ["catálogo", "catalogo", "canción", "cancion", "álbum", "album", "subir", "track", "mi música", "mi musica"]):
            return {"path": "/artist-studio", "section": "catalog"}
        if any(k in text for k in ["audiencia", "suscriptor", "fan", "comunidad", "votación", "votacion", "encuesta", "notificación", "notificacion"]):
            return {"path": "/artist-studio", "section": "community"}
        if any(k in text for k in ["agente", "whatsapp", "telegram", "qr", "rag", "persona"]):
            return {"path": "/artist-studio", "section": "agent"}
        if any(k in text for k in ["analítica", "analitica", "estadística", "estadistica", "métrica", "metrica", "resumen", "estudio", "panel"]):
            return {"path": "/artist-studio", "section": "overview"}
        if any(k in text for k in ["canal público", "canal publico", "mi página", "mi pagina", "mi perfil"]):
            return {"path": "", "section": ""}  # lo resuelve el llamador con el slug

    if any(k in text for k in ["mis compras", "descarga", "biblioteca", "portal", "mis playlists", "mis listas"]):
        return {"path": "/portal", "section": ""}
    if any(k in text for k in ["sandbox", "modo demo", "jurado"]):
        return {"path": "/?sandbox=1", "section": ""}
    if any(k in text for k in ["inicio", "explorar", "descubrir", "catálogo", "catalogo", "tienda"]):
        return {"path": "/", "section": ""}
    return None


def wants_account_analysis(message: str) -> bool:
    text = (message or "").lower()
    account_terms = [
        "mi cuenta", "mis ingresos", "mis ganancias", "mis ventas", "mi balance",
        "mi saldo", "mis retiros", "mis pagos", "mi audiencia", "mis suscriptores",
        "mis estadísticas", "mis estadisticas", "mi análisis", "mi analisis",
        "cómo va mi", "como va mi", "resumen de mi", "mi negocio", "mi catálogo",
        "mi catalogo", "mis canciones", "mis compras", "mis descargas",
    ]
    analysis_terms = ["analiza", "análisis", "analisis", "resumen", "cómo va", "como va", "dame un", "muéstrame", "muestrame", "estado de"]
    return any(t in text for t in account_terms) and any(t in text for t in analysis_terms)


def account_section_for(message: str, role: str) -> dict[str, str]:
    return detect_navigation_intent(message, role) or (
        {"path": "/artist-studio", "section": "overview"}
        if role == "artist"
        else {"path": "/portal", "section": ""}
    )
