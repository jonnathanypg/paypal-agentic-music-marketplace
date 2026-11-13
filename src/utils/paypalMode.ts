/**
 * PayPal demo-mode helpers.
 *
 * A judge can enable the isolated PayPal Sandbox flow with `?sandbox=1`.
 * The choice is persisted in localStorage so client-side navigation keeps
 * sandbox mode. Without the query param, production keeps using the live
 * PayPal app as before.
 */

const SANDBOX_STORAGE_KEY = "exito_sandbox_mode";

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
  return process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || null;
}

/**
 * Local/judge demo checkout. Enabled only when the build explicitly sets
 * NEXT_PUBLIC_DEMO_CHECKOUT=1 (see .env.example) AND no PayPal Client ID is
 * configured for the active mode. As soon as real credentials are provided,
 * the real PayPal button takes precedence and this fallback disappears.
 */
export function demoCheckoutEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_CHECKOUT !== "1") return false;
  return !getPayPalClientId();
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
