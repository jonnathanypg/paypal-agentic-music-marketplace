"use client";
// NOTE: The MediaSuite production Sidebar is intentionally NOT rendered in this
// marketplace build (exito.cyou). The Sidebar import below is kept only as a
// dead import to avoid breaking tree-shaking. It MUST NOT be rendered on any
// route — not on /artist-studio, /portal, /channel/*, sandbox or live mode.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Sidebar } from "@/components/sidebar";
import dynamic from "next/dynamic";
import { PlayerProvider, usePlayer } from "@/contexts/PlayerContext";
import { Toaster } from "react-hot-toast";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

// Carga diferida para sacar lottie-web (~314KB) del bundle inicial crítico
const StreamPlayer = dynamic(() => import("@/components/StreamPlayer"), { ssr: false });
const AIChatSidebar = dynamic(() => import("@/components/AIChatSidebar"), { ssr: false });
import { DJProvider } from "@/contexts/DJContext";



// Carga diferida del sidebar del Agente de Producción (solo admin/productores)
const ProducerChatSidebar = dynamic(
  () => import("@/components/ProducerChatSidebar"),
  { ssr: false }
);

import SandboxBanner from "@/components/SandboxBanner";

// Rutas del dashboard de productores (donde debe aparecer el agente Director)
const PRODUCER_DASHBOARD_PATHS = [
  '/studio',
  '/shorts',
  '/audiobooks',
  '/playlist',
  '/animation',
  '/media',
  '/tasks',
  '/pexels',
  '/projects',
  '/dashboard',
  '/schedules',
  '/stream',
  '/live',
];

function isDevPath(pathname: string | null): boolean {
  return !!pathname && (pathname === '/dev' || pathname.startsWith('/dev/'));
}

function isProducerPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname.startsWith('/live/join')) return false;
  return PRODUCER_DASHBOARD_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

function LayoutPlayer() {
  const { currentTrack, playlist, chatOpen, adminMode, checkoutHandler, addToPlaylistHandler, play, showPlaylistView, setShowPlaylistView } = usePlayer();
  const pathname = usePathname();

  // No renderizar el reproductor si estamos en las rutas de productor
  if (isProducerPath(pathname)) {
    return null;
  }

  return (
    <StreamPlayer
      track={currentTrack}
      playlist={playlist}
      onTrackChange={play}
      onCheckout={(track) => checkoutHandler?.(track)}
      onAddToPlaylist={(track) => addToPlaylistHandler?.(track)}
      isChatOpen={chatOpen}
      isAdmin={adminMode}
      showPlaylistView={showPlaylistView}
      onClosePlaylistView={() => setShowPlaylistView(false)}
    />
  );
}

function LayoutChatSidebar() {
  const { currentTrack, chatOpen, setChatOpen, catalog, filterHandler, checkoutHandler, creatorContext, play } = usePlayer();
  const pathname = usePathname();
  
  // No renderizar el chat de Saori (cliente) si estamos en las rutas de productor
  if (isProducerPath(pathname)) {
    return null;
  }

  return (
    <AIChatSidebar
      catalog={catalog}
      onPlay={play}
      onFilter={(type) => filterHandler?.(type)}
      onCheckout={(track) => checkoutHandler?.(track)}
      currentTrack={currentTrack}
      isOpen={chatOpen}
      onToggle={() => setChatOpen(!chatOpen)}
      hasActivePlayer={!!currentTrack}
      creatorContext={creatorContext}
    />
  );
}

/**
 * ProducerSidebarController — Controla el agente de producción "Director"
 * Solo aparece en rutas del dashboard de productores/administradores.
 * Detecta automáticamente si el usuario es admin leyendo la cookie JWT
 * y solo muestra el sidebar cuando corresponde.
 */
function ProducerSidebarController({ pathname }: { pathname: string | null }) {
  const [isProducerOpen, setIsProducerOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Detectar si el usuario tiene rol admin leyendo la cookie/sessionStorage
    const checkRole = async () => {
      try {
        const sessionRole = sessionStorage.getItem("mediasuite_role");
        if (sessionRole === "super_admin" || sessionRole === "tools_admin") {
          setIsAdmin(true);
          return;
        }

        // Hacer fetch al endpoint si no está en sessionStorage (ej. primer renderizado)
        const res = await fetch("/api/ecommerce/me/info");
        if (res.ok) {
          const data = await res.json();
          if (data?.authenticated && data?.user) {
            const role = data.user.role;
            if (role === "super_admin" || role === "tools_admin") {
              setIsAdmin(true);
              sessionStorage.setItem("mediasuite_role", role);
              return;
            }
          }
        }

        // Fallback: intentar decodificar la cookie JWT del lado del cliente
        const cookies = document.cookie.split(";");
        const sessionCookie = cookies.find((c) => c.trim().startsWith("mediasuite_session="));
        if (sessionCookie) {
          const token = sessionCookie.split("=")[1]?.trim();
          if (token) {
            const parts = token.split(".");
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1]));
              const role = payload?.role || "";
              if (role === "super_admin" || role === "tools_admin") {
                setIsAdmin(true);
                sessionStorage.setItem("mediasuite_role", role);
              }
            }
          }
        }
      } catch {}
    };

    checkRole();
  }, [pathname]);

  useEffect(() => {
    const handleToggle = () => {
      setIsProducerOpen((o) => !o);
    };
    window.addEventListener("producer:toggle_chat", handleToggle);
    return () => window.removeEventListener("producer:toggle_chat", handleToggle);
  }, []);

  if (!isAdmin || !isProducerPath(pathname)) {
    return null;
  }

  return (
    <ProducerChatSidebar
      isOpen={isProducerOpen}
      onToggle={() => setIsProducerOpen((o) => !o)}
      currentPath={pathname || undefined}
    />
  );
}

function LayoutShell({ children }: { children: React.ReactNode }) {
  const { currentTrack } = usePlayer();
  const pathname = usePathname();
  // isSidebarOpen kept for future use; sidebar is disabled in this marketplace build
  const [isSidebarOpen] = useState(false);

  // The MediaSuite production Sidebar NEVER renders in this marketplace build (exito.cyou).
  // Artist Studio (/artist-studio) and Fan Portal (/portal) have their own self-contained
  // headers — no production sidebar should ever appear or flash on those routes.

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then((reg) => console.log("Service Worker registered successfully:", reg.scope))
        .catch((err) => console.error("Service worker registration failed:", err));
    }
  }, []);

  useEffect(() => {
    const prev = sessionStorage.getItem('current_path');
    if (prev && prev !== pathname) {
      sessionStorage.setItem('previous_path', prev);
    }
    sessionStorage.setItem('current_path', pathname || "");
  }, [pathname]);

  const playerPadding = currentTrack ? "pb-[88px]" : "";

  return (
    <>
      {/* No sidebar in this build — marketplace runs fully self-contained */}
      <div className={`bg-[#0a0a1a] text-[#f0f0f5] min-h-screen ${playerPadding}`}>
        <SandboxBanner />
        {children}
      </div>
      {/* Producer Agent Sidebar — only visible for super_admin/tools_admin on producer paths */}
      <ProducerSidebarController pathname={pathname} />
    </>
  );
}

export function LayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDev = isDevPath(pathname);
  const isJoinGuest = !!pathname && pathname.startsWith('/live/join');

  if (isDev || isJoinGuest) {
    return (
      <>
        {children}
        <Toaster position="bottom-right" />
      </>
    );
  }
  return (
    <PlayerProvider>
      <DJProvider>
        <LayoutShell>{children}</LayoutShell>
        <LayoutPlayer />
        <LayoutChatSidebar />
        <Toaster position="bottom-right" />
      </DJProvider>
    </PlayerProvider>
  );
}


