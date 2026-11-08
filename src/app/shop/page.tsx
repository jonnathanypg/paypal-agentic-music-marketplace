"use client";

import { useState, useEffect, useRef } from "react";

interface CatalogItem {
  id: number;
  title: string;
  artist: string;
  type: "song" | "album" | "audiobook" | "video" | "project_zip";
  price_tokens: number;
  price_usd: number;
  album_art_path?: string;
  file_path: string;
}

interface Message {
  sender: "user" | "bot";
  text: string;
  interactiveItem?: CatalogItem;
}

export default function ShopPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modals & User state
  const [user, setUser] = useState<{ username: string; tokens: number } | null>(null);
  const [checkoutItem, setCheckoutItem] = useState<CatalogItem | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"paypal" | "tokens">("paypal");
  const [guestEmail, setGuestEmail] = useState("");
  const [purchaseSuccess, setPurchaseSuccess] = useState<any>(null);
  const [downloadingToken, setDownloadingToken] = useState<string | null>(null);

  // Chatbot State
  const [chatMessages, setChatMessages] = useState<Message[]>([
    {
      sender: "bot",
      text: "¡Hola! Soy tu Asistente Agéntico de MediaSuite. ¿Buscas alguna canción, álbum o audiolibro en especial? Puedo ayudarte a filtrarlos y a comprarlos directamente desde aquí.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Audio Player State
  const [playingItem, setPlayingItem] = useState<CatalogItem | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchUser();
    fetchCatalog();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/ecommerce/me/info");
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser({ username: data.user.username, tokens: data.user.tokens_balance });
        } else {
          setUser(null);
        }
      }
    } catch (e) {
      // Not logged in
    }
  };

  const fetchCatalog = async () => {
    try {
      const res = await fetch("/api/ecommerce/catalog");
      if (res.ok) {
        const data = await res.json();
        setCatalog(data);
      } else {
        // Mock items if catalog is empty initially
        const mockItems: CatalogItem[] = [
          {
            id: 1,
            title: "Cyberpunk Sunrise",
            artist: "AI Soundscape Labs",
            type: "song",
            price_tokens: 1,
            price_usd: 0.99,
            album_art_path: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&q=80",
            file_path: "/media_library/Audiobooks/songs/cyberpunk_sunrise.mp3",
          },
          {
            id: 2,
            title: "Ecos del Futuro - Audiobook",
            artist: "Dra. Elena Ramos (IA Narrator)",
            type: "audiobook",
            price_tokens: 3,
            price_usd: 4.99,
            album_art_path: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=300&q=80",
            file_path: "/media_library/Audiobooks/narrations/ecos_futuro/mixed.mp3",
          },
          {
            id: 3,
            title: "Chill Lofi Beats Album",
            artist: "Synthesized Mind",
            type: "album",
            price_tokens: 5,
            price_usd: 7.99,
            album_art_path: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80",
            file_path: "/media_library/Audiobooks/songs/lofi_beats.mp3",
          },
          {
            id: 4,
            title: "Marketing Report 2026 - Audiobook",
            artist: "MediaSuite Finanzas",
            type: "audiobook",
            price_tokens: 4,
            price_usd: 5.99,
            album_art_path: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300&q=80",
            file_path: "/media_library/Audiobooks/narrations/mkt_report.mp3",
          },
        ];
        setCatalog(mockItems);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPreview = (item: CatalogItem) => {
    if (playingItem?.id === item.id) {
      audioRef.current?.pause();
      setPlayingItem(null);
    } else {
      setPlayingItem(item);
      // Simular reproducción si no hay un archivo de audio real montado en esa ruta
      if (audioRef.current) {
        audioRef.current.src = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"; // preview
        audioRef.current.play().catch(() => {});
      }
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const userText = chatInput;
    setChatMessages((prev) => [...prev, { sender: "user", text: userText }]);
    setChatInput("");

    // Respuesta simple Agéntica
    setTimeout(() => {
      const lower = userText.toLowerCase();
      let match = catalog.find(
        (item) =>
          item.title.toLowerCase().includes(lower) ||
          item.artist.toLowerCase().includes(lower)
      );

      if (match) {
        setChatMessages((prev) => [
          ...prev,
          {
            sender: "bot",
            text: `He encontrado un archivo que coincide con tu búsqueda: "${match?.title}" por ${match?.artist}. Puedes comprarlo directamente aquí:`,
            interactiveItem: match,
          },
        ]);
      } else if (lower.includes("lofi") || lower.includes("chill")) {
        const lofi = catalog.find((i) => i.id === 3);
        setChatMessages((prev) => [
          ...prev,
          {
            sender: "bot",
            text: "¡Claro! Te sugiero nuestro álbum estrella de Lofi beats:",
            interactiveItem: lofi,
          },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            sender: "bot",
            text: "No encontré exactamente lo que buscas en el catálogo actual, pero puedes explorar nuestra biblioteca o pedirme que busque por géneros como 'lofi' o 'cyberpunk'.",
          },
        ]);
      }
    }, 800);
  };

  const startCheckout = (item: CatalogItem) => {
    setCheckoutItem(item);
    setPaymentMethod(user ? "tokens" : "paypal");
    setGuestEmail("");
    setPurchaseSuccess(null);
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutItem) return;

    try {
      const res = await fetch("/api/ecommerce/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_catalog_id: checkoutItem.id,
          payment_method: paymentMethod,
          guest_email: paymentMethod === "paypal" && !user ? guestEmail : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPurchaseSuccess(data);
        if (user && paymentMethod === "tokens") {
          setUser((prev) => prev ? { ...prev, tokens: data.balance } : null);
        }
      } else {
        const err = await res.json();
        alert(`Error en el checkout: ${err.detail || "Intente nuevamente"}`);
      }
    } catch (e) {
      alert("Error al conectar con el servidor.");
    }
  };

  const handleDownload = async (purchaseId: number) => {
    try {
      const res = await fetch(`/api/ecommerce/download-link/${purchaseId}`);
      if (res.ok) {
        const data = await res.json();
        window.open(data.download_url, "_blank");
      }
    } catch (e) {
      alert("Error al obtener el enlace de descarga.");
    }
  };

  const filteredCatalog = catalog.filter((item) => {
    const matchesTab = activeTab === "all" || item.type === activeTab;
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.artist.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col lg:flex-row">
      <audio ref={audioRef} className="hidden" />

      {/* ── Main Content Area: E-commerce Store ── */}
      <main className="flex-1 p-6 lg:p-10 space-y-8 overflow-y-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight premium-gradient-text">
              MediaSuite Store
            </h1>
            <p className="text-text-secondary text-sm">
              Adquiere de forma oficial canciones, audiolibros, reportajes y proyectos listos para descargar.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a 
              href="/shop/player" 
              className="bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-black uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-cyan-500/25 flex items-center gap-1.5"
            >
              🎧 Reproductor Público
            </a>
            {user && (
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl px-4 py-2.5 flex items-center gap-3">
                <span className="text-xs font-bold text-text-muted">Tus Créditos:</span>
                <span className="text-lg font-black text-accent">{user.tokens} 🪙</span>
              </div>
            )}
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white/[0.01] border border-white/[0.04] p-3 rounded-2xl backdrop-blur-md">
          <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
            {["all", "song", "album", "audiobook", "project_zip"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                  activeTab === tab
                    ? "bg-accent text-white shadow-lg shadow-accent/20"
                    : "text-text-secondary hover:text-white hover:bg-white/[0.03]"
                }`}
              >
                {tab === "all" ? "Todos" : tab === "song" ? "Canciones" : tab === "album" ? "Álbumes" : tab === "audiobook" ? "Audiolibros" : "Proyectos"}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Buscar artista o título..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/[0.02] border border-white/[0.08] focus:border-accent rounded-xl py-2 px-4 text-sm outline-none transition-colors"
            />
          </div>
        </div>

        {/* Store Grid (Bento Style) */}
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredCatalog.map((item) => (
              <div
                key={item.id}
                className="group relative bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] rounded-3xl p-5 hover:border-accent/30 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  {/* Album Cover & Play preview */}
                  <div className="relative aspect-square rounded-2xl overflow-hidden mb-4 bg-white/[0.02]">
                    {item.album_art_path ? (
                      <img
                        src={item.album_art_path.includes("media_library/") ? item.album_art_path.substring(item.album_art_path.indexOf("media_library/")).replace("media_library/", "/media-static/") : item.album_art_path}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl bg-gradient-to-tr from-accent/20 to-cyan/20">
                        🎵
                      </div>
                    )}
                    <button
                      onClick={() => handlePlayPreview(item)}
                      className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <span className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center text-2xl shadow-2xl hover:scale-110 transition-transform">
                        {playingItem?.id === item.id ? "⏸" : "▶"}
                      </span>
                    </button>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[0.65rem] font-bold text-accent uppercase tracking-widest">
                      {item.type}
                    </span>
                    <h3 className="font-bold text-lg truncate text-text-primary">
                      {item.title}
                    </h3>
                    <p className="text-text-secondary text-xs truncate">
                      {item.artist}
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-white/[0.04] flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[0.65rem] text-text-muted">Precio</span>
                    <span className="font-extrabold text-sm text-text-primary">
                      ${item.price_usd.toFixed(2)} USD / {item.price_tokens} 🪙
                    </span>
                  </div>
                  <button
                    onClick={() => startCheckout(item)}
                    className="bg-accent hover:bg-accent-hover text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-accent/10"
                  >
                    Comprar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Chatbot Sidebar ── */}
      <aside className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-white/[0.06] bg-bg-secondary flex flex-col h-[500px] lg:h-screen shrink-0">
        <div className="p-5 border-b border-white/[0.04]">
          <h2 className="font-black text-sm uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            Media Curador IA
          </h2>
          <p className="text-[0.65rem] text-text-muted">Chat agéntico de ventas e investigación</p>
        </div>

        {/* Message logs */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-accent text-white"
                    : "bg-white/[0.03] border border-white/[0.06] text-text-secondary"
                }`}
              >
                {msg.text}
              </div>
              {msg.interactiveItem && (
                <div className="mt-2 w-full max-w-[85%] bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 flex gap-3 items-center justify-between animate-fade-in">
                  <div className="min-w-0">
                    <p className="text-[0.7rem] font-bold truncate text-text-primary">
                      {msg.interactiveItem.title}
                    </p>
                    <p className="text-[0.6rem] text-text-muted truncate">
                      {msg.interactiveItem.artist}
                    </p>
                  </div>
                  <button
                    onClick={() => startCheckout(msg.interactiveItem!)}
                    className="bg-accent hover:bg-accent-hover text-white text-[0.6rem] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all"
                  >
                    Comprar
                  </button>
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Chat input */}
        <div className="p-4 border-t border-white/[0.04] flex gap-2">
          <input
            type="text"
            placeholder="Pregunta por un tema o género..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            className="flex-1 bg-white/[0.02] border border-white/[0.08] focus:border-accent rounded-xl py-2 px-3 text-xs outline-none transition-colors"
          />
          <button
            onClick={handleSendMessage}
            className="bg-accent hover:bg-accent-hover text-white px-3 py-2 rounded-xl text-xs font-bold transition-all"
          >
            Enviar
          </button>
        </div>
      </aside>

      {/* ── Checkout Modal ── */}
      {checkoutItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-bg-secondary border border-white/[0.08] rounded-3xl p-6 w-full max-w-md space-y-6 relative animate-fade-in">
            <button
              onClick={() => setCheckoutItem(null)}
              className="absolute top-5 right-5 text-text-muted hover:text-white transition-colors"
            >
              ✕
            </button>

            {!purchaseSuccess ? (
              <form onSubmit={handleCheckoutSubmit} className="space-y-5">
                <div>
                  <h3 className="text-lg font-black tracking-tight premium-gradient-text">
                    Confirmar Compra
                  </h3>
                  <p className="text-text-muted text-xs">
                    Estás adquiriendo: <span className="font-bold text-text-primary">{checkoutItem.title}</span>
                  </p>
                </div>

                {/* Métodos de pago */}
                <div className="space-y-2">
                  <label className="text-[0.65rem] font-bold uppercase tracking-wider text-text-muted">
                    Método de Pago
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("paypal")}
                      className={`py-3 rounded-2xl text-xs font-bold border transition-all ${
                        paymentMethod === "paypal"
                          ? "bg-cyan/10 border-cyan text-cyan shadow-lg shadow-cyan/10"
                          : "border-white/[0.06] text-text-secondary hover:bg-white/[0.02]"
                      }`}
                    >
                      PayPal / Tarjeta
                    </button>
                    {user && (
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("tokens")}
                        className={`py-3 rounded-2xl text-xs font-bold border transition-all ${
                          paymentMethod === "tokens"
                            ? "bg-accent/10 border-accent text-accent shadow-lg shadow-accent/10"
                            : "border-white/[0.06] text-text-secondary hover:bg-white/[0.02]"
                        }`}
                      >
                        Usar Créditos ({checkoutItem.price_tokens} 🪙)
                      </button>
                    )}
                  </div>
                </div>

                {/* Si es paypal & no hay user */}
                {paymentMethod === "paypal" && !user && (
                  <div className="space-y-1">
                    <label className="text-[0.65rem] font-bold uppercase tracking-wider text-text-muted">
                      Correo Electrónico (Invitado)
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="tu@email.com"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/[0.08] focus:border-accent rounded-xl py-2.5 px-4 text-xs outline-none"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-accent hover:bg-accent-hover text-white py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all"
                >
                  Procesar Pago (${checkoutItem.price_usd.toFixed(2)} USD)
                </button>
              </form>
            ) : (
              <div className="space-y-6 text-center py-4">
                <div className="w-16 h-16 rounded-full bg-success/20 text-success flex items-center justify-center text-3xl mx-auto">
                  ✓
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-white">
                    ¡Compra Completa!
                  </h3>
                  <p className="text-text-muted text-xs mt-1">
                    Tu pago ha sido procesado exitosamente. Se inyectaron tus firmas DRM y metadatos de autoría.
                  </p>
                </div>

                <div className="bg-white/[0.02] border border-white/[0.04] p-3 rounded-2xl text-left space-y-1">
                  <p className="text-[0.65rem] text-text-muted">Transacción ID</p>
                  <p className="text-xs font-mono font-bold text-text-primary break-all">
                    {purchaseSuccess.transaction_id}
                  </p>
                </div>

                <button
                  onClick={() => handleDownload(purchaseSuccess.purchase_id)}
                  className="w-full bg-success hover:bg-success-hover text-white py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all"
                >
                  Descargar Archivo Con Metadatos
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
