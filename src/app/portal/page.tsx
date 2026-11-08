"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { usePlayer } from "@/contexts/PlayerContext";
import type { Track } from "@/components/StreamPlayer";
import { prefetchTrack } from "@/utils/prefetch";

interface UserProfile {
  id: number;
  username: string;
  email: string;
  role: string;
  tokens_balance: number;
  created_at: string;
  subscription: {
    plan: string;
    tokens_per_month: number;
    status: string;
    period_end: string | null;
    created_at: string;
  } | null;
  purchases: {
    id: number;
    media_title: string;
    media_type: string | null;
    payment_method: string;
    amount_paid: number;
    purchased_at: string;
    download_count: number;
    download_link: string;
  }[];
  purchases_count: number;
}

interface Playlist {
  id: number;
  name: string;
  description: string | null;
  item_count: number;
  created_at: string;
  updated_at: string;
}

const SVGIcon = {
  User: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Token: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  ),
  Purchase: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  ),
  Subscription: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Download: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Playlist: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  Logout: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Trash: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
};

function PortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { play: contextPlay, setPlaylist: setCtxPlaylist } = usePlayer();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<{ id: number; name: string } | null>(null);
  const [playlistItems, setPlaylistItems] = useState<any[]>([]);
  const [playlistItemsLoading, setPlaylistItemsLoading] = useState(false);
  const [playingItemId, setPlayingItemId] = useState<number | null>(null);

  // Profile Edit modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [updateSuccess, setUpdateSuccess] = useState("");

  useEffect(() => {
    fetch("/api/auth/profile")
      .then(r => { if (!r.ok) throw new Error("No auth"); return r.json(); })
      .then(d => {
        if (d.success) {
          setProfile(d.user);
          setEditUsername(d.user.username);
          setEditEmail(d.user.email);
        } else {
          router.push("/login?redirect=/portal");
        }
      })
      .catch(() => router.push("/login?redirect=/portal"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    fetch("/api/user-playlists")
      .then(r => r.ok ? r.json() : [])
      .then(setPlaylists)
      .catch(() => {});
  }, []);

  // Listen to query param to open modal automatically
  useEffect(() => {
    if (searchParams.get("edit") === "1") {
      setShowEditModal(true);
    }
  }, [searchParams]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingProfile(true);
    setUpdateError("");
    setUpdateSuccess("");

    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: editUsername,
          email: editEmail,
          password: editPassword || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Error al actualizar perfil");
      }

      setUpdateSuccess("Perfil actualizado con éxito");
      setEditPassword("");
      
      // Refresh local profile state
      if (profile) {
        setProfile({
          ...profile,
          username: editUsername,
          email: editEmail,
        });
      }

      setTimeout(() => {
        setShowEditModal(false);
        setUpdateSuccess("");
        // Clean URL parameter
        router.push("/portal");
      }, 1500);

    } catch (err: any) {
      setUpdateError(err.message || "Ocurrió un error");
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleDownload = async (purchaseId: number) => {
    setDownloading(purchaseId);
    try {
      const res = await fetch(`/api/ecommerce/download-link/${purchaseId}`);
      const data = await res.json();
      if (data.success) {
        window.open(data.download_url, "_blank");
      }
    } catch {
      alert("Error al generar el enlace de descarga");
    } finally {
      setDownloading(null);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      const res = await fetch("/api/user-playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPlaylistName.trim(), description: newPlaylistDesc.trim() || null }),
      });
      const data = await res.json();
      if (data.success) {
        setPlaylists(prev => [...prev, data.playlist]);
        setNewPlaylistName("");
        setNewPlaylistDesc("");
        setShowNewPlaylist(false);
      }
    } catch {
      alert("Error al crear la lista");
    }
  };

  const handleOpenPlaylist = async (id: number, name: string) => {
    setSelectedPlaylist({ id, name });
    setPlaylistItemsLoading(true);
    setPlaylistItems([]);
    try {
      const res = await fetch(`/api/user-playlists/${id}`);
      if (res.ok) {
        const data = await res.json();
        setPlaylistItems(data.items || []);
      }
    } catch {
      alert("Error al cargar los items de la lista");
    } finally {
      setPlaylistItemsLoading(false);
    }
  };

  const handleRemoveItem = async (playlistId: number, itemId: number) => {
    try {
      const res = await fetch(`/api/user-playlists/${playlistId}/items/${itemId}`, { method: "DELETE" });
      if (res.ok) {
        setPlaylistItems(prev => prev.filter(i => i.id !== itemId));
        setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, item_count: p.item_count - 1 } : p));
      }
    } catch {
      alert("Error al eliminar el item");
    }
  };

  const handlePlayItem = (item: any) => {
    const track: Track = {
      id: item.media_catalog_id,
      title: item.title,
      artist: item.artist,
      type: item.type || "song",
      album_art_path: item.album_art_path,
      duration_seconds: item.duration_seconds,
      file_path: item.file_path || "",
      price_tokens: item.price_tokens || 0,
      price_usd: item.price_usd || 0,
      creator: item.artist,
    };
    setPlayingItemId(item.media_catalog_id);
    setTimeout(() => { setPlayingItemId(null); }, 2000);
    setCtxPlaylist([]);
    contextPlay(track);
  };

  const handlePrefetchItem = (item: any) => {
    prefetchTrack({
      id: item.media_catalog_id,
      title: item.title,
      artist: item.artist,
      type: item.type || "song",
      album_art_path: item.album_art_path,
      duration_seconds: item.duration_seconds,
      file_path: item.file_path || "",
      price_tokens: item.price_tokens || 0,
      price_usd: item.price_usd || 0,
      creator: item.artist,
    });
  };

  const handlePlayAll = (items: any[]) => {
    if (items.length === 0) return;
    const tracks: Track[] = items.map(item => ({
      id: item.media_catalog_id,
      title: item.title,
      artist: item.artist,
      type: item.type || "song",
      album_art_path: item.album_art_path,
      duration_seconds: item.duration_seconds,
      file_path: item.file_path || "",
      price_tokens: item.price_tokens || 0,
      price_usd: item.price_usd || 0,
      creator: item.artist,
    }));
    setCtxPlaylist(tracks);
    contextPlay(tracks[0]);
  };

  const handleDeletePlaylist = async (id: number) => {
    try {
      await fetch(`/api/user-playlists/${id}`, { method: "DELETE" });
      setPlaylists(prev => prev.filter(p => p.id !== id));
    } catch {
      alert("Error al eliminar la lista");
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-[#0a0a1a]">
      <header className="border-b border-white/[0.04] bg-[#0d0d1f]/50 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#06b6d4] flex items-center justify-center text-white font-black text-sm">M</div>
            <span className="text-sm font-black text-white">MediaSuite</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/artist-studio" className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-bold text-white shadow-lg shadow-purple-600/20 transition">
              🎤 Mi Panel de Artista & PayPal
            </Link>
            <Link href="/" className="text-xs text-white/40 hover:text-white/70 transition-colors">Explorar</Link>
            <button onClick={handleLogout} className="flex items-center gap-2 text-xs text-white/40 hover:text-red-400 transition-colors">
              <SVGIcon.Logout /> Cerrar Sesión
            </button>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        <div className="glass-panel p-6 sm:p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-white font-black text-xl shadow-lg">
                {profile.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">{profile.username}</h1>
                <p className="text-sm text-white/40">{profile.email}</p>
              </div>
            </div>
            <button
              onClick={() => setShowEditModal(true)}
              className="px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-xs font-bold text-purple-400 hover:bg-purple-500/30 transition-all flex items-center gap-1.5"
            >
              ⚙️ Editar Datos
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
              <div className="text-purple-400 mb-2"><SVGIcon.Token /></div>
              <p className="text-2xl font-black text-white">{profile.tokens_balance}</p>
              <p className="text-[0.65rem] uppercase tracking-wider text-white/40 font-bold">Tokens</p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
              <div className="text-cyan-400 mb-2"><SVGIcon.Purchase /></div>
              <p className="text-2xl font-black text-white">{profile.purchases_count}</p>
              <p className="text-[0.65rem] uppercase tracking-wider text-white/40 font-bold">Compras</p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
              <div className="text-emerald-400 mb-2"><SVGIcon.Subscription /></div>
              <p className="text-2xl font-black text-white capitalize">{profile.subscription?.status || "Inactiva"}</p>
              <p className="text-[0.65rem] uppercase tracking-wider text-white/40 font-bold">Suscripción</p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
              <div className="text-amber-400 mb-2"><SVGIcon.User /></div>
              <p className="text-2xl font-black text-white capitalize">{profile.role}</p>
              <p className="text-[0.65rem] uppercase tracking-wider text-white/40 font-bold">Tipo</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass-panel p-6 lg:col-span-1">
            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <SVGIcon.Subscription /> Suscripción
            </h2>
            {profile.subscription ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">Plan</span>
                  <span className="text-xs font-bold text-white">{profile.subscription.plan}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">Tokens/Mes</span>
                  <span className="text-xs font-bold text-white">{profile.subscription.tokens_per_month}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">Estado</span>
                  <span className={`text-xs font-bold ${profile.subscription.status === "active" ? "text-emerald-400" : "text-amber-400"}`}>
                    {profile.subscription.status}
                  </span>
                </div>
                {profile.subscription.period_end && (
                  <div className="flex justify-between">
                    <span className="text-xs text-white/40">Válido hasta</span>
                    <span className="text-xs text-white">{new Date(profile.subscription.period_end).toLocaleDateString()}</span>
                  </div>
                )}
                <Link href="/shop" className="block text-center mt-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-bold text-purple-400 hover:bg-white/[0.08] transition-all">
                  Gestionar Plan
                </Link>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-xs text-white/30 mb-4">Sin suscripción activa</p>
                <Link href="/shop" className="inline-block py-2.5 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-cyan-500 text-xs font-black text-white uppercase tracking-wider hover:shadow-lg transition-all">
                  Ver Planes
                </Link>
              </div>
            )}
          </div>

          <div className="glass-panel p-6 lg:col-span-2">
            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <SVGIcon.Download /> Descargas ({profile.purchases_count})
            </h2>
            {profile.purchases.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-white/30 text-sm">No tienes compras aún</p>
                <Link href="/" className="inline-block mt-4 text-xs text-purple-400 hover:text-purple-300 transition-colors">
                  Explorar Catálogo →
                </Link>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                {profile.purchases.map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 hover:bg-white/[0.04] transition-all">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{p.media_title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[0.6rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/[0.04] text-white/40 font-bold">{p.media_type}</span>
                        <span className="text-[0.6rem] text-white/30">{new Date(p.purchased_at).toLocaleDateString()}</span>
                        <span className="text-[0.6rem] text-white/20">({p.download_count} descargas)</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <button
                        onClick={() => handleDownload(p.id)}
                        disabled={downloading === p.id}
                        className="px-3 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-xs font-bold text-purple-400 hover:bg-purple-500/30 transition-all disabled:opacity-50"
                      >
                        {downloading === p.id ? "..." : "Descargar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[0.55rem] text-white/20 mt-3 text-center">
              Los enlaces de descarga expiran en 24 horas desde su generación
            </p>
          </div>
        </div>

        <div className="mt-6 glass-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <SVGIcon.Playlist /> Mis Listas de Reproducción
            </h2>
            <button
              onClick={() => setShowNewPlaylist(!showNewPlaylist)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-xs font-bold text-purple-400 hover:bg-purple-500/30 transition-all"
            >
              <SVGIcon.Plus /> Nueva Lista
            </button>
          </div>

          {showNewPlaylist && (
            <div className="mb-4 p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl space-y-3">
              <input
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Nombre de la lista"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/20"
                onKeyDown={(e) => e.key === "Enter" && handleCreatePlaylist()}
              />
              <input
                value={newPlaylistDesc}
                onChange={(e) => setNewPlaylistDesc(e.target.value)}
                placeholder="Descripción (opcional)"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/20"
              />
              <div className="flex gap-2">
                <button onClick={handleCreatePlaylist} className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-cyan-500 text-xs font-bold text-white hover:shadow-lg transition-all">
                  Crear
                </button>
                <button onClick={() => setShowNewPlaylist(false)} className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-bold text-white/40 hover:text-white/70 transition-all">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {playlists.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-white/30 text-sm">No tienes listas de reproducción</p>
              <p className="text-white/20 text-xs mt-2">Crea una lista para organizar tu música</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => handleOpenPlaylist(pl.id, pl.name)}
                  className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-4 hover:bg-white/[0.04] transition-all group cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                     <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-white truncate">{pl.name}</h3>
                      {pl.description && (
                        <p className="text-xs text-white/30 mt-1 line-clamp-2">{pl.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const res = await fetch(`/api/user-playlists/${pl.id}`);
                            if (res.ok) {
                              const data = await res.json();
                              if (data?.items?.length > 0) {
                                const tracks: Track[] = data.items.map((item: any) => ({
                                  id: item.media_catalog_id,
                                  title: item.title,
                                  artist: item.artist,
                                  type: item.type || "song",
                                  album_art_path: item.album_art_path,
                                  duration_seconds: item.duration_seconds,
                                  file_path: item.file_path || "",
                                  price_tokens: item.price_tokens || 0,
                                  price_usd: item.price_usd || 0,
                                  creator: item.artist,
                                }));
                                setCtxPlaylist(tracks);
                                contextPlay(tracks[0]);
                              }
                            }
                          } catch {}
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[0.6rem] font-bold text-purple-400 hover:bg-purple-500/20 transition-all"
                      >
                        Reproducir
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(pl.id); }}
                        className="text-white/20 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-white/[0.04]"
                      >
                        <SVGIcon.Trash />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-[0.6rem] text-white/30">{pl.item_count} items</span>
                    <span className="text-[0.5rem] text-white/20">·</span>
                    <span className="text-[0.6rem] text-white/20">{new Date(pl.updated_at).toLocaleDateString()}</span>
                  </div>
                  <p className="mt-2 text-[0.55rem] text-purple-400/50 group-hover:text-purple-400 transition-all flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                    Ver detalles
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ─── PLAYLIST DETAIL MODAL ────────────────────────────────────── */}
          {selectedPlaylist && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4" onClick={() => { setSelectedPlaylist(null); setPlaylistItems([]); }}>
              <div className="bg-[#0d0d1f] border border-white/[0.08] rounded-3xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 20% 0%, rgba(124,58,237,0.08) 0%, transparent 60%)" }} />

                {/* Header */}
                <div className="relative flex items-center justify-between px-6 py-5 border-b border-white/[0.05]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#7c3aed]/20 border border-[#7c3aed]/30 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#a78bfa]">
                        <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-white">{selectedPlaylist.name}</h2>
                      <p className="text-xs text-white/40">{playlistItems.length} items</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {playlistItems.length > 0 && (
                      <button
                        onClick={() => handlePlayAll(playlistItems)}
                        className="px-3 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-[0.65rem] font-bold text-purple-400 hover:bg-purple-500/30 transition-all flex items-center gap-1.5"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        Reproducir todo
                      </button>
                    )}
                    <button
                      onClick={() => { setSelectedPlaylist(null); setPlaylistItems([]); }}
                      className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.10] transition-all"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                  </div>
                </div>

                {/* Items list */}
                <div className="relative flex-1 overflow-y-auto p-4 [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-thumb]:bg-white/[0.08] [&::-webkit-scrollbar-thumb]:rounded-full">
                  {playlistItemsLoading ? (
                    <div className="flex justify-center py-16">
                      <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : playlistItems.length === 0 ? (
                    <div className="text-center py-16">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20 mx-auto mb-3">
                        <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                      </svg>
                      <p className="text-sm text-white/30">Esta lista está vacía</p>
                      <p className="text-xs text-white/20 mt-1">Agrega items desde el catálogo principal</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {playlistItems.map((item) => {
                        const artPath = item.album_art_path;
                        const art = artPath?.includes("media_library/")
                          ? artPath.replace(/.*media_library\//, "/media-static/")
                          : artPath?.startsWith("http") ? artPath : null;
                        return (
                          <div key={item.id} onMouseEnter={() => handlePrefetchItem(item)} onTouchStart={() => handlePrefetchItem(item)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group/item hover:bg-white/[0.03] ${playingItemId === item.media_catalog_id ? "bg-purple-500/10 border border-purple-500/20" : "border border-transparent"}`}>
                            {/* Album art */}
                            <div className="w-10 h-10 shrink-0 rounded-xl overflow-hidden bg-white/[0.04] relative">
                              {art ? (
                                <img src={art} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white/20">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                                </div>
                              )}
                              {/* Play overlay on hover */}
                              <button
                                onClick={() => handlePlayItem(item)}
                                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-white"><path d="M8 5v14l11-7z"/></svg>
                              </button>
                            </div>

                            {/* Info */}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-white truncate">{item.title}</p>
                              <p className="text-[0.6rem] text-white/40 truncate">{item.artist}</p>
                            </div>

                            {/* Duration + Remove */}
                            <div className="flex items-center gap-2 shrink-0">
                              {item.duration_seconds && (
                                <span className="text-[0.55rem] text-white/30 font-mono">
                                  {Math.floor(item.duration_seconds / 60)}:{(item.duration_seconds % 60).toString().padStart(2, "0")}
                                </span>
                              )}
                              <button
                                onClick={() => handleRemoveItem(selectedPlaylist.id, item.id)}
                                className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-white/[0.04] transition-all opacity-0 group-hover/item:opacity-100"
                                title="Eliminar de la lista"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer hint */}
                <div className="relative px-6 py-3 border-t border-white/[0.04]">
                  <p className="text-[0.55rem] text-white/20 text-center">
                    Agrega más música desde el catálogo principal usando el botón <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block align-middle"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> en cada elemento
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── EDIT PROFILE MODAL ────────────────────────────────────── */}
        {showEditModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[210] flex items-center justify-center p-4" onClick={() => { setShowEditModal(false); router.push("/portal"); }}>
            <div className="bg-[#0d0d1f] border border-white/[0.08] rounded-3xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 80% 0%, rgba(124,58,237,0.06) 0%, transparent 50%)" }} />
              
              <div className="flex justify-between items-center mb-6 relative">
                <h2 className="text-base font-black text-white">Editar Perfil</h2>
                <button
                  onClick={() => { setShowEditModal(false); router.push("/portal"); }}
                  className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.10] transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
              </div>

              {updateError && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
                  {updateError}
                </div>
              )}
              {updateSuccess && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                  {updateSuccess}
                </div>
              )}

              <form onSubmit={handleUpdateProfile} className="space-y-4 relative">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-white/40 mb-1.5">Nombre de Usuario</label>
                  <input
                    type="text"
                    required
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-purple-500/50 rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-white/40 mb-1.5">Correo Electrónico</label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-purple-500/50 rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-white/40 mb-1.5">Nueva Contraseña (dejar en blanco para mantener actual)</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-purple-500/50 rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/20 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={updatingProfile}
                  className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-cyan-500 text-xs font-black text-white uppercase tracking-wider hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {updatingProfile ? "Guardando..." : "Guardar Cambios"}
                </button>
              </form>
            </div>
          </div>
        )}

        <div className="mt-6 glass-panel p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-3">Tu enlace de la tienda</h3>
          <div className="flex items-center gap-3">
            <input
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${profile.username}`}
              className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white/60 outline-none"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/?ref=${profile.username}`);
              }}
              className="px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-bold text-white/60 hover:text-purple-400 transition-all"
            >
              Copiar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PortalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PortalContent />
    </Suspense>
  );
}

