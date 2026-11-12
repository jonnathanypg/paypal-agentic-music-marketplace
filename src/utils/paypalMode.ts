/**
 * PayPal demo-mode helpers.
 *
 * A judge can enable the isolated PayPal Sandbox flow with `?sandbox=1`.
 * The choice is persisted in localStorage so client-side navigation keeps
 * sandbox mode. Without the query param, production keeps using the live
 * PayPal app as before.
 */

const SANDBOX_STORAGE_KEY = "exito_sandbox_mode";

// Kept only as a safety fallback so a missing NEXT_PUBLIC_PAYPAL_CLIENT_ID
// does not break the existing production checkout. Sandbox never falls back
// to this value.
const LIVE_FALLBACK_CLIENT_ID =
  "AUYxLqb4aKaVxE9Rd4l7ZmsmOD3EwFzCm5_qj9esAgDlvqUutzP5aomnhRFbWFg4s5vnJ14IOvMeY6in";

export function peekSandboxMode(): boolean {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  const flag = params.get("sandbox");

  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;

  return window.localStorage.getItem(SANDBOX_STORAGE_KEY) === "1";
}

export function isSandboxMode(): boolean {
  if (typeof window === "undefined") return false;

  const active = peekSandboxMode();
  if (active) {
    window.localStorage.setItem(SANDBOX_STORAGE_KEY, "1");
  } else {
    window.localStorage.removeItem(SANDBOX_STORAGE_KEY);
  }
  return active;
}

export function getPayPalClientId(): string | null {
  if (isSandboxMode()) {
    return process.env.NEXT_PUBLIC_PAYPAL_SANDBOX_CLIENT_ID || null;
  }
  return process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || LIVE_FALLBACK_CLIENT_ID;
}

export function getPayPalSdkUrl(): string | null {
  const clientId = getPayPalClientId();
  if (!clientId) return null;
  return `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&disable-funding=credit`;
}

export function sandboxModePayload(): { sandbox_mode: boolean } {
  return { sandbox_mode: isSandboxMode() };
}

export function withSandboxQuery(url: string): string {
  if (!isSandboxMode()) return url;
  if (url.includes("sandbox=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}sandbox=1`;
}
