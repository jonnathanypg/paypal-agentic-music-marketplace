# -*- coding: utf-8 -*-
"""PayPal runtime credential resolver.

Allows the same deployment to serve the normal live checkout and an isolated
PayPal Sandbox demo mode (``sandbox_mode=True``) without restarting or
switching global environment variables.
"""

import os

SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com"
LIVE_API_BASE = "https://api-m.paypal.com"


def _clean(value: str) -> str:
    return (value or "").strip().strip('"').strip("'")


def get_paypal_runtime(sandbox: bool = False):
    """Return ``(client_id, client_secret, api_base, mode)``.

    ``sandbox=True`` uses the dedicated sandbox app credentials so judges can
    pay with a PayPal Sandbox buyer account. ``sandbox=False`` preserves the
    existing production behaviour (live by default in this deployment).
    """
    if sandbox:
        return (
            _clean(os.getenv("PAYPAL_SANDBOX_CLIENT_ID", "")),
            _clean(os.getenv("PAYPAL_SANDBOX_CLIENT_SECRET", "")),
            SANDBOX_API_BASE,
            "sandbox",
        )

    from config import PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE

    mode = _clean(PAYPAL_MODE) or "sandbox"
    return (
        _clean(PAYPAL_CLIENT_ID),
        _clean(PAYPAL_CLIENT_SECRET),
        LIVE_API_BASE if mode == "live" else SANDBOX_API_BASE,
        mode,
    )


def sandbox_is_configured() -> bool:
    return bool(
        _clean(os.getenv("PAYPAL_SANDBOX_CLIENT_ID", ""))
        and _clean(os.getenv("PAYPAL_SANDBOX_CLIENT_SECRET", ""))
    )
