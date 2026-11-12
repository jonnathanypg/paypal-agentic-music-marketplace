"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isSandboxMode, peekSandboxMode } from "@/utils/paypalMode";

const subscribe = (onStoreChange: () => void) => {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
};

const getSnapshot = () => peekSandboxMode();
const getServerSnapshot = () => false;

interface UserState {
  authenticated: boolean;
  user?: {
    username: string;
    role: string;
  };
}

/**
 * Shows a clear banner when the app is running the isolated PayPal Sandbox demo (`?sandbox=1`).
 * Incluye acceso directo / botón para Iniciar Sesión en Sandbox cuando no se está autenticado,
 * o Cerrar Sesión directamente cuando se está logueado como fan o artista demo.
 */
export default function SandboxBanner() {
  const router = useRouter();
  const active = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [userState, setUserState] = useState<UserState | null>(null);

  useEffect(() => {
    isSandboxMode();
    fetch("/api/ecommerce/me/info")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setUserState({
            authenticated: !!data.authenticated,
            user: data.user,
          });
        }
      })
      .catch(() => {});
  }, []);

  if (!active) return null;

  const exitHref =
    typeof window !== "undefined"
      ? `${window.location.pathname}?sandbox=0`
      : "/?sandbox=0";

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUserState({ authenticated: false });
      if (typeof window !== "undefined") {
        window.location.href = "/?sandbox=1";
      }
    } catch {
      router.push("/?sandbox=1");
    }
  };

  return (
    <div className="w-full bg-amber-400 text-black text-[11px] font-black tracking-wide px-3 py-1.5 flex items-center justify-between gap-2 shadow-md z-50 relative">
      <div className="flex items-center gap-2 truncate">
        <span className="w-2 h-2 rounded-full bg-black animate-pulse shrink-0" />
        <span className="truncate">PAYPAL SANDBOX DEMO — Sin cobros reales</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {userState?.authenticated ? (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-black/10 text-[10px] font-extrabold uppercase">
              {userState.user?.username || "Usuario"}
            </span>
            <button
              onClick={handleLogout}
              className="px-2.5 py-0.5 rounded-lg bg-black text-white hover:bg-neutral-800 transition-colors flex items-center gap-1 text-[10px] uppercase font-bold"
              title="Cerrar sesión demo"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Salir</span>
            </button>
          </div>
        ) : (
          <Link
            href="/login?sandbox=1"
            className="px-2.5 py-0.5 rounded-lg bg-black text-amber-300 hover:bg-neutral-800 transition-colors flex items-center gap-1 text-[10px] uppercase font-black tracking-wider shadow-sm"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            <span>Iniciar Sesión Sandbox</span>
          </Link>
        )}

        <span className="text-black/30">|</span>

        <a href={exitHref} className="underline underline-offset-2 whitespace-nowrap text-[10px] hover:text-neutral-900 transition-colors">
          Salir de sandbox
        </a>
      </div>
    </div>
  );
}
