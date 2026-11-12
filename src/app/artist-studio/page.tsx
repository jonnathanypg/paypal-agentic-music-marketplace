"use client";

/**
 * /artist-studio/page.tsx — Panel de Artista Independiente & PayPal Agentic Marketplace
 * ======================================================================================
 * Construido para MediaSuite / Éxito.cyou (PayPal AI Hackathon 2026):
 * 1. Billetera PayPal (Zero Fondos Propios), Split de 15% plataforma / 85% artista.
 * 2. Modos de retiro flexibles: Inmediato, Por Umbral ($), Programado (Semanal/Mensual) o Manual.
 * 3. Subida de canciones MP3/WAV, letras, portadas y creación de Álbumes con precios flexibles.
 * 4. Doble modalidad:
 *    - Con suscripción exito.cyou -> Acceso directo a Suno DAW, Shorts Engine, Live Studio, etc.
 *    - Sin suscripción -> Gestión completa de su catálogo y conversión de ganancias en Tokens IA.
 * 5. Analítica avanzada tipo Spotify for Artists + Comunidad (Suscriptores, Notificaciones, Votaciones).
 * 6. Agente IA Personalizado (RAG Multitenant) + Vinculación Omnicanal WhatsApp QR (Aikrofy) y Telegram.
 */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ExitoLogoIcon } from "@/components/ExitoLogo";
import { isSandboxMode } from "@/utils/paypalMode";
import { setAgentPageContext } from "@/utils/agentPageContext";

type TabType = "overview" | "catalog" | "paypal" | "agent" | "community";

export default function ArtistStudioPage() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [loading, setLoading] = useState(true);
  const [studioData, setStudioData] = useState<any>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Estados de Formulario de Perfil, PayPal y Agente ──
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [bio, setBio] = useState("");
  const [genreFocus, setGenreFocus] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#8b5cf6");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [paypalMerchantId, setPaypalMerchantId] = useState("");
  const [payphoneNumber, setPayphoneNumber] = useState("");
  const [payoutMode, setPayoutMode] = useState("manual");
  const [payoutThreshold, setPayoutThreshold] = useState(20);

  // ── Agente IA y Omnicanalidad ──
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [agentName, setAgentName] = useState("");
  const [agentPersonaType, setAgentPersonaType] = useState("artist_clone");
  const [agentWelcomeMessage, setAgentWelcomeMessage] = useState("");
  const [agentRagKnowledge, setAgentRagKnowledge] = useState("");
  const [agentVoiceId, setAgentVoiceId] = useState("ef_dora");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramBotUsername, setTelegramBotUsername] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [metaWabaId, setMetaWabaId] = useState("");
  const [waQrSvg, setWaQrSvg] = useState<string | null>(null);
  const [waConnected, setWaConnected] = useState(false);
  const [waLoading, setWaLoading] = useState(false);

  // ── Subida de Track MP3/WAV ──
  const [trackTitle, setTrackTitle] = useState("");
  const [trackGenre, setTrackGenre] = useState("Urbano / Consciente");
  const [trackPriceUsd, setTrackPriceUsd] = useState("1.99");
  const [trackPriceTokens, setTrackPriceTokens] = useState("2");
  const [trackAlbumName, setTrackAlbumName] = useState("");
  const [trackDesc, setTrackDesc] = useState("");
  const [trackLyrics, setTrackLyrics] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploadingTrack, setUploadingTrack] = useState(false);

  // ── Creación de Álbum ──
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumDesc, setAlbumDesc] = useState("");
  const [albumGenre, setAlbumGenre] = useState("Urbano / Consciente");
  const [albumPriceUsd, setAlbumPriceUsd] = useState("9.99");
  const [albumCoverFile, setAlbumCoverFile] = useState<File | null>(null);
  const [creatingAlbum, setCreatingAlbum] = useState(false);

  // ── Simulador Agéntico PayPal en Vivo ──
  const [agentChatInput, setAgentChatInput] = useState("Recomiéndame tu mejor canción y dame el link para comprarla con PayPal");
  const [agentChatReply, setAgentChatReply] = useState<any>(null);
  const [testingAgent, setTestingAgent] = useState(false);

  // ── Comunidad: Votaciones y Boletines ──
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOpt1, setPollOpt1] = useState("");
  const [pollOpt2, setPollOpt2] = useState("");
  const [pollOpt3, setPollOpt3] = useState("");
  const [notifSubject, setNotifSubject] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [convertAmount, setConvertAmount] = useState("5.00");

  // ── Retiro / Withdrawal ──
  const [withdrawAmount, setWithdrawAmount] = useState("");

  // ── Gestión Avanzada de Catálogo: Canal Activo, Sub-vistas, Búsqueda y Modales de Edición ──
  const [selectedChannel, setSelectedChannel] = useState<string>("all");
  const [catalogView, setCatalogView] = useState<"tracks" | "albums" | "upload">("tracks");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [selectedAlbumFilter, setSelectedAlbumFilter] = useState<string>("all");
  const [playingTrackId, setPlayingTrackId] = useState<number | null>(null);
  const [audioPreviewEl, setAudioPreviewEl] = useState<HTMLAudioElement | null>(null);

  // Modal Editar Canción
  const [editingTrack, setEditingTrack] = useState<any | null>(null);
  const [editTrackTitle, setEditTrackTitle] = useState("");
  const [editTrackAlbum, setEditTrackAlbum] = useState("");
  const [editTrackGenre, setEditTrackGenre] = useState("");
  const [editTrackPriceUsd, setEditTrackPriceUsd] = useState("1.99");
  const [editTrackLyrics, setEditTrackLyrics] = useState("");
  const [editTrackCoverFile, setEditTrackCoverFile] = useState<File | null>(null);
  const [savingTrackEdit, setSavingTrackEdit] = useState(false);

  // Modal Editar Álbum
  const [editingAlbum, setEditingAlbum] = useState<any | null>(null);
  const [editAlbumTitle, setEditAlbumTitle] = useState("");
  const [editAlbumDesc, setEditAlbumDesc] = useState("");
  const [editAlbumGenre, setEditAlbumGenre] = useState("");
  const [editAlbumPriceUsd, setEditAlbumPriceUsd] = useState("7.99");
  const [editAlbumCoverFile, setEditAlbumCoverFile] = useState<File | null>(null);
  const [applyAlbumCoverToTracks, setApplyAlbumCoverToTracks] = useState(true);
  const [savingAlbumEdit, setSavingAlbumEdit] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const resolveMediaUrl = (path?: string | null) => {
    if (!path) return "/icon.svg";
    if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/media-static/")) {
      return path;
    }
    const clean = path.replace(/^media_library\//, "").replace(/^\/+/, "");
    return `/media-static/${clean}`;
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4500);
  };

  const fetchStudio = useCallback(async (chSlug?: string) => {
    try {
      const targetCh = chSlug ?? selectedChannel;
      const q = targetCh ? `?channel_slug=${encodeURIComponent(targetCh)}` : "";
      const res = await fetch(`/api/artist-studio/me${q}`);
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      setStudioData(data);
      const p = data.profile || {};
      setDisplayName(p.display_name || "");
      setSlug(p.slug || "");
      setBio(p.bio || "");
      setGenreFocus(p.genre_focus || "");
      setPrimaryColor(p.primary_color || "#8b5cf6");
      setPaypalEmail(p.paypal_email || "");
      setPaypalMerchantId(p.paypal_merchant_id || "");
      setPayphoneNumber(p.payphone_number || "");
      setPayoutMode(p.payout_mode || "manual");
      setPayoutThreshold(p.payout_threshold_usd ?? 20);
      setAgentEnabled(p.agent_enabled ?? true);
      setAgentName(p.agent_name || "");
      setAgentPersonaType(p.agent_persona_type || "artist_clone");
      setAgentWelcomeMessage(p.agent_welcome_message || "");
      setAgentRagKnowledge(p.agent_rag_knowledge || "");
      setAgentVoiceId(p.agent_voice_id || "ef_dora");
      setTelegramBotToken(p.telegram_bot_token || "");
      setTelegramBotUsername(p.telegram_bot_username || "");
      setWhatsappPhone(p.whatsapp_phone || "");
      setMetaWabaId(p.meta_business_waba_id || "");
      setWaConnected(Boolean(p.whatsapp_connected));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedChannel]);

  useEffect(() => {
    fetchStudio(selectedChannel);
  }, [fetchStudio, selectedChannel]);

  // Contexto para el copiloto Saori: sabe que el usuario es artista y en qué
  // sección del Artist Studio está. También atiende navegaciones del agente.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setAgentPageContext({
      module: "artist-studio",
      section: activeTab,
      title: "Artist Studio & PayPal Marketplace",
      path: "/artist-studio",
      artist_slug: slug || undefined,
    });
    try {
      sessionStorage.setItem("exito_user_role", "artist");
    } catch {}
  }, [activeTab, slug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const validTabs: TabType[] = ["overview", "catalog", "paypal", "agent", "community"];

    const applyTab = (value: unknown) => {
      const tab = String(value || "");
      if (validTabs.includes(tab as TabType)) {
        setActiveTab(tab as TabType);
      }
    };

    try {
      const pending = sessionStorage.getItem("exito_studio_tab");
      if (pending) {
        applyTab(pending);
        sessionStorage.removeItem("exito_studio_tab");
      }
    } catch {}

    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      applyTab(detail.section);
    };
    window.addEventListener("exito:navigate-section", onNavigate);
    return () => window.removeEventListener("exito:navigate-section", onNavigate);
  }, []);

  const handleUploadProfileImage = async (file: File, imageType: "avatar" | "banner") => {
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("image_type", imageType);
      fd.append("file", file);
      const res = await fetch("/api/artist-studio/me/avatar", {
        method: "POST",
        body: fd,
      });
      const d = await res.json();
      if (res.ok && d.success) {
        showToast(imageType === "avatar" ? "✅ Foto de perfil de artista actualizada" : "✅ Portada/Banner del canal actualizado");
        fetchStudio();
      } else {
        showToast(`⚠️ ${d.detail || "Error al subir imagen"}`);
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  const openEditTrackModal = async (t: any) => {
    setEditingTrack(t);
    setEditTrackTitle(t.title || "");
    setEditTrackAlbum(t.album || t.artist || "");
    setEditTrackGenre(t.genre || "");
    setEditTrackPriceUsd(String(t.price_usd ?? 1.99));
    setEditTrackLyrics("");
    setEditTrackCoverFile(null);
    try {
      const res = await fetch(`/api/artist-studio/me/tracks/${t.id}/lyrics`);
      if (res.ok) {
        const d = await res.json();
        setEditTrackLyrics(d.lyrics_text || "");
      }
    } catch {}
  };

  const handleSaveTrackEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrack) return;
    setSavingTrackEdit(true);
    try {
      const res = await fetch(`/api/artist-studio/me/tracks/${editingTrack.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTrackTitle,
          album: editTrackAlbum,
          genre: editTrackGenre,
          price_usd: parseFloat(editTrackPriceUsd || "1.99"),
          lyrics_text: editTrackLyrics,
        }),
      });
      if (editTrackCoverFile) {
        const fd = new FormData();
        fd.append("file", editTrackCoverFile);
        await fetch(`/api/artist-studio/me/tracks/${editingTrack.id}/cover`, {
          method: "POST",
          body: fd,
        });
      }
      if (res.ok) {
        showToast(`✅ Canción '${editTrackTitle}' actualizada`);
        setEditingTrack(null);
        fetchStudio();
      } else {
        const d = await res.json();
        showToast(`⚠️ ${d.detail || "No se pudo actualizar la canción"}`);
      }
    } finally {
      setSavingTrackEdit(false);
    }
  };

  const handleQuickTrackCoverUpload = async (trackId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/artist-studio/me/tracks/${trackId}/cover`, {
      method: "POST",
      body: fd,
    });
    if (res.ok) {
      showToast("🖼️ Portada de la canción actualizada");
      fetchStudio();
    } else {
      showToast("⚠️ Error actualizando portada");
    }
  };

  const openEditAlbumModal = (alb: any) => {
    setEditingAlbum(alb);
    setEditAlbumTitle(alb.title || "");
    setEditAlbumDesc(alb.description || "");
    setEditAlbumGenre(alb.genre || "");
    setEditAlbumPriceUsd(String(alb.price_usd ?? 7.99));
    setEditAlbumCoverFile(null);
    setApplyAlbumCoverToTracks(true);
  };

  const handleSaveAlbumEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAlbum) return;
    setSavingAlbumEdit(true);
    try {
      const res = await fetch(`/api/artist-studio/me/albums/${editingAlbum.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editAlbumTitle,
          description: editAlbumDesc,
          genre: editAlbumGenre,
          price_usd: parseFloat(editAlbumPriceUsd || "7.99"),
        }),
      });
      if (editAlbumCoverFile) {
        const fd = new FormData();
        fd.append("apply_to_tracks", String(applyAlbumCoverToTracks));
        fd.append("file", editAlbumCoverFile);
        await fetch(`/api/artist-studio/me/albums/${editingAlbum.id}/cover`, {
          method: "POST",
          body: fd,
        });
      }
      if (res.ok) {
        showToast(`💿 Álbum '${editAlbumTitle}' actualizado`);
        setEditingAlbum(null);
        fetchStudio();
      } else {
        const d = await res.json();
        showToast(`⚠️ ${d.detail || "No se pudo actualizar el álbum"}`);
      }
    } finally {
      setSavingAlbumEdit(false);
    }
  };

  const handleQuickAlbumCoverUpload = async (albumId: number, file: File) => {
    const fd = new FormData();
    fd.append("apply_to_tracks", "true");
    fd.append("file", file);
    const res = await fetch(`/api/artist-studio/me/albums/${albumId}/cover`, {
      method: "POST",
      body: fd,
    });
    if (res.ok) {
      showToast("🖼️ Portada del álbum y sus canciones actualizada");
      fetchStudio();
    } else {
      showToast("⚠️ Error actualizando portada del álbum");
    }
  };

  const togglePlayPreview = (track: any) => {
    if (playingTrackId === track.id && audioPreviewEl) {
      audioPreviewEl.pause();
      setPlayingTrackId(null);
      return;
    }
    if (audioPreviewEl) {
      audioPreviewEl.pause();
    }
    const url = resolveMediaUrl(track.file_path);
    const audio = new Audio(url);
    audio.onended = () => setPlayingTrackId(null);
    audio.play().catch(() => {});
    setAudioPreviewEl(audio);
    setPlayingTrackId(track.id);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/artist-studio/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          slug,
          bio,
          genre_focus: genreFocus,
          primary_color: primaryColor,
          paypal_email: paypalEmail,
          paypal_merchant_id: paypalMerchantId,
          payphone_number: payphoneNumber,
          payout_mode: payoutMode,
          payout_threshold_usd: Number(payoutThreshold),
          agent_enabled: agentEnabled,
          agent_name: agentName,
          agent_persona_type: agentPersonaType,
          agent_welcome_message: agentWelcomeMessage,
          agent_rag_knowledge: agentRagKnowledge,
          agent_voice_id: agentVoiceId,
          telegram_bot_token: telegramBotToken,
          telegram_bot_username: telegramBotUsername,
          whatsapp_phone: whatsappPhone,
          meta_business_waba_id: metaWabaId,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        showToast("✅ Configuración guardada y sincronizada con tu canal público");
        fetchStudio();
      } else {
        showToast(`⚠️ Error: ${d.detail || "No se pudo guardar"}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUploadTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile || !trackTitle.trim()) {
      showToast("⚠️ Selecciona un archivo MP3/WAV y escribe el título del track");
      return;
    }
    setUploadingTrack(true);
    try {
      const fd = new FormData();
      fd.append("title", trackTitle);
      fd.append("genre", trackGenre);
      fd.append("price_usd", trackPriceUsd);
      fd.append("price_tokens", trackPriceTokens);
      if (trackAlbumName) fd.append("album_name", trackAlbumName);
      if (trackDesc) fd.append("description", trackDesc);
      if (trackLyrics) fd.append("lyrics_text", trackLyrics);
      fd.append("audio_file", audioFile);
      if (coverFile) fd.append("cover_file", coverFile);

      const res = await fetch("/api/artist-studio/me/tracks/upload", {
        method: "POST",
        body: fd,
      });
      const d = await res.json();
      if (res.ok) {
        showToast(`🎵 ${d.message}`);
        setTrackTitle("");
        setTrackDesc("");
        setTrackLyrics("");
        setAudioFile(null);
        setCoverFile(null);
        fetchStudio();
      } else {
        showToast(`⚠️ ${d.detail || "Error al subir track"}`);
      }
    } finally {
      setUploadingTrack(false);
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!albumTitle.trim()) return;
    setCreatingAlbum(true);
    try {
      const fd = new FormData();
      fd.append("title", albumTitle);
      fd.append("description", albumDesc);
      fd.append("genre", albumGenre);
      fd.append("price_usd", albumPriceUsd);
      fd.append("price_tokens", "10");
      if (albumCoverFile) fd.append("cover_file", albumCoverFile);

      const res = await fetch("/api/artist-studio/me/albums", {
        method: "POST",
        body: fd,
      });
      const d = await res.json();
      if (res.ok) {
        showToast(`💿 ${d.message}`);
        setAlbumTitle("");
        setAlbumDesc("");
        setAlbumCoverFile(null);
        fetchStudio();
      } else {
        showToast(`⚠️ ${d.detail || "Error al crear álbum"}`);
      }
    } finally {
      setCreatingAlbum(false);
    }
  };

  const handleWithdrawPayPal = async (method: "paypal" | "payphone" = "paypal") => {
    const parsedAmount = parseFloat(withdrawAmount);
    const body: Record<string, unknown> = { payout_method: method, sandbox_mode: isSandboxMode() };
    if (withdrawAmount && !isNaN(parsedAmount) && parsedAmount > 0) {
      body.amount_usd = parsedAmount;
    }
    const res = await fetch("/api/artist-studio/me/payouts/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (res.ok) {
      showToast(`💸 ${d.message}`);
      setWithdrawAmount("");
      fetchStudio();
    } else {
      showToast(`⚠️ ${d.detail || "No se pudo procesar el retiro"}`);
    }
  };

  const handleConvertTokens = async () => {
    const res = await fetch("/api/artist-studio/me/wallet/convert-to-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount_usd: parseFloat(convertAmount || "1") }),
    });
    const d = await res.json();
    if (res.ok) {
      showToast(`⚡ ${d.message}`);
      fetchStudio();
    } else {
      showToast(`⚠️ ${d.detail || "Error al convertir saldo"}`);
    }
  };

  const handleInitWhatsAppQR = async () => {
    setWaLoading(true);
    try {
      const res = await fetch("/api/artist-studio/me/whatsapp/init-qr", { method: "POST" });
      const d = await res.json();
      if (res.ok) {
        setWaConnected(Boolean(d.connected));
        setWaQrSvg(d.qr_svg || null);
        showToast(d.connected ? "✅ WhatsApp conectado" : "📱 Escanea el código QR desde tu WhatsApp");
      }
    } finally {
      setWaLoading(false);
    }
  };

  const handleTestAgenticCommerce = async () => {
    setTestingAgent(true);
    try {
      const res = await fetch("/api/artist-studio/agentic-commerce/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist_slug: slug || "billionairesoundtrack",
          message: agentChatInput,
          channel: "whatsapp",
          sandbox_mode: isSandboxMode(),
        }),
      });
      const d = await res.json();
      setAgentChatReply(d);
    } finally {
      setTestingAgent(false);
    }
  };

  const handleCreatePoll = async () => {
    const options = [pollOpt1, pollOpt2, pollOpt3].filter(Boolean);
    const res = await fetch("/api/artist-studio/me/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: pollQuestion, options }),
    });
    const d = await res.json();
    if (res.ok) {
      showToast("🗳️ Encuesta publicada en tu canal");
      setPollQuestion("");
      setPollOpt1("");
      setPollOpt2("");
      setPollOpt3("");
      fetchStudio();
    } else {
      showToast(`⚠️ ${d.detail || "Error creando encuesta"}`);
    }
  };

  const handleSendNotification = async () => {
    const res = await fetch("/api/artist-studio/me/notify-subscribers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: notifSubject, message: notifMessage, channel: "all" }),
    });
    const d = await res.json();
    if (res.ok) {
      showToast(`📣 ${d.message}`);
      setNotifSubject("");
      setNotifMessage("");
      fetchStudio();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070510] text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-zinc-400">Cargando Panel de Artista & PayPal Marketplace...</p>
        </div>
      </div>
    );
  }

  const profile = studioData?.profile || {};
  const analytics = studioData?.analytics || {};
  const tracks = studioData?.tracks || [];
  const albums = studioData?.albums || [];
  const salesLedger = studioData?.sales_ledger || [];
  const payouts = studioData?.payouts || [];
  const polls = studioData?.polls || [];
  const subscribers = studioData?.subscribers || [];

  const maxAmount = Number(profile.available_balance_usd || 0);
  const parsedWithdraw = parseFloat(withdrawAmount);
  const isValidAmount = !isNaN(parsedWithdraw) && parsedWithdraw > 0 && parsedWithdraw <= maxAmount;

  return (
    <div className="min-h-screen bg-[#070510] text-white pb-20">
      {/* Toast Flotante */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-purple-600/95 border border-purple-400 text-white px-5 py-3 rounded-xl shadow-2xl font-medium text-sm">
          {toastMsg}
        </div>
      )}

      {/* Top Navigation */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#0b0818]/90 border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* Avatar Interactivo del Artista con Subida Rápida */}
            <label className="relative w-12 h-12 rounded-2xl overflow-hidden border-2 border-purple-500/50 cursor-pointer group shrink-0 bg-zinc-900">
              <img
                src={resolveMediaUrl(profile.avatar_url)}
                alt={profile.display_name || "Artista"}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] font-bold text-center leading-tight transition">
                📷 Foto
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadProfileImage(f, "avatar");
                }}
              />
            </label>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Link href="/" className="font-bold text-lg tracking-tight hover:text-purple-300 transition">
                  {profile.display_name || "Éxito.cyou Studio"}
                </Link>
                <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-purple-500/20 border border-amber-400/30 text-amber-300 font-semibold">
                  Artist Studio & PayPal Marketplace
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-400 mt-0.5 flex-wrap">
                <span>
                  Canal público:{" "}
                  <Link href={`/channel/${profile.slug || "billionairesoundtrack"}`} className="text-purple-400 hover:underline font-mono">
                    exito.cyou/channel/{profile.slug || "artista"}
                  </Link>
                </span>
                {/* Selector de Canal / Catálogo */}
                {studioData?.available_channels && (
                  <select
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value)}
                    className="bg-black/60 border border-purple-500/40 rounded-lg px-2.5 py-0.5 text-[11px] text-purple-200 font-semibold outline-none"
                  >
                    {studioData.available_channels.map((ch: any) => (
                      <option key={ch.slug} value={ch.slug}>
                        {ch.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Badge de Modalidad de Cuenta */}
            {profile.has_production_subscription ? (
              <Link
                href="/studio"
                className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-semibold flex items-center gap-2 hover:bg-emerald-500/25 transition"
              >
                <span>✨ Suscripción Producción IA Activa (Abrir Studio DAW)</span>
              </Link>
            ) : (
              <div className="px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-medium">
                Modo Artista Independiente • Tokens IA: <b>{studioData?.user?.tokens_balance ?? 0}</b>
              </div>
            )}

            <Link
              href={`/channel/${profile.slug || "billionairesoundtrack"}`}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-semibold transition"
            >
              Ver Mi Canal Público →
            </Link>
            <Link
              href="/portal"
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-300 transition"
            >
              Mi Cuenta Fan
            </Link>
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
              className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-bold text-rose-300 transition flex items-center gap-1.5"
              title="Cerrar sesión"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Salir</span>
            </button>
          </div>
        </div>

        {/* Pestañas */}
        <div className="max-w-7xl mx-auto mt-4 flex gap-2 overflow-x-auto pb-1">
          {[
            { id: "overview", label: "📊 Estudio & Analítica (Spotify-Style)" },
            { id: "catalog", label: `🎵 Mi Catálogo (${tracks.length} Canciones / ${albums.length} Álbumes)` },
            { id: "paypal", label: "💳 PayPal Marketplace & Retiros Flexibles" },
            { id: "agent", label: "🤖 Agente IA + WhatsApp QR & Telegram" },
            { id: "community", label: "🗳️ Comunidad, Votaciones & Fans" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as TabType)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                activeTab === t.id
                  ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/25"
                  : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-8 space-y-8">
        {/* ══════════════════════════════════════════════════════════════════
            TAB 1: OVERVIEW & ANALÍTICA DE ESTUDIO (SPOTIFY FOR ARTISTS)
           ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Tarjetas KPI Principales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-900/30 to-indigo-900/20 border border-purple-500/30">
                <p className="text-xs text-zinc-400 uppercase tracking-wider">Saldo Disponible (Neto 85%)</p>
                <p className="text-3xl font-extrabold text-white mt-1">
                  ${Number(profile.available_balance_usd || 0).toFixed(2)} <span className="text-sm font-normal text-purple-300">USD</span>
                </p>
                <p className="text-[11px] text-emerald-400 mt-2">
                  Modo de cobro: <b>{profile.payout_mode?.toUpperCase()}</b> • PayPal Verificado
                </p>
              </div>

              <div
                onClick={() => { setActiveTab("catalog"); setCatalogView("tracks"); }}
                className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-cyan-500/40 cursor-pointer transition"
              >
                <p className="text-xs text-zinc-400 uppercase tracking-wider">Reproducciones & Catálogo</p>
                <p className="text-3xl font-extrabold text-cyan-400 mt-1">
                  {(analytics.total_streams || 0).toLocaleString()}
                </p>
                <p className="text-[11px] text-cyan-300 mt-2 underline">
                  Ver y editar mis {analytics.total_tracks || 0} canciones y {analytics.total_albums || 0} álbumes →
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10">
                <p className="text-xs text-zinc-400 uppercase tracking-wider">Corazones / Me Gusta de Fans</p>
                <p className="text-3xl font-extrabold text-rose-400 mt-1">
                  ♥ {(analytics.total_likes || 0).toLocaleString()}
                </p>
                <p className="text-[11px] text-zinc-400 mt-2">
                  Señal activa en el Algoritmo de Recomendación Saori
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10">
                <p className="text-xs text-zinc-400 uppercase tracking-wider">Ventas Directas Acumuladas</p>
                <p className="text-3xl font-extrabold text-amber-400 mt-1">
                  ${Number(profile.lifetime_gross_sales_usd || 0).toFixed(2)}
                </p>
                <p className="text-[11px] text-zinc-400 mt-2">
                  Neto artista: ${Number(profile.lifetime_net_earnings_usd || 0).toFixed(2)} • Fee (15%): ${Number(profile.lifetime_platform_fees_usd || 0).toFixed(2)}
                </p>
              </div>
            </div>

            {/* ── Retiro Rápido de Saldo (Withdraw) — Acceso prominente desde Analytics ── */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-900/30 to-teal-900/20 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Retirar Saldo a PayPal</p>
                <p className="text-sm text-emerald-300 font-semibold">
                  Balance disponible: <span className="text-white font-extrabold">${maxAmount.toFixed(2)} USD</span>
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Ingresa el monto a retirar (máx: ${maxAmount.toFixed(2)})
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="number"
                  min={0.01}
                  max={maxAmount}
                  step={0.01}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder={`0.00`}
                  className="w-32 px-3 py-2 rounded-xl bg-black/50 border border-emerald-400/40 text-white text-sm font-bold outline-none focus:border-emerald-400"
                />
                <button
                  onClick={() => handleWithdrawPayPal("paypal")}
                  disabled={!isValidAmount}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-sm font-bold text-white transition whitespace-nowrap"
                >
                  💸 Retirar a PayPal
                </button>
                <button
                  onClick={() => setActiveTab("paypal")}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-200 transition"
                >
                  ⚙️ Configurar
                </button>
              </div>
            </div>

            {/* Ranking de Canciones Favoritas + Perfil del Canal */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-lg font-bold">🏆 Ranking de Audios Favoritos (Streams + Corazones)</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setActiveTab("catalog"); setCatalogView("tracks"); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30 font-semibold"
                    >
                      🎸 Ver Todas Mis Canciones ({tracks.length})
                    </button>
                    <button
                      onClick={() => { setActiveTab("catalog"); setCatalogView("albums"); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 hover:bg-amber-500/30 font-semibold"
                    >
                      💿 Ver Mis Álbumes ({albums.length})
                    </button>
                  </div>
                </div>

                {analytics.top_tracks_ranking?.length ? (
                  <div className="space-y-2.5">
                    {analytics.top_tracks_ranking.map((t: any, idx: number) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-purple-500/30 transition gap-3 flex-wrap"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-5 text-center font-bold text-xs text-purple-400">#{idx + 1}</span>
                          <img
                            src={resolveMediaUrl(t.album_art_path)}
                            alt={t.title}
                            className="w-11 h-11 rounded-lg object-cover border border-white/10 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-white truncate">{t.title}</p>
                            <p className="text-xs text-zinc-400 truncate">
                              {t.genre || "Single"} • Álbum: <span className="text-purple-300">{t.album || t.artist || "Single"}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <button
                            onClick={() => togglePlayPreview(t)}
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold"
                          >
                            {playingTrackId === t.id ? "⏸ Pausar" : "▶ Oír"}
                          </button>
                          <span className="text-cyan-300 font-medium">▶ {t.play_count}</span>
                          <span className="text-rose-400 font-medium">♥ {t.likes_count}</span>
                          <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 font-bold">
                            ${Number(t.price_usd).toFixed(2)}
                          </span>
                          <button
                            onClick={() => openEditTrackModal(t)}
                            className="px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/30 text-purple-200 font-semibold"
                          >
                            ✏️ Editar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400 py-6 text-center">
                    Aún no hay canciones en este filtro. Selecciona <b>🌐 Todos mis Canales</b> arriba o sube un nuevo MP3.
                  </p>
                )}
              </div>

              {/* Editor Rápido de Identidad e Imagen de Perfil del Artista */}
              <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <h2 className="text-lg font-bold">🎨 Identidad & Foto de Perfil del Artista</h2>

                {/* Previsualización y Subida de Foto de Perfil y Banner */}
                <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-3">
                  <div className="flex items-center gap-3.5">
                    <img
                      src={resolveMediaUrl(profile.avatar_url)}
                      alt={displayName}
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-purple-500/50 shrink-0 bg-zinc-900"
                    />
                    <div className="space-y-1.5 flex-1">
                      <label className="block w-full text-center py-1.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs cursor-pointer transition">
                        {uploadingAvatar ? "Subiendo imagen..." : "📷 Cambiar Foto de Perfil"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUploadProfileImage(f, "avatar");
                          }}
                        />
                      </label>
                      <label className="block w-full text-center py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 font-semibold text-[11px] cursor-pointer transition">
                        🖼️ Cambiar Banner / Portada de Canal
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUploadProfileImage(f, "banner");
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-zinc-400 block mb-1">Nombre Artístico / Sello Musical</label>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Slug URL (exito.cyou/channel/slug)</label>
                    <input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-purple-300 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Género Principal</label>
                    <input
                      value={genreFocus}
                      onChange={(e) => setGenreFocus(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Biografía del Canal</label>
                    <textarea
                      rows={3}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                    />
                  </div>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 font-semibold text-white transition"
                  >
                    {saving ? "Guardando..." : "Guardar Cambios del Canal"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 2: GESTOR COMPLETO DE CATÁLOGO (CANCIONES, ÁLBUMES Y SUBIDAS)
           ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "catalog" && (
          <div className="space-y-6">
            {/* Barra de Sub-navegación del Catálogo */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setCatalogView("tracks")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    catalogView === "tracks"
                      ? "bg-purple-600 text-white shadow-lg"
                      : "bg-white/5 text-zinc-300 hover:bg-white/10"
                  }`}
                >
                  🎸 Mis Canciones Subidas ({tracks.length})
                </button>
                <button
                  onClick={() => setCatalogView("albums")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    catalogView === "albums"
                      ? "bg-amber-500 text-black shadow-lg"
                      : "bg-white/5 text-zinc-300 hover:bg-white/10"
                  }`}
                >
                  💿 Mis Álbumes & Portadas ({albums.length})
                </button>
                <button
                  onClick={() => setCatalogView("upload")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    catalogView === "upload"
                      ? "bg-emerald-600 text-white shadow-lg"
                      : "bg-white/5 text-zinc-300 hover:bg-white/10"
                  }`}
                >
                  ➕ Subir Nuevo MP3 / Crear Álbum
                </button>
              </div>

              {/* Buscador y Filtro por Álbum */}
              {catalogView !== "upload" && (
                <div className="flex items-center gap-2.5 flex-wrap">
                  <input
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="🔍 Buscar canción o álbum..."
                    className="px-3.5 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white w-56 outline-none focus:border-purple-400"
                  />
                  {catalogView === "tracks" && (
                    <select
                      value={selectedAlbumFilter}
                      onChange={(e) => setSelectedAlbumFilter(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-zinc-200 outline-none"
                    >
                      <option value="all">💿 Todos los Álbumes ({albums.length})</option>
                      {albums.map((a: any) => (
                        <option key={a.id} value={a.title}>
                          {a.title} ({a.tracks_count || 0})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* ── VISTA 2A: LISTADO COMPLETO DE CANCIONES SUBIDAS CON EDICIÓN Y PORTADA ── */}
            {catalogView === "tracks" && (
              <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-lg font-bold">🎸 Todas Mis Canciones Publicadas</h2>
                    <p className="text-xs text-zinc-400">
                      Haz clic en la portada de cualquier canción para cambiar su imagen, o en <b>✏️ Editar Canción / Letra / Precio</b> para personalizar sus datos.
                    </p>
                  </div>
                  {selectedAlbumFilter !== "all" && (
                    <button
                      onClick={() => setSelectedAlbumFilter("all")}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200"
                    >
                      ✕ Quitar filtro de álbum: {selectedAlbumFilter}
                    </button>
                  )}
                </div>

                <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
                  {tracks
                    .filter((t: any) => {
                      const matchesAlbum =
                        selectedAlbumFilter === "all" ||
                        (t.album || t.artist || "") === selectedAlbumFilter;
                      const q = catalogSearch.trim().toLowerCase();
                      const matchesSearch =
                        !q ||
                        (t.title || "").toLowerCase().includes(q) ||
                        (t.album || t.artist || "").toLowerCase().includes(q) ||
                        (t.genre || "").toLowerCase().includes(q);
                      return matchesAlbum && matchesSearch;
                    })
                    .map((t: any) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-3.5 rounded-2xl bg-black/40 border border-white/10 hover:border-purple-500/40 transition gap-4 flex-wrap"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          {/* Portada con cambio en 1 clic */}
                          <label className="relative w-14 h-14 rounded-xl overflow-hidden border border-white/15 cursor-pointer group shrink-0 bg-zinc-900">
                            <img
                              src={resolveMediaUrl(t.album_art_path)}
                              alt={t.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] font-bold text-center text-white leading-tight p-1 transition">
                              📷 Cambiar Portada
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleQuickTrackCoverUpload(t.id, f);
                              }}
                            />
                          </label>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-sm text-white truncate">{t.title}</p>
                              {t.lyrics_path && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  📝 Con Letra
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-400 truncate mt-0.5">
                              Álbum: <b className="text-zinc-200">{t.album || t.artist || "Singles"}</b> • Género:{" "}
                              <span className="text-cyan-300">{t.genre || "Urbano"}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 text-xs flex-wrap">
                          <button
                            onClick={() => togglePlayPreview(t)}
                            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold"
                          >
                            {playingTrackId === t.id ? "⏸ Pausar" : "▶ Escuchar"}
                          </button>

                          <span className="px-2.5 py-1.5 rounded-xl bg-cyan-500/10 text-cyan-300 font-medium">
                            ▶ {t.play_count || 0}
                          </span>
                          <span className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 text-rose-300 font-medium">
                            ♥ {t.likes_count || 0}
                          </span>
                          <span className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 font-extrabold">
                            ${Number(t.price_usd || 0.99).toFixed(2)} USD
                          </span>

                          <button
                            onClick={() => openEditTrackModal(t)}
                            className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold shadow"
                          >
                            ✏️ Editar Canción / Letra / Precio
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ── VISTA 2B: GRID DE ÁLBUMES CON EDICIÓN DE INFORMACIÓN Y PORTADA ── */}
            {catalogView === "albums" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-lg font-bold">💿 Mis Álbumes Publicados ({albums.length})</h2>
                    <p className="text-xs text-zinc-400">
                      Personaliza el título, descripción, precio por álbum completo en PayPal y actualiza la imagen de portada de cada álbum.
                    </p>
                  </div>
                  <button
                    onClick={() => setCatalogView("upload")}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs"
                  >
                    + Crear Nuevo Álbum
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {albums
                    .filter((a: any) => {
                      const q = catalogSearch.trim().toLowerCase();
                      return (
                        !q ||
                        (a.title || "").toLowerCase().includes(q) ||
                        (a.description || "").toLowerCase().includes(q)
                      );
                    })
                    .map((a: any) => (
                      <div
                        key={a.id}
                        className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden flex flex-col justify-between hover:border-amber-500/40 transition"
                      >
                        <div>
                          <div className="relative h-48 w-full bg-zinc-900 group">
                            <img
                              src={resolveMediaUrl(a.cover_art_path)}
                              alt={a.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/80 backdrop-blur-md border border-amber-400/40 text-amber-300 font-extrabold text-xs">
                              ${Number(a.price_usd || 7.99).toFixed(2)} USD
                            </div>
                            <label className="absolute bottom-3 left-3 px-3 py-1.5 rounded-xl bg-black/80 hover:bg-purple-600 text-white text-xs font-bold cursor-pointer border border-white/20 transition">
                              📷 Cambiar Portada del Álbum
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleQuickAlbumCoverUpload(a.id, f);
                                }}
                              />
                            </label>
                          </div>

                          <div className="p-4 space-y-1.5">
                            <h3 className="font-bold text-base text-white truncate">{a.title}</h3>
                            <p className="text-xs text-zinc-400 line-clamp-2">
                              {a.description || "Álbum oficial disponible para streaming y descarga directa PayPal."}
                            </p>
                            <div className="flex items-center gap-3 text-[11px] text-zinc-400 pt-1">
                              <span className="text-purple-300 font-semibold">
                                🎵 {a.tracks_count || 0} canciones
                              </span>
                              <span>•</span>
                              <span className="text-cyan-300">▶ {a.play_count || 0} streams</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 pt-0 flex items-center gap-2">
                          <button
                            onClick={() => openEditAlbumModal(a)}
                            className="flex-1 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold text-xs transition"
                          >
                            ✏️ Editar Álbum & Portada
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAlbumFilter(a.title);
                              setCatalogView("tracks");
                            }}
                            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs transition"
                          >
                            Ver Pistas →
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ── VISTA 2C: FORMULARIOS PARA SUBIR NUEVO MP3/WAV O CREAR ÁLBUM ── */}
            {catalogView === "upload" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Formulario Subir Track */}
                <form onSubmit={handleUploadTrack} className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                  <h2 className="text-lg font-bold">🎵 Subir Nuevo Audio (MP3 / WAV) + Letra</h2>
                  <p className="text-xs text-zinc-400">
                    Elige el precio de descarga directa en USD. Tus fans podrán escucharlo en streaming, mezclarlo en el Cloud DJ y comprarlo con PayPal para guardarlo en su dispositivo.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-zinc-400 block mb-1">Título de la Canción *</label>
                      <input
                        required
                        value={trackTitle}
                        onChange={(e) => setTrackTitle(e.target.value)}
                        placeholder="Ej. Imperio Cuántico"
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Género Musical</label>
                      <input
                        value={trackGenre}
                        onChange={(e) => setTrackGenre(e.target.value)}
                        placeholder="Afrobeats / Rap / Deep House"
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Precio Venta PayPal (USD)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={trackPriceUsd}
                        onChange={(e) => setTrackPriceUsd(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-amber-500/40 text-amber-300 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Nombre del Álbum (Opcional)</label>
                      <input
                        value={trackAlbumName}
                        onChange={(e) => setTrackAlbumName(e.target.value)}
                        placeholder="Ej. Códigos de Abundancia"
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-zinc-400 block mb-1">Archivo de Audio (MP3 / WAV) *</label>
                      <input
                        type="file"
                        accept=".mp3,.wav,.ogg,.m4a,.flac"
                        onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                        className="w-full text-xs text-zinc-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Portada Personalizada (JPG / PNG)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                        className="w-full text-xs text-zinc-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white"
                      />
                    </div>
                  </div>

                  <div className="text-xs">
                    <label className="text-zinc-400 block mb-1">Letra de la Canción (Sincronizada con el Reproductor y el Agente IA)</label>
                    <textarea
                      rows={4}
                      value={trackLyrics}
                      onChange={(e) => setTrackLyrics(e.target.value)}
                      placeholder="Pega aquí la letra completa de tu canción para que los fans la lean en tiempo real y tu Agente IA pueda explicar su significado..."
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={uploadingTrack}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 font-bold text-sm shadow-lg"
                  >
                    {uploadingTrack ? "Subiendo y Publicando..." : "🚀 Publicar Canción en Mi Canal y Marketplace"}
                  </button>
                </form>

                {/* Formulario Crear Álbum Pack */}
                <form onSubmit={handleCreateAlbum} className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                  <h2 className="text-lg font-bold">💿 Crear Álbum Completo (Venta por Pack)</h2>
                  <p className="text-xs text-zinc-400">
                    Agrupa tus canciones y permite que tus seguidores compren el álbum entero por un valor preferencial vía PayPal.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-zinc-400 block mb-1">Título del Álbum *</label>
                      <input
                        required
                        value={albumTitle}
                        onChange={(e) => setAlbumTitle(e.target.value)}
                        placeholder="Ej. Frecuencia Millonaria Vol. 1"
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Precio del Álbum Completo (USD)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={albumPriceUsd}
                        onChange={(e) => setAlbumPriceUsd(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-amber-500/40 text-amber-300 font-bold"
                      />
                    </div>
                  </div>

                  <div className="text-xs">
                    <label className="text-zinc-400 block mb-1">Descripción / Concepto del Álbum</label>
                    <textarea
                      rows={3}
                      value={albumDesc}
                      onChange={(e) => setAlbumDesc(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                    />
                  </div>

                  <div className="text-xs">
                    <label className="text-zinc-400 block mb-1">Portada Oficial del Álbum</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setAlbumCoverFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-zinc-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-600 file:text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={creatingAlbum}
                    className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-sm text-white"
                  >
                    {creatingAlbum ? "Creando Álbum..." : "💿 Publicar Álbum Completo"}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ── MODAL EDITAR CANCIÓN (TÍTULO, ÁLBUM, PRECIO, PORTADA Y LETRA) ── */}
        {editingTrack && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[#100c22] border border-purple-500/40 rounded-3xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">✏️ Editar Canción, Portada & Letra</h3>
                <button
                  onClick={() => setEditingTrack(null)}
                  className="text-zinc-400 hover:text-white text-lg px-2"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveTrackEdit} className="space-y-3.5 text-xs">
                <div className="flex items-center gap-4 p-3 rounded-2xl bg-black/40 border border-white/10">
                  <img
                    src={resolveMediaUrl(editingTrack.album_art_path)}
                    alt={editingTrack.title}
                    className="w-16 h-16 rounded-xl object-cover border border-white/15 shrink-0"
                  />
                  <div className="flex-1">
                    <label className="text-zinc-300 font-semibold block mb-1">
                      Actualizar Imagen de Portada de la Canción
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setEditTrackCoverFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-zinc-300 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 block mb-1">Título de la Canción</label>
                    <input
                      required
                      value={editTrackTitle}
                      onChange={(e) => setEditTrackTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Álbum / Colección</label>
                    <input
                      value={editTrackAlbum}
                      onChange={(e) => setEditTrackAlbum(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Género Musical</label>
                    <input
                      value={editTrackGenre}
                      onChange={(e) => setEditTrackGenre(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Precio Venta PayPal (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editTrackPriceUsd}
                      onChange={(e) => setEditTrackPriceUsd(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-amber-500/40 text-amber-300 font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">
                    Letra de la Canción (Sincronizada con el Reproductor y el Agente IA)
                  </label>
                  <textarea
                    rows={6}
                    value={editTrackLyrics}
                    onChange={(e) => setEditTrackLyrics(e.target.value)}
                    placeholder="Escribe o edita aquí la letra de la canción..."
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-white font-mono text-xs"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingTrack(null)}
                    className="px-4 py-2.5 rounded-xl bg-white/10 text-zinc-300 font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingTrackEdit}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold shadow-lg"
                  >
                    {savingTrackEdit ? "Guardando..." : "💾 Guardar Cambios de la Canción"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL EDITAR ÁLBUM (TÍTULO, DESCRIPCIÓN, PRECIO Y PORTADA) ── */}
        {editingAlbum && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[#100c22] border border-amber-500/40 rounded-3xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">💿 Editar Álbum & Imagen de Portada</h3>
                <button
                  onClick={() => setEditingAlbum(null)}
                  className="text-zinc-400 hover:text-white text-lg px-2"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveAlbumEdit} className="space-y-3.5 text-xs">
                <div className="flex items-center gap-4 p-3 rounded-2xl bg-black/40 border border-white/10">
                  <img
                    src={resolveMediaUrl(editingAlbum.cover_art_path)}
                    alt={editingAlbum.title}
                    className="w-20 h-20 rounded-xl object-cover border border-amber-500/40 shrink-0"
                  />
                  <div className="flex-1 space-y-2">
                    <label className="text-zinc-200 font-semibold block">
                      Subir Nueva Portada del Álbum
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setEditAlbumCoverFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-zinc-300 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-amber-500 file:text-black file:font-bold"
                    />
                    <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyAlbumCoverToTracks}
                        onChange={(e) => setApplyAlbumCoverToTracks(e.target.checked)}
                      />
                      Aplicar también esta portada a las canciones de este álbum
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 block mb-1">Título del Álbum</label>
                    <input
                      required
                      value={editAlbumTitle}
                      onChange={(e) => setEditAlbumTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Precio del Álbum en PayPal (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editAlbumPriceUsd}
                      onChange={(e) => setEditAlbumPriceUsd(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-amber-500/40 text-amber-300 font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">Género del Álbum</label>
                  <input
                    value={editAlbumGenre}
                    onChange={(e) => setEditAlbumGenre(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-white"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">Descripción / Concepto del Álbum</label>
                  <textarea
                    rows={3}
                    value={editAlbumDesc}
                    onChange={(e) => setEditAlbumDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingAlbum(null)}
                    className="px-4 py-2.5 rounded-xl bg-white/10 text-zinc-300 font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingAlbumEdit}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold shadow-lg"
                  >
                    {savingAlbumEdit ? "Guardando..." : "💾 Guardar Cambios del Álbum"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 3: PAYPAL MARKETPLACE & RETIROS FLEXIBLES (ZERO FONDOS PROPIOS)
           ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "paypal" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-950/40 to-indigo-950/30 border border-blue-500/30 space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-white">💳 Configuración de Cuenta PayPal & Reglas de Liquidación</h2>
                    <p className="text-xs text-zinc-300">
                      Cada venta se procesa por la pasarela PayPal de la plataforma. Recibes el <b>85% neto</b> (15% comisión de infraestructura) sin requerir saldo previo.
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-200 text-xs font-semibold">
                    PayPal Verified Split Engine
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="text-zinc-300 block mb-1">Correo de tu Cuenta PayPal (Personal o Business) *</label>
                    <input
                      type="email"
                      value={paypalEmail}
                      onChange={(e) => setPaypalEmail(e.target.value)}
                      placeholder="artista@paypal.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-blue-400/40 text-white font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-300 block mb-1">Cuenta PayPhone Secundaria (Opcional Latam)</label>
                    <input
                      value={payphoneNumber}
                      onChange={(e) => setPayphoneNumber(e.target.value)}
                      placeholder="+593 99 999 9999"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-white"
                    />
                  </div>
                </div>

                {/* Selector de Modalidad de Retiro */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-200 block">
                    ¿Cuándo y cómo deseas recibir tus ganancias en tu PayPal?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {[
                      {
                        id: "instant",
                        title: "⚡ Pago Inmediato Automático",
                        desc: "En cuanto el fan paga con PayPal, se transfiere tu 85% automáticamente a tu cuenta PayPal.",
                      },
                      {
                        id: "threshold",
                        title: "🎯 Al alcanzar un Monto Mínimo (Umbral)",
                        desc: "Acumula tus ventas en la billetera y transfiere automáticamente al superar el monto que elijas.",
                      },
                      {
                        id: "scheduled_weekly",
                        title: "📅 Pago Programado Periódico (Semanal / Mensual)",
                        desc: "Recibe todas tus regalías consolidadas en un solo pago periódico programado.",
                      },
                      {
                        id: "manual",
                        title: "🏦 A Demanda / Guardar Saldo en Cuenta",
                        desc: "Conserva tu saldo para retirar manualmente cuando quieras o canjearlo por Tokens IA.",
                      },
                    ].map((m) => (
                      <div
                        key={m.id}
                        onClick={() => setPayoutMode(m.id)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition ${
                          payoutMode === m.id
                            ? "bg-blue-600/25 border-blue-400 text-white"
                            : "bg-black/30 border-white/10 text-zinc-400 hover:border-white/25"
                        }`}
                      >
                        <p className="font-bold text-white">{m.title}</p>
                        <p className="text-[11px] mt-1 leading-relaxed">{m.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {payoutMode === "threshold" && (
                  <div className="text-xs max-w-xs">
                    <label className="text-zinc-300 block mb-1">Monto Umbral para Disparo Automático (USD)</label>
                    <input
                      type="number"
                      min="5"
                      value={payoutThreshold}
                      onChange={(e) => setPayoutThreshold(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-blue-400/40 text-white font-bold"
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    onClick={handleSaveProfile}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition"
                  >
                    Guardar Preferencias de Pago PayPal
                  </button>
                </div>

                {/* Sección de Retiro Manual con Monto */}
                <div className="mt-4 p-4 rounded-xl bg-emerald-900/20 border border-emerald-500/30 space-y-3">
                  <div>
                    <p className="text-sm font-bold text-emerald-300">💸 Retirar Saldo a PayPal</p>
                    <p className="text-xs text-zinc-300 mt-0.5">
                      Balance disponible: <span className="font-extrabold text-white">${maxAmount.toFixed(2)} USD</span>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">Monto a retirar (USD)</label>
                    <input
                      type="number"
                      min={0.01}
                      max={maxAmount}
                      step={0.01}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-emerald-400/40 text-white text-sm font-bold outline-none focus:border-emerald-400"
                    />
                    {withdrawAmount && !isValidAmount && (
                      <p className="text-[11px] text-rose-400">
                        Ingresa un monto mayor a 0 y menor o igual a ${maxAmount.toFixed(2)}.
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleWithdrawPayPal("paypal")}
                    disabled={!isValidAmount}
                    className="w-full px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-sm font-bold text-white transition"
                  >
                    💸 Retirar ${isValidAmount ? parsedWithdraw.toFixed(2) : "0.00"} USD a PayPal
                  </button>
                </div>
              </div>

              {/* Libro Mayor de Ventas y Comisiones */}
              <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <h3 className="font-bold text-sm">📒 Libro Mayor de Ventas y Split de Comisiones en Tiempo Real</h3>
                {salesLedger.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-zinc-400 border-b border-white/10">
                        <tr>
                          <th className="py-2">Orden PayPal</th>
                          <th className="py-2">Canal</th>
                          <th className="py-2">Total Fan</th>
                          <th className="py-2">Fee Plataforma (15%)</th>
                          <th className="py-2">Tu Neto (85%)</th>
                          <th className="py-2">Estado Liquidación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {salesLedger.map((s: any) => (
                          <tr key={s.id}>
                            <td className="py-2.5 font-mono text-purple-300">{s.paypal_order_id || `#${s.id}`}</td>
                            <td className="py-2.5">{s.sale_channel}</td>
                            <td className="py-2.5 font-semibold">${s.gross_amount_usd.toFixed(2)}</td>
                            <td className="py-2.5 text-zinc-400">-${s.platform_fee_usd.toFixed(2)}</td>
                            <td className="py-2.5 font-bold text-emerald-400">+${s.net_artist_amount_usd.toFixed(2)}</td>
                            <td className="py-2.5">
                              {s.auto_payout_triggered ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Auto-Enviado a PayPal</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">En Billetera</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400">Aún no se registran ventas. Las compras de tus fans aparecerán aquí al instante.</p>
                )}
              </div>
            </div>

            {/* Columna Derecha: Canjear Saldo por Tokens IA + Historial de Payouts */}
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-900/30 to-pink-900/20 border border-purple-500/30 space-y-4">
                <h3 className="font-bold text-sm">⚡ Usar Saldo de Ventas para Comprar Tokens IA</h3>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  ¿No tienes suscripción mensual Pro en <b>Exito.cyou</b>? Usa directamente el saldo guardado de tus ventas para adquirir Tokens y generar nuevas pistas, portadas o videos con IA ($1 USD = 10 Tokens).
                </p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={convertAmount}
                    onChange={(e) => setConvertAmount(e.target.value)}
                    className="w-28 px-3 py-2 rounded-xl bg-black/50 border border-white/20 text-white text-xs font-bold"
                  />
                  <button
                    onClick={handleConvertTokens}
                    className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white"
                  >
                    Convertir en Tokens IA
                  </button>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <h3 className="font-bold text-sm">🏦 Historial de Transferencias a PayPal ({payouts.length})</h3>
                {payouts.length ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {payouts.map((p: any) => (
                      <div key={p.id} className="p-3 rounded-xl bg-black/30 border border-white/5 text-xs">
                        <div className="flex justify-between font-bold">
                          <span className="text-emerald-400">${p.amount_usd.toFixed(2)} USD</span>
                          <span className="font-mono text-[11px] text-zinc-400">{p.paypal_payout_batch_id}</span>
                        </div>
                        <p className="text-zinc-300 mt-1">{p.destination_account}</p>
                        <p className="text-[11px] text-zinc-500">{p.notes}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400">Sin retiros ejecutados todavía.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 4: AGENTE IA DEL ARTISTA + WHATSAPP QR (AIKROFY) & TELEGRAM
           ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "agent" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Configuración del Agente Personalizado y RAG */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">🤖 Personalidad y Memoria RAG de tu Agente IA</h2>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold">
                  Agentic Commerce Activo
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Personaliza tu clon IA o asistente oficial. Hablará con tus fans sobre tus canciones, recomendará tus álbumes para fiestas con Cloud DJ y cerrará ventas por PayPal.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-zinc-400 block mb-1">Nombre de tu Agente IA</label>
                  <input
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="Ej. Luna AI (Versión IA del Artista)"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Rol de Identidad</label>
                  <select
                    value={agentPersonaType}
                    onChange={(e) => setAgentPersonaType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                  >
                    <option value="artist_clone">Clon Digital del Artista (Habla en 1ra persona)</option>
                    <option value="virtual_manager">Asistente / Manager Oficial del Artista</option>
                  </select>
                </div>
              </div>

              <div className="text-xs">
                <label className="text-zinc-400 block mb-1">Mensaje de Bienvenida del Agente</label>
                <input
                  value={agentWelcomeMessage}
                  onChange={(e) => setAgentWelcomeMessage(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                />
              </div>

              <div className="text-xs">
                <label className="text-zinc-400 block mb-1">
                  Memoria RAG Exclusiva del Artista (Biografía, significado de álbumes, conciertos, promos)
                </label>
                <textarea
                  rows={5}
                  value={agentRagKnowledge}
                  onChange={(e) => setAgentRagKnowledge(e.target.value)}
                  placeholder="Escribe aquí la historia de tus canciones, colaboraciones, próximos lanzamientos y por qué los fans deberían descargar tus masters..."
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                />
              </div>

              {/* Bot de Telegram */}
              <div className="pt-2 border-t border-white/10 space-y-3 text-xs">
                <h3 className="font-bold text-sm text-sky-400">✈️ Vincular Bot Propio de Telegram</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 block mb-1">Username del Bot (@ejemplo_bot)</label>
                    <input
                      value={telegramBotUsername}
                      onChange={(e) => setTelegramBotUsername(e.target.value)}
                      placeholder="@MiArtistaOficial_bot"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Telegram Bot Token (BotFather)</label>
                    <input
                      type="password"
                      value={telegramBotToken}
                      onChange={(e) => setTelegramBotToken(e.target.value)}
                      placeholder="123456:ABC-DEF..."
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleSaveProfile}
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 font-bold text-xs text-white"
              >
                Guardar Agente IA, Memoria RAG y Bot de Telegram
              </button>
            </div>

            {/* Columna Derecha: WhatsApp QR (Aikrofy Multi-Tenant Bridge) + Simulador de Venta Agéntica */}
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-950/40 to-teal-950/20 border border-emerald-500/30 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-base text-emerald-300">📱 WhatsApp QR Multi-Tenant & Meta Tech Provider</h3>
                    <p className="text-xs text-zinc-300">
                      Conectado vía microservicio <b>Aikrofy WhatsApp Bridge</b>. Escanea el QR para que tu Agente IA venda tus canciones por WhatsApp con links de PayPal.
                    </p>
                  </div>
                  <button
                    onClick={handleInitWhatsAppQR}
                    disabled={waLoading}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shrink-0"
                  >
                    {waLoading ? "Generando QR..." : "Generar / Ver QR"}
                  </button>
                </div>

                {waQrSvg && (
                  <div className="p-4 bg-white rounded-2xl w-52 h-52 mx-auto flex items-center justify-center" dangerouslySetInnerHTML={{ __html: waQrSvg }} />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
                  <div>
                    <label className="text-zinc-400 block mb-1">Número WhatsApp Oficial</label>
                    <input
                      value={whatsappPhone}
                      onChange={(e) => setWhatsappPhone(e.target.value)}
                      placeholder="+593 99 999 9999"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Meta Business WABA ID (Opcional)</label>
                    <input
                      value={metaWabaId}
                      onChange={(e) => setMetaWabaId(e.target.value)}
                      placeholder="WABA-ID Tech Provider"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Simulador en Vivo de Agentic Commerce con PayPal */}
              <div className="p-6 rounded-2xl bg-white/[0.03] border border-purple-500/30 space-y-4">
                <h3 className="font-bold text-sm text-purple-300">
                  🧪 Probar Comercio Conversacional Agéntico (PayPal Checkout Generator)
                </h3>
                <div className="flex gap-2">
                  <input
                    value={agentChatInput}
                    onChange={(e) => setAgentChatInput(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white"
                  />
                  <button
                    onClick={handleTestAgenticCommerce}
                    disabled={testingAgent}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white"
                  >
                    {testingAgent ? "Procesando..." : "Probar Agente"}
                  </button>
                </div>

                {agentChatReply && (
                  <div className="p-4 rounded-xl bg-black/50 border border-white/10 space-y-3 text-xs">
                    <p className="whitespace-pre-line text-zinc-200 leading-relaxed">{agentChatReply.reply}</p>
                    {agentChatReply.agentic_paypal_checkout && (
                      <div className="p-3 rounded-lg bg-blue-500/15 border border-blue-400/30 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-blue-200">
                            Orden PayPal: {agentChatReply.agentic_paypal_checkout.paypal_order_id}
                          </p>
                          <p className="text-[11px] text-zinc-300">
                            Neto Artista: ${agentChatReply.agentic_paypal_checkout.artist_net_usd} USD • Fee: ${agentChatReply.agentic_paypal_checkout.platform_fee_usd} USD
                          </p>
                        </div>
                        <Link
                          href={agentChatReply.agentic_paypal_checkout.direct_url}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-bold text-xs"
                        >
                          Ir al Checkout →
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 5: COMUNIDAD, VOTACIONES HECHAS POR EL ARTISTA Y NOTIFICACIONES
           ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "community" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Crear Votación para los Fans */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
              <h2 className="text-lg font-bold">🗳️ Crear Votación Interactiva para tu Comunidad</h2>
              <p className="text-xs text-zinc-400">
                Publica encuestas en tu canal público para que tus fans voten qué canción o estilo quieren en tu próximo lanzamiento.
              </p>
              <div className="space-y-3 text-xs">
                <input
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="Ej. ¿Qué ritmo prefieren para mi próximo single?"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                />
                <input
                  value={pollOpt1}
                  onChange={(e) => setPollOpt1(e.target.value)}
                  placeholder="Opción 1 (Ej. Afrobeats Millonario)"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                />
                <input
                  value={pollOpt2}
                  onChange={(e) => setPollOpt2(e.target.value)}
                  placeholder="Opción 2 (Ej. Trap Consciente)"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                />
                <input
                  value={pollOpt3}
                  onChange={(e) => setPollOpt3(e.target.value)}
                  placeholder="Opción 3 (Opcional - Ej. Deep House 432Hz)"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                />
                <button
                  onClick={handleCreatePoll}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 font-bold text-white"
                >
                  Publicar Votación en Mi Canal
                </button>
              </div>

              <div className="pt-4 space-y-3">
                <h3 className="font-bold text-sm">Encuestas Activas ({polls.length})</h3>
                {polls.map((p: any) => (
                  <div key={p.id} className="p-3.5 rounded-xl bg-black/30 border border-white/10 text-xs space-y-2">
                    <p className="font-bold text-white">{p.question}</p>
                    {p.options.map((o: any) => (
                      <div key={o.id} className="flex justify-between text-zinc-300">
                        <span>• {o.text}</span>
                        <span className="font-semibold text-purple-400">{o.votes} votos</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Enviar Notificaciones a Suscriptores */}
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <h2 className="text-lg font-bold">📣 Enviar Notificación a tus Suscriptores ({subscribers.length})</h2>
                <div className="space-y-3 text-xs">
                  <input
                    value={notifSubject}
                    onChange={(e) => setNotifSubject(e.target.value)}
                    placeholder="Asunto: ¡Nuevo Álbum Disponible para Descarga!"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                  />
                  <textarea
                    rows={3}
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    placeholder="Mensaje para tu comunidad por Correo, WhatsApp y Telegram..."
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white"
                  />
                  <button
                    onClick={handleSendNotification}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-white"
                  >
                    Enviar Boletín a Mi Comunidad
                  </button>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <h3 className="font-bold text-sm">👥 Lista de Suscriptores del Canal ({subscribers.length})</h3>
                {subscribers.length ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto text-xs">
                    {subscribers.map((s: any) => (
                      <div key={s.id} className="flex justify-between p-2.5 rounded-lg bg-black/30">
                        <span className="font-medium text-white">{s.fan_name}</span>
                        <span className="text-zinc-400">{s.fan_email}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400">
                    Los fans que se suscriban desde tu perfil público aparecerán aquí.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
