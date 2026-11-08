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

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4500);
  };

  const fetchStudio = useCallback(async () => {
    try {
      const res = await fetch("/api/artist-studio/me");
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
  }, []);

  useEffect(() => {
    fetchStudio();
  }, [fetchStudio]);

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
    const res = await fetch("/api/artist-studio/me/payouts/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payout_method: method }),
    });
    const d = await res.json();
    if (res.ok) {
      showToast(`💸 ${d.message}`);
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
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <ExitoLogoIcon size={36} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg tracking-tight">Éxito.cyou</span>
                  <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-purple-500/20 border border-amber-400/30 text-amber-300 font-semibold">
                    Artist Studio & PayPal AI Marketplace
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Canal público:{" "}
                  <Link href={`/@${profile.slug || "billionairesoundtrack"}`} className="text-purple-400 hover:underline font-mono">
                    exito.cyou/@{profile.slug || "artista"}
                  </Link>
                </p>
              </div>
            </Link>
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
              href={`/@${profile.slug || "billionairesoundtrack"}`}
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
          </div>
        </div>

        {/* Pestañas */}
        <div className="max-w-7xl mx-auto mt-4 flex gap-2 overflow-x-auto pb-1">
          {[
            { id: "overview", label: "📊 Estudio & Analítica (Spotify-Style)" },
            { id: "catalog", label: "🎵 Subir MP3 / Álbumes / Letras" },
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

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10">
                <p className="text-xs text-zinc-400 uppercase tracking-wider">Reproducciones (Streams)</p>
                <p className="text-3xl font-extrabold text-cyan-400 mt-1">
                  {(analytics.total_streams || 0).toLocaleString()}
                </p>
                <p className="text-[11px] text-zinc-400 mt-2">
                  En {analytics.total_tracks || 0} canciones y {analytics.total_albums || 0} álbumes
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

            {/* Ranking de Canciones Favoritas + Perfil del Canal */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">🏆 Ranking de Audios Favoritos (Streams + Corazones)</h2>
                  <button
                    onClick={() => setActiveTab("catalog")}
                    className="text-xs px-3 py-1.5 rounded-lg bg-purple-600/30 border border-purple-500/40 text-purple-200 hover:bg-purple-600/50"
                  >
                    + Subir Nuevo MP3
                  </button>
                </div>

                {analytics.top_tracks_ranking?.length ? (
                  <div className="space-y-2.5">
                    {analytics.top_tracks_ranking.map((t: any, idx: number) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-purple-500/30 transition"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 text-center font-bold text-sm text-purple-400">#{idx + 1}</span>
                          <div>
                            <p className="font-semibold text-sm text-white">{t.title}</p>
                            <p className="text-xs text-zinc-400">
                              {t.genre || "Single"} • Álbum: {t.album || "Single"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-5 text-xs">
                          <span className="text-cyan-300 font-medium">▶ {t.play_count} streams</span>
                          <span className="text-rose-400 font-medium">♥ {t.likes_count} likes</span>
                          <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 font-bold">
                            ${Number(t.price_usd).toFixed(2)} USD
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400 py-6 text-center">
                    Aún no has subido canciones a tu canal. Ve a la pestaña <b>Subir MP3 / Álbumes</b> para publicar tu primer track.
                  </p>
                )}
              </div>

              {/* Editor Rápido de Identidad del Canal */}
              <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <h2 className="text-lg font-bold">🎨 Identidad del Canal de Artista</h2>
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
                    <label className="text-zinc-400 block mb-1">Slug URL (exito.cyou/@slug)</label>
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
            TAB 2: SUBIDA DE CANCIONES MP3/WAV, LETRAS Y ÁLBUMES
           ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "catalog" && (
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
            <div className="space-y-6">
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
                    rows={2}
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
                  className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-sm text-white"
                >
                  {creatingAlbum ? "Creando Álbum..." : "💿 Publicar Álbum Completo"}
                </button>
              </form>

              {/* Lista rápida de álbumes y tracks actuales */}
              <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <h3 className="font-bold text-sm">Mis Álbumes Publicados ({albums.length})</h3>
                {albums.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-black/30 border border-white/5 text-xs">
                    <div>
                      <p className="font-semibold text-white">{a.title}</p>
                      <p className="text-zinc-400">{a.description}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-bold">
                      ${Number(a.price_usd).toFixed(2)} USD
                    </span>
                  </div>
                ))}
              </div>
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
                  <button
                    onClick={() => handleWithdrawPayPal("paypal")}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition"
                  >
                    💸 Retirar Saldo Ahora a mi PayPal (${Number(profile.available_balance_usd || 0).toFixed(2)} USD)
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
                  ¿No tienes suscripción mensual en <b>media.weblifetech.com</b>? Usa directamente el saldo guardado de tus ventas para adquirir Tokens y generar nuevas pistas, portadas o videos con IA ($1 USD = 10 Tokens).
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
