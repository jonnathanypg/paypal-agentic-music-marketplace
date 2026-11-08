"use client";

/**
 * page.tsx — Portal Público de Streaming WEBLIFETECH MEDIA
 * ====================================================================
 * Vista principal del usuario final: tipo SoundCloud + Spotify moderno.
 * - Catálogo de canciones, álbumes, audiolibros y podcasts
 * - Secciones por creador con sus álbumes y canciones
 * - Reproductor de fondo persistente (StreamPlayer)
 * - Sidebar lateral derecho retráctil con Chat Agéntico
 * - Modal de compra anónima / con cuenta
 * - Filtros por tipo y búsqueda en tiempo real
 * - Todos los iconos en SVG (sin emojis)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/contexts/PlayerContext";
import { getUserRecommendations } from "@/utils/recommender";
import type { Track } from "@/components/StreamPlayer";
import { prefetchTrack } from "@/utils/prefetch";
import dynamic from "next/dynamic";
import Image from "next/image";
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });
import musicLoadingAnimation from "../../public/lotties/music-loading.json";
import navigationAnimation from "../../public/lotties/Navegation-Creator-music.json";
import ExitoLogo, { ExitoLogoIcon } from "@/components/ExitoLogo";


// ─── Tipos ────────────────────────────────────────────────────────────────
interface UserInfo {
  authenticated: boolean;
  user?: {
    username: string;
    email: string;
    role: string;
    tokens_balance: number;
  };
  subscription?: {
    plan: string;
    tokens_per_month: number;
    period_end: string;
  };
}

type FilterType = "all" | "song" | "album" | "audiobook" | "video";

// ─── SVG Icons ─────────────────────────────────────────────────────────────
const IconSearch = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
  </svg>
);

const IconMusicNote = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
  </svg>
);

const IconAlbum = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
  </svg>
);

const IconBook = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z" />
  </svg>
);

const IconVideo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
  </svg>
);

const IconHeadphones = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z" />
  </svg>
);

const IconPlay = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const IconPause = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const IconDownload = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
  </svg>
);

const IconToken = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
  </svg>
);

const IconClose = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const IconCheck = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

const IconChevronRight = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
  </svg>
);

const IconLock = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
  </svg>
);

const IconCreditCard = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
  </svg>
);

const IconGift = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 6h-2.18c.07-.23.18-.45.18-.7 0-1.84-1.34-3.3-3-3.3-1.02 0-1.96.53-2.5 1.35l-.5.67-.5-.68C10.96 2.53 10.02 2 9 2 7.34 2 6 3.46 6 5.3c0 .25.11.47.18.7H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z" />
  </svg>
);

const IconUser = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

const IconStar = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="m12 17.27 4.15 2.51c.76.46 1.69-.22 1.49-1.08l-1.1-4.72 3.67-3.18c.67-.58.31-1.68-.57-1.75l-4.83-.41-1.89-4.46c-.34-.81-1.5-.81-1.84 0L9.19 8.63l-4.83.41c-.88.07-1.24 1.17-.57 1.75l3.67 3.18-1.1 4.72c-.2.86.73 1.54 1.49 1.08L12 17.27z" />
  </svg>
);

// Creator-specific icons
const IconMicrophone = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
  </svg>
);

const IconLibrary = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-9 3h2v8h-2V5zm0 10h2v2h-2v-2z" />
  </svg>
);

const IconGlobe = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z" />
  </svg>
);

const IconSparkle = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1 9.19 8.63 1.74 9.27l5.46 4.73-1.64 7.27L12 17.77l6.44 3.5-1.64-7.27 5.46-4.73-7.45-.64z" />
  </svg>
);

const IconBrain = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M13 3c-4.42 0-8 3.58-8 8 0 3.11 1.78 5.82 4.38 7.21L9 21h6l-.38-2.79C17.22 16.82 19 14.11 19 11c0-4.42-3.58-8-8-8zm-1 14h2v2h-2v-2zm2-3.88V15h-2v-1.88C9.6 12.62 8 11.43 8 10h2c0 .55.44 1 1 1s1-.45 1-1c0-1.38-3-1.5-3-4C9 4.65 10.47 3.35 12 3.13 13.53 3.35 15 4.65 15 6c0 2.5-3 2.62-3 4 0 .55.45 1 1 1s1-.45 1-1h2c0 1.43-1.6 2.62-3 3.12z" />
  </svg>
);

const IconWings = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 12l-1.41-1.41L13 17.17V4h-2v13.17L4.41 10.59 3 12l9 9z" />
  </svg>
);

// ─── Helper ────────────────────────────────────────────────────────────────
function getArtUrl(path?: string): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (path.includes("media_library/")) {
    return path.replace(/.*media_library\//, "/media-static/");
  }
  return path;
}

// ─── PayPal Button Wrapper (Real SDK integration) ───────────────────────────
interface PayPalButtonWrapperProps {
  checkoutItem: Track;
  guestEmail: string;
  guestUsername: string;
  guestPassword: string;
  autoRegister: boolean;
  isAuthenticated: boolean;
  onSuccess: (data: any) => void;
  setProcessing: (b: boolean) => void;
  processing: boolean;
  fundingType: "paypal" | "card";
  checkoutPlan?: string | null;
}

function PayPalButtonWrapper({
  checkoutItem,
  guestEmail,
  guestUsername,
  guestPassword,
  autoRegister,
  isAuthenticated,
  onSuccess,
  setProcessing,
  processing,
  fundingType,
  checkoutPlan,
}: PayPalButtonWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const renderPayPal = () => {
      const win = window as any;
      if (!win.paypal || !containerRef.current) return false;

      containerRef.current.innerHTML = "";

      try {
        win.paypal.Buttons({
          fundingSource: fundingType === "paypal" ? win.paypal.FUNDING.PAYPAL : win.paypal.FUNDING.CARD,
          style: {
            layout: "horizontal",
            color: fundingType === "paypal" ? "gold" : "black",
            shape: "rect",
            tagline: false,
            height: 48
          },
          onClick: (data: any, actions: any) => {
            if (!isAuthenticated && !guestEmail.includes("@")) {
              alert("Por favor ingrese un correo electrónico válido para facturar antes de proceder al pago.");
              return actions.reject();
            }
            return actions.resolve();
          },
        createOrder: async () => {
          setProcessing(true);
          try {
            const orderEndpoint = checkoutPlan
              ? "/api/ecommerce/paypal/create-subscription-order"
              : "/api/ecommerce/paypal/create-order";
            const orderBody = checkoutPlan
              ? { plan_name: checkoutPlan, payment_method: "paypal" }
              : {
                  media_catalog_id: checkoutItem.id,
                  payment_method: "paypal",
                  guest_email: !isAuthenticated ? guestEmail : undefined,
                  guest_username: guestUsername || undefined,
                  guest_password: guestPassword || undefined,
                  auto_register: autoRegister && !isAuthenticated
                };
            const res = await fetch(orderEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(orderBody)
            });
            const data = await res.json();
            if (res.ok && data.order_id) {
              return data.order_id;
            } else {
              alert(`Error de PayPal: ${data.detail || "No se pudo iniciar la orden"}`);
              setProcessing(false);
              throw new Error(data.detail);
            }
          } catch (e) {
            setProcessing(false);
            throw e;
          }
        },
        onApprove: async (data: any, actions: any) => {
          // Capturar pago en backend
          try {
            const res = await fetch("/api/ecommerce/purchase", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                media_catalog_id: checkoutItem.id,
                payment_method: "paypal",
                guest_email: !isAuthenticated ? guestEmail : undefined,
                guest_username: guestUsername || guestEmail.split("@")[0],
                guest_password: guestPassword || undefined,
                auto_register: autoRegister && !isAuthenticated,
                order_id: data.orderID // Pasamos la orden aprobada para capturar
              })
            });
            const result = await res.json();
            if (res.ok && result.success) {
              onSuccess(result);
            } else {
              alert(`Fallo al capturar pago: ${result.detail || "Intente de nuevo"}`);
            }
          } catch {
            alert("Error de conexión al confirmar pago");
          } finally {
            setProcessing(false);
          }
        },
        onCancel: () => {
          setProcessing(false);
        },
        onError: (err: any) => {
          console.error("PayPal Error:", err);
          setProcessing(false);
        }
      }).render(containerRef.current).catch((e: any) => console.error(e));
      return true;
    } catch (e) {
      console.error("Failed to render PayPal Buttons:", e);
      return false;
    }
    };

    if (!renderPayPal()) {
      intervalId = setInterval(() => {
        if (renderPayPal()) clearInterval(intervalId);
      }, 500);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [checkoutItem.id, guestEmail, guestUsername, guestPassword, autoRegister, isAuthenticated, fundingType, checkoutPlan]);

  return <div ref={containerRef} />;
}

const TYPE_LABELS: Record<string, string> = {
  all: "Todo",
  song: "Canciones",
  album: "Álbumes",
  audiobook: "Audiolibros",
  video: "Videos",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  all: <IconHeadphones size={14} />,
  song: <IconMusicNote size={14} />,
  album: <IconAlbum size={14} />,
  audiobook: <IconBook size={14} />,
  video: <IconVideo size={14} />,
};

const CREATORS_METADATA = [
  { 
    id: "all", 
    slug: null as string | null,
    name: "Todos los Creadores", 
    nameEn: "All Creators", 
    icon: <IconHeadphones size={22} />, 
    desc: "Todo el catálogo", 
    color: "from-white/10 to-white/5",
    accent: "#a78bfa"
  },
  { 
    id: "Billionaire SoundTrack",
    slug: "billionairesoundtrack",
    name: "Billionaire SoundTrack", 
    nameEn: "Billionaire SoundTrack", 
    icon: <IconMicrophone size={22} />, 
    desc: "Música en Español", 
    color: "from-yellow-500/20 to-amber-600/10",
    accent: "#f59e0b"
  },
  { 
    id: "Billionaires Playlist",
    slug: "billionairesplaylist",
    name: "Billionaires Playlist", 
    nameEn: "Billionaires Playlist", 
    icon: <IconGlobe size={22} />, 
    desc: "Music in English", 
    color: "from-blue-500/20 to-indigo-600/10",
    accent: "#06b6d4"
  },
  { 
    id: "Audiolibros de Metafísica",
    slug: "audiolibrosmetafisica",
    name: "Audiolibros de Metafísica", 
    nameEn: "Metaphysics Audio", 
    icon: <IconSparkle size={22} />, 
    desc: "Leyes y atracción", 
    color: "from-purple-500/20 to-pink-600/10",
    accent: "#a78bfa"
  },
  { 
    id: "Mentalidad HBL",
    slug: "mentalidadhbl",
    name: "Mentalidad HBL", 
    nameEn: "HBL Mindset", 
    icon: <IconBrain size={22} />, 
    desc: "Lecciones Salazar", 
    color: "from-emerald-500/20 to-teal-600/10",
    accent: "#10b981"
  },
  { 
    id: "Efecto Metamorfosis",
    slug: "efectometamorfosis",
    name: "Efecto Metamorfosis", 
    nameEn: "Metamorphosis Effect", 
    icon: <IconWings size={22} />, 
    desc: "Reportajes premium", 
    color: "from-rose-500/20 to-red-600/10",
    accent: "#f43f5e"
  },
];

// ─── Helpers para Shuffling y Caching ──────────────────────────────────────
function formatStreams(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getAudioUrl(t: Track): string {
  if (!t?.file_path) return "";
  if (t.file_path.includes("media_library/")) {
    return t.file_path
      .substring(t.file_path.indexOf("media_library/"))
      .replace("media_library/", "/media-static/");
  }
  return t.file_path;
}

function TrackPreloader({ track }: { track: Track }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const url = getAudioUrl(track);
            if (url && !audioRef.current) {
              const audio = new Audio();
              audio.src = url;
              audio.preload = "auto";
              audioRef.current = audio;
            }
            observer.disconnect();
          }
        });
      },
      { rootMargin: "150px" }
    );

    const target = document.getElementById(`track-card-${track.id}`) || document.getElementById(`track-card-top-${track.id}`);
    if (target) {
      observer.observe(target);
    }

    return () => {
      observer.disconnect();
    };
  }, [track]);

  return null;
}

// ─── Mock catalog para desarrollo ─────────────────────────────────────────
const MOCK_CATALOG: Track[] = [
  { id: 1, title: "Cyberpunk Sunrise", artist: "Billionaires Playlist", type: "song", price_tokens: 1, price_usd: 0.99, album_art_path: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80", file_path: "", genre: "Electronic", duration_seconds: 210, creator: "Billionaires Playlist", language: "en" },
  { id: 2, title: "Ecos del Futuro", artist: "Elena Ramos", type: "audiobook", price_tokens: 3, price_usd: 4.99, album_art_path: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80", file_path: "", description: "Un viaje al futuro narrado con voces de alta fidelidad.", genre: "Ficción", duration_seconds: 3600, creator: "Efecto Metamorfosis", language: "es" },
  { id: 3, title: "Chill Lofi Beats", artist: "Billionaires Playlist", type: "album", price_tokens: 5, price_usd: 7.99, album_art_path: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80", file_path: "", genre: "Lo-Fi", duration_seconds: 2400, creator: "Billionaires Playlist", language: "en" },
  { id: 4, title: "Meditación Cósmica", artist: "Billionaire SoundTrack", type: "song", price_tokens: 1, price_usd: 0.99, album_art_path: "https://images.unsplash.com/photo-1536152470836-b943b246224c?w=400&q=80", file_path: "", genre: "Ambient", duration_seconds: 480, creator: "Billionaire SoundTrack", language: "es" },
  { id: 5, title: "El Poder de la Mente", artist: "Metafísica & Ley de Atracción", type: "audiobook", price_tokens: 4, price_usd: 5.99, album_art_path: "https://images.unsplash.com/photo-1490633874781-1c63cc424610?w=400&q=80", file_path: "", description: "Audiolibro sobre psicología positiva y mentalidad ganadora.", genre: "Autoayuda", duration_seconds: 5400, creator: "Audiolibros de Metafísica", language: "es" },
  { id: 6, title: "Neon Dreamer", artist: "Billionaires Playlist", type: "song", price_tokens: 1, price_usd: 0.99, album_art_path: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&q=80", file_path: "", genre: "Synthwave", duration_seconds: 265, creator: "Billionaires Playlist", language: "en" },
];

// ─── CreditPackSelector — Selector de créditos personalizado ─────────────
// Precio base: 3 créditos = $1.00 USD (sin descuento)
const CREDIT_PACKS = [
  { credits: 5,   usd: +(5  / 3).toFixed(2) },  // $1.67
  { credits: 10,  usd: +(10 / 3).toFixed(2) },  // $3.33
  { credits: 20,  usd: +(20 / 3).toFixed(2) },  // $6.67
  { credits: 30,  usd: +(30 / 3).toFixed(2) },  // $10.00
  { credits: 50,  usd: +(50 / 3).toFixed(2) },  // $16.67
  { credits: 100, usd: +(100 / 3).toFixed(2) }, // $33.33
];

function CreditPackSelector({ language, userInfo, router, onCheckout }: {
  language: string;
  userInfo: { authenticated: boolean };
  router: ReturnType<typeof useRouter>;
  onCheckout: (credits: number, usd: number) => void;
}) {
  const [selected, setSelected] = useState(1);
  const pack = CREDIT_PACKS[selected];
  const pricePerCredit = (1 / 3).toFixed(3); // $0.333 cada crédito

  return (
    <div>
      {/* Selector de cantidad */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {CREDIT_PACKS.map((p, i) => (
          <button
            key={p.credits}
            onClick={() => setSelected(i)}
            className={`flex-1 min-w-[56px] py-2.5 rounded-xl text-xs font-black transition-all border ${
              selected === i
                ? "bg-[#7c3aed]/20 border-[#7c3aed]/50 text-[#a78bfa] shadow-[0_0_20px_rgba(124,58,237,0.2)]"
                : "bg-white/[0.02] border-white/[0.06] text-white/30 hover:border-white/20 hover:text-white/60"
            }`}
          >
            {p.credits}
          </button>
        ))}
      </div>

      {/* Preview */}
      <div className="flex items-center justify-between mb-6 px-1">
        <div>
          <p className="text-2xl font-black text-white">
            {pack.credits} <span className="text-sm font-normal text-white/40">{language === "es" ? "créditos" : "credits"}</span>
          </p>
          <p className="text-white/40 text-xs mt-0.5">
            ≈ {pack.credits} {language === "es" ? "descargas MP3" : "MP3 downloads"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-[#06b6d4]">${pack.usd.toFixed(2)}</p>
          <p className="text-white/30 text-xs">${pricePerCredit} / {language === "es" ? "crédito" : "credit"}</p>
        </div>
      </div>

      {/* Botón de compra — va directo a PayPal/Tarjeta */}
      <button
        onClick={() => {
          onCheckout(pack.credits, pack.usd);
        }}
        className="w-full py-3.5 rounded-2xl font-black text-sm bg-gradient-to-r from-[#7c3aed] to-[#06b6d4] text-white shadow-[0_8px_30px_rgba(124,58,237,0.3)] hover:shadow-[0_8px_40px_rgba(124,58,237,0.5)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
        {language === "es"
          ? `Comprar ${pack.credits} créditos — $${pack.usd.toFixed(2)}`
          : `Buy ${pack.credits} credits — $${pack.usd.toFixed(2)}`}
      </button>

      <p className="text-center text-white/20 text-[0.6rem] mt-3">
        {language === "es" ? "Precio base: 3 créditos = $1.00 USD · Pago único sin suscripción" : "Base price: 3 credits = $1.00 USD · One-time payment, no subscription"}
      </p>
    </div>
  );
}

// ─── PlanBillingToggle — Toggle Mensual / Anual ────────────────────────────
function PlanBillingToggle({ language, onChange }: { language: string; onChange?: (isAnnual: boolean) => void }) {
  const [isAnnual, setIsAnnual] = useState(false);
  return (
    <div className="inline-flex items-center gap-3 bg-white/[0.04] border border-white/[0.08] rounded-2xl p-1.5">
      <button
        onClick={() => { setIsAnnual(false); onChange?.(false); }}
        className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${!isAnnual ? "bg-[#06b6d4] text-black shadow-[0_4px_15px_rgba(6,182,212,0.4)]" : "text-white/40 hover:text-white/70"}`}
      >
        {language === "es" ? "Mensual" : "Monthly"}
      </button>
      <button
        onClick={() => { setIsAnnual(true); onChange?.(true); }}
        className={`px-5 py-2 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${isAnnual ? "bg-[#7c3aed] text-white shadow-[0_4px_15px_rgba(124,58,237,0.4)]" : "text-white/40 hover:text-white/70"}`}
        id="billing-toggle-annual"
        data-active={isAnnual ? "true" : "false"}
      >
        {language === "es" ? "Anual" : "Annual"}
        {isAnnual && (
          <span className="text-[0.55rem] bg-white/20 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider">
            {language === "es" ? "Ahorra 25%" : "Save 25%"}
          </span>
        )}
      </button>
    </div>
  );
}

// ─── Componente Principal ──────────────────────────────────────────────────
export default function StreamPortal() {
  const router = useRouter();
  const {
    currentTrack, chatOpen, play: contextPlay,
    setPlaylist: setCtxPlaylist, setCatalog: setCtxCatalog,
    setCheckoutHandler: setCtxCheckout, setAddToPlaylistHandler: setCtxAddToPlaylist, setFilterHandler: setCtxFilter,
    setAdminMode: setCtxAdmin, setIsAuthenticated: setCtxAuth,
    setShowPlaylistView,
  } = usePlayer();
  const [catalog, setCatalog] = useState<Track[]>([]);
  const [shuffledCatalog, setShuffledCatalog] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [recommendedTracks, setRecommendedTracks] = useState<Track[]>([]);

  // Recomendados: siempre cargar 25 pistas al inicio
  useEffect(() => {
    if (catalog.length > 0) {
      const recs = getUserRecommendations(catalog, 25);
      setRecommendedTracks(recs);
    }
  }, [catalog]);

  // Auto-scroll del carrusel de recomendados
  const recScrollRef = useRef<HTMLDivElement>(null);
  const recAutoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recManualScrollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualScrollingRef = useRef(false);

  const startRecAutoScroll = useCallback(() => {
    if (recAutoScrollRef.current) clearInterval(recAutoScrollRef.current);
    recAutoScrollRef.current = setInterval(() => {
      const el = recScrollRef.current;
      if (!el || isManualScrollingRef.current) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= maxScroll - 10) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: 180, behavior: "smooth" });
      }
    }, 1500);
  }, []);

  useEffect(() => {
    if (recommendedTracks.length > 0) {
      startRecAutoScroll();
    }
    return () => {
      if (recAutoScrollRef.current) clearInterval(recAutoScrollRef.current);
    };
  }, [recommendedTracks.length, startRecAutoScroll]);

  const handleRecommendationsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // Mark as manual scroll - pause auto-scroll for 3s
    isManualScrollingRef.current = true;
    if (recManualScrollRef.current) clearTimeout(recManualScrollRef.current);
    recManualScrollRef.current = setTimeout(() => {
      isManualScrollingRef.current = false;
    }, 3000);
    // Load more when reaching the end
    const container = e.currentTarget;
    if (container.scrollLeft + container.clientWidth >= container.scrollWidth - 200) {
      const moreRecs = getUserRecommendations(catalog, 10);
      setRecommendedTracks(prev => {
        const newItems = moreRecs.filter(r => !prev.some(p => p.id === r.id));
        return [...prev, ...newItems].slice(0, 50);
      });
    }
  };

  useEffect(() => {
    const initialized = sessionStorage.getItem('app_initialized');
    if (initialized) {
      setIsInitialLoad(false);
    } else {
      sessionStorage.setItem('app_initialized', 'true');
      setIsInitialLoad(true);
    }
  }, []);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["song"]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCreator, setActiveCreator] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(12);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Reset visibleCount when filters or search query changes
  useEffect(() => {
    setVisibleCount(12);
  }, [selectedTypes, selectedGenres, searchQuery, activeCreator]);

  // Sync catalog to context for StreamPlayer & AIChatSidebar
  useEffect(() => {
    setCtxCatalog(catalog);
  }, [catalog]);

  useEffect(() => {
    CREATORS_METADATA.forEach(c => {
      if (c.slug) {
        router.prefetch(`/channel/${c.slug}`);
      }
    });
  }, [router]);
  const [checkoutItem, setCheckoutItem] = useState<Track | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo>({ authenticated: false });
  const [purchaseSuccess, setPurchaseSuccess] = useState<any>(null);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestUsername, setGuestUsername] = useState("");
  const [guestPassword, setGuestPassword] = useState("");
  const [autoRegister, setAutoRegister] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"paypal" | "tokens">("paypal");
  const [paymentSubMethod, setPaymentSubMethod] = useState<"paypal" | "card">("paypal");
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [isAnnualPlan, setIsAnnualPlan] = useState(false);
  const [activeSection, setActiveSection] = useState<"home" | "subscription">("home");
  const [language, setLanguage] = useState<"es" | "en">("es");
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [creatorModalOpen, setCreatorModalOpen] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<(typeof CREATORS_METADATA)[0] | null>(null);
  // Cover management
  const [coverUploadItem, setCoverUploadItem] = useState<Track | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverUpdates, setCoverUpdates] = useState<Record<number, string>>({});  // id → new art URL
  const coverFileRef = useRef<HTMLInputElement | null>(null);
  const [autoCoverRunning, setAutoCoverRunning] = useState(false);
  const [autoCoverToast, setAutoCoverToast] = useState<string | null>(null);

  // ─── Add-to-Playlist state ────────────────────────────────────────────────
  const [userPlaylists, setUserPlaylists] = useState<{ id: number; name: string; item_count: number }[]>([]);
  const [addToPlaylistItem, setAddToPlaylistItem] = useState<Track | null>(null);
  const [addToPlaylistLoading, setAddToPlaylistLoading] = useState(false);
  const [addToPlaylistSuccess, setAddToPlaylistSuccess] = useState<string | null>(null);


  const heroRef = useRef<HTMLDivElement>(null);

  // Cargar SDK de PayPal dinámicamente solo si el usuario abre el checkout
  useEffect(() => {
    if (!checkoutItem) return;
    if (typeof window !== "undefined" && !document.getElementById("paypal-sdk-script")) {
      const script = document.createElement("script");
      script.id = "paypal-sdk-script";
      const clientId = "AUYxLqb4aKaVxE9Rd4l7ZmsmOD3EwFzCm5_qj9esAgDlvqUutzP5aomnhRFbWFg4s5vnJ14IOvMeY6in";
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&disable-funding=credit`;
      script.async = true;
      document.body.appendChild(script);
    }
  }, [checkoutItem]);

  // Cargar catálogo y usuario
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catalogRes, userRes] = await Promise.all([
          fetch("/api/ecommerce/catalog"),
          fetch("/api/ecommerce/me/info"),
        ]);

        if (catalogRes.ok) {
          const data = await catalogRes.json();
          const finalCatalog = data.length > 0 ? data : MOCK_CATALOG;
          setCatalog(finalCatalog);
          setActiveSection("home"); // Asegurar que inicie en la sección de Inicio
        } else {
          setCatalog(MOCK_CATALOG);
        }

        if (userRes.ok) {
          const userData = await userRes.json();
          setUserInfo(userData);
          setCtxAuth(userData.authenticated);
          const isAdminUser = userData.authenticated && ["super_admin", "tools_admin"].includes(userData.user?.role || "");
          setCtxAdmin(isAdminUser);
          if (userData.authenticated && userData.user?.tokens_balance >= 0) {
            setPaymentMethod("tokens");
          }
          // Solo sincronizar disco automáticamente cuando entra un administrador
          if (isAdminUser) {
            setTimeout(() => {
              fetch("/api/ecommerce/catalog?scan=true").catch(() => {});
            }, 3000);
          }
        }
      } catch {
        setCatalog(MOCK_CATALOG);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Fetch user playlists when authenticated
  useEffect(() => {
    if (!userInfo.authenticated) return;
    fetch("/api/user-playlists")
      .then(r => r.ok ? r.json() : [])
      .then(setUserPlaylists)
      .catch(() => {});
  }, [userInfo.authenticated]);

  // Persist guest email in localStorage
  useEffect(() => {
    if (guestEmail) {
      localStorage.setItem("mediasuite_guest_email", guestEmail);
    }
  }, [guestEmail]);

  // Sync catalog updates to shuffled catalog
  useEffect(() => {
    if (catalog.length > 0) {
      setShuffledCatalog(shuffleArray(catalog));
    }
  }, [catalog]);

  // Periodic rotation of catalog to keep it fresh (every 12h, only if search query is empty)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!searchQuery) {
        setShuffledCatalog(prev => shuffleArray(prev));
      }
    }, 43200000);
    return () => clearInterval(interval);
  }, [searchQuery]);

  const scrollToCatalog = useCallback(() => {
    setActiveSection("home");
    // Small timeout to allow activeSection state change to complete rendering
    setTimeout(() => {
      const el = document.getElementById("catalog-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  }, []);

  useEffect(() => {
    setCtxFilter((type) => {
      if (!type || type === "all") {
        setSelectedTypes([]);
      } else {
        setSelectedTypes([type]);
      }
      scrollToCatalog();
    });
  }, [setCtxFilter, scrollToCatalog]);

  // Auto-play from ?play=param (redirect from portal playlist detail)
  useEffect(() => {
    if (catalog.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const playId = params.get("play");
    if (playId) {
      const track = catalog.find(t => t.id === Number(playId));
      if (track) {
        setTimeout(() => contextPlay(track), 500);
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [catalog, contextPlay]);

  // Load playlist from ?playlist= param (redirect from portal)
  useEffect(() => {
    if (catalog.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const playlistId = params.get("playlist");
    if (playlistId) {
      fetch(`/api/user-playlists/${playlistId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.items?.length > 0) {
            const tracks: Track[] = data.items.map((item: any) => ({
              id: item.media_catalog_id,
              title: item.title,
              artist: item.artist,
              type: item.type || "song",
              album_art_path: item.album_art_path,
              duration_seconds: item.duration_seconds,
              file_path: "",
              price_tokens: 0,
              price_usd: 0,
              genre: "",
              creator: item.artist,
              language: item.language || "es",
            }));
            setCtxPlaylist(tracks);
            setTimeout(() => contextPlay(tracks[0]), 500);
          }
        })
        .catch(() => {});
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [catalog, contextPlay, setCtxPlaylist]);

  // Restore playlist queue from sessionStorage
  useEffect(() => {
    if (catalog.length === 0) return;
    try {
      const raw = sessionStorage.getItem("mediasuite_playlist_queue");
      if (raw) {
        const tracks: Track[] = JSON.parse(raw);
        if (tracks.length > 0) {
          setCtxPlaylist(tracks);
          setTimeout(() => contextPlay(tracks[0]), 500);
          sessionStorage.removeItem("mediasuite_playlist_queue");
        }
      }
    } catch {}
  }, [catalog, contextPlay, setCtxPlaylist]);

  // Limpiar filtros y volver a Inicio
  const resetFiltersAndGoHome = useCallback(() => {
    setActiveSection("home");
    setSelectedTypes([]);
    setActiveCreator("all");
    setSelectedGenres([]);
    setSearchQuery("");
  }, []);

  // Asegurar que al entrar en primera instancia se abra Inicio y se muestre todo el catálogo limpio
  useEffect(() => {
    resetFiltersAndGoHome();
  }, [resetFiltersAndGoHome]);

  // Auto-cover batch: triggers background Pexels cover assignment
  const triggerAutoCoverBatch = useCallback(async (missingCount: number) => {
    if (autoCoverRunning) return;
    try {
      setAutoCoverRunning(true);
      const res = await fetch("/api/covers/batch-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: Math.min(missingCount, 30), only_missing: true, delay_ms: 900 }),
      });
      if (res.ok) {
        setAutoCoverToast(`🎨 Asignando portadas a ${missingCount} archivos en background...`);
        setTimeout(() => setAutoCoverToast(null), 5000);
        // After batch finishes (~missingCount * 0.9s), refresh catalog to show new covers
        setTimeout(() => {
          fetch("/api/ecommerce/catalog")
            .then(r => r.json())
            .then(data => { if (data.length > 0) setCatalog(data); })
            .catch(() => {});
          setAutoCoverRunning(false);
        }, Math.min(missingCount * 950 + 5000, 60000));
      } else {
        setAutoCoverRunning(false);
      }
    } catch {
      setAutoCoverRunning(false);
    }
  }, [autoCoverRunning]);

  // Custom cover upload handler
  const handleCoverUpload = useCallback(async (file: File) => {
    if (!coverUploadItem) return;
    setCoverUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/covers/upload-custom/${coverUploadItem.id}`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        // Update catalog locally with new art path
        const newUrl = data.album_art_path?.includes("media_library/")
          ? data.album_art_path.replace(/.*media_library\//, "/media-static/")
          : data.album_art_path;
        setCoverUpdates(prev => ({ ...prev, [coverUploadItem.id]: newUrl }));
        setCatalog(prev => prev.map(i =>
          i.id === coverUploadItem.id ? { ...i, album_art_path: data.album_art_path } : i
        ));
        setAutoCoverToast(`✅ Portada personalizada actualizada para "${coverUploadItem.title}"`);
        setTimeout(() => setAutoCoverToast(null), 4000);
      } else {
        const err = await res.json();
        setAutoCoverToast(`❌ Error: ${err.detail || "No se pudo subir la imagen"}`);
        setTimeout(() => setAutoCoverToast(null), 4000);
      }
    } catch {
      setAutoCoverToast("❌ Error de conexión al subir portada");
      setTimeout(() => setAutoCoverToast(null), 4000);
    } finally {
      setCoverUploading(false);
      setCoverUploadItem(null);
    }
  }, [coverUploadItem]);

  // Auto-assign single cover for a specific item (on-demand)
  const handleAutoAssignCover = useCallback(async (item: Track) => {
    try {
      const res = await fetch("/api/covers/auto-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_id: item.id,
          title: item.title,
          genre: (item as any).genre || "",
          artist: item.artist,
          creator: item.creator || "",
          force: false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && !data.skipped) {
          const newUrl = data.album_art_path?.includes("media_library/")
            ? data.album_art_path.replace(/.*media_library\//, "/media-static/")
            : data.album_art_path;
          setCoverUpdates(prev => ({ ...prev, [item.id]: newUrl }));
          setCatalog(prev => prev.map(i =>
            i.id === item.id ? { ...i, album_art_path: data.album_art_path } : i
          ));
        }
      }
    } catch {}
  }, []);


  // Filtrado del catálogo usando el catálogo mezclado (o catálogo base si aún no se ha mezclado)
  const filteredCatalog = useMemo(() => {
    const displaySource = shuffledCatalog.length > 0 ? shuffledCatalog : catalog;
    return displaySource.filter(item => {
      const matchType = selectedTypes.length === 0 || selectedTypes.includes(item.type);
      const matchCreator = activeCreator === "all" || item.creator === activeCreator;
      const matchGenre = selectedGenres.length === 0 || selectedGenres.includes(item.genre || "");
      const q = searchQuery.toLowerCase();
      const matchSearch = !q ||
        item.title.toLowerCase().includes(q) ||
        item.artist.toLowerCase().includes(q) ||
        (item.genre || "").toLowerCase().includes(q) ||
        (item.creator || "").toLowerCase().includes(q);
      return matchType && matchCreator && matchGenre && matchSearch;
    });
  }, [shuffledCatalog, catalog, selectedTypes, activeCreator, selectedGenres, searchQuery]);

  // Infinite scroll trigger observer
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + 12, filteredCatalog.length));
        }
      },
      { rootMargin: "250px" }
    );

    const trigger = document.getElementById("infinite-scroll-trigger");
    if (trigger) {
      observer.observe(trigger);
    }

    return () => observer.disconnect();
  }, [filteredCatalog.length, visibleCount]);

  // Tipos únicos dinámicos del catálogo
  const uniqueTypes = useMemo(() => {
    const types = new Set<string>();
    catalog.forEach(item => { if (item.type) types.add(item.type); });
    return Array.from(types).sort();
  }, [catalog]);

  // Generos únicos dinámicos del catálogo
  const uniqueGenres = useMemo(() => {
    const genres = new Set<string>();
    catalog.forEach(item => { if (item.genre) genres.add(item.genre); });
    return Array.from(genres).sort();
  }, [catalog]);

  // Creadores dinámicos organizados por popularidad (suma de reproducciones)
  const dynamicCreators = useMemo(() => {
    const creatorsMap = new Map<string, { id: string; streams: number; tracksCount: number }>();
    catalog.forEach(item => {
      if (!item.creator) return;
      const existing = creatorsMap.get(item.creator);
      const playCount = item.play_count || 0;
      if (existing) {
        existing.streams += playCount;
        existing.tracksCount += 1;
      } else {
        creatorsMap.set(item.creator, {
          id: item.creator,
          streams: playCount,
          tracksCount: 1,
        });
      }
    });

    const sorted = Array.from(creatorsMap.values()).sort((a, b) => b.streams - a.streams);
    
    // Todos los creadores al inicio
    const allItem = {
      id: "all",
      slug: null as string | null,
      name: "Todos los Creadores",
      nameEn: "All Creators",
      icon: <IconHeadphones size={22} />,
      desc: "Todo el catálogo",
      color: "from-white/10 to-white/5",
      accent: "#a78bfa",
      streams: 0,
      tracksCount: catalog.length,
    };

    const list = sorted.map(sc => {
      const meta = CREATORS_METADATA.find(c => c.id === sc.id);
      if (meta) {
        return {
          ...meta,
          streams: sc.streams,
          tracksCount: sc.tracksCount,
        };
      }
      const calculatedSlug = sc.id.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
      return {
        id: sc.id,
        slug: calculatedSlug,
        name: sc.id,
        nameEn: sc.id,
        icon: <IconUser size={22} />,
        desc: "Creador de la plataforma",
        color: "from-purple-500/10 to-indigo-600/5",
        accent: "#7c3aed",
        streams: sc.streams,
        tracksCount: sc.tracksCount,
      };
    });

    return [allItem, ...list];
  }, [catalog]);

  // Catálogo de un creador específico
  const creatorCatalog = selectedCreator && selectedCreator.id !== "all"
    ? catalog.filter(item => item.creator === selectedCreator.id)
    : [];

  // Función de play (canción individual, sin contexto de álbum/lista)
  const handlePlay = useCallback((track: Track) => {
    setCtxPlaylist([]);
    contextPlay(track);
    const slug = track.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    window.history.pushState({ trackId: track.id }, "", `/?t=${track.id}&slug=${slug}`);
  }, [contextPlay, setCtxPlaylist]);

  // Play user playlist: fetch tracks, set playlist, play, open carrusel 3D
  const handlePlayPlaylist = useCallback(async (playlistId: number, playlistName: string) => {
    try {
      const res = await fetch(`/api/user-playlists/${playlistId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.items?.length) return;
      const tracks: Track[] = data.items.map((item: any) => {
        // Si la API no devuelve file_path, resolverlo desde el catálogo completo
        let filePath = item.file_path || "";
        if (!filePath && catalog.length > 0) {
          const fromCatalog = catalog.find(c => c.id === item.media_catalog_id);
          if (fromCatalog?.file_path) filePath = fromCatalog.file_path;
        }
        return {
          id: item.media_catalog_id,
          title: item.title,
          artist: item.artist,
          type: item.type || "song",
          price_tokens: item.price_tokens || 1,
          price_usd: item.price_usd || 0.99,
          album_art_path: item.album_art_path,
          duration_seconds: item.duration_seconds,
          file_path: filePath,
          genre: item.genre || "",
          creator: item.artist,
          album: item.album,
          language: item.language || "es",
        };
      });
      setCtxPlaylist(tracks);
      contextPlay(tracks[0]);
      setShowPlaylistView(true);
    } catch {}
  }, [contextPlay, setCtxPlaylist, setShowPlaylistView, catalog]);

  // Play filtered catalog as a playlist (abre carrusel 3D)
  const handlePlayFilteredCatalog = useCallback(() => {
    if (filteredCatalog.length === 0) return;
    setCtxPlaylist(filteredCatalog);
    contextPlay(filteredCatalog[0]);
    setShowPlaylistView(true);
  }, [filteredCatalog, contextPlay, setCtxPlaylist, setShowPlaylistView]);

  // Play all tracks by a specific album
  const handlePlayAlbum = useCallback((albumName: string, tracks: Track[]) => {
    if (tracks.length === 0) return;
    setCtxPlaylist(tracks);
    contextPlay(tracks[0]);
    setShowPlaylistView(true);
  }, [contextPlay, setCtxPlaylist, setShowPlaylistView]);

  // Agrupar tracks por álbum para el botón "Reproducir álbum" (solo música, no audiolibros/videos)
  const albumGroups = useMemo(() => {
    const groups = new Map<string, Track[]>();
    const allTracks = shuffledCatalog.length > 0 ? shuffledCatalog : catalog;
    allTracks.forEach(t => {
      if (t.type !== "song" && t.type !== "album") return;
      const albumName = (t as any).album || "Singles";
      if (!groups.has(albumName)) groups.set(albumName, []);
      groups.get(albumName)!.push(t);
    });
    return Array.from(groups.entries())
      .filter(([name]) => name !== "Singles" || (name === "Singles" && groups.get("Singles")!.length > 0))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [shuffledCatalog, catalog]);

  // Checkout handler
  const handleCheckout = useCallback((track: Track) => {
    setCheckoutItem(track);
    setPurchaseSuccess(null);
    setCheckoutStep(1);
    setCheckoutPlan(null);
    const savedEmail = localStorage.getItem("mediasuite_guest_email") || "";
    setGuestEmail(savedEmail);
    setGuestUsername("");
    setGuestPassword("");
    setAutoRegister(false);
    const hasActivePlan = !!(userInfo.authenticated && userInfo.subscription);
    if (hasActivePlan) {
      setPaymentMethod("tokens");
    } else {
      setPaymentMethod("paypal");
      setPaymentSubMethod("paypal");
    }
  }, [userInfo]);

  // Registrar checkout handler en el contexto global
  useEffect(() => {
    setCtxCheckout(() => handleCheckout);
  }, [handleCheckout]);

  // Registrar add-to-playlist handler
  useEffect(() => {
    setCtxAddToPlaylist(() => (track: Track) => setAddToPlaylistItem(track));
  }, [setCtxAddToPlaylist]);

  // Leer checkout item de sessionStorage al montar (cross-page checkout)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedCheckout = sessionStorage.getItem("mediasuite_checkout_item");
      if (savedCheckout) {
        try {
          const item = JSON.parse(savedCheckout);
          handleCheckout(item);
          sessionStorage.removeItem("mediasuite_checkout_item");
        } catch {}
      }
    }
  }, [handleCheckout]);

  // Procesar compra
  const processPurchase = async (e?: React.FormEvent, orderId?: string) => {
    if (e) e.preventDefault();
    if (!checkoutItem) return;
    setProcessing(true);
    try {
      const endpoint = checkoutPlan ? "/api/ecommerce/subscribe" : "/api/ecommerce/purchase";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkoutPlan ? {
          plan_name: checkoutPlan,
          payment_method: paymentMethod,
          order_id: orderId || undefined,
        } : {
          media_catalog_id: checkoutItem.id,
          payment_method: paymentMethod,
          guest_email: paymentMethod === "paypal" && !userInfo.authenticated ? guestEmail : undefined,
          guest_username: guestUsername || guestEmail.split("@")[0],
          guest_password: guestPassword || undefined,
          auto_register: autoRegister && !userInfo.authenticated,
          order_id: orderId || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPurchaseSuccess(data);
        if (userInfo.authenticated && paymentMethod === "tokens") {
          setUserInfo(prev => ({
            ...prev,
            user: prev.user ? { ...prev.user, tokens_balance: data.balance } : prev.user,
          }));
        }
      } else {
        alert(`Error: ${data.detail || "Error en el pago"}`);
      }
    } catch {
      alert("Error de conexión");
    } finally {
      setProcessing(false);
    }
  };

  // Obtener link de descarga
  const handleDownload = async (purchaseId: number) => {
    try {
      const res = await fetch(`/api/ecommerce/download-link/${purchaseId}`);
      if (res.ok) {
        const data = await res.json();
        window.open(data.download_url, "_blank");
      }
    } catch { /* silent */ }
  };

  // Abrir modal de creador
  const openCreatorModal = (creator: typeof CREATORS_METADATA[0]) => {
    if (creator.id === "all") {
      setActiveCreator("all");
      return;
    }
    setSelectedCreator(creator);
    setCreatorModalOpen(true);
  };

  // ─── TEXTO BILINGÜE ──────────────────────────────────────────────────────
  const t = {
    hero_title: language === "es" ? "Sintoniza tu mente. Crea tu realidad." : "Tune your mind. See your success.",
    hero_subtitle: language === "es"
      ? "Plataforma de Programación Mental Auditiva: frecuencias Solfeggio, ondas binaurales, música transformacional, streaming conversacional con IA y Stream DJ de estados de ánimo."
      : "Auditory Mental Programming platform: Solfeggio frequencies, binaural beats, transformational music, conversational AI streaming and Stream DJ.",

    explore: language === "es" ? "Explorar Catálogo" : "Explore Catalog",
    subscribe_cta: language === "es" ? "Obtener Membresía" : "Get Membership",
    search_placeholder: language === "es" ? "Buscar artista, género o título..." : "Search artist, genre or title...",
    listening_free: language === "es" ? "Escucha gratuita" : "Free listening",
    buy_download: language === "es" ? "Comprar & Descargar" : "Buy & Download",
    featured: language === "es" ? "Destacados" : "Featured",
    catalog_title: language === "es" ? "Catálogo Completo" : "Full Catalog",
    creators: language === "es" ? "Canales & Creadores" : "Channels & Creators",
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#04040a] text-white">
        <div className="relative flex flex-col items-center p-8">
          <Lottie
            animationData={isInitialLoad ? navigationAnimation : musicLoadingAnimation}
            loop={true}
            className="w-64 h-64"
          />
          {isInitialLoad && (
            <div className="mt-4 flex flex-col items-center">
              <ExitoLogo size="lg" showTagline={true} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen w-full bg-[#0a0a1a] text-white overflow-y-auto pb-[108px]" style={{ background: "radial-gradient(circle at 20% 10%, rgba(124,58,237,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 90%, rgba(6,182,212,0.05) 0%, transparent 50%), #0a0a1a" }}>
      
      {/* ─── HEADER / NAV ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[#0a0a1a]/80 backdrop-blur-xl border-b border-white/[0.04] px-4 lg:px-8 h-16 flex items-center justify-between">
        <div 
          onClick={resetFiltersAndGoHome}
          className="flex items-center cursor-pointer transition-transform hover:scale-[1.01]"
        >
          <ExitoLogo size="md" showTagline={true} />
        </div>


        <nav className="hidden md:flex items-center gap-1">
          <button
            onClick={resetFiltersAndGoHome}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              activeSection === "home"
                ? "bg-white/[0.06] text-white"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {language === "es" ? "Inicio" : "Home"}
          </button>
          <button
            onClick={scrollToCatalog}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white/40 hover:text-white/70 uppercase tracking-wider transition-all"
          >
            {language === "es" ? "Catálogo" : "Catalog"}
          </button>
          <button
            onClick={() => setActiveSection("subscription")}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              activeSection === "subscription"
                ? "bg-white/[0.06] text-white"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {language === "es" ? "Planes" : "Plans"}
          </button>
          <Link
            href="/artist-studio"
            className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500/20 to-purple-500/20 border border-amber-400/30 text-amber-300 hover:border-amber-400/60 transition-all flex items-center gap-1.5"
          >
            <span>🎤 {language === "es" ? "Panel Artistas & PayPal" : "Artist Studio & PayPal"}</span>
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {/* Language toggle */}
          <button
            onClick={() => setLanguage(l => l === "es" ? "en" : "es")}
            className="text-xs font-bold text-white/40 hover:text-white/70 transition-colors px-2 py-1.5 rounded-lg border border-white/[0.06] hover:border-white/20 flex items-center gap-1.5"
          >
            <IconGlobe size={14} />
            {language === "es" ? "EN" : "ES"}
          </button>
          
          {userInfo.authenticated ? (
            <div className="relative group">
              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-xl h-9 text-xs font-bold px-3 cursor-pointer hover:bg-white/[0.08] transition-all">
                <div className="w-5 h-5 shrink-0 rounded-full bg-gradient-to-br from-[#7c3aed] to-[#06b6d4] flex items-center justify-center">
                  <IconUser size={12} />
                </div>
                <span className="flex items-center gap-1 text-white/70">
                  {userInfo.user?.tokens_balance} <IconToken size={12} className="shrink-0" />
                </span>
              </div>
              <div className="absolute right-0 top-full mt-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="bg-[#0d0d1f] border border-white/[0.08] rounded-2xl p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
                  <Link href="/portal" className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-white/70 hover:text-white hover:bg-white/[0.04] transition-all">
                    <IconUser size={14} /> Mi Perfil
                  </Link>
                  {["super_admin", "tools_admin"].includes(userInfo.user?.role || "") && (
                    <Link href="/dashboard" className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-white/70 hover:text-white hover:bg-white/[0.04] transition-all">
                      <IconStar size={14} /> Suite Producción
                    </Link>
                  )}
                  {userInfo.user?.role === "super_admin" && (
                    <Link href="/admin" className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-white/70 hover:text-white hover:bg-white/[0.04] transition-all">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                      Admin Panel
                    </Link>
                  )}
                  <button
                    onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-white/40 hover:text-red-400 hover:bg-white/[0.04] transition-all"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Cerrar Sesión
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Link href="/login" className="text-xs font-bold text-white/40 hover:text-white/70 transition-colors px-3 py-2 rounded-xl border border-white/[0.06] hover:border-white/20 flex items-center gap-1.5">
              <IconUser size={14} /> Iniciar Sesión
            </Link>
          )}
        </div>
      </header>

      {/* ─── LAYOUT PRINCIPAL ──────────────────────────────────────────── */}
      <div className="transition-all duration-500">
        <div className="w-full">

          {/* ─── HERO SECTION ─────────────────────────────────────────────── */}
          {activeSection === "home" && (
            <section ref={heroRef} className="relative px-4 lg:px-8 pt-16 pb-20 overflow-hidden">
              <div className="absolute -top-40 left-1/4 w-96 h-96 bg-[#7c3aed]/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 right-1/4 w-72 h-72 bg-[#06b6d4]/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="max-w-4xl mx-auto text-center relative z-10">
                <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-2 text-[0.7rem] font-bold text-white/60 mb-6 uppercase tracking-widest">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#06b6d4] animate-pulse" />
                  {language === "es" ? "Programación Mental Auditiva · Bienestar & Frecuencias" : "Auditory Mental Programming · Wellness & Frequencies"}
                </div>
                
                <h2 className="text-5xl lg:text-7xl font-black tracking-tight mb-6 leading-tight">
                  <span className="bg-gradient-to-r from-white via-[#e9d5ff] to-[#06b6d4] bg-clip-text text-transparent">Éxito<span className="text-[#06b6d4]">.cyou</span></span>
                  <br />
                  <span className="text-2xl lg:text-4xl bg-gradient-to-r from-[#7c3aed] via-[#a78bfa] to-[#06b6d4] bg-clip-text text-transparent font-bold">{t.hero_title}</span>
                </h2>

                
                <p className="text-white/50 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">{t.hero_subtitle}</p>
                
                <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center">
                  <button
                    onClick={scrollToCatalog}
                    className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#9333ea] text-white font-black text-sm uppercase tracking-wider shadow-2xl shadow-purple-500/25 hover:shadow-purple-500/40 hover:-translate-y-0.5 transition-all flex items-center gap-2 justify-center"
                  >
                    {t.explore} <IconChevronRight size={16} />
                  </button>
                  <Link
                    href="/artist-studio"
                    className="px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500/20 to-blue-600/20 border border-amber-400/40 text-amber-300 font-black text-sm uppercase tracking-wider hover:bg-amber-500/30 hover:-translate-y-0.5 transition-all flex items-center gap-2 justify-center shadow-xl"
                  >
                    🎤 {language === "es" ? "Soy Artista: Monetizar con PayPal" : "For Artists: Monetize with PayPal"}
                  </Link>
                  <button
                    onClick={() => setActiveSection("subscription")}
                    className="px-8 py-4 rounded-2xl bg-white/[0.04] border border-white/[0.10] text-white/70 font-black text-sm uppercase tracking-wider hover:bg-white/[0.08] hover:-translate-y-0.5 transition-all flex items-center gap-2 justify-center"
                  >
                    <IconToken size={16} /> {t.subscribe_cta}
                  </button>
                </div>
              </div>

              {/* Top 10 of the Day Carousel */}
              <div className="max-w-5xl mx-auto mt-16">
                <h3 className="text-sm font-bold uppercase tracking-widest text-white/30 mb-6 text-center flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#06b6d4] animate-pulse" />
                  {language === "es" ? "Top 10 del Día" : "Top 10 of the Day"}
                </h3>
                <div className="carousel-fade-container">
                  <div className="flex gap-4 overflow-x-auto scrollbar-none snap-x py-4 px-6 scroll-smooth">
                    {((): Track[] => {
                      return [...catalog].sort((a, b) => (b.play_count || 0) - (a.play_count || 0)).slice(0, 10);
                    })().map((item, i) => {
                      const art = getArtUrl(item.album_art_path);
                      return (
                        <div
                          key={item.id}
                          id={`track-card-top-${item.id}`}
                          onClick={() => handlePlay(item)}
                          onMouseEnter={() => prefetchTrack(item)}
                          onTouchStart={() => prefetchTrack(item)}
                          className="group cursor-pointer shrink-0 w-[140px] snap-start relative transition-all duration-300 hover:-translate-y-1"
                        >
                          <TrackPreloader track={item} />
                          <div className="aspect-square rounded-2xl overflow-hidden bg-white/[0.04] relative mb-2 shadow-lg">
                            {art ? (
                              <Image src={art} alt={item.title} fill sizes="140px" className="object-cover group-hover:scale-110 transition-transform duration-500" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white/30 bg-gradient-to-br from-[#7c3aed]/20 to-[#06b6d4]/20">
                                {item.type === "audiobook" ? <IconBook size={32} /> : <IconMusicNote size={32} />}
                              </div>
                            )}
                            <div className="absolute top-2 left-2 w-7 h-7 rounded-lg bg-black/70 backdrop-blur-md flex items-center justify-center border border-white/10 z-10">
                              <span className="text-xs font-black text-[#06b6d4]">#{i + 1}</span>
                            </div>
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-2xl">
                                <IconPlay size={16} />
                              </div>
                            </div>
                          </div>
                          <p className="text-[0.7rem] font-bold text-white/80 truncate">{item.title}</p>
                          <p 
                            onClick={(e) => {
                              e.stopPropagation();
                              const matched = CREATORS_METADATA.find(c => c.id === item.creator);
                              if (matched && matched.slug) {
                                router.push(`/channel/${matched.slug}`);
                              } else {
                                const calculatedSlug = item.creator?.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
                                if (calculatedSlug) router.push(`/channel/${calculatedSlug}`);
                              }
                            }}
                            className="text-[0.6rem] text-white/30 truncate hover:text-[#06b6d4] hover:underline cursor-pointer"
                          >
                            {item.artist}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ─── MIS LISTAS / PLAY LISTS ─────────────────────────────── */}
              {userInfo.authenticated && userPlaylists.length > 0 && (
                <div className="max-w-5xl mx-auto mt-10 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-white/30 flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[#a78bfa]">
                        <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
                      </svg>
                      Mis Listas de Reproducción
                    </h3>
                    <span className="text-[0.6rem] text-white/20">{userPlaylists.length} listas</span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto overflow-y-hidden pb-2 [&::-webkit-scrollbar]:h-[3px] [&::-webkit-scrollbar-thumb]:bg-white/[0.06] [&::-webkit-scrollbar-thumb]:rounded-full">
                    {userPlaylists.map(pl => (
                      <button
                        key={pl.id}
                        onClick={() => handlePlayPlaylist(pl.id, pl.name)}
                        className="group shrink-0 flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:bg-[#7c3aed]/10 hover:border-[#7c3aed]/40 transition-all hover:scale-[1.02]"
                      >
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7c3aed]/20 to-[#06b6d4]/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-[#a78bfa]">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                        <div className="text-left min-w-0">
                          <p className="text-sm font-bold text-white/80 group-hover:text-white truncate max-w-[140px]">{pl.name}</p>
                          <p className="text-[0.6rem] text-white/40">{pl.item_count} {pl.item_count === 1 ? "canción" : "canciones"}</p>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/20 group-hover:text-[#a78bfa] transition-colors shrink-0">
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── ÁLBUMES DESTACADOS ──────────────────────────────────── */}
              {albumGroups.length > 0 && (
                <div className="max-w-5xl mx-auto mt-8 mb-2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-white/30 flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[#06b6d4]">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/>
                      </svg>
                      Álbumes
                    </h3>
                    <span className="text-[0.6rem] text-white/20">{albumGroups.length} álbumes</span>
                  </div>
                  <div className="carousel-fade-container">
                  <div className="flex gap-3 overflow-x-auto overflow-y-hidden py-2 px-6 scrollbar-none snap-x [&::-webkit-scrollbar]:h-[3px] [&::-webkit-scrollbar-thumb]:bg-white/[0.06] [&::-webkit-scrollbar-thumb]:rounded-full">
                    {albumGroups.slice(0, 8).map(([albumName, tracks]) => {
                      const coverArt = getArtUrl(tracks[0]?.album_art_path);
                      return (
                        <button
                          key={albumName}
                          onClick={() => handlePlayAlbum(albumName, tracks)}
                          className="group shrink-0 flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:bg-[#06b6d4]/10 hover:border-[#06b6d4]/40 transition-all hover:scale-105"
                        >
                          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0">
                            {coverArt ? (
                              <img src={coverArt} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-[#06b6d4]/20 to-[#7c3aed]/20 flex items-center justify-center">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[#06b6d4]">
                                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/>
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="text-left min-w-0">
                            <p className="text-sm font-bold text-white/80 group-hover:text-white truncate max-w-[140px]">{albumName}</p>
                            <p className="text-[0.6rem] text-white/40">{tracks.length} {tracks.length === 1 ? "track" : "tracks"}</p>
                          </div>
                          <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center group-hover:bg-[#06b6d4]/20 transition-colors shrink-0">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-white/40 group-hover:text-[#06b6d4]">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  </div>{/* /carousel-fade-container */}
                </div>
              )}


            </section>
          )}

          {/* ─── CATALOG SECTION ─────────────────────────────────────────── */}
          {(activeSection === "home") && (
            <section id="catalog-section" className="px-4 lg:px-8 pb-8 pt-4 border-t border-white/[0.02]">
              
              {/* Recomendados para Ti (Horizontal Scroll Infinito) */}
              {recommendedTracks.length > 0 && (
                <div className="max-w-6xl mx-auto mb-10 mt-2">
                  <div className="flex items-center justify-between mb-4 px-2">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-white/80 flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        {language === "es" ? "Recomendado para Ti" : "Recommended for You"}
                      </h3>
                      <p className="text-[0.6rem] text-white/30">{language === "es" ? "Personalizado con algoritmo de metadatos según tus escuchas" : "Personalized via metadata based on your listens"}</p>
                    </div>
                  </div>
                  <div className="carousel-fade-container">
                    <div 
                      ref={recScrollRef}
                      onScroll={handleRecommendationsScroll}
                      className="flex gap-4 overflow-x-auto scrollbar-none snap-x py-3 px-6 scroll-smooth"
                    >
                      {recommendedTracks.map((item, idx) => {
                        const art = getArtUrl(item.album_art_path);
                        return (
                          <div
                            key={`${item.id}-rec-${idx}`}
                            onClick={() => handlePlay(item)}
                            className="group cursor-pointer shrink-0 w-[130px] snap-start relative transition-all duration-300 hover:-translate-y-0.5"
                          >
                            <div className="aspect-square rounded-2xl overflow-hidden bg-white/[0.03] relative mb-2 shadow-md">
                              {art ? (
                                <Image src={art} alt={item.title} fill sizes="130px" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white/20 bg-gradient-to-br from-[#7c3aed]/10 to-[#06b6d4]/10">
                                  <IconMusicNote size={24} />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <div className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shadow-lg">
                                  <IconPlay size={14} />
                                </div>
                              </div>
                            </div>
                            <p className="text-[0.65rem] font-bold text-white/80 truncate mb-0.5">{item.title}</p>
                            <p 
                              onClick={(e) => {
                                e.stopPropagation();
                                const matched = CREATORS_METADATA.find(c => c.id === item.creator);
                                if (matched && matched.slug) {
                                  router.push(`/channel/${matched.slug}`);
                                } else {
                                  const calculatedSlug = item.creator?.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
                                  if (calculatedSlug) router.push(`/channel/${calculatedSlug}`);
                                }
                              }}
                              className="text-[0.55rem] text-white/30 truncate hover:text-[#06b6d4] hover:underline cursor-pointer"
                            >
                              {item.artist}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Collapsible Minimalist Filters */}
              <div className="max-w-6xl mx-auto mb-8">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
                      <IconSearch size={16} />
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder={t.search_placeholder}
                      className="w-full bg-white/[0.02] border border-white/[0.08] focus:border-[#7c3aed]/50 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-all backdrop-blur-sm"
                    />
                  </div>
                  
                  <button
                    onClick={() => setFiltersExpanded(!filtersExpanded)}
                    className={`px-4 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2 border ${
                      filtersExpanded || selectedTypes.length > 0 || selectedGenres.length > 0 || activeCreator !== "all"
                        ? "bg-[#7c3aed]/10 border-[#7c3aed]/40 text-[#a78bfa]"
                        : "bg-white/[0.02] border-white/[0.08] text-white/60 hover:text-white hover:border-white/20"
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>
                    </svg>
                    <span>{language === "es" ? "Filtros" : "Filters"}</span>
                    {(selectedTypes.length > 0 || selectedGenres.length > 0 || activeCreator !== "all") && (
                      <span className="bg-[#7c3aed] text-white w-4 h-4 rounded-full text-[0.6rem] flex items-center justify-center">
                        {selectedTypes.length + selectedGenres.length + (activeCreator !== "all" ? 1 : 0)}
                      </span>
                    )}
                  </button>
                </div>

                {/* Collapsible Panel */}
                {filtersExpanded && (
                  <div className="mt-4 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-4 animate-fadeIn">
                    <div>
                      <h4 className="text-[0.65rem] font-black uppercase tracking-widest text-white/30 mb-2">
                        {language === "es" ? "Tipos de Audio" : "Audio Types"}
                      </h4>
                      <div className="flex gap-2 flex-wrap">
                        {uniqueTypes.map(type => {
                          const active = selectedTypes.includes(type);
                          const label = TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1);
                          return (
                            <button
                              key={type}
                              onClick={() => {
                                setSelectedTypes(prev =>
                                  prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                                );
                              }}
                              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                                active
                                  ? "bg-[#7c3aed] text-white border-[#7c3aed] shadow-md shadow-purple-500/20"
                                  : "bg-white/[0.02] border-white/[0.06] text-white/50 hover:text-white/80 hover:border-white/12"
                              }`}
                            >
                              {TYPE_ICONS[type] || <IconHeadphones size={12} />} {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {uniqueGenres.length > 0 && (
                      <div>
                        <h4 className="text-[0.65rem] font-black uppercase tracking-widest text-white/30 mb-2">
                          {language === "es" ? "Géneros y Etiquetas" : "Genres & Tags"}
                        </h4>
                        <div className="flex gap-1.5 flex-wrap">
                          {uniqueGenres.map(genre => {
                            const active = selectedGenres.includes(genre);
                            return (
                              <button
                                key={genre}
                                onClick={() => {
                                  setSelectedGenres(prev =>
                                    prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
                                  );
                                }}
                                className={`px-2.5 py-1.5 rounded-lg text-[0.65rem] font-bold transition-all border ${
                                  active
                                    ? "bg-[#06b6d4]/20 text-[#06b6d4] border-[#06b6d4]/40"
                                    : "bg-white/[0.01] border-white/[0.05] text-white/40 hover:text-white/70 hover:border-white/10"
                                }`}
                              >
                                {genre}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {dynamicCreators.length > 0 && (
                      <div>
                        <h4 className="text-[0.65rem] font-black uppercase tracking-widest text-white/30 mb-2">
                          {t.creators}
                        </h4>
                        <div className="flex gap-1.5 flex-wrap">
                          {dynamicCreators.map(c => {
                            const active = activeCreator === c.id;
                            return (
                              <button
                                key={c.id}
                                onClick={() => {
                                  if (activeCreator === c.id) {
                                    setActiveCreator("all");
                                  } else {
                                    setActiveCreator(c.id);
                                  }
                                }}
                                className={`px-2.5 py-1.5 rounded-lg text-[0.65rem] font-bold transition-all border ${
                                  active
                                    ? "bg-[#7c3aed]/20 text-[#a78bfa] border-[#7c3aed]/40"
                                    : "bg-white/[0.01] border-white/[0.05] text-white/40 hover:text-white/70 hover:border-white/10"
                                }`}
                              >
                                {language === "es" ? c.name : c.nameEn}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>


              {/* Botón Reproductor General */}
              {filteredCatalog.length > 0 && (
                <div className="max-w-6xl mx-auto mb-4 flex items-center justify-between">
                  <p className="text-[0.65rem] text-white/30 font-bold uppercase tracking-widest">
                    {filteredCatalog.length} {filteredCatalog.length === 1 ? "resultado" : "resultados"}
                  </p>
                  <div className="flex items-center gap-2">
                    {albumGroups.length > 0 && (
                      <button
                        onClick={() => {
                          if (albumGroups.length > 0) {
                            const [name, tracks] = albumGroups[0];
                            handlePlayAlbum(name, tracks);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg text-[0.6rem] font-bold border border-white/[0.06] text-white/40 hover:text-[#06b6d4] hover:border-[#06b6d4]/40 hover:bg-[#06b6d4]/10 transition-all flex items-center gap-1.5"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>
                        Por álbum
                      </button>
                    )}
                    <button
                      onClick={handlePlayFilteredCatalog}
                      className="px-4 py-1.5 rounded-lg text-[0.6rem] font-bold bg-[#7c3aed]/15 border border-[#7c3aed]/30 text-[#a78bfa] hover:bg-[#7c3aed]/25 hover:border-[#7c3aed]/50 transition-all flex items-center gap-1.5"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      Reproducir todo ({filteredCatalog.length})
                    </button>
                  </div>
                </div>
              )}

              {/* Grid de Catalog */}

              <div key={`grid-${catalog.length}-${selectedTypes.join(",")}-${selectedGenres.join(",")}`} className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 border-t border-white/[0.02] pt-6">
                {filteredCatalog.slice(0, visibleCount).map((item) => {
                  const artPath = coverUpdates[item.id] || item.album_art_path;
                  const art = getArtUrl(artPath);
                  const isPlaying = currentTrack?.id === item.id;
                  const hasNoCover = !art;
                  return (
                    <div
                      key={item.id}
                      id={`track-card-${item.id}`}
                      onMouseEnter={() => prefetchTrack(item)}
                      onTouchStart={() => prefetchTrack(item)}
                      className={`group relative bg-white/[0.02] rounded-2xl border transition-all duration-500 overflow-hidden cursor-pointer hover:-translate-y-1.5 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] ${isPlaying ? "border-[#7c3aed] ring-2 ring-[#7c3aed]/25 bg-gradient-to-b from-[#7c3aed]/10 to-transparent scale-[1.02]" : "border-white/[0.05] hover:border-white/[0.18]"}`}
                    >
                      <TrackPreloader track={item} />
                      {/* Album Art */}
                      <div className="aspect-square relative overflow-hidden bg-white/[0.03]" onClick={() => handlePlay(item)}>
                        {art ? (
                          <Image src={art} alt={item.title} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/20 bg-gradient-to-br from-[#7c3aed]/10 via-[#4c1d95]/15 to-[#06b6d4]/10 relative">
                            {item.type === "audiobook" ? <IconBook size={40} /> : item.type === "video" ? <IconVideo size={40} /> : <IconMusicNote size={40} />}
                            {/* Subtle animated gradient for items without cover */}
                            <div className="absolute inset-0 opacity-30" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.3) 0%, rgba(6,182,212,0.2) 50%, rgba(124,58,237,0.1) 100%)", animation: "pulse 3s ease-in-out infinite" }} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
                            {isPlaying ? <IconPause size={20} /> : <IconPlay size={20} />}
                          </div>
                        </div>
                        {isPlaying && (
                          <div className="absolute bottom-3 left-3 flex gap-[3.5px] items-end bg-black/60 backdrop-blur-md px-2 py-1.5 rounded-lg border border-white/[0.08]">
                            {[6, 10, 8, 12, 6].map((h, i) => (
                              <span key={i} className="w-[3px] bg-[#06b6d4] rounded-full animate-bounce" style={{ height: `${h}px`, animationDelay: `${i * 0.15}s` }} />
                            ))}
                          </div>
                        )}
                        <div className="absolute top-2 right-2">
                          <span className="text-[0.5rem] font-black uppercase tracking-wider bg-[#0a0a1a]/80 backdrop-blur-sm text-white/70 px-1.5 py-0.5 rounded-md border border-white/[0.04]">
                            {item.type}
                          </span>
                        </div>
                        {/* Cover customize button (visible on hover for items without cover, subtle for items with) */}
                        {userInfo.authenticated && ["super_admin", "tools_admin"].includes(userInfo.user?.role || "") && (
                          <button
                            onClick={e => { e.stopPropagation(); setCoverUploadItem(item); }}
                            title="Personalizar portada"
                            className={`absolute bottom-2 right-2 rounded-lg text-[0.55rem] font-bold flex items-center gap-1 transition-all backdrop-blur-sm ${
                              hasNoCover
                                ? "opacity-0 group-hover:opacity-100 bg-[#7c3aed]/80 text-white px-2 py-1 border border-[#7c3aed]/60"
                                : "opacity-0 group-hover:opacity-60 bg-black/60 text-white/70 px-1.5 py-0.5 border border-white/10 hover:opacity-100"
                            }`}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                            {hasNoCover ? "Portada" : ""}
                          </button>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-3">
                        <p className="text-xs font-bold text-white truncate mb-0.5">{item.title}</p>
                        <p 
                          onClick={(e) => {
                            e.stopPropagation();
                            const matched = CREATORS_METADATA.find(c => c.id === item.creator);
                            if (matched && matched.slug) {
                              router.push(`/channel/${matched.slug}`);
                            } else {
                              const calculatedSlug = item.creator?.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
                              if (calculatedSlug) router.push(`/channel/${calculatedSlug}`);
                            }
                          }}
                          className="text-[0.6rem] text-white/45 truncate mb-1 hover:text-[#06b6d4] hover:underline transition-all cursor-pointer"
                        >
                          {item.artist}
                        </p>
                        {(item as any).album && (
                          <p 
                            onClick={(e) => {
                              e.stopPropagation();
                              const matched = CREATORS_METADATA.find(c => c.id === item.creator);
                              if (matched && matched.slug) {
                                router.push(`/channel/${matched.slug}`);
                              }
                            }}
                            className="text-[0.55rem] text-[#a78bfa] truncate mb-2.5 uppercase tracking-wider hover:text-white hover:underline transition-all cursor-pointer"
                          >
                            {(item as any).album}
                          </p>
                        )}
                        
                        {/* Price + Buy + Add to Playlist */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[0.6rem] text-white/25 uppercase tracking-wider">desde</p>
                            <p className="text-xs font-black text-white">${item.price_usd.toFixed(2)}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {userInfo.authenticated && userPlaylists.length > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setAddToPlaylistItem(item); }}
                                className="w-7 h-7 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-[#06b6d4] hover:border-[#06b6d4]/40 hover:bg-[#06b6d4]/10 transition-all hover:scale-110"
                                title="Agregar a lista"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCheckout(item); }}
                              className="w-8 h-8 rounded-xl bg-[#7c3aed]/20 border border-[#7c3aed]/30 flex items-center justify-center text-[#a78bfa] hover:bg-[#7c3aed]/40 hover:border-[#7c3aed]/60 transition-all hover:scale-110"
                              title="Comprar"
                            >
                              <IconDownload size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Infinite Scroll trigger element */}
              {filteredCatalog.length > visibleCount && (
                <div id="infinite-scroll-trigger" className="w-full flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-[#7c3aed] border-t-transparent rounded-full animate-spin" />
                </div>
              )}


              {filteredCatalog.length === 0 && (
                <div className="max-w-6xl mx-auto text-center py-24">
                  <div className="text-white/20 flex justify-center mb-4">
                    <IconSearch size={48} />
                  </div>
                  <p className="text-white/40 text-sm">{language === "es" ? "No se encontraron resultados para tu búsqueda." : "No results found for your search."}</p>
                </div>
              )}
            </section>
          )}

          {/* ─── SUBSCRIPTION SECTION ────────────────────────────────────── */}
          {activeSection === "subscription" && (
            <section className="px-4 lg:px-8 py-16">
              <div className="max-w-4xl mx-auto">
                <div className="text-center mb-10">
                  <h2 className="text-3xl font-black mb-3 bg-gradient-to-r from-white via-[#e9d5ff] to-[#06b6d4] bg-clip-text text-transparent">
                    {language === "es" ? "Membresía Éxito.cyou — Programación Mental" : "Éxito.cyou Membership — Mind Programming"}
                  </h2>
                  <p className="text-white/40 text-sm mb-6">
                    {language === "es"
                      ? "Acceso ilimitado a frecuencias Solfeggio, ondas binaurales, música transformacional y descargas MP3 oficiales."
                      : "Unlimited access to Solfeggio frequencies, binaural beats, transformational audio and official MP3 downloads."}
                  </p>


                  {/* Toggle Mensual / Anual */}
                  <PlanBillingToggle language={language} onChange={(annual) => setIsAnnualPlan(annual)} />
                </div>

                {/* Planes fijos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-10">
                  {[
                    {
                      key: "starter", name: "Starter", monthlyUsd: 4.99, annualUsd: 3.99,
                      tokens: 15, extraTokens: 0, discount: 10,
                      desc: language === "es" ? "Ideal para escuchas casuales" : "Ideal for casual listeners",
                      color: "#06b6d4", popular: false,
                    },
                    {
                      key: "pro", name: "Pro", monthlyUsd: 9.99, annualUsd: 7.49,
                      tokens: 35, extraTokens: 5, discount: 25,
                      desc: language === "es" ? "Para fans del contenido" : "For content enthusiasts",
                      color: "#7c3aed", popular: true,
                    },
                  ].map(plan => {
                    const priceUsd = isAnnualPlan ? plan.annualUsd : plan.monthlyUsd;
                    const totalUsd = isAnnualPlan ? +(plan.annualUsd * 12).toFixed(2) : plan.monthlyUsd;
                    return (
                    <div
                      key={plan.key}
                      className={`relative rounded-3xl border p-7 flex flex-col transition-all hover:-translate-y-1 ${
                        plan.popular
                          ? "border-[#7c3aed]/50 bg-[#7c3aed]/5 shadow-[0_20px_60px_rgba(124,58,237,0.15)]"
                          : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                      }`}
                    >
                      {plan.popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#7c3aed] text-white text-[0.6rem] font-black uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1">
                          <IconStar size={10} /> {language === "es" ? "Más Popular" : "Most Popular"}
                        </div>
                      )}
                      <div className="w-12 h-12 rounded-2xl mb-5 flex items-center justify-center" style={{ background: `${plan.color}20`, border: `1px solid ${plan.color}30` }}>
                        <IconToken size={22} />
                      </div>
                      <h3 className="text-xl font-black mb-1">{plan.name}</h3>
                      <p className="text-3xl font-black mb-0.5" style={{ color: plan.color }}>
                        ${priceUsd}<span className="text-sm font-normal text-white/40">/{isAnnualPlan ? (language === "es" ? "mes (anual)" : "mo (annual)") : (language === "es" ? "mes" : "mo")}</span>
                      </p>
                      <p className="text-[0.6rem] text-white/30 mb-2">
                        {isAnnualPlan
                          ? (language === "es" ? `Cobrado en un pago de $${totalUsd} al año` : `Billed as $${totalUsd} yearly`)
                          : (language === "es" ? `Anual: $${plan.annualUsd}/mes · Ahorras ${plan.discount}%` : `Annual: $${plan.annualUsd}/mo · Save ${plan.discount}%`)}
                      </p>
                      <p className="text-white/60 text-sm mb-1">
                        <strong style={{ color: plan.color }}>{plan.tokens}</strong> {language === "es" ? "créditos/mes" : "credits/month"}
                      </p>
                      <p className="text-white/30 text-xs mb-6">{plan.desc}</p>
                      <ul className="space-y-2 mb-7 flex-1">
                        {[
                          language === "es" ? "Descargas MP3" : "MP3 Downloads",
                          language === "es" ? "Re-descarga con 66% de descuento" : "Re-download with 66% discount",
                          language === "es" ? "Catálogo completo" : "Full catalog access",
                          ...(plan.extraTokens > 0 ? [language === "es" ? `+${plan.extraTokens} créditos bono al suscribirte` : `+${plan.extraTokens} bonus credits on sign-up`] : []),
                        ].map(tp => (
                          <li key={tp} className="flex items-center gap-2 text-xs text-white/60">
                            <span className="text-emerald-400"><IconCheck size={14} /></span> {tp}
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => {
                          const planItem: Track = {
                            id: 0, title: `Plan ${plan.name} (${isAnnualPlan ? (language === "es" ? "Anual" : "Annual") : (language === "es" ? "Mensual" : "Monthly")})`, artist: "Éxito.cyou", type: "subscription",
                            price_tokens: 0, price_usd: totalUsd, album_art_path: "", file_path: "",
                            genre: "subscription", duration_seconds: 0, creator: "Éxito.cyou",
                            description: `${plan.tokens} créditos/mes`,
                          };
                          setCheckoutItem(planItem); setPaymentMethod("paypal"); setPaymentSubMethod("paypal");
                          setPurchaseSuccess(null);
                          setCheckoutPlan(plan.key + (isAnnualPlan ? "_annual" : "_monthly"));
                          setCheckoutStep(userInfo.authenticated ? 2 : 1);
                          if (!userInfo.authenticated) setGuestEmail(localStorage.getItem("mediasuite_guest_email") || "");
                        }}
                        className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2"
                        style={{ background: `${plan.color}20`, color: plan.color, border: `1px solid ${plan.color}30` }}
                      >
                        <IconToken size={14} /> {language === "es" ? `Suscribirse a ${plan.name}` : `Subscribe to ${plan.name}`}
                      </button>
                    </div>
                    );
                  })}
                </div>

                {/* Compra de créditos puntuales (pay-for-use) */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-3xl p-8 mb-6">
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-black mb-1">{language === "es" ? "Compra créditos sueltos" : "Buy individual credits"}</h3>
                    <p className="text-white/40 text-xs">
                      {language === "es"
                        ? "Sin suscripción. Precio base: 3 créditos = $1.00 USD. Elige la cantidad exacta."
                        : "No subscription. Base price: 3 credits = $1.00 USD. Choose the exact amount."}
                    </p>
                  </div>
                  <CreditPackSelector language={language} userInfo={userInfo} router={router}
                    onCheckout={(credits: number, usd: number) => {
                      const packItem: Track = {
                        id: 0, title: `${credits} créditos`, artist: "Éxito.cyou", type: "credits",
                        price_tokens: 0, price_usd: usd, album_art_path: "", file_path: "",
                        genre: "credits", duration_seconds: 0, creator: "Éxito.cyou",
                        description: `Pack de ${credits} créditos`,
                      };

                      setCheckoutItem(packItem); setPaymentMethod("paypal"); setPaymentSubMethod("paypal");
                      setPurchaseSuccess(null); setCheckoutPlan("");
                      setCheckoutStep(userInfo.authenticated ? 2 : 1);
                      if (!userInfo.authenticated) setGuestEmail(localStorage.getItem("mediasuite_guest_email") || "");
                    }}
                  />
                </div>

                {/* Sin suscripción */}
                <div className="mt-6 text-center">
                  <p className="text-white/30 text-xs">
                    {language === "es" ? "También puedes comprar canciones individuales directamente desde el catálogo." : "You can also buy individual songs directly from the catalog."}
                  </p>
                  <button onClick={scrollToCatalog} className="mt-3 px-5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/50 text-sm font-bold hover:bg-white/[0.08] transition-all inline-flex items-center gap-2">
                    {language === "es" ? "Explorar catálogo" : "Explore catalog"} <IconChevronRight size={14} />
                  </button>
                </div>
              </div>
            </section>
          )}

        </div>
      </div>




      {/* ─── MODAL CREADOR ──────────────────────────────────────────────── */}
      {creatorModalOpen && selectedCreator && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setCreatorModalOpen(false)}
        >
          <div className="bg-[#0d0d1f] border border-white/[0.08] rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl relative overflow-hidden">
            {/* Background gradient */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 20% 0%, ${selectedCreator.accent}15 0%, transparent 60%)` }} />
            
            {/* Header */}
            <div className="relative flex items-center justify-between px-6 py-5 border-b border-white/[0.05]">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${selectedCreator.accent}20`, border: `1px solid ${selectedCreator.accent}40` }}>
                  <span style={{ color: selectedCreator.accent }}>{selectedCreator.icon}</span>
                </div>
                <div>
                  <h2 className="text-xl font-black text-white">{language === "es" ? selectedCreator.name : selectedCreator.nameEn}</h2>
                  <p className="text-sm text-white/40">{selectedCreator.desc}</p>
                  <p className="text-xs text-white/25 mt-0.5">{creatorCatalog.length} {language === "es" ? "elementos" : "items"}</p>
                </div>
              </div>
              <button
                onClick={() => setCreatorModalOpen(false)}
                className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.10] transition-all"
              >
                <IconClose size={16} />
              </button>
            </div>

            {/* Catalog grid */}
            <div className="relative flex-1 overflow-y-auto p-5 [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-thumb]:bg-white/[0.08] [&::-webkit-scrollbar-thumb]:rounded-full">
              {creatorCatalog.length === 0 ? (
                <div className="text-center py-16 text-white/30">
                  <div className="flex justify-center mb-4">
                    <IconMusicNote size={40} />
                  </div>
                  <p className="text-sm">{language === "es" ? "Contenido próximamente disponible." : "Content coming soon."}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {creatorCatalog.map(item => {
                    const art = getArtUrl(item.album_art_path);
                    const isPlaying = currentTrack?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`group rounded-xl border overflow-hidden cursor-pointer transition-all hover:-translate-y-1 ${
                          isPlaying
                            ? "border-[#7c3aed]/50 bg-[#7c3aed]/10"
                            : "border-white/[0.05] bg-white/[0.02] hover:border-white/[0.15]"
                        }`}
                      >
                        <div className="aspect-square relative overflow-hidden" onClick={() => {
                          handlePlay(item);
                          setCreatorModalOpen(false);
                          scrollToCatalog();
                        }}>
                          {art ? (
                            <Image src={art} alt={item.title} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/20 bg-gradient-to-br from-[#7c3aed]/15 to-[#06b6d4]/10">
                              {item.type === "audiobook" ? <IconBook size={32} /> : <IconMusicNote size={32} />}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black">
                              {isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
                            </div>
                          </div>
                        </div>
                        <div className="p-3">
                          <p className="text-xs font-bold text-white truncate">{item.title}</p>
                          <div className="flex items-center justify-between mt-1.5">
                            <p className="text-[0.6rem] font-black text-white">${item.price_usd.toFixed(2)}</p>
                            <button
                              onClick={() => handleCheckout(item)}
                              className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:scale-110"
                              style={{ background: `${selectedCreator.accent}20`, color: selectedCreator.accent, border: `1px solid ${selectedCreator.accent}30` }}
                              title="Comprar"
                            >
                              <IconDownload size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE COMPRA ─────────────────────────────────────────────── */}
      {checkoutItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && !purchaseSuccess && setCheckoutItem(null)}>
          <div className="bg-[#0d0d1f] border border-white/[0.08] rounded-3xl p-7 w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl relative [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-thumb]:bg-white/[0.08] [&::-webkit-scrollbar-thumb]:rounded-full">
            <button
              onClick={() => { setCheckoutItem(null); setPurchaseSuccess(null); setCheckoutPlan(null); }}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.10] transition-all"
            >
              <IconClose size={16} />
            </button>

            {!purchaseSuccess ? (
              // Para suscripciones y packs de créditos: ir SIEMPRE a método de pago (PayPal/Tarjeta)
              // Para canciones con suscripción activa: canje directo de tokens
              userInfo.authenticated && userInfo.subscription &&
              checkoutItem.type !== "subscription" && checkoutItem.type !== "credits" ? (
                /* ─── AUTHENTICATED WITH SUBSCRIPTION: Direct token redeem ─── */
                <form onSubmit={processPurchase} className="space-y-5">
                  <div className="flex items-center gap-4 bg-white/[0.03] rounded-2xl p-4">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/[0.05] shrink-0">
                      {getArtUrl(checkoutItem.album_art_path) ? (
                        <img src={getArtUrl(checkoutItem.album_art_path)!} alt="" className="w-full h-full object-cover" />
                      ) : <div className="w-full h-full flex items-center justify-center text-white/30"><IconMusicNote size={24} /></div>}
                    </div>
                    <div>
                      <p className="font-black text-white">{checkoutItem.title}</p>
                      <p className="text-sm text-white/40">{checkoutItem.artist}</p>
                      <p className="text-xs font-bold mt-1 flex items-center gap-1" style={{ color: "#06b6d4" }}>
                        ${checkoutItem.price_usd.toFixed(2)} USD · {checkoutItem.price_tokens} <IconToken size={12} />
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-white/40 text-center font-bold bg-[#7c3aed]/15 border border-[#7c3aed]/25 rounded-2xl p-3 flex items-center justify-center gap-2">
                    <IconToken size={14} className="text-[#a78bfa]" /> Suscripción Activa · Canje Directo con Créditos
                  </div>
                  <button
                    type="submit"
                    disabled={processing}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#9333ea] text-white font-black text-sm uppercase tracking-wider transition-all hover:shadow-[0_8px_30px_rgba(124,58,237,0.4)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <><IconToken size={16} /> Canjear {checkoutItem.price_tokens} Créditos</>
                    )}
                  </button>
                  <p className="text-center text-[0.6rem] text-white/20 flex items-center justify-center gap-1 mt-2">
                    <IconLock size={10} /> Pago seguro · DRM con firma digital · Disponible 48h
                  </p>
                </form>
              ) : checkoutStep === 1 ? (
                /* ─── STEP 1: Guest info + Pay button ─── */
                <div className="space-y-5">
                  {/* Track info */}
                  <div className="flex items-center gap-4 bg-white/[0.03] rounded-2xl p-4">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/[0.05] shrink-0">
                      {getArtUrl(checkoutItem.album_art_path) ? (
                        <img src={getArtUrl(checkoutItem.album_art_path)!} alt="" className="w-full h-full object-cover" />
                      ) : <div className="w-full h-full flex items-center justify-center text-white/30"><IconMusicNote size={24} /></div>}
                    </div>
                    <div>
                      <p className="font-black text-white">{checkoutItem.title}</p>
                      <p className="text-sm text-white/40">{checkoutItem.artist}</p>
                      {(checkoutItem as any).album && (
                        <p className="text-[0.65rem] text-[#a78bfa] truncate">{((checkoutItem as any).album as string)}</p>
                      )}
                      <p className="text-xs font-bold mt-1 flex items-center gap-1" style={{ color: "#06b6d4" }}>
                        ${checkoutItem.price_usd.toFixed(2)} USD · {checkoutItem.price_tokens} <IconToken size={12} />
                      </p>
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-[0.65rem] font-bold uppercase tracking-wider text-white/30 mb-1.5">Tu email</label>
                    <input
                      type="email" required value={guestEmail} onChange={e => setGuestEmail(e.target.value)}
                      placeholder="tu@email.com"
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-[#7c3aed]/50 transition-all"
                    />
                  </div>

                  {/* Register toggle */}
                  <div className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                    <input type="checkbox" id="autoReg" checked={autoRegister} onChange={e => setAutoRegister(e.target.checked)} className="w-4 h-4 accent-[#7c3aed] rounded" />
                    <label htmlFor="autoReg" className="text-[0.7rem] text-emerald-400 font-bold cursor-pointer flex items-center gap-1.5">
                      <IconGift size={12} /> Registrar para recibir 5 tokens gratis
                    </label>
                  </div>
                  {autoRegister && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[0.6rem] font-bold uppercase tracking-wider text-white/30 mb-1.5">Nombre</label>
                        <input type="text" value={guestUsername} onChange={e => setGuestUsername(e.target.value)} placeholder="tu nombre" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/20 outline-none focus:border-[#7c3aed]/50 transition-all" />
                      </div>
                      <div>
                        <label className="block text-[0.6rem] font-bold uppercase tracking-wider text-white/30 mb-1.5">Contraseña</label>
                        <input type="password" value={guestPassword} onChange={e => setGuestPassword(e.target.value)} placeholder="••••••••" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/20 outline-none focus:border-[#7c3aed]/50 transition-all" />
                      </div>
                    </div>
                  )}

                  {/* Pay button → goes to step 2 */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!guestEmail.includes("@")) {
                        alert("Por favor ingrese un correo electrónico válido.");
                        return;
                      }
                      setCheckoutStep(2);
                    }}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#9333ea] text-white font-black text-sm uppercase tracking-wider transition-all hover:shadow-[0_8px_30px_rgba(124,58,237,0.4)] hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    Pagar ${checkoutItem.price_usd.toFixed(2)}
                  </button>

                  <p className="text-center text-[0.6rem] text-white/20 flex items-center justify-center gap-1 mt-2">
                    <IconLock size={10} /> Pago seguro · DRM con firma digital · Disponible 48h
                  </p>
                </div>
              ) : (
                /* ─── STEP 2: Payment method selection (PayPal / Card) ─── */
                <div className="space-y-5">
                  {/* Compact track info */}
                  <div className="flex items-center gap-3 bg-white/[0.03] rounded-2xl p-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/[0.05] shrink-0">
                      {getArtUrl(checkoutItem.album_art_path) ? (
                        <img src={getArtUrl(checkoutItem.album_art_path)!} alt="" className="w-full h-full object-cover" />
                      ) : <div className="w-full h-full flex items-center justify-center text-white/30"><IconMusicNote size={20} /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-white truncate">{checkoutItem.title}</p>
                      <p className="text-[0.6rem] text-white/40 truncate">{checkoutItem.artist}</p>
                    </div>
                    <p className="text-xs font-black shrink-0" style={{ color: "#06b6d4" }}>${checkoutItem.price_usd.toFixed(2)}</p>
                  </div>

                  {/* Payment method selector */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentSubMethod("paypal")}
                      className={`py-3 rounded-2xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${paymentSubMethod === "paypal" ? "bg-[#06b6d4]/10 border-[#06b6d4] text-[#06b6d4]" : "border-white/[0.06] text-white/40 hover:bg-white/[0.03]"}`}
                    >
                      <IconCreditCard size={14} /> PayPal
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentSubMethod("card")}
                      className={`py-3 rounded-2xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${paymentSubMethod === "card" ? "bg-[#06b6d4]/10 border-[#06b6d4] text-[#06b6d4]" : "border-white/[0.06] text-white/40 hover:bg-white/[0.03]"}`}
                    >
                      <IconCreditCard size={14} /> Tarjeta
                    </button>
                  </div>

                  {/* PayPal Button */}
                  <PayPalButtonWrapper 
                    key={paymentSubMethod}
                    fundingType={paymentSubMethod}
                    checkoutItem={checkoutItem}
                    guestEmail={guestEmail}
                    guestUsername={guestUsername}
                    guestPassword={guestPassword}
                    autoRegister={autoRegister}
                    isAuthenticated={checkoutPlan ? true : false}
                    onSuccess={(data: any) => setPurchaseSuccess(data)}
                    setProcessing={setProcessing}
                    processing={processing}
                    checkoutPlan={checkoutPlan}
                  />

                  {/* Back */}
                  <button
                    type="button"
                    onClick={() => {
                      if (checkoutPlan) {
                        setCheckoutItem(null);
                        setCheckoutPlan(null);
                        setActiveSection("subscription");
                      } else {
                        setCheckoutStep(1);
                      }
                    }}
                    className="w-full py-2 rounded-xl border border-white/[0.06] text-white/40 text-xs font-bold hover:bg-white/[0.03] hover:text-white/60 transition-all"
                  >
                    ← {checkoutPlan ? "Planes" : "Volver"}
                  </button>

                  <p className="text-center text-[0.6rem] text-white/20 flex items-center justify-center gap-1 mt-2">
                    <IconLock size={10} /> Pago seguro · DRM con firma digital · Disponible 48h
                  </p>
                </div>
              )
            ) : (
              <div className="text-center space-y-6 py-4">
                <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                  <IconCheck size={36} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">
                    {checkoutPlan ? "¡Suscripción Activada!" : "¡Compra Exitosa!"}
                  </h3>
                  <p className="text-white/40 text-sm mt-1">
                    {checkoutPlan
                      ? `Plan ${purchaseSuccess.plan || checkoutPlan} activado. ${purchaseSuccess.tokens_granted || 0} créditos añadidos a tu cuenta.`
                      : "Tu archivo está listo con firma DRM personalizada y metadatos de autoría."}
                  </p>
                </div>
                {purchaseSuccess.transaction_id && (
                  <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-4 text-left">
                    <p className="text-[0.6rem] text-white/30 uppercase tracking-wider mb-1">ID de Transacción</p>
                    <p className="text-xs font-mono font-bold text-white/70 break-all">{purchaseSuccess.transaction_id}</p>
                  </div>
                )}
                {purchaseSuccess.auto_user && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 text-left">
                    <p className="text-[0.65rem] font-black text-emerald-400 mb-1 flex items-center gap-1"><IconGift size={12} /> Cuenta creada automáticamente</p>
                    <p className="text-xs text-white/50">Usuario: <span className="text-white font-mono">{purchaseSuccess.auto_user}</span></p>
                    <p className="text-xs text-white/50 mt-0.5">Créditos de regalo: <span className="text-[#06b6d4] font-bold flex items-center gap-1 inline-flex">5 <IconToken size={10} /></span></p>
                  </div>
                )}
                {purchaseSuccess.new_balance != null && (
                  <div className="bg-[#7c3aed]/10 border border-[#7c3aed]/25 rounded-2xl p-4 text-left">
                    <p className="text-[0.65rem] font-black text-[#a78bfa] mb-1 flex items-center gap-1"><IconToken size={12} /> Nuevo saldo de créditos</p>
                    <p className="text-lg font-black text-white">{purchaseSuccess.new_balance} <span className="text-sm text-[#a78bfa]"><IconToken size={14} /></span></p>
                  </div>
                )}
                {!checkoutPlan && (
                  <button
                    onClick={() => handleDownload(purchaseSuccess.purchase_id)}
                    className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm uppercase tracking-wider transition-all hover:-translate-y-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                  >
                    <IconDownload size={18} /> Descargar con DRM
                  </button>
                )}
                {checkoutPlan && (
                  <button
                    onClick={() => { setCheckoutItem(null); setPurchaseSuccess(null); setCheckoutPlan(null); setActiveSection("subscription"); }}
                    className="w-full py-4 rounded-2xl bg-[#7c3aed] hover:bg-[#9333ea] text-white font-black text-sm uppercase tracking-wider transition-all hover:-translate-y-0.5 shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
                  >
                    Ir a mis planes
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {/* ─── COVER UPLOAD MODAL ──────────────────────────────────────────── */}
      {coverUploadItem && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[300] flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && !coverUploading && setCoverUploadItem(null)}
        >
          <div className="bg-[#0c0c1e] border border-white/[0.08] rounded-3xl p-6 w-full max-w-sm shadow-2xl relative overflow-hidden">
            {/* Gradient accent */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 50% 0%, rgba(124,58,237,0.08) 0%, transparent 70%)" }} />

            <button
              onClick={() => setCoverUploadItem(null)}
              disabled={coverUploading}
              className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white transition-all"
            >
              <IconClose size={14} />
            </button>

            <div className="relative">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-2xl bg-[#7c3aed]/20 border border-[#7c3aed]/30 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-[#a78bfa]"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Personalizar Portada</h3>
                  <p className="text-[0.65rem] text-white/40 truncate max-w-[180px]">{coverUploadItem.title}</p>
                </div>
              </div>

              {/* Track art preview */}
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white/[0.05] border border-white/[0.06] mx-auto mb-5">
                {getArtUrl(coverUpdates[coverUploadItem.id] || coverUploadItem.album_art_path) ? (
                  <img
                    src={getArtUrl(coverUpdates[coverUploadItem.id] || coverUploadItem.album_art_path)!}
                    alt="" className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20">
                    <IconMusicNote size={28} />
                  </div>
                )}
              </div>

              {/* Upload area */}
              <label
                htmlFor="cover-file-input"
                className={`block w-full border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
                  coverUploading
                    ? "border-[#7c3aed]/60 bg-[#7c3aed]/5 cursor-not-allowed"
                    : "border-white/[0.10] hover:border-[#7c3aed]/60 hover:bg-[#7c3aed]/5"
                }`}
              >
                {coverUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-[#7c3aed]/30 border-t-[#a78bfa] rounded-full animate-spin" />
                    <p className="text-xs text-[#a78bfa] font-bold">Subiendo portada...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-white/30">
                      <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
                    </svg>
                    <p className="text-xs font-bold text-white/60">Arrastra una imagen o haz clic</p>
                    <p className="text-[0.6rem] text-white/30">JPG, PNG, WEBP · Máx 10MB · Recomendado cuadrada</p>
                  </div>
                )}
                <input
                  id="cover-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={coverUploading}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleCoverUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>

              {/* Divider */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-white/[0.05]" />
                <span className="text-[0.6rem] text-white/25 uppercase tracking-wider">o</span>
                <div className="flex-1 h-px bg-white/[0.05]" />
              </div>

              {/* Auto-assign from Pexels */}
              <button
                onClick={() => { handleAutoAssignCover(coverUploadItem); setCoverUploadItem(null); }}
                disabled={coverUploading}
                className="w-full py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/60 text-xs font-bold hover:bg-white/[0.07] hover:border-white/20 hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-[#06b6d4]"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                Auto-asignar desde Pexels
                <span className="text-[0.55rem] text-white/25 font-normal">(acorde al título)</span>
              </button>

              <p className="text-center text-[0.58rem] text-white/20 mt-3">
                La imagen se guardará en formato cuadrado y se asignará solo a este archivo
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD TO PLAYLIST MODAL ───────────────────────────────────────── */}
      {addToPlaylistItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4" onClick={() => { setAddToPlaylistItem(null); setAddToPlaylistSuccess(null); }}>
          <div className="bg-[#0d0d1f] border border-white/[0.08] rounded-3xl w-full max-w-sm p-5 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setAddToPlaylistItem(null); setAddToPlaylistSuccess(null); }} className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white transition-all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 shrink-0 rounded-xl overflow-hidden bg-white/[0.05]">
                {getArtUrl(addToPlaylistItem.album_art_path) ? (
                  <img src={getArtUrl(addToPlaylistItem.album_art_path)!} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20"><IconMusicNote size={20} /></div>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white truncate">{addToPlaylistItem.title}</h3>
                <p className="text-[0.6rem] text-white/40 truncate">{addToPlaylistItem.artist}</p>
              </div>
            </div>
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-white/30 mb-3">Agregar a lista</p>
            {addToPlaylistSuccess ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-400 mx-auto mb-2"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                <p className="text-sm font-bold text-emerald-400">¡Agregado!</p>
                <p className="text-[0.6rem] text-white/40 mt-1">{addToPlaylistSuccess}</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-52 overflow-y-auto custom-scrollbar">
                {userPlaylists.map(pl => (
                  <button
                    key={pl.id}
                    disabled={addToPlaylistLoading}
                    onClick={async () => {
                      setAddToPlaylistLoading(true);
                      try {
                        const res = await fetch(`/api/user-playlists/${pl.id}/items`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ media_catalog_id: addToPlaylistItem.id }),
                        });
                        if (res.ok) {
                          setAddToPlaylistSuccess(`Agregado a "${pl.name}"`);
                          setUserPlaylists(prev => prev.map(p => p.id === pl.id ? { ...p, item_count: p.item_count + 1 } : p));
                        } else {
                          const err = await res.json();
                          alert(err.detail || "Error al agregar");
                        }
                      } catch {
                        alert("Error de conexión");
                      } finally {
                        setAddToPlaylistLoading(false);
                      }
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold text-white/70 hover:text-white hover:bg-white/[0.04] transition-all border border-transparent hover:border-white/[0.06] disabled:opacity-50"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#a78bfa] shrink-0">
                      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                    <span className="flex-1 truncate">{pl.name}</span>
                    <span className="text-[0.55rem] text-white/30">{pl.item_count} items</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TOAST NOTIFICATION ──────────────────────────────────────────── */}
      {autoCoverToast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[400] bg-[#0c0c1e]/95 backdrop-blur-xl border border-white/[0.10] rounded-2xl px-4 py-3 text-xs text-white/80 font-medium shadow-2xl shadow-black/60 flex items-center gap-2.5 max-w-xs text-center animate-[fadeIn_0.3s_ease]">
          <span className="shrink-0 text-base">{autoCoverToast.startsWith("✅") ? "✅" : autoCoverToast.startsWith("❌") ? "❌" : "🎨"}</span>
          <span>{autoCoverToast.replace(/^[✅❌🎨]\s*/, "")}</span>
        </div>
      )}
    </main>
  );
}
