"use client";

import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";

interface CatalogItem {
  id: number;
  title: string;
  artist: string;
  type: "song" | "album" | "audiobook" | "video" | "project_zip";
  price_tokens: number;
  price_usd: number;
  album_art_path?: string;
  file_path: string;
  description?: string;
}

export default function PublicPlayerPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [activeItem, setActiveItem] = useState<CatalogItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [lyrics, setLyrics] = useState<string>("Cargando letras...");
  const [loading, setLoading] = useState(true);

  // Auto-checkout and register popups
  const [checkoutItem, setCheckoutItem] = useState<CatalogItem | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [autoRegister, setAutoRegister] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState<any>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchCatalog();
  }, []);

  // Fetch all public items
  const fetchCatalog = async () => {
    try {
      const res = await fetch("/api/ecommerce/catalog");
      if (res.ok) {
        const data = await res.json();
        setCatalog(data);
        if (data.length > 0) {
          // Si el query param ?track= está presente, seleccionarlo. Si no, el primero
          const params = new URLSearchParams(window.location.search);
          const initialTrackId = params.get("track");
          const selected = data.find((x: any) => String(x.id) === initialTrackId) || data[0];
          selectTrack(selected, false);
        }
      }
    } catch (e) {
      toast.error("Error al cargar catálogo público");
    } finally {
      setLoading(false);
    }
  };

  // Cambiar de pista sin recargar, actualizando la URL dinámicamente
  const selectTrack = (item: CatalogItem, shouldPlay = true) => {
    setActiveItem(item);
    setLyrics(`Letras de ${item.title}:\n\n[00:15] Esta es una demostración rítmica de ${item.title}.\n[00:32] Producido completamente con MediaSuite AI.\n[00:55] Licenciado oficialmente para uso comercial.\n\nEscucha, siente, crea con inteligencia artificial.`);
    
    // Cambiar la ruta en el navegador sin recargar la página (para SEO y Pageviews dinámicos)
    const newUrl = `${window.location.pathname}?track=${item.id}&slug=${encodeURIComponent(item.title.toLowerCase().replace(/ /g, "-"))}`;
    window.history.pushState({ trackId: item.id }, "", newUrl);

    if (audioRef.current) {
      // Usamos el archivo estático si es de la biblioteca, si no un preview estándar
      const staticUrl = item.file_path.includes("media_library/") 
        ? item.file_path.substring(item.file_path.indexOf("media_library/")).replace("media_library/", "/media-static/") 
        : "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
      
      audioRef.current.src = staticUrl;
      if (shouldPlay) {
        audioRef.current.play().catch(() => {});
        setPlaying(true);
      }
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  };

  // Al finalizar una canción, reproducir la siguiente automáticamente en bucle (crea un nuevo pageview virtual)
  const handleTrackEnded = () => {
    if (catalog.length === 0 || !activeItem) return;
    const currentIndex = catalog.findIndex(x => x.id === activeItem.id);
    const nextIndex = (currentIndex + 1) % catalog.length;
    selectTrack(catalog[nextIndex], true);
    toast.success(`Pasando a la siguiente canción: ${catalog[nextIndex].title}`);
  };

  // Envío del formulario de compra y registro automatizado
  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutItem) return;
    setProcessing(true);
    const toastId = toast.loading("Procesando pago de forma segura...");

    try {
      const res = await fetch("/api/ecommerce/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_catalog_id: checkoutItem.id,
          payment_method: "paypal", // Simula portal Paypal o Tarjeta Directa sin login
          guest_email: email,
          guest_username: username || email.split("@")[0],
          guest_password: password || "Wltech.2026",
          auto_register: autoRegister
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("¡Pago aprobado! Archivo listo con carátula e ID3 inyectados.", { id: toastId });
        setPurchaseSuccess(data);
      } else {
        toast.error(data.detail || "Error en el pago", { id: toastId });
      }
    } catch (err) {
      toast.error("Error de conexión", { id: toastId });
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
    } catch (e) {
      toast.error("Error al descargar el archivo con DRM");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary p-6 lg:p-10 flex flex-col items-center justify-between">
      <audio ref={audioRef} onEnded={handleTrackEnded} className="hidden" />

      {/* ── ESPACIO AD 1: Banner Superior ── */}
      <div className="w-full max-w-4xl h-24 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-xs text-text-muted mb-8 tracking-widest relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-accent/5 opacity-50 group-hover:opacity-100 transition-opacity" />
        <span>ANUNCIO PUBLICITARIO GOOGLE ADSENSE (DISPLAY BANNER 728x90)</span>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        {/* Playlist / Tracks Sidebar */}
        <div className="glass-panel p-5 space-y-4 md:col-span-1">
          <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400">Playlists del Proyecto</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar pr-1">
            {catalog.map(item => (
              <div 
                key={item.id}
                onClick={() => selectTrack(item)}
                className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                  activeItem?.id === item.id 
                    ? "bg-cyan-500/10 border-cyan text-white shadow-lg" 
                    : "bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10"
                }`}
              >
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/10 shrink-0">
                  {item.album_art_path ? (
                    <img 
                      src={item.album_art_path.includes("media_library/") ? item.album_art_path.substring(item.album_art_path.indexOf("media_library/")).replace("media_library/", "/media-static/") : item.album_art_path} 
                      alt="art" 
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm">🎵</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate">{item.title}</p>
                  <p className="text-[10px] text-text-muted truncate">{item.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Player & Lyrics Display */}
        <div className="md:col-span-2 space-y-6">
          {activeItem && (
            <div className="glass-panel p-6 flex flex-col items-center text-center space-y-6 border-l-4 border-cyan-500">
              {/* Album Art */}
              <div className="relative w-48 h-48 rounded-2xl overflow-hidden shadow-2xl bg-white/5 aspect-square">
                {activeItem.album_art_path ? (
                  <img 
                    src={activeItem.album_art_path.includes("media_library/") ? activeItem.album_art_path.substring(activeItem.album_art_path.indexOf("media_library/")).replace("media_library/", "/media-static/") : activeItem.album_art_path} 
                    alt={activeItem.title} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-5xl">🎵</div>
                )}
                {/* Visualizer Overlay */}
                {playing && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-1">
                    <span className="w-1.5 h-8 bg-cyan-400 rounded-full animate-pulse" />
                    <span className="w-1.5 h-12 bg-cyan-400 rounded-full animate-pulse delay-75" />
                    <span className="w-1.5 h-6 bg-cyan-400 rounded-full animate-pulse delay-150" />
                  </div>
                )}
              </div>

              {/* Title & Artist */}
              <div>
                <h2 className="text-2xl font-black tracking-tight">{activeItem.title}</h2>
                <p className="text-sm text-text-muted mt-1">{activeItem.artist}</p>
              </div>

              {/* Play & Buy Buttons */}
              <div className="flex gap-4">
                <button 
                  onClick={togglePlay}
                  className="px-8 py-3 rounded-full bg-cyan-500 hover:bg-cyan-400 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/25 flex items-center gap-2"
                >
                  {playing ? "⏸ Pausar" : "▶ Escuchar Demo"}
                </button>
                <button 
                  onClick={() => setCheckoutItem(activeItem)}
                  className="px-8 py-3 rounded-full bg-accent hover:bg-accent-hover text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-accent/25"
                >
                  📥 Descargar / Comprar ($1.99 USD)
                </button>
              </div>

              {/* Lyrics Panel */}
              <div className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-left">
                <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-3">Letras Sincronizadas</h4>
                <pre className="text-xs text-text-secondary font-mono leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar select-none">
                  {lyrics}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ESPACIO AD 2: Banner Inferior ── */}
      <div className="w-full max-w-4xl h-24 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-xs text-text-muted mt-8 tracking-widest relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-accent/5 to-cyan-500/5 opacity-50 group-hover:opacity-100 transition-opacity" />
        <span>ANUNCIO PUBLICITARIO GOOGLE ADSENSE (DISPLAY BANNER 728x90)</span>
      </div>

      {/* ── Checkout & Auto Register Popup ── */}
      {checkoutItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[300] flex items-center justify-center p-4">
          <div className="bg-bg-secondary border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-6 relative shadow-2xl">
            <button 
              onClick={() => { setCheckoutItem(null); setPurchaseSuccess(null); }}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
            >
              ✕
            </button>

            {!purchaseSuccess ? (
              <form onSubmit={handlePurchase} className="space-y-4">
                <div>
                  <span className="text-[10px] bg-accent/20 text-accent font-black uppercase px-2 py-0.5 rounded-md">Paso Único</span>
                  <h3 className="text-xl font-black mt-2">Descarga Con Portada y DRM</h3>
                  <p className="text-xs text-text-muted mt-1">Completa el pago. Se creará tu cuenta automáticamente para descargas futuras ilimitadas.</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">Correo Electrónico</label>
                    <input 
                      type="email" 
                      required
                      placeholder="correo@ejemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {autoRegister && (
                    <div className="grid grid-cols-2 gap-2 animate-fade-in">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">Nombre de Usuario</label>
                        <input 
                          type="text" 
                          required
                          placeholder="usuario"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="w-full bg-bg-primary border border-border rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">Contraseña Nueva</label>
                        <input 
                          type="password" 
                          required
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full bg-bg-primary border border-border rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 bg-white/5 p-3 rounded-xl border border-white/5">
                  <input 
                    type="checkbox" 
                    id="autoReg" 
                    checked={autoRegister} 
                    onChange={(e) => setAutoRegister(e.target.checked)} 
                    className="w-4 h-4 rounded accent-cyan-500" 
                  />
                  <label htmlFor="autoReg" className="text-[10px] font-bold cursor-pointer text-white">
                    Activar auto-registro (Regalo: 5 tokens gratis 🪙)
                  </label>
                </div>

                <button 
                  type="submit"
                  disabled={processing}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-accent text-white font-black uppercase text-xs tracking-wider transition-opacity hover:opacity-90"
                >
                  {processing ? "Cargando pasarela..." : `Pagar $${checkoutItem.price_usd.toFixed(2)} USD con Tarjeta / PayPal`}
                </button>
              </form>
            ) : (
              <div className="text-center space-y-5 py-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-3xl mx-auto border border-emerald-500/30">
                  ✓
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">¡Gracias por tu compra!</h4>
                  <p className="text-xs text-text-secondary mt-1">
                    Tu cuenta ha sido creada exitosamente. Se inyectaron tus firmas DRM y metadatos de autoría en el archivo.
                  </p>
                </div>

                {purchaseSuccess.auto_user && (
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-left text-xs">
                    <p className="font-bold text-cyan-400">Datos de tu nueva cuenta:</p>
                    <p className="mt-1 text-text-muted">Usuario: <span className="text-white font-mono">{purchaseSuccess.auto_user}</span></p>
                    <p className="text-text-muted">Créditos de regalo: <span className="text-white font-mono">5 Tokens 🪙</span></p>
                  </div>
                )}

                <button 
                  onClick={() => handleDownload(purchaseSuccess.purchase_id)}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-xs tracking-wider transition-colors"
                >
                  Descargar Audio con Carátula ⬇️
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
