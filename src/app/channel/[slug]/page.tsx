"use client";

/**
 * /channel/[slug]/page.tsx — Perfil de Creador/Canal
 * ====================================================
 * Accesible también via /@slug gracias al rewrite en next.config.ts
 * Inspirado en Spotify Artist Profile + YouTube Channel Page
 * - Banner glassmorphism con stats destacadas
 * - Álbumes agrupados por proyecto
 * - Canciones más escuchadas (top tracks)
 * - Lanzamientos recientes
 * - Reproductor integrado persistente
 * - Checkout funcional con tokens y PayPal
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { use } from "react";
import StreamPlayer, { type Track } from "@/components/StreamPlayer";
import { prefetchTrack } from "@/utils/prefetch";
import AIChatSidebar from "@/components/AIChatSidebar";
import { usePlayer } from "@/contexts/PlayerContext";
import dynamic from "next/dynamic";
import Link from "next/link";
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });
import musicLoadingAnimation from "../../../../public/lotties/music-loading.json";
import { getPayPalSdkUrl, sandboxModePayload } from "@/utils/paypalMode";

// ─── PayPal Button Wrapper (Real SDK integration) ───────────────────────────
interface PayPalButtonWrapperProps {
  checkoutItem: Track;
  guestEmail: string;
  guestUsername: string;
  guestPassword: string;
  autoRegister: boolean;
  isAuthenticated: boolean;
  channelSlug: string;
  onSuccess: (data: any) => void;
  setProcessing: (b: boolean) => void;
  processing: boolean;
  fundingType: "paypal" | "card";
}

function PayPalButtonWrapper({
  checkoutItem,
  guestEmail,
  guestUsername,
  guestPassword,
  autoRegister,
  isAuthenticated,
  channelSlug,
  onSuccess,
  setProcessing,
  processing,
  fundingType
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
            // Validar correo en invitados
            if (!isAuthenticated && !guestEmail.includes("@")) {
              alert("Por favor ingrese un correo electrónico válido para facturar antes de proceder al pago.");
              return actions.reject();
            }
            return actions.resolve();
          },
          createOrder: async () => {
            setProcessing(true);
            try {
              const res = await fetch("/api/ecommerce/paypal/create-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  media_catalog_id: checkoutItem.id,
                  payment_method: "paypal",
                  guest_email: !isAuthenticated ? guestEmail : undefined,
                  guest_username: guestUsername || undefined,
                  guest_password: guestPassword || undefined,
                  auto_register: autoRegister && !isAuthenticated,
                  ...sandboxModePayload()
                })
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
                  order_id: data.orderID, // Pasamos la orden aprobada para capturar
                  channel_slug: channelSlug,
                  ...sandboxModePayload()
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
  }, [checkoutItem.id, guestEmail, guestUsername, guestPassword, autoRegister, isAuthenticated, fundingType]);

  return <div ref={containerRef} />;
}


// ─── Tipos ──────────────────────────────────────────────────────────────────
interface Album {
  name: string;
  cover: string | null;
  tracks: Track[];
  total_streams: number;
}

interface CreatorProfile {
  slug: string;
  name: string;
  description: string;
  color: string;
  gradient: string;
  type: string;
  creator_type?: string;
  language: string;
  stats: {
    total_tracks: number;
    total_audiobooks: number;
    total_items: number;
    total_streams: number;
    total_albums: number;
  };
  albums: Album[];
  top_tracks: Track[];
  recent_items: Track[];
  all_songs: Track[];
  all_audiobooks: Track[];
}

interface UserInfo {
  authenticated: boolean;
  user?: {
    username: string;
    tokens_balance: number;
    role: string;
  };
  subscription?: {
    plan: string;
    tokens_per_month: number;
    period_end: string;
  };
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────
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

const IconMusicNote = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
  </svg>
);

const IconBook = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z" />
  </svg>
);

const IconDownload = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
  </svg>
);

const IconBack = ({ size = 20, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
  </svg>
);

const IconAlbum = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
  </svg>
);

const IconHeadphones = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z" />
  </svg>
);

const IconToken = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
  </svg>
);

const IconAt = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10h5v-2h-5c-4.34 0-8-3.66-8-8s3.66-8 8-8 8 3.66 8 8v1.43c0 .79-.71 1.57-1.5 1.57s-1.5-.78-1.5-1.57V12c0-2.76-2.24-5-5-5s-5 2.24-5 5 2.24 5 5 5c1.38 0 2.64-.56 3.54-1.47.65.89 1.77 1.47 2.96 1.47C19.05 19 21 17.05 21 14.43V12c0-5.52-4.48-10-10-10zm0 13c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" />
  </svg>
);

const IconClose = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const IconCheck = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

// ─── Helper ──────────────────────────────────────────────────────────────────
function getArtUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (path.includes("media_library/")) {
    return path.replace(/.*media_library\//, "/media-static/");
  }
  return path;
}

function formatStreams(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(secs?: number): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function CreatorChannelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const { currentTrack, play: contextPlay, setPlaylist: setCtxPlaylist } = usePlayer();

  useEffect(() => {
    if (typeof window !== "undefined" && slug) {
      // Preserve query params (e.g. ?buy=<track_id>&sandbox=1) from agentic links.
      const search = window.location.search || "";
      window.history.replaceState({}, "", `/@${slug}${search}`);
    }
  }, [slug]);
  const [activeTab, setActiveTab] = useState<"overview" | "albums" | "tracks" | "audiobooks">("overview");
  const [checkoutItem, setCheckoutItem] = useState<Track | null>(null);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo>({ authenticated: false });
  const [paymentMethod, setPaymentMethod] = useState<"paypal" | "tokens">("paypal");
  const [paymentSubMethod, setPaymentSubMethod] = useState<"paypal" | "card">("paypal");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestUsername, setGuestUsername] = useState("");
  const [guestPassword, setGuestPassword] = useState("");
  const [autoRegister, setAutoRegister] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState<any>(null);
  const [likedIds, setLikedIds] = useState<number[]>([]);
  const [likesCounts, setLikesCounts] = useState<Record<string, number>>({});
  const [fanEmailSub, setFanEmailSub] = useState("");
  const [subToast, setSubToast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/artist-studio/likes/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.success) {
          setLikedIds(d.liked_ids || []);
          setLikesCounts(d.counts || {});
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleLike = async (trackId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch("/api/artist-studio/likes/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_catalog_id: trackId }),
      });
      const d = await res.json();
      if (d?.success) {
        setLikesCounts((prev) => ({ ...prev, [String(trackId)]: d.likes_count }));
        setLikedIds((prev) =>
          d.liked ? [...prev.filter((id) => id !== trackId), trackId] : prev.filter((id) => id !== trackId)
        );
      }
    } catch {}
  };

  const handleVotePoll = async (pollId: number, optionId: number) => {
    try {
      const res = await fetch(`/api/artist-studio/polls/${pollId}/vote?option_id=${optionId}`, {
        method: "POST",
      });
      if (res.ok) {
        const updated = await fetch(`/api/ecommerce/creator/${slug}`);
        if (updated.ok) setProfile(await updated.json());
      }
    } catch {}
  };

  const handleSubscribeArtist = async () => {
    if (!fanEmailSub.includes("@")) return;
    const res = await fetch(`/api/artist-studio/public/${slug}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fan_email: fanEmailSub }),
    });
    if (res.ok) {
      setSubToast("✅ ¡Te has suscrito al canal del artista!");
      setFanEmailSub("");
      setTimeout(() => setSubToast(null), 4000);
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch(`/api/ecommerce/creator/${slug}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
          // Combinar todas las canciones para el reproductor
          const tracks = [...data.all_songs, ...data.all_audiobooks];
          setAllTracks(tracks);
          setCtxPlaylist(tracks);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();

    // Verificar autenticación del usuario
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/ecommerce/me/info");
        if (res.ok) {
          const data = await res.json();
          setUserInfo(data);
        }
      } catch {}
    };
    checkAuth();
  }, [slug]);

  const handlePlay = useCallback((track: Track) => {
    setCtxPlaylist([]);
    contextPlay(track);
  }, [contextPlay, setCtxPlaylist]);

  const handleCheckout = useCallback((track: Track) => {
    setCheckoutItem(track);
    setPurchaseSuccess(null);
    setGuestEmail("");
    const hasActivePlan = !!(userInfo.authenticated && userInfo.subscription);
    if (hasActivePlan) {
      setPaymentMethod("tokens");
    } else {
      setPaymentMethod("paypal");
      setPaymentSubMethod("paypal");
    }
  }, [userInfo]);

  // Open the checkout modal when arriving from an agentic share link
  // (e.g. /channel/<slug>?buy=<track_id>&sandbox=1).
  const autoCheckoutRef = useRef<string | null>(null);
  useEffect(() => {
    if (allTracks.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const buyId = params.get("buy");
    if (!buyId || autoCheckoutRef.current === buyId) return;
    const track = allTracks.find((t) => String(t.id) === buyId);
    if (!track) return;
    autoCheckoutRef.current = buyId;
    params.delete("buy");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    queueMicrotask(() => handleCheckout(track));
  }, [allTracks, handleCheckout]);

  // Cargar SDK de PayPal dinámicamente si no está en el window.
  // En modo demo (?sandbox=1) usa NEXT_PUBLIC_PAYPAL_SANDBOX_CLIENT_ID.
  useEffect(() => {
    const sdkUrl = getPayPalSdkUrl();
    if (!sdkUrl) {
      console.warn("Sandbox demo mode is enabled, but NEXT_PUBLIC_PAYPAL_SANDBOX_CLIENT_ID is not configured on this build.");
      return;
    }
    const existing = document.getElementById("paypal-sdk-script") as HTMLScriptElement | null;
    if (existing && existing.src !== sdkUrl) {
      existing.remove();
      delete (window as any).paypal;
    }
    if (!document.getElementById("paypal-sdk-script")) {
      const script = document.createElement("script");
      script.id = "paypal-sdk-script";
      script.src = sdkUrl;
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const processPurchase = async (e?: React.FormEvent, orderId?: string) => {
    if (e) e.preventDefault();
    if (!checkoutItem) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/ecommerce/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_catalog_id: checkoutItem.id,
          payment_method: paymentMethod,
          guest_email: paymentMethod === "paypal" && !userInfo.authenticated ? guestEmail : undefined,
          guest_username: guestUsername || guestEmail.split("@")[0],
          guest_password: guestPassword || undefined,
          auto_register: autoRegister && !userInfo.authenticated,
          order_id: orderId || undefined,
          channel_slug: slug,
          ...sandboxModePayload(),
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

  const handleDownload = async (purchaseId: number) => {
    try {
      const res = await fetch(`/api/ecommerce/download-link/${purchaseId}`);
      if (res.ok) {
        const data = await res.json();
        window.open(data.download_url, "_blank");
      }
    } catch {}
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#04040a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <Lottie
            animationData={musicLoadingAnimation}
            loop={true}
            className="w-64 h-64"
          />
        </div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-[#04040a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/20 text-6xl font-black mb-4">404</p>
          <p className="text-white/50 text-lg mb-8">Creador no encontrado</p>
          <Link href="/" className="px-6 py-3 rounded-2xl bg-[#7c3aed] text-white font-bold text-sm hover:bg-[#9333ea] transition-colors">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const accentColor = profile.color;
  const hasPlayer = !!currentTrack;

  // Separar canciones con álbum de los Singles
  const singlesAlbum: Album | null = (() => {
    const singles = profile.all_songs.filter(s => !s.album || s.album === "Single");
    if (singles.length === 0) return null;
    return {
      name: "Singles",
      cover: singles[0]?.album_art_path || null,
      tracks: singles,
      total_streams: singles.reduce((acc, s) => acc + (s.play_count || 0), 0),
    };
  })();

  const allAlbums = singlesAlbum
    ? [...profile.albums, singlesAlbum]
    : profile.albums;

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background: `radial-gradient(circle at 20% 0%, ${accentColor}12 0%, transparent 40%), radial-gradient(circle at 80% 60%, ${accentColor}08 0%, transparent 50%), #04040a`,
        paddingBottom: hasPlayer ? "108px" : "32px",
      }}
    >
      {/* ─── BACK BUTTON ───────────────────────────────────────────────── */}
      <div className="fixed top-4 left-4 z-30 group">
        <Link
          href="/"
          className={`flex items-center gap-2 bg-black/60 backdrop-blur-xl border border-white/[0.08] rounded-full h-10 text-white/60 hover:text-white text-sm font-bold transition-all duration-300 hover:bg-black/80 overflow-hidden ${isScrolled ? 'w-10 px-0 justify-center group-hover:w-[130px] group-hover:px-4' : 'w-[130px] px-4'}`}
        >
          <IconBack size={16} className="shrink-0" />
          <span className={`whitespace-nowrap transition-opacity duration-300 ${isScrolled ? 'opacity-0 group-hover:opacity-100 hidden group-hover:block' : 'opacity-100 block'}`}>Éxito.cyou</span>
        </Link>
      </div>


      {/* ─── USER BADGE (top right) ─────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-30 flex items-center gap-2">
        {userInfo.authenticated && userInfo.user ? (
          <div className="flex items-center gap-2">
            <Link
              href="/portal"
              className="flex items-center gap-2 bg-black/60 backdrop-blur-xl border border-white/[0.08] hover:border-purple-500/40 rounded-full h-10 px-3.5 text-white/80 hover:text-white text-xs font-bold transition-all shadow-lg"
              title="Ir a mi Portal de Fan"
            >
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#7c3aed] to-[#06b6d4] flex items-center justify-center text-[10px] text-white font-black">
                {userInfo.user.username.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:inline">{userInfo.user.username}</span>
              <span className="flex items-center gap-1 text-amber-300 ml-1">
                <IconToken size={11} className="shrink-0" />
                <span>{userInfo.user.tokens_balance}</span>
              </span>
            </Link>

            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.reload();
              }}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/[0.08] hover:border-rose-500/40 text-white/40 hover:text-rose-400 transition-all shadow-lg"
              title="Cerrar Sesión"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-1.5 bg-black/60 backdrop-blur-xl border border-white/[0.08] hover:border-purple-500/40 rounded-full h-10 px-4 text-white/70 hover:text-white text-xs font-bold transition-all shadow-lg"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            <span>Iniciar Sesión</span>
          </Link>
        )}
      </div>

      {/* ─── HERO BANNER ───────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Gradient banner background */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${accentColor}30 0%, ${accentColor}10 40%, transparent 100%)`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#04040a]" />

        {/* Animated particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full opacity-10 animate-pulse"
              style={{
                width: `${80 + i * 40}px`,
                height: `${80 + i * 40}px`,
                background: accentColor,
                top: `${10 + i * 12}%`,
                left: `${5 + i * 16}%`,
                animationDelay: `${i * 0.5}s`,
                filter: "blur(40px)",
              }}
            />
          ))}
        </div>

        <div className="relative z-10 px-6 lg:px-12 pt-20 pb-10">
          <div className="flex flex-col md:flex-row items-start md:items-end gap-8 max-w-6xl mx-auto">
            {/* Channel Avatar */}
            <div
              className="w-36 h-36 md:w-48 md:h-48 rounded-3xl flex items-center justify-center shrink-0 shadow-2xl border border-white/10 relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${accentColor}40, ${accentColor}15)`,
                boxShadow: `0 20px 60px ${accentColor}30`,
              }}
            >
              <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at 30% 30%, ${accentColor}80, transparent 70%)` }} />
              <span style={{ color: accentColor }} className="relative z-10">
                <IconHeadphones size={64} />
              </span>
              {/* Verified badge */}
              <div
                className="absolute bottom-3 right-3 w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
                style={{ background: accentColor }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </div>
            </div>

            {/* Channel Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-[0.65rem] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border"
                  style={{ color: accentColor, borderColor: `${accentColor}40`, background: `${accentColor}10` }}
                >
                  {profile.type}
                </span>
                <span className="text-[0.6rem] text-white/30 flex items-center gap-1">
                  <IconAt size={12} />
                  {profile.slug}
                </span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-3 leading-none">
                {profile.name}
              </h1>
              <p className="text-white/50 text-sm max-w-xl leading-relaxed mb-6">
                {profile.description}
              </p>

             {/* Stats Row */}
              <div className="flex flex-wrap gap-6">
                {[
                  { label: profile.language === "en" ? "Tracks" : "Canciones", value: profile.stats.total_tracks, icon: <IconMusicNote size={14} /> },
                  { label: profile.language === "en" ? "Albums" : "Álbumes", value: profile.stats.total_albums, icon: <IconAlbum size={14} /> },
                  ...(profile.creator_type === "audiobook" || profile.stats.total_audiobooks > 0 ? [
                    { label: profile.language === "en" ? "Audiobooks" : "Audiolibros", value: profile.stats.total_audiobooks, icon: <IconBook size={14} /> }
                  ] : []),
                  { label: profile.language === "en" ? "Streams" : "Reproducciones", value: formatStreams(profile.stats.total_streams), icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg> },
                ].map(stat => (
                  <div key={stat.label} className="flex flex-col">
                    <span className="text-[0.6rem] text-white/30 uppercase tracking-widest flex items-center gap-1 mb-0.5">
                      <span style={{ color: accentColor }}>{stat.icon}</span>
                      {stat.label}
                    </span>
                    <span className="text-xl font-black" style={{ color: accentColor }}>
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Play All Button */}
            {allTracks.length > 0 && (
              <button
                onClick={() => {
                  setCtxPlaylist(allTracks);
                  contextPlay(allTracks[0]);
                }}
                className="shrink-0 flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all hover:-translate-y-0.5 hover:shadow-2xl active:scale-95"
                style={{
                  background: accentColor,
                  boxShadow: `0 8px 30px ${accentColor}40`,
                  color: "#04040a",
                }}
              >
                <IconPlay size={20} />
                {profile.language === "en" ? "Play All" : "Reproducir todo"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── TAB NAVIGATION ────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 px-6 lg:px-12 py-0 bg-[#04040a]/90 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto flex gap-1 overflow-x-auto scrollbar-none">
          {([
            { id: "overview", label: profile.language === "en" ? "Overview" : "Resumen" },
            { id: "albums", label: profile.language === "en" ? `Albums (${allAlbums.length})` : `Álbumes (${allAlbums.length})` },
            { id: "tracks", label: profile.language === "en" ? `Songs (${profile.stats.total_tracks})` : `Canciones (${profile.stats.total_tracks})` },
            ...(profile.stats.total_audiobooks > 0 ? [{ id: "audiobooks", label: profile.language === "en" ? `Audiobooks (${profile.stats.total_audiobooks})` : `Audiolibros (${profile.stats.total_audiobooks})` }] : []),
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-5 py-4 text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap border-b-2 ${
                activeTab === tab.id
                  ? "text-white border-current"
                  : "text-white/30 border-transparent hover:text-white/60"
              }`}
              style={activeTab === tab.id ? { borderColor: accentColor, color: accentColor } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── CONTENT ───────────────────────────────────────────────────── */}
      <div className="px-6 lg:px-12 py-8 max-w-6xl mx-auto">

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-12">

            {/* Top Tracks */}
            {profile.top_tracks.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-black">
                    {profile.language === "en" ? "Popular Tracks" : "Más escuchadas"}
                  </h2>
                  <button
                    onClick={() => setActiveTab("tracks")}
                    className="text-xs font-bold text-white/40 hover:text-white transition-colors uppercase tracking-wider"
                  >
                    {profile.language === "en" ? "See all →" : "Ver todas →"}
                  </button>
                </div>
                <div className="space-y-1">
                  {profile.top_tracks.slice(0, 5).map((track, idx) => {
                    const art = getArtUrl(track.album_art_path);
                    const isPlaying = currentTrack?.id === track.id;
                    return (
                      <div
                        key={track.id}
                        className={`group flex items-center gap-4 p-3 rounded-xl transition-all hover:bg-white/[0.04] cursor-pointer ${
                          isPlaying ? "bg-white/[0.06]" : ""
                        }`}
                        onClick={() => handlePlay(track)}
                        onMouseEnter={() => prefetchTrack(track)}
                        onTouchStart={() => prefetchTrack(track)}
                      >
                        <span className="w-6 text-center text-sm font-bold text-white/30 group-hover:hidden">
                          {idx + 1}
                        </span>
                        <button className="w-6 hidden group-hover:flex items-center justify-center text-white">
                          {isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
                        </button>

                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/[0.04] shrink-0">
                          {art ? (
                            <img src={art} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/20">
                              <IconMusicNote size={16} />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${isPlaying ? "text-current" : "text-white"}`}
                            style={isPlaying ? { color: accentColor } : {}}>
                            {track.title}
                          </p>
                          <p className="text-[0.65rem] text-white/40 truncate">{track.artist}</p>
                        </div>

                        {/* Play count */}
                        <span className="text-xs text-white/30 tabular-nums shrink-0">
                          {formatStreams(track.play_count || 0)}
                        </span>

                        {/* Duration */}
                        <span className="text-xs text-white/30 tabular-nums w-10 text-right shrink-0">
                          {formatDuration(track.duration_seconds)}
                        </span>

                        {/* Corazón / Me Gusta */}
                        <button
                          onClick={e => handleToggleLike(track.id, e)}
                          className={`px-2 py-1 rounded-lg flex items-center gap-1 text-xs font-bold transition-all shrink-0 ${
                            likedIds.includes(track.id)
                              ? "text-rose-400 bg-rose-500/15 border border-rose-500/40"
                              : "text-white/30 hover:text-rose-400"
                          }`}
                          title="Me Gusta"
                        >
                          <span>{likedIds.includes(track.id) ? "♥" : "♡"}</span>
                          {(likesCounts[String(track.id)] || 0) > 0 && (
                            <span className="text-[10px]">{likesCounts[String(track.id)]}</span>
                          )}
                        </button>

                        {/* Buy button */}
                        <button
                          onClick={e => { e.stopPropagation(); handleCheckout(track); }}
                          className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110 shrink-0"
                          style={{ background: `${accentColor}20`, color: accentColor, border: `1px solid ${accentColor}30` }}
                        >
                          <IconDownload size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Albums Preview */}
            {allAlbums.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-black">
                    {profile.language === "en" ? "Albums" : "Álbumes"}
                  </h2>
                  <button
                    onClick={() => setActiveTab("albums")}
                    className="text-xs font-bold text-white/40 hover:text-white transition-colors uppercase tracking-wider"
                  >
                    {profile.language === "en" ? "See all →" : "Ver todos →"}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {allAlbums.slice(0, 5).map(album => {
                    const art = getArtUrl(album.cover);
                    return (
                      <div
                        key={album.name}
                        className="group cursor-pointer"
                        onClick={() => { setActiveTab("albums"); }}
                      >
                        <div className="aspect-square rounded-2xl overflow-hidden bg-white/[0.04] mb-3 relative shadow-lg">
                          {art ? (
                            <img src={art} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ background: `${accentColor}10` }}>
                              <span style={{ color: accentColor }}><IconAlbum size={40} /></span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    setCtxPlaylist(album.tracks);
                                    contextPlay(album.tracks[0]);
                                  }}
                                  className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-2xl hover:scale-110 transition-transform"
                                >
                                  <IconPlay size={20} />
                                </button>
                              </div>
                        </div>
                        <p className="text-sm font-bold text-white truncate">{album.name}</p>
                        <p className="text-[0.6rem] text-white/40 mt-0.5">
                          {album.tracks.length} {profile.language === "en" ? "tracks" : "canciones"} · {formatStreams(album.total_streams)} {profile.language === "en" ? "plays" : "reproducciones"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Recent Releases */}
            {profile.recent_items.length > 0 && (
              <section>
                <h2 className="text-xl font-black mb-6">
                  {profile.language === "en" ? "Recent Releases" : "Lanzamientos recientes"}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {profile.recent_items.slice(0, 6).map(item => {
                    const art = getArtUrl(item.album_art_path);
                    const isPlaying = currentTrack?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        className="group cursor-pointer"
                        onClick={() => handlePlay(item)}
                        onMouseEnter={() => prefetchTrack(item)}
                        onTouchStart={() => prefetchTrack(item)}
                      >
                        <div className={`aspect-square rounded-2xl overflow-hidden bg-white/[0.04] mb-2 relative shadow-md border transition-all ${isPlaying ? "border-current ring-2" : "border-white/[0.05]"}`}
                          style={isPlaying ? { borderColor: accentColor, boxShadow: `0 0 20px ${accentColor}30` } : {}}>
                          {art ? (
                            <img src={art} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/20">
                              {item.type === "audiobook" ? <IconBook size={32} /> : <IconMusicNote size={32} />}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-xl">
                              {isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
                            </div>
                          </div>
                          {isPlaying && (
                            <div className="absolute bottom-2 left-2 flex gap-[3px] items-end">
                              {[5,9,7,11].map((h,i) => (
                                <span key={i} className="w-[3px] rounded-full animate-bounce" style={{ height:`${h}px`, background: accentColor, animationDelay:`${i*0.15}s` }} />
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="text-[0.7rem] font-bold text-white truncate">{item.title}</p>
                        <p className="text-[0.6rem] text-white/30 truncate capitalize">{item.type}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Comunidad del Artista: Suscripción y Votaciones Interactivas ── */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              {/* Unirse a la Comunidad del Artista */}
              <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-white">🔔 Comunidad Oficial de {profile.name}</h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold">
                    {(profile.stats as any)?.subscribers_count || 0} miembros
                  </span>
                </div>
                <p className="text-xs text-white/50">
                  Recibe alertas de nuevos lanzamientos, preventas de álbumes vía PayPal y sesiones en vivo de Cloud DJ.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={fanEmailSub}
                    onChange={(e) => setFanEmailSub(e.target.value)}
                    placeholder="Tu correo electrónico..."
                    className="flex-1 px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white"
                  />
                  <button
                    onClick={handleSubscribeArtist}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-black transition hover:opacity-90"
                    style={{ background: accentColor }}
                  >
                    Unirme
                  </button>
                </div>
                {subToast && <p className="text-xs text-emerald-400 font-semibold">{subToast}</p>}
              </div>

              {/* Votaciones creadas por el Artista */}
              <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-white">🗳️ Votaciones del Artista</h3>
                  <Link href="/artist-studio" className="text-[11px] text-purple-400 hover:underline font-bold">
                    ¿Eres artista? Abre tu Studio →
                  </Link>
                </div>
                {(profile as any).polls && (profile as any).polls.length > 0 ? (
                  <div className="space-y-3">
                    {(profile as any).polls.slice(0, 2).map((poll: any) => (
                      <div key={poll.id} className="p-3.5 rounded-2xl bg-black/30 border border-white/5 space-y-2">
                        <p className="text-xs font-bold text-white">{poll.question}</p>
                        <div className="space-y-1.5">
                          {poll.options.map((opt: any) => (
                            <button
                              key={opt.id}
                              onClick={() => handleVotePoll(poll.id, opt.id)}
                              className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 text-xs transition"
                            >
                              <span className="text-white/90">{opt.text}</span>
                              <span className="font-bold text-purple-300">{opt.votes} votos</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-white/40 py-4">
                    El artista publicará nuevas encuestas para elegir el próximo single muy pronto.
                  </p>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ── ALBUMS TAB ───────────────────────────────────────────────── */}
        {activeTab === "albums" && (
          <div>
            {allAlbums.length === 0 ? (
              <div className="text-center py-24 text-white/20">
                <IconAlbum size={48} />
                <p className="mt-4 text-sm">No hay álbumes disponibles aún</p>
              </div>
            ) : (
              <div className="space-y-10">
                {allAlbums.map(album => {
                  const art = getArtUrl(album.cover);
                  return (
                    <div key={album.name} className="bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden">
                      {/* Album Header */}
                      <div className="flex items-center gap-6 p-6 border-b border-white/[0.04]">
                        <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white/[0.04] shrink-0">
                          {art ? (
                            <img src={art} alt={album.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ background: `${accentColor}10` }}>
                              <span style={{ color: accentColor }}><IconAlbum size={32} /></span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-[0.6rem] text-white/30 uppercase tracking-widest mb-1">Álbum</p>
                          <h3 className="text-xl font-black text-white">{album.name}</h3>
                          <p className="text-sm text-white/40 mt-0.5">{album.tracks.length} tracks · {formatStreams(album.total_streams)} plays</p>
                        </div>
                        <button
                          onClick={() => {
                            setCtxPlaylist(album.tracks);
                            contextPlay(album.tracks[0]);
                          }}
                          className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 shrink-0"
                          style={{ background: accentColor, color: "#04040a" }}
                        >
                          <IconPlay size={20} />
                        </button>
                      </div>

                      {/* Track List */}
                      <div className="p-4 space-y-1">
                        {album.tracks.map((track, idx) => {
                          const isPlaying = currentTrack?.id === track.id;
                          return (
                            <div
                              key={track.id}
                              className={`group flex items-center gap-4 p-2.5 rounded-xl cursor-pointer transition-all hover:bg-white/[0.04] ${isPlaying ? "bg-white/[0.06]" : ""}`}
                              onClick={() => handlePlay(track)}
                              onMouseEnter={() => prefetchTrack(track)}
                              onTouchStart={() => prefetchTrack(track)}
                            >
                              <span className="w-5 text-center text-xs font-bold text-white/30 group-hover:hidden">{idx + 1}</span>
                              <span className="w-5 hidden group-hover:flex items-center justify-center">
                                {isPlaying ? <IconPause size={14} /> : <IconPlay size={14} />}
                              </span>
                              <p className="flex-1 text-sm font-bold truncate" style={isPlaying ? { color: accentColor } : { color: "rgba(255,255,255,0.85)" }}>
                                {track.title}
                              </p>
                              <span className="text-xs text-white/30 tabular-nums">{formatStreams(track.play_count || 0)}</span>
                              <span className="text-xs text-white/25 tabular-nums w-10 text-right">{formatDuration(track.duration_seconds)}</span>
                              <button
                                onClick={e => { e.stopPropagation(); handleCheckout(track); }}
                                className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0"
                                style={{ background: `${accentColor}20`, color: accentColor }}
                              >
                                <IconDownload size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TRACKS TAB ──────────────────────────────────────────────── */}
        {activeTab === "tracks" && (
          <div>
            <div className="space-y-1">
              {profile.all_songs.length === 0 ? (
                <div className="text-center py-24 text-white/20">
                  <IconMusicNote size={48} />
                  <p className="mt-4 text-sm">No hay canciones disponibles</p>
                </div>
              ) : (
                profile.all_songs.map((track, idx) => {
                  const art = getArtUrl(track.album_art_path);
                  const isPlaying = currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      className={`group flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all hover:bg-white/[0.04] ${isPlaying ? "bg-white/[0.06]" : ""}`}
                      onClick={() => handlePlay(track)}
                      onMouseEnter={() => prefetchTrack(track)}
                      onTouchStart={() => prefetchTrack(track)}
                    >
                      <span className="w-6 text-center text-sm font-bold text-white/20 group-hover:hidden">{idx + 1}</span>
                      <span className="w-6 hidden group-hover:flex items-center justify-center">
                        {isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
                      </span>
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/[0.04] shrink-0">
                        {art ? <img src={art} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/20"><IconMusicNote size={16} /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate" style={isPlaying ? { color: accentColor } : { color: "rgba(255,255,255,0.85)" }}>{track.title}</p>
                        <p className="text-[0.6rem] text-white/35 truncate">{track.album || "Single"}</p>
                      </div>
                      <span className="text-xs text-white/30 tabular-nums hidden sm:block">{track.genre || ""}</span>
                      <span className="text-xs text-white/25 tabular-nums">{formatStreams(track.play_count || 0)}</span>
                      <span className="text-xs text-white/25 tabular-nums w-10 text-right">{formatDuration(track.duration_seconds)}</span>
                      <button
                        onClick={e => { e.stopPropagation(); handleCheckout(track); }}
                        className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0"
                        style={{ background: `${accentColor}20`, color: accentColor }}
                      >
                        <IconDownload size={12} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── AUDIOBOOKS TAB ──────────────────────────────────────────── */}
        {activeTab === "audiobooks" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {profile.all_audiobooks.length === 0 ? (
              <div className="col-span-full text-center py-24 text-white/20">
                <IconBook size={48} />
                <p className="mt-4 text-sm">No hay audiolibros disponibles</p>
              </div>
            ) : (
              profile.all_audiobooks.map(item => {
                const art = getArtUrl(item.album_art_path);
                const isPlaying = currentTrack?.id === item.id;
                return (
                  <div key={item.id} className="group cursor-pointer" onClick={() => handlePlay(item)}>
                    <div className={`aspect-square rounded-2xl overflow-hidden bg-white/[0.04] mb-3 relative border transition-all ${isPlaying ? "ring-2" : "border-white/[0.05]"}`}
                      style={isPlaying ? { borderColor: accentColor, boxShadow: `0 0 20px ${accentColor}30` } : {}}>
                      {art ? <img src={art} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : (
                        <div className="w-full h-full flex items-center justify-center text-white/20"><IconBook size={40} /></div>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-xl">
                          {isPlaying ? <IconPause size={20} /> : <IconPlay size={20} />}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs font-bold text-white truncate">{item.title}</p>
                    <p className="text-[0.6rem] text-white/35 mt-0.5">{item.artist}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[0.6rem] font-black" style={{ color: accentColor }}>${item.price_usd.toFixed(2)}</span>
                      <button
                        onClick={e => { e.stopPropagation(); handleCheckout(item); }}
                        className="w-6 h-6 rounded-lg flex items-center justify-center transition-all"
                        style={{ background: `${accentColor}20`, color: accentColor }}
                      >
                        <IconDownload size={11} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ─── CHECKOUT MODAL ────────────────────────────────────────────── */}
      {checkoutItem && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && !purchaseSuccess && setCheckoutItem(null)}
        >
          <div className="bg-[#0d0d1f] border border-white/[0.08] rounded-3xl p-7 w-full max-w-md shadow-2xl relative">
            <button
              onClick={() => { setCheckoutItem(null); setPurchaseSuccess(null); }}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.10] transition-all"
            >
              <IconClose size={16} />
            </button>

            {purchaseSuccess ? (
              /* ── SUCCESS STATE ── */
              <div className="text-center py-4">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl"
                  style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}80)` }}
                >
                  <IconCheck size={28} />
                </div>
                <h3 className="text-xl font-black text-white mb-2">¡Compra exitosa!</h3>
                <p className="text-sm text-white/50 mb-1">{checkoutItem.title}</p>
                {purchaseSuccess.balance !== undefined && (
                  <p className="text-xs text-white/30 mb-6">Balance restante: <span className="font-bold" style={{ color: accentColor }}>{purchaseSuccess.balance} tokens</span></p>
                )}
                {purchaseSuccess.purchase_id && (
                  <button
                    onClick={() => handleDownload(purchaseSuccess.purchase_id)}
                    className="w-full py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 mb-3 transition-all hover:opacity-90"
                    style={{ background: accentColor, color: "#04040a" }}
                  >
                    <IconDownload size={16} />
                    Descargar archivo
                  </button>
                )}
                <button
                  onClick={() => { setCheckoutItem(null); setPurchaseSuccess(null); }}
                  className="w-full py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white/50 text-sm font-bold hover:bg-white/[0.08] transition-all"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              /* ── CHECKOUT FORM ── */
              <form onSubmit={processPurchase}>
                {/* Item Preview */}
                <div className="flex items-center gap-4 bg-white/[0.03] rounded-2xl p-4 mb-5">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/[0.05] shrink-0">
                    {getArtUrl(checkoutItem.album_art_path) ? (
                      <img src={getArtUrl(checkoutItem.album_art_path)!} alt="" className="w-full h-full object-cover" />
                    ) : <div className="w-full h-full flex items-center justify-center text-white/30"><IconMusicNote size={24} /></div>}
                  </div>
                  <div>
                    <p className="font-black text-white">{checkoutItem.title}</p>
                    <p className="text-sm text-white/40">{checkoutItem.artist}</p>
                    <p className="text-xs font-bold mt-1 flex items-center gap-1" style={{ color: accentColor }}>
                      ${checkoutItem.price_usd.toFixed(2)} USD · {checkoutItem.price_tokens} <IconToken size={10} /> tokens
                    </p>
                  </div>
                </div>

                {/* Payment Method Selector */}
                {!(userInfo.authenticated && userInfo.subscription) && (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => setPaymentSubMethod("paypal")}
                      className={`py-3 rounded-2xl text-xs font-bold border transition-all flex items-center justify-center gap-2`}
                      style={paymentSubMethod === "paypal" ? { borderColor: accentColor, background: `${accentColor}15`, color: accentColor } : { borderColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
                    >
                      💳 PayPal
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentSubMethod("card")}
                      className={`py-3 rounded-2xl text-xs font-bold border transition-all flex items-center justify-center gap-2`}
                      style={paymentSubMethod === "card" ? { borderColor: accentColor, background: `${accentColor}15`, color: accentColor } : { borderColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
                    >
                      💳 Tarjeta (Invitado)
                    </button>
                  </div>
                )}
                
                {/* Guest fields (only for PayPal + not authenticated) */}
                {!userInfo.authenticated && (
                  <div className="space-y-3 mb-4">
                    <input
                      type="email"
                      required
                      placeholder="Tu email"
                      value={guestEmail}
                      onChange={e => setGuestEmail(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20 transition-colors"
                    />
                    <input
                      type="text"
                      placeholder="Nombre de usuario (opcional)"
                      value={guestUsername}
                      onChange={e => setGuestUsername(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20 transition-colors"
                    />
                    <input
                      type="password"
                      placeholder="Contraseña (opcional)"
                      value={guestPassword}
                      onChange={e => setGuestPassword(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20 transition-colors"
                    />
                    <div className="flex items-center gap-2 bg-white/[0.02] p-3 rounded-xl border border-white/[0.04]">
                      <input
                        type="checkbox"
                        id="autoReg"
                        checked={autoRegister}
                        onChange={e => setAutoRegister(e.target.checked)}
                        className="w-4 h-4 rounded accent-[#7c3aed]"
                      />
                      <label htmlFor="autoReg" className="text-xs text-white/60 cursor-pointer select-none">
                        Crear cuenta gratis con este correo
                      </label>
                    </div>
                  </div>
                )}

                {/* Token warning */}
                {paymentMethod === "tokens" && userInfo.user && userInfo.user.tokens_balance < checkoutItem.price_tokens && (
                  <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    ⚠️ Saldo insuficiente. Tienes {userInfo.user.tokens_balance} tokens, necesitas {checkoutItem.price_tokens}.
                  </div>
                )}

                {paymentMethod === "tokens" ? (
                  <>
                    <button
                      type="submit"
                      disabled={processing || (paymentMethod === "tokens" && !!userInfo.user && userInfo.user.tokens_balance < checkoutItem.price_tokens)}
                      className="w-full py-3 rounded-2xl text-sm font-black transition-all hover:opacity-90 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
                      style={{ background: accentColor, color: "#04040a" }}
                    >
                      {processing ? "Procesando..." : `Canjear · ${checkoutItem.price_tokens} Tokens`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckoutItem(null)}
                      className="w-full py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white/50 text-sm font-bold hover:bg-white/[0.08] transition-all"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <PayPalButtonWrapper 
                      key={paymentSubMethod}
                      fundingType={paymentSubMethod}
                      checkoutItem={checkoutItem}
                      guestEmail={guestEmail}
                      guestUsername={guestUsername}
                      guestPassword={guestPassword}
                      autoRegister={autoRegister}
                      isAuthenticated={userInfo.authenticated}
                      channelSlug={slug}
                      onSuccess={(data: any) => setPurchaseSuccess(data)}
                      setProcessing={setProcessing}
                      processing={processing}
                    />
                    <button
                      type="button"
                      onClick={() => setCheckoutItem(null)}
                      className="w-full py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white/50 text-sm font-bold hover:bg-white/[0.08] transition-all"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
