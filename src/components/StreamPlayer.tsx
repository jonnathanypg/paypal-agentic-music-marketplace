"use client";

/**
 * StreamPlayer.tsx — Reproductor Premium Persistente (Estilo Spotify)
 * ===================================================================
 * Barra de reproductor fija en la parte inferior del portal de streaming,
 * expandible a pantalla completa con vista enfocada en 3D y letras sincronizadas.
 */

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { logTrackPlay, logTrackListenTime, getNextRecommendedTrack } from "@/utils/recommender";


export interface Track {
  id: number;
  title: string;
  artist: string;
  type: string;
  price_tokens: number;
  price_usd: number;
  album_art_path?: string;
  file_path: string;
  description?: string;
  genre?: string;
  duration_seconds?: number;
  lyrics_path?: string;
  creator?: string;
  album?: string;
  play_count?: number;
  language?: string;
}

interface StreamPlayerProps {
  track: Track | null;
  playlist: Track[];
  onTrackChange: (track: Track) => void;
  onCheckout: (track: Track) => void;
  onAddToPlaylist?: (track: Track) => void;
  isChatOpen?: boolean;
  isAdmin?: boolean;
  showPlaylistView?: boolean;
  onClosePlaylistView?: () => void;
}

interface SyncedLine {
  time: number;
  text: string;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getCreatorSlug(creator: string | undefined): string | null {
  if (!creator) return null;
  const name = creator.toLowerCase().trim();
  if (name.includes("metafísica") || name.includes("metafisica")) return "audiolibrosmetafisica";
  if (name.includes("soundtrack")) return "billionairesoundtrack";
  if (name.includes("playlist")) return "billionairesplaylist";
  if (name.includes("hbl")) return "mentalidadhbl";
  if (name.includes("metamorfosis")) return "efectometamorfosis";
  return name.replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
}

// ─── SVG Icon Components ────────────────────────────────────────────────────
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

const IconSkipNext = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
  </svg>
);

const IconSkipPrev = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
  </svg>
);

const IconShuffle = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
  </svg>
);

const IconRepeat = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
  </svg>
);

const IconRepeatOne = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v6H13z" />
  </svg>
);

const IconVolumeUp = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </svg>
);

const IconVolumeMute = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
  </svg>
);

const IconLyrics = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
  </svg>
);

const IconDownload = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
  </svg>
);

const IconChevronDown = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
  </svg>
);

const IconChevronLeft = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
  </svg>
);

const IconChevronRight = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
  </svg>
);

const IconMusicNote = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
  </svg>
);

const IconExpand = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
  </svg>
);

const IconPlus = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
  </svg>
);

const IconQueue = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
  </svg>
);

// import { IconHeart, IconHeartFilled, IconShare, IconPlaylist, IconQueue, IconSettings, IconChevronUp, IconMenu, IconLayoutBoard } from "./Icons";
import { usePlayer } from "@/contexts/PlayerContext";
import Image from "next/image";
import { useDJ } from "@/contexts/DJContext";
import { VirtualDJStudio } from "./VirtualDJStudio";

export default function StreamPlayer({ track, playlist, onTrackChange, onCheckout, onAddToPlaylist, isChatOpen = false, isAdmin = false, showPlaylistView = false, onClosePlaylistView }: StreamPlayerProps) {
  const { isAgentSpeaking, catalog, isAuthenticated, showDJView, setShowDJView } = usePlayer();
  const {
    setIsOpen: setDJOpen,
    loadTrackToDeck,
    playDeck,
    pauseDeck,
    togglePlayDeck,
    seekDeck,
    deckA,
    deckB,
    crossfader,
    masterVolume,
    setMasterVolume,
    registerOnTrackChangeListener,
    unregisterOnTrackChangeListener,
    registerOnDeckEndedListener,
    unregisterOnDeckEndedListener,
    smoothCloseDJ,
  } = useDJ();

  const dominantDeckKey: "A" | "B" = crossfader > 0.5 ? "B" : "A";
  const dominantDeck = dominantDeckKey === "B" ? deckB : deckA;
  const isAudioActive = Boolean(dominantDeck.track);

  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const progressExpandedRef = useRef<HTMLDivElement>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const coverUploadRef = useRef<HTMLInputElement>(null);
  const playlistCarouselRef = useRef<HTMLDivElement>(null);
  const currentTrackRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"none" | "one" | "all">("all");
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsText, setLyricsText] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  // ── Cover Art Personalization ──
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverStatus, setCoverStatus] = useState<{type: "success"|"error"|"info", msg: string} | null>(null);
  const [currentArtUrl, setCurrentArtUrl] = useState<string | null>(null);

  // ── Fan Heart / Me Gusta Reaction State (Sin comentarios, señal pura para algoritmo Saori) ──
  const [likedIds, setLikedIds] = useState<number[]>([]);
  const [likesCounts, setLikesCounts] = useState<Record<string, number>>({});

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
  }, [track?.id]);

  const handleToggleLike = async (targetTrack: Track) => {
    try {
      const res = await fetch("/api/artist-studio/likes/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_catalog_id: targetTrack.id }),
      });
      const d = await res.json();
      if (d?.success) {
        setLikesCounts((prev) => ({ ...prev, [String(targetTrack.id)]: d.likes_count }));
        setLikedIds((prev) =>
          d.liked ? [...prev.filter((id) => id !== targetTrack.id), targetTrack.id] : prev.filter((id) => id !== targetTrack.id)
        );
        try {
          const { logTrackPlay } = require("@/utils/recommender");
          if (d.liked) logTrackPlay(targetTrack);
        } catch {}
      }
    } catch {}
  };

  // Update currentArtUrl when track changes
  useEffect(() => {
    setCurrentArtUrl(getArtUrl(track?.album_art_path));
  }, [track?.album_art_path, track?.id]);

  // Escuchar cambios de pista dominante en tiempo real desde el DJ Studio (Crossfader)
  useEffect(() => {
    const handleDominantTrackChange = (newDominantTrack: Track) => {
      if (newDominantTrack && (!track || newDominantTrack.id !== track.id)) {
        onTrackChange(newDominantTrack);
      }
    };

    registerOnTrackChangeListener(handleDominantTrackChange);
    return () => {
      unregisterOnTrackChangeListener(handleDominantTrackChange);
    };
  }, [track, onTrackChange, registerOnTrackChangeListener, unregisterOnTrackChangeListener]);

  // Sincronizar volumen master y ducking hacia el motor DJ (Single Audio Bus)
  useEffect(() => {
    if (isAgentSpeaking) {
      setMasterVolume(0.15); // Ducking inteligente al 15%
    } else {
      setMasterVolume(muted ? 0 : volume);
    }
  }, [isAgentSpeaking, volume, muted, setMasterVolume]);

  // Sincronizar tiempo de reproducción, duración y estado con el deck dominante
  useEffect(() => {
    setCurrentTime(dominantDeck.currentTime);
    if (dominantDeck.duration > 0) {
      setDuration(dominantDeck.duration);
    }
    setPlaying(dominantDeck.isPlaying);
  }, [dominantDeck.currentTime, dominantDeck.duration, dominantDeck.isPlaying]);

  // Cierre fluido de la vista de cabina DJ: NO detiene ni reinicia el audio
  const handleCloseDJView = (openNextView?: "lyrics" | "focus" | "queue") => {
    smoothCloseDJ(() => {
      setShowDJView(false);
      const isB = crossfader > 0.5;
      const activeDeck = isB ? deckB : deckA;
      const activeTrack = activeDeck.track || (isB ? deckA.track : deckB.track);

      if (activeTrack && (!track || track.id !== activeTrack.id)) {
        onTrackChange(activeTrack);
      }

      if (openNextView === "lyrics") {
        setIsExpanded(true);
        setShowLyrics(true);
      } else if (openNextView === "focus") {
        setShowLyrics(false);
        setIsExpanded(true);
      } else if (openNextView === "queue") {
        setShowQueue(true);
      }
    });
  };

  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);


  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;
    if (diff > threshold) {
      handleNext();
    } else if (diff < -threshold) {
      handlePrev();
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const getAudioUrl = useCallback((t: Track) => {
    if (!t?.file_path) return "";
    if (t.file_path.includes("media_library/")) {
      return t.file_path
        .substring(t.file_path.indexOf("media_library/"))
        .replace("media_library/", "/media-static/");
    }
    return t.file_path;
  }, []);

  const getArtUrl = useCallback((path?: string) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    if (path.includes("media_library/")) {
      return path.substring(path.indexOf("media_library/")).replace("media_library/", "/media-static/");
    }
    return path;
  }, []);

  // Parsear letras limpias desde el archivo (excluir metadata como TITLE:, TAGS:, PROMPT:, etc.)
  // IMPORTANTE: Preserva las líneas LRC con timestamp [mm:ss.xx] para sincronización precisa.
  const parseLyricsFile = (raw: string): string => {
    const lines = raw.split("\n");
    const lrcLineRegex = /^\[\d+:\d+(?:\.\d+)?\]/;
    const cleanLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();

      // Saltar líneas de metadata (NUNCA borrar líneas LRC que empiezan con timestamp)
      if (lrcLineRegex.test(trimmed)) {
        // Preservar línea LRC con timestamp
        cleanLines.push(trimmed);
        continue;
      }

      // Saltar líneas de metadata del archivo de letras
      if (
        lower.startsWith("title:") ||
        lower.startsWith("tags:") ||
        lower.startsWith("genero:") ||
        lower.startsWith("genre:") ||
        lower.startsWith("prompt:") ||
        lower.startsWith("artist:") ||
        lower.startsWith("album:")
      ) {
        continue;
      }

      if (trimmed.length > 0) {
        cleanLines.push(trimmed);
      }
    }

    // Si no encontramos letras reales, devolver lo que hay sin metadata
    const result = cleanLines.join("\n").trim();
    if (result.length < 20) {
      // Last resort: just remove obvious metadata lines
      return lines
        .filter(l => {
          const lw = l.trim().toLowerCase();
          return !lw.startsWith("title:") && !lw.startsWith("tags:") && !lw.startsWith("genero:") && !lw.startsWith("genre:") && !lw.startsWith("prompt:");
        })
        .join("\n")
        .trim();
    }
    return result;
  };

  useEffect(() => {
    if (!track) return;
    try {
      logTrackPlay(track);
    } catch (_) {}

    // Cargar en el deck dominante si no coincide
    const currentDominant = crossfader > 0.5 ? deckB : deckA;
    if (!currentDominant.track || currentDominant.track.id !== track.id) {
      const targetDeck = crossfader > 0.5 ? "B" : "A";
      let resumeTime = 0;
      let shouldAutoPlay = true;
      try {
        const savedStr = sessionStorage.getItem("mediasuite_playback_pos");
        if (savedStr) {
          const saved = JSON.parse(savedStr);
          if (saved.trackId === track.id && saved.time > 2) {
            resumeTime = saved.time;
            shouldAutoPlay = saved.playing !== false;
          }
        }
      } catch (_) {}

      loadTrackToDeck(targetDeck, track, shouldAutoPlay, resumeTime);
    }

    // Predictive prefetching of the next track via Service Worker
    const nextTrack = getNextTrack();
    if (nextTrack) {
      const nextUrl = getAudioUrl(nextTrack);
      if (nextUrl && typeof navigator !== "undefined" && navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          action: "PREFETCH_TRACKS",
          urls: [nextUrl]
        });
      }
    }

    if (track.lyrics_path) {
      const lyricsUrl = `/media-static/${track.lyrics_path.replace(/.*media_library\//, "")}`;
      fetch(lyricsUrl)
        .then(r => r.text())
        .then(t => {
          const cleaned = parseLyricsFile(t);
          setLyricsText(cleaned.length > 10 ? cleaned : "Letras no disponibles para esta pista.");
        })
        .catch(() => setLyricsText("Letras no disponibles para esta pista."));
    } else {
      setLyricsText(`${track.title}\n\nLetras próximamente disponibles.`);
    }
  }, [track]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume;
    }
  }, [volume, muted]);

  // Sincronizar showPlaylistView del contexto con showQueue interno
  useEffect(() => {
    if (showPlaylistView) {
      setShowQueue(true);
    }
  }, [showPlaylistView]);

  // Auto-centrar el track actual en el carrusel cuando se abre la cola
  useEffect(() => {
    if (showQueue && currentTrackRef.current) {
      setTimeout(() => {
        currentTrackRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
      }, 300);
    }
  }, [showQueue, track?.id]);

  const togglePlay = () => {
    togglePlayDeck(dominantDeckKey);
  };

  const lastSavedTimeRef = useRef<number>(0);
  const nextTrackPrefetched = useRef<string | null>(null);

  // Persistir progreso y prefetching predictivo
  useEffect(() => {
    const current = dominantDeck.currentTime;
    const dur = dominantDeck.duration || 0;
    if (track && Math.abs(current - lastSavedTimeRef.current) >= 2) {
      lastSavedTimeRef.current = current;
      try {
        logTrackListenTime(track.id, 2);
        sessionStorage.setItem("mediasuite_playback_pos", JSON.stringify({
          trackId: track.id,
          time: current,
          playing: dominantDeck.isPlaying,
        }));
      } catch (_) {}
    }
    if (dur > 0 && (current / dur) > 0.85) {
      const nextTrack = getNextTrack();
      if (nextTrack && nextTrackPrefetched.current !== nextTrack.file_path) {
        nextTrackPrefetched.current = nextTrack.file_path;
        const preloadLink = document.createElement("link");
        preloadLink.rel = "prefetch";
        preloadLink.as = "audio";
        preloadLink.href = getAudioUrl(nextTrack);
        document.head.appendChild(preloadLink);
      }
    }
  }, [dominantDeck.currentTime, dominantDeck.duration, dominantDeck.isPlaying, track]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>, ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return;
    const totalDur = dominantDeck.duration || duration;
    if (!totalDur) return;
    const rect = ref.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekDeck(dominantDeckKey, ratio * totalDur);
  };

  const getNextTrack = useCallback((): Track | null => {
    if (!track) return null;

    // Si hay una playlist activa (álbum/lista), navegar dentro de ella
    if (playlist.length > 0) {
      if (shuffle) {
        const others = playlist.filter(t => t.id !== track.id);
        return others[Math.floor(Math.random() * others.length)] || track;
      }
      const idx = playlist.findIndex(t => t.id === track.id);
      return playlist[(idx + 1) % playlist.length];
    }

    // Sin playlist: usar todo el catálogo de canciones como queue infinita
    const songCatalog = catalog.filter(t => t.type === "song" || !t.type);
    if (songCatalog.length > 0) {
      if (shuffle) {
        const others = songCatalog.filter(t => t.id !== track.id);
        if (others.length === 0) return songCatalog[0];
        return others[Math.floor(Math.random() * others.length)];
      }
      const idx = songCatalog.findIndex(t => t.id === track.id);
      if (idx !== -1) {
        return songCatalog[(idx + 1) % songCatalog.length];
      }
      // Si el track actual no está en el catálogo filtrado, recomendación inteligente
      return getNextRecommendedTrack(track.id, songCatalog, isAuthenticated);
    }
    return null;
  }, [track, playlist, shuffle, catalog, isAuthenticated]);

  const getPrevTrack = useCallback((): Track | null => {
    if (!track) return null;

    if (playlist.length > 0) {
      const idx = playlist.findIndex(t => t.id === track.id);
      return playlist[(idx - 1 + playlist.length) % playlist.length];
    }

    // Sin playlist: retroceder en el catálogo completo
    const songCatalog = catalog.filter(t => t.type === "song" || !t.type);
    if (songCatalog.length > 0) {
      const idx = songCatalog.findIndex(t => t.id === track.id);
      if (idx !== -1) {
        return songCatalog[(idx - 1 + songCatalog.length) % songCatalog.length];
      }
    }
    return null;
  }, [track, playlist, catalog]);

  const handleNext = () => {
    const next = getNextTrack();
    if (next) onTrackChange(next);
  };

  const handlePrev = () => {
    if (dominantDeck.currentTime > 3) {
      seekDeck(dominantDeckKey, 0);
      return;
    }
    const prev = getPrevTrack();
    if (prev) onTrackChange(prev);
  };

  const handleEnded = useCallback(() => {
    if (repeat === "one") {
      seekDeck(dominantDeckKey, 0);
      playDeck(dominantDeckKey);
      return;
    }
    const next = getNextTrack();
    if (next) onTrackChange(next);
  }, [repeat, dominantDeckKey, seekDeck, playDeck, getNextTrack, onTrackChange]);

  // Escuchar cuando el deck dominante finaliza la reproducción
  useEffect(() => {
    const handleDeckEnded = (endedDeck: "A" | "B") => {
      if (endedDeck === dominantDeckKey) {
        handleEnded();
      }
    };
    registerOnDeckEndedListener(handleDeckEnded);
    return () => {
      unregisterOnDeckEndedListener(handleDeckEnded);
    };
  }, [dominantDeckKey, handleEnded, registerOnDeckEndedListener, unregisterOnDeckEndedListener]);

  const cycleRepeat = () => {
    setRepeat(r => r === "none" ? "all" : r === "all" ? "one" : "none");
  };

  // PARSEO DE LETRAS SINCRONIZADAS
  // Soporta formato LRC [mm:ss.xx] o fallback proporcional con offset de intro.
  const parsedLines = useMemo((): SyncedLine[] => {
    if (!lyricsText) return [];
    const lines = lyricsText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const lrcRegex = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/;
    // Líneas de sección a excluir del karaoke (no son versos cantados)
    const sectionHeaderRegex = /^\[(?:INTRO|VERSE|VERSO|CORO|CHORUS|BRIDGE|PUENTE|PRE-CORO|PRE-CHORUS|OUTRO|REMATE|ESTRIBILLO|HOOK|DROP)[^\]]*\]$/i;
    const result: SyncedLine[] = [];
    let hasTimestamps = false;

    for (const line of lines) {
      const match = line.match(lrcRegex);
      if (match) {
        hasTimestamps = true;
        const min = parseInt(match[1], 10);
        const sec = parseFloat(match[2]);
        const text = match[3].trim();
        // Ignorar líneas LRC de sección vacías o sin texto cantable
        if (text.length > 0 && !sectionHeaderRegex.test(text)) {
          result.push({ time: min * 60 + sec, text });
        }
      }
    }

    if (hasTimestamps && result.length > 0) {
      return result.sort((a, b) => a.time - b.time);
    }

    // Fallback: distribuir líneas con offset de intro
    // Filtra metadata y marcadores de sección tipo [INTRO], [VERSO 1], etc.
    const cleanLines = lines.filter(l => {
      const lower = l.toLowerCase();
      if (
        lower.startsWith("title:") ||
        lower.startsWith("prompt:") ||
        lower.startsWith("tags:") ||
        lower.startsWith("genero:") ||
        lower.startsWith("genre:")
      ) return false;
      // Filtrar marcadores de sección entre corchetes (p.ej. [INTRO], [VERSO 1])
      if (sectionHeaderRegex.test(l.trim())) return false;
      return true;
    });

    if (cleanLines.length === 0) {
      return [{ time: 0, text: lyricsText }];
    }

    const totalDur = duration || 180;
    // Estimación del offset de intro: 8% de la duración, mín 5s, máx 20s
    // Esto aproxima el silencio instrumental antes de que entre la voz
    const introOffset = Math.min(20, Math.max(5, totalDur * 0.08));
    const usableDuration = totalDur - introOffset;
    const interval = usableDuration / cleanLines.length;
    return cleanLines.map((line, idx) => ({
      time: introOffset + idx * interval,
      text: line
    }));
  }, [lyricsText, duration]);

  const currentLineIndex = useMemo(() => {
    if (parsedLines.length === 0) return -1;
    // Antes del primer timestamp LRC → no marcar ninguna línea activa
    if (parsedLines[0] && currentTime < parsedLines[0].time) return -1;
    let idx = -1;
    for (let i = 0; i < parsedLines.length; i++) {
      if (currentTime >= parsedLines[i].time) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [parsedLines, currentTime]);

  const activeLineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentLineIndex]);

  const progress = duration ? (currentTime / duration) * 100 : 0;
  const artUrl = currentArtUrl || getArtUrl(track?.album_art_path);
  const nextTrack = getNextTrack();
  const prevTrack = getPrevTrack();

  // ── Cover Art handlers ──
  const handleAutoGenerateCover = async () => {
    if (!track) return;
    setCoverLoading(true);
    setCoverStatus({ type: "info", msg: "🔍 Buscando imagen contextual en Pexels..." });
    try {
      const res = await fetch(`/api/ecommerce/catalog/${track.id}/cover/auto`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        if (data.skipped) {
          setCoverStatus({ type: "info", msg: "ℹ️ Ya tiene portada personalizada (no se sobreescribió)" });
        } else {
          const newUrl = `/media-static/${data.album_art_path.replace(/.*media_library\//, "")}`;
          setCurrentArtUrl(newUrl);
          setCoverStatus({ type: "success", msg: `✅ Portada generada | Foto por: ${data.photographer}` });
        }
      } else {
        setCoverStatus({ type: "error", msg: `❌ Error: ${data.detail || "No se pudo generar la portada"}` });
      }
    } catch (e) {
      setCoverStatus({ type: "error", msg: "❌ Error de conexión. Verifica el servidor." });
    } finally {
      setCoverLoading(false);
    }
  };

  const handleUploadCover = async (file: File) => {
    if (!track || !file) return;
    setCoverLoading(true);
    setCoverStatus({ type: "info", msg: "⬆️ Subiendo imagen personalizada..." });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/ecommerce/catalog/${track.id}/cover/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        const newUrl = `/media-static/${data.album_art_path.replace(/.*media_library\//, "")}`;
        setCurrentArtUrl(newUrl);
        setCoverStatus({ type: "success", msg: `✅ Portada personalizada guardada (${data.size_kb} KB)` });
      } else {
        setCoverStatus({ type: "error", msg: `❌ ${data.detail || "Error al subir la imagen"}` });
      }
    } catch (e) {
      setCoverStatus({ type: "error", msg: "❌ Error al subir la imagen. Intenta de nuevo." });
    } finally {
      setCoverLoading(false);
    }
  };

  if (!track) return null;

  const renderLyricsLines = () => parsedLines.map((line, idx) => {
    const isActive = idx === currentLineIndex;
    const noActiveYet = currentLineIndex === -1;
    const distance = noActiveYet ? 999 : Math.abs(idx - currentLineIndex);

    let scale = 1;
    let opacity = 1;

    if (noActiveYet) {
      scale = 0.95;
      opacity = 0.25;
    } else if (distance === 0) {
      scale = 1.08;
      opacity = 1.0;
    } else if (distance === 1) {
      scale = 0.98;
      opacity = 0.70;
    } else if (distance === 2) {
      scale = 0.90;
      opacity = 0.45;
    } else if (distance === 3) {
      scale = 0.82;
      opacity = 0.25;
    } else {
      scale = 0.75;
      opacity = 0.10;
    }

    return (
      <div
        key={idx}
        ref={isActive ? activeLineRef : null}
        onClick={() => {
          if (audioRef.current) {
            audioRef.current.currentTime = line.time;
          }
        }}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "left center",
          opacity: opacity,
        }}
        className={`text-left py-1 text-lg md:text-2xl font-black tracking-tight transition-all duration-500 ease-out cursor-pointer hover:opacity-100 ${
          isActive
            ? "text-[#06b6d4] drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]"
            : "text-white"
        }`}
      >
        {line.text}
      </div>
    );
  });

  return (
    <>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
        .marquee-wrap {
          overflow: hidden;
          white-space: nowrap;
          position: relative;
        }
        .marquee-wrap > .marquee-inner {
          display: inline-block;
          padding-right: 60px;
          animation: marquee 18s linear infinite;
          animation-play-state: running;
        }
        .marquee-wrap > .marquee-inner-slow {
          display: inline-block;
          padding-right: 60px;
          animation: marquee 28s linear infinite;
          animation-play-state: running;
        }
      `}</style>
      {/* Audio Engine Unificado: La reproducción total se procesa en DJContext (Canal A y Canal B conectados al Master Bus) */}

      {/* ========================================== */}
      {/*  MODO EXPANDIDO 3D — ENFOQUE TOTAL         */}
      {/* ========================================== */}
      {isExpanded && (
        <div           className="fixed inset-0 z-[150] bg-[#04040a]/99 backdrop-blur-3xl flex flex-col p-6 pb-4 md:pb-6 overflow-hidden animate-[fadeIn_0.3s_ease]">
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes slideUp {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}} />
          
          {/* Header */}
          <div className="flex items-center justify-between shrink-0 mb-4">
            <div>
              <p className="text-[0.6rem] text-purple-400 font-black uppercase tracking-widest">Canal / Creador</p>
              <h2 className="text-sm font-bold text-white truncate max-w-xs">{track.creator || "Éxito.cyou"}</h2>
            </div>

            <button 
              onClick={() => { setIsExpanded(false); setShowLyrics(false); }}
              className="w-10 h-10 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:scale-105 active:scale-95 transition-all text-white flex items-center justify-center shadow-lg"
              title="Minimizar"
            >
              <IconChevronDown size={20} />
            </button>
          </div>

          {/* Central Section */}
          <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-8 min-h-0 py-4 relative">
            
            {/* LADO IZQUIERDO: DECK CAROUSEL 3D */}
            <div 
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className={`flex flex-col items-center justify-center h-full relative select-none transition-all duration-500 ${
                showLyrics ? "w-full lg:w-1/2" : "w-full max-w-2xl"
              }`}
            >
              
              {/* Carousel container */}
              <div className="flex items-center justify-center gap-6 w-full max-w-md relative" style={{ perspective: "1000px" }}>
                
                {/* Prev Arrow Button */}
                <button
                  onClick={handlePrev}
                  className="absolute left-0 z-20 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 hover:scale-110 transition-all shadow-lg"
                  title="Anterior"
                >
                  <IconChevronLeft size={20} />
                </button>

                {/* Prev Card (Detrás Izquierda) */}
                {prevTrack && (
                  <div 
                    onClick={handlePrev}
                    className="hidden sm:block absolute left-8 w-32 h-32 md:w-40 md:h-40 rounded-3xl overflow-hidden cursor-pointer shadow-2xl opacity-20 transition-all duration-500 hover:opacity-40"
                    style={{
                      transform: "translateX(-40%) translateZ(-150px) rotateY(25deg)",
                      pointerEvents: "auto"
                    }}
                  >
                    {getArtUrl(prevTrack.album_art_path) ? (
                      <Image src={getArtUrl(prevTrack.album_art_path)!} alt="" fill sizes="48px" className="object-cover" />
                    ) : <div className="w-full h-full bg-white/5 flex items-center justify-center text-white/40"><IconMusicNote size={32} /></div>}
                  </div>
                )}

                {/* Active Card Group (Centro Enfoque con Vinilo Desplazable) */}
                <div className="relative w-56 h-56 md:w-72 md:h-72 flex items-center justify-center z-10 transition-all duration-500">
                  
                  {/* Spinning Vinyl Record */}
                  <div 
                    className={`absolute rounded-full bg-black/95 border border-neutral-800 shadow-[0_10px_35px_rgba(0,0,0,0.8)] flex items-center justify-center transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] z-0 ${
                      playing 
                        ? "w-48 h-48 md:w-64 md:h-64 translate-x-16 md:translate-x-20 rotate-180 animate-[spin_10s_linear_infinite]" 
                        : "w-44 h-44 md:w-56 md:h-56 translate-x-0"
                    }`}
                  >
                    <div className="absolute inset-2 rounded-full border border-neutral-900/30 bg-[repeating-radial-gradient(circle,black,black_2px,transparent_3px,transparent_5px)] opacity-60" />
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#7c3aed]/20 border border-[#7c3aed]/40 flex items-center justify-center relative">
                      <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-[#04040a] z-10" />
                    </div>
                  </div>

                  {/* Album Cover Art with Edit Button */}
                  <div className="w-full h-full rounded-3xl overflow-hidden bg-neutral-900 shadow-[0_20px_50px_rgba(0,0,0,0.6)] relative z-10 border border-white/[0.08] hover:scale-[1.02] transition-transform duration-500 group/cover">
                    {artUrl ? (
                      <Image src={artUrl} alt={track.title} fill sizes="(max-width: 640px) 128px, 96px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#7c3aed]/20 to-[#06b6d4]/20 flex items-center justify-center text-white/40">
                        <IconMusicNote size={64} />
                      </div>
                    )}
                    {/* Hover overlay with edit button (Only for Administrators) */}
                    {isAdmin && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/cover:opacity-100 transition-opacity duration-300 flex items-center justify-center rounded-3xl">
                        <button
                          onClick={() => { setShowCoverModal(true); setCoverStatus(null); }}
                          className="flex flex-col items-center gap-2 text-white hover:scale-110 transition-transform"
                          title="Personalizar portada"
                        >
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                            <path d="M20 3H4v2h7v2H4v2h7v2H4v2h16v-2h-7v-2h7V7h-7V5h7V3z" style={{display:'none'}}/>
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M20 4h-3.17L15 2H9L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 13c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
                          </svg>
                          <span className="text-xs font-bold">Personalizar portada</span>
                        </button>
                      </div>
                    )}
                  </div>

                </div>

                {/* Next Card (Detrás Derecha) */}
                {nextTrack && (
                  <div 
                    onClick={handleNext}
                    className="hidden sm:block absolute right-8 w-32 h-32 md:w-40 md:h-40 rounded-3xl overflow-hidden cursor-pointer shadow-2xl opacity-20 transition-all duration-500 hover:opacity-40"
                    style={{
                      transform: "translateX(40%) translateZ(-150px) rotateY(-25deg)",
                      pointerEvents: "auto"
                    }}
                  >
                    {getArtUrl(nextTrack.album_art_path) ? (
                      <Image src={getArtUrl(nextTrack.album_art_path)!} alt="" fill sizes="48px" className="object-cover" />
                    ) : <div className="w-full h-full bg-white/5 flex items-center justify-center text-white/40"><IconMusicNote size={32} /></div>}
                  </div>
                )}

                {/* Next Arrow Button */}
                <button
                  onClick={handleNext}
                  className="absolute right-0 z-20 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 hover:scale-110 transition-all shadow-lg"
                  title="Siguiente"
                >
                  <IconChevronRight size={20} />
                </button>

              </div>

              {/* Title & Artist */}
              <div className="mt-8 text-center px-4 w-full">
                <h1 className="text-xl md:text-2xl font-black text-white tracking-tight line-clamp-1">{track.title}</h1>
                <p 
                  onClick={() => {
                    const slug = getCreatorSlug(track.creator || track.artist);
                    if (slug) {
                      setIsExpanded(false);
                      router.push(`/channel/${slug}`);
                    }
                  }}
                  className="text-sm text-white/50 font-bold mt-1.5 hover:text-[#06b6d4] hover:underline cursor-pointer transition-colors inline-block"
                >
                  {track.artist}
                </p>
                {track.album && (
                  <p className="text-[0.7rem] text-purple-400 font-bold mt-1.5 uppercase tracking-wider">Álbum: {track.album}</p>
                )}
                <div className="inline-block mt-3 bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-1 text-[0.65rem] font-bold text-white/40 uppercase tracking-widest">
                  {track.genre || "Niche Audio"}
                </div>
              </div>

            </div>

            {/* LADO DERECHO (DESKTOP) / BOTTOM SHEET (MOBILE) - LETRAS SINCRONIZADAS */}
            {showLyrics && (
              <div className="absolute lg:relative inset-x-0 bottom-0 lg:bottom-auto lg:inset-auto z-40 lg:z-10 w-full h-1/2 lg:h-full lg:w-1/2 min-h-0 flex flex-col justify-center animate-[slideUp_0.3s_ease] lg:animate-[fadeIn_0.3s_ease] px-4 lg:px-0">
                
                <div className="bg-[#0c0c16]/95 border border-white/[0.08] lg:border-white/[0.05] rounded-t-3xl lg:rounded-3xl p-5 md:p-6 w-full h-full flex flex-col min-h-0 relative backdrop-blur-2xl shadow-2xl">
                  <div className="lg:hidden flex justify-center pb-2">
                    <div className="w-12 h-1 rounded-full bg-white/20" onClick={() => setShowLyrics(false)} />
                  </div>
                  
                  <div className="flex items-center justify-between mb-2 border-b border-white/[0.04] pb-2 shrink-0">
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#06b6d4] flex items-center gap-1.5">
                      <IconLyrics size={14} />
                      Letras Sincronizadas
                    </h3>
                    <span className="text-[0.6rem] text-white/25 hidden sm:inline">Toca un verso para buscar ese instante</span>
                  </div>
                  
                  <div className="relative flex-1 min-h-0 w-full overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-14 bg-gradient-to-b from-[#0c0c16] via-[#0c0c16]/75 to-transparent pointer-events-none z-10" />
                    
                    <div 
                      ref={lyricsContainerRef}
                      className="w-full h-full overflow-y-auto space-y-6 px-4 py-16 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-white/[0.05] [&::-webkit-scrollbar-thumb]:rounded-full scroll-smooth"
                    >
                      {renderLyricsLines()}
                    </div>

                    <div className="absolute bottom-0 inset-x-0 h-14 bg-gradient-to-t from-[#0c0c16] via-[#0c0c16]/75 to-transparent pointer-events-none z-10" />
                  </div>
                </div>

              </div>
            )}

          </div>

          {/* Footer Controls */}
          <div className="shrink-0 max-w-2xl mx-auto w-full flex flex-col gap-4 mt-auto">
            {/* Progress Bar */}
            <div className="w-full flex items-center gap-2">
              <span className="text-[0.6rem] text-white/40 tabular-nums w-8 text-right">{formatTime(currentTime)}</span>
              <div
                ref={progressExpandedRef}
                onClick={e => handleProgressClick(e, progressExpandedRef)}
                className="flex-1 h-1 bg-white/[0.08] rounded-full cursor-pointer group relative"
              >
                <div
                  className="h-full bg-purple-500 rounded-full relative transition-all group-hover:bg-[#06b6d4]"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-1/2" />
                </div>
              </div>
              <span className="text-[0.6rem] text-white/40 tabular-nums w-8">{formatTime(duration)}</span>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-between px-2 mb-2">
              
              {/* Left Group (Download/License + Add to Playlist) */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onCheckout(track)}
                  className="w-10 h-10 rounded-2xl bg-[#7c3aed]/20 border border-[#7c3aed]/30 flex items-center justify-center text-[#a78bfa] hover:bg-[#7c3aed]/30 transition-all active:scale-95"
                  title="Licenciar / Descargar"
                >
                  <IconDownload size={18} />
                </button>
                <button
                  onClick={() => onAddToPlaylist?.(track)}
                  className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-[#06b6d4] hover:border-[#06b6d4]/40 hover:bg-[#06b6d4]/10 transition-all active:scale-95"
                  title="Añadir a lista de reproducción"
                >
                  <IconPlus size={18} />
                </button>
              </div>

              {/* Center Controls */}
              <div className="flex items-center gap-5">
                <button
                  onClick={() => setShuffle(!shuffle)}
                  className={`transition-colors ${shuffle ? "text-[#06b6d4]" : "text-white/30 hover:text-white/60"}`}
                  title="Aleatorio"
                >
                  <IconShuffle size={18} />
                </button>
                <button onClick={handlePrev} className="text-white/60 hover:text-white transition-colors" title="Anterior">
                  <IconSkipPrev size={24} />
                </button>
                <button
                  onClick={togglePlay}
                  className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-2xl hover:scale-105 transition-transform active:scale-95"
                >
                  {playing ? <IconPause size={24} /> : <IconPlay size={24} />}
                </button>
                <button onClick={handleNext} className="text-white/60 hover:text-white transition-colors" title="Siguiente">
                  <IconSkipNext size={24} />
                </button>
                <button
                  onClick={cycleRepeat}
                  className={`transition-colors ${repeat !== "none" ? "text-[#06b6d4]" : "text-white/30 hover:text-white/60"}`}
                  title={`Repetir: ${repeat}`}
                >
                  {repeat === "one" ? <IconRepeatOne size={18} /> : <IconRepeat size={18} />}
                </button>
              </div>

              {/* Right Group (Mute + Lyrics Toggle) */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowLyrics(!showLyrics)}
                  className={`w-10 h-10 rounded-2xl border flex items-center justify-center transition-all ${
                    showLyrics
                      ? "bg-[#7c3aed]/20 border-[#7c3aed]/40 text-[#a78bfa]"
                      : "bg-white/[0.04] border border-white/[0.08] text-white/40 hover:text-white"
                  }`}
                  title="Mostrar Letras"
                >
                  <IconLyrics size={18} />
                </button>
                <button
                  onClick={() => setMuted(!muted)}
                  className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white transition-colors"
                  title="Silenciar"
                >
                  {muted || volume === 0 ? <IconVolumeMute size={18} /> : <IconVolumeUp size={18} />}
                </button>
              </div>

            </div>
          </div>

        </div>
      )}

      {/* ========================================== */}
      {/*  BARRA INFERIOR PERSISTENTE (MODO MINI)    */}
      {/* ========================================== */}
      {!isExpanded && (
      <div 
        className="fixed inset-x-0 bottom-0 z-50 bg-[#080810]/95 backdrop-blur-2xl border-t border-white/[0.06] h-[88px] flex items-center px-4 gap-4 select-none"
      >
        {/* Track Info (Click expands to 3D Player) */}
        <div 
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-3 md:w-[220px] w-[140px] shrink-0 cursor-pointer group"
          title="Ver en detalle"
        >
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/[0.05] shrink-0 shadow-lg relative">
            {artUrl ? (
              <Image src={artUrl} alt={track.title} fill sizes="(max-width: 768px) 100vw, 30vw" className={`object-cover transition-transform duration-500 ${playing ? "scale-105" : "scale-100"}`} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/30">
                <IconMusicNote size={24} />
              </div>
            )}
            {playing && (
              <div className="absolute inset-0 bg-black/20 flex items-end justify-center pb-1 gap-[2px]">
                {[...Array(4)].map((_, i) => (
                  <span key={i} className="w-[3px] bg-[#06b6d4] rounded-full animate-pulse" style={{height: `${6 + i * 4}px`, animationDelay: `${i * 0.1}s`}} />
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="marquee-wrap w-full">
              <span className="marquee-inner">
                <span className="text-sm font-bold text-white group-hover:text-[#a78bfa] transition-colors">{track.title}</span>
                <span className="text-sm font-bold text-white/40 ml-12">{track.title}</span>
              </span>
            </div>
            <div className="marquee-wrap w-full">
              <span className="marquee-inner-slow">
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    const slug = getCreatorSlug(track.creator || track.artist);
                    if (slug) {
                      router.push(`/channel/${slug}`);
                    }
                  }}
                  className="text-[0.7rem] text-white/50 hover:text-[#06b6d4] hover:underline cursor-pointer transition-colors"
                >
                  {track.artist}
                </span>
                <span className="text-[0.7rem] text-white/20 ml-12">{track.artist}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Botón Corazón / Me Gusta (Sin comentarios, alimenta Algoritmo de Recomendación Saori) */}
          <button
            onClick={() => handleToggleLike(track)}
            className={`h-8 px-2.5 rounded-lg border flex items-center gap-1 text-xs font-bold transition-all ${
              likedIds.includes(track.id)
                ? "bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)] scale-105"
                : "bg-white/[0.04] border-white/[0.08] text-white/40 hover:text-rose-400 hover:border-rose-500/40"
            }`}
            title="Me Gusta (Entrena tu algoritmo personal con Saori)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={likedIds.includes(track.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {(likesCounts[String(track.id)] || 0) > 0 && (
              <span className="text-[10px]">{likesCounts[String(track.id)]}</span>
            )}
          </button>

          <button
            onClick={() => onCheckout(track)}
            className="w-8 h-8 rounded-lg bg-[#7c3aed]/20 border border-[#7c3aed]/30 flex items-center justify-center text-[#7c3aed] hover:bg-[#7c3aed]/30 transition-colors"
            title="Comprar/Descargar"
          >
            <IconDownload size={16} />
          </button>
          <button
            onClick={() => {
              onAddToPlaylist?.(track);
              try {
                const { logTrackAddedToPlaylist } = require("@/utils/recommender");
                logTrackAddedToPlaylist(track.id);
              } catch (_) {}
            }}
            className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-[#06b6d4] hover:border-[#06b6d4]/40 hover:bg-[#06b6d4]/10 transition-colors"
            title="Añadir a lista de reproducción"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        </div>

        {/* Controls */}
        <div className="hidden md:flex flex-1 flex-col items-center gap-1.5 max-w-lg mx-auto">
          {/* Buttons */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShuffle(!shuffle)}
              className={`transition-colors ${shuffle ? "text-[#06b6d4]" : "text-white/30 hover:text-white/60"}`}
              title="Aleatorio"
            >
              <IconShuffle size={16} />
            </button>
            <button onClick={handlePrev} className="text-white/60 hover:text-white transition-colors" title="Anterior">
              <IconSkipPrev size={20} />
            </button>
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform active:scale-95"
            >
              {playing ? <IconPause size={20} /> : <IconPlay size={20} />}
            </button>
            <button onClick={handleNext} className="text-white/60 hover:text-white transition-colors" title="Siguiente">
              <IconSkipNext size={20} />
            </button>
            <button
              onClick={cycleRepeat}
              className={`transition-colors ${repeat !== "none" ? "text-[#06b6d4]" : "text-white/30 hover:text-white/60"}`}
              title={`Repetir: ${repeat}`}
            >
              {repeat === "one" ? <IconRepeatOne size={16} /> : <IconRepeat size={16} />}
            </button>
          </div>

          {/* Progress Bar */}
          <div className="w-full flex items-center gap-2">
            <span className="text-[0.6rem] text-white/40 tabular-nums w-8 text-right">{formatTime(currentTime)}</span>
            <div
              ref={progressRef}
              onClick={e => handleProgressClick(e, progressRef)}
              className="flex-1 h-1 bg-white/[0.08] rounded-full cursor-pointer group relative"
            >
              <div
                className="h-full bg-white rounded-full relative transition-all group-hover:bg-[#06b6d4]"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-1/2" />
              </div>
            </div>
            <span className="text-[0.6rem] text-white/40 tabular-nums w-8">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-3 shrink-0 ml-auto md:ml-0 md:w-[220px]">
          {/* Mobile playback controls */}
          <div className="md:hidden flex items-center gap-2.5 shrink-0">
            <button onClick={handlePrev} className="text-white/60 hover:text-white transition-colors" title="Anterior">
              <IconSkipPrev size={16} />
            </button>
            <button
              onClick={togglePlay}
              className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow-md active:scale-95 transition-transform"
            >
              {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
            </button>
            <button onClick={handleNext} className="text-white/60 hover:text-white transition-colors" title="Siguiente">
              <IconSkipNext size={16} />
            </button>
          </div>

          {/* Queue Button - Carrusel 3D (solo visible cuando hay contexto de álbum/lista) */}
          {playlist.length > 0 && (
            <button
              onClick={() => setShowQueue(true)}
              className="text-xs p-2 sm:px-3 sm:py-1.5 rounded-lg border border-white/[0.06] text-white/40 hover:text-[#06b6d4] hover:border-[#06b6d4]/40 hover:bg-[#06b6d4]/10 transition-all flex items-center gap-1.5 relative group"
              title="Ver carrusel 3D de la lista"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="group-hover:scale-110 transition-transform">
                <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
              </svg>
              <span className="hidden sm:inline font-bold">
                {playlist.findIndex(t => t.id === track.id) + 1}/{playlist.length}
              </span>
            </button>
          )}

          {/* Toggle Expand View / Lyrics Button */}
          <button
            onClick={() => {
              setShowQueue(false);
              setShowDJView(false);
              onClosePlaylistView?.();
              setIsExpanded(true);
              setShowLyrics(true);
            }}
            className="text-xs p-2 sm:px-2.5 sm:py-1.5 rounded-lg border border-white/[0.06] text-white/40 hover:text-white hover:border-white/20 transition-all flex items-center gap-1.5"
            title="Ver Letras de la Canción"
          >
            <IconLyrics size={14} />
            <span className="hidden sm:inline">Letras</span>
          </button>

          {/* Stream DJ View Toggle Button */}
          <button
            onClick={() => {
              setShowQueue(false);
              setShowLyrics(false);
              setIsExpanded(false);
              onClosePlaylistView?.();
              setShowDJView(!showDJView);
            }}
            className={`text-xs p-2 sm:px-2.5 sm:py-1.5 rounded-lg border transition-all flex items-center gap-1.5 font-bold shadow-sm ${
              showDJView
                ? "bg-cyan-500 text-black border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:text-white hover:border-cyan-400"
            }`}
            title="Alternar Cabina Stream DJ en Vivo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14"></line>
              <line x1="4" y1="10" x2="4" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12" y2="3"></line>
              <line x1="20" y1="21" x2="20" y2="16"></line>
              <line x1="20" y1="12" x2="20" y2="3"></line>
              <line x1="1" y1="14" x2="7" y2="14"></line>
              <line x1="9" y1="8" x2="15" y2="8"></line>
              <line x1="17" y1="16" x2="23" y2="16"></line>
            </svg>
            <span className="hidden sm:inline">Stream DJ</span>
          </button>

          {/* Toggle Expand View Button */}
          <button
            onClick={() => {
              setShowQueue(false);
              setShowDJView(false);
              onClosePlaylistView?.();
              setIsExpanded(!isExpanded);
              setShowLyrics(false);
            }}
            className="text-xs p-2 sm:px-2.5 sm:py-1.5 rounded-lg border border-white/[0.06] text-white/40 hover:text-white hover:border-white/20 transition-all flex items-center gap-1.5"
            title="Vista 3D Sincronizada"
          >
            <IconExpand size={14} />
            <span className="hidden sm:inline">Focus</span>
          </button>



          {/* Volume */}
          <div className="hidden md:flex items-center gap-1.5">
            <button
              onClick={() => setMuted(!muted)}
              className="text-white/40 hover:text-white transition-colors"
            >
              {muted || volume === 0 ? <IconVolumeMute size={16} /> : <IconVolumeUp size={16} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={e => { setVolume(Number(e.target.value)); setMuted(false); }}
              className="w-20 h-1 accent-[#7c3aed] cursor-pointer"
            />
          </div>
        </div>
      </div>
      )}

      {/* ========================================== */}
      {/*  MODAL: PERSONALIZAR PORTADA               */}
      {/* ========================================== */}
      {showCoverModal && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl"
          onClick={e => { if (e.target === e.currentTarget) setShowCoverModal(false); }}
        >
          <div className="relative bg-[#0c0c18] border border-white/[0.1] rounded-3xl p-6 w-full max-w-md shadow-2xl animate-[fadeIn_0.25s_ease]">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-black text-white">Personalizar Portada</h3>
                <p className="text-[0.7rem] text-white/40 mt-0.5 line-clamp-1">{track.title}</p>
              </div>
              <button
                onClick={() => setShowCoverModal(false)}
                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>

            {/* Current cover preview */}
            <div className="w-full aspect-square rounded-2xl overflow-hidden bg-white/5 border border-white/[0.08] mb-5">
              {artUrl ? (
                <Image src={artUrl} alt="Portada actual" fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                  <span className="text-sm text-white/30 mt-2">Sin portada</span>
                </div>
              )}
            </div>

            {/* Status message */}
            {coverStatus && (
              <div className={`mb-4 px-3 py-2 rounded-xl text-xs font-medium border ${
                coverStatus.type === "success" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" :
                coverStatus.type === "error" ? "bg-red-500/10 border-red-500/30 text-red-300" :
                "bg-blue-500/10 border-blue-500/30 text-blue-300"
              }`}>
                {coverStatus.msg}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              {/* Auto Pexels */}
              <button
                onClick={handleAutoGenerateCover}
                disabled={coverLoading}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#7c3aed]/10 border border-[#7c3aed]/30 hover:bg-[#7c3aed]/20 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-xl bg-[#7c3aed]/20 flex items-center justify-center shrink-0 group-hover:bg-[#7c3aed]/30 transition-colors">
                  {coverLoading ? (
                    <svg className="animate-spin w-5 h-5 text-[#a78bfa]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#a78bfa]"><path d="M21 3H3C2 3 1 4 1 5v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1-1-2-2-2zm0 16H3V5h18v14zM16.5 11l-3 3.86L11 12.14 7.5 17h9l-3.5-6h3.5z"/></svg>
                  )}
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-white">Generar con Pexels</p>
                  <p className="text-[0.65rem] text-white/40">Búsqueda automática contextual · Imagen única cuadrada</p>
                </div>
                <span className="ml-auto text-[0.6rem] text-[#a78bfa] font-bold bg-[#7c3aed]/20 px-2 py-0.5 rounded-full">AUTO</span>
              </button>

              {/* Upload custom */}
              <button
                onClick={() => coverUploadRef.current?.click()}
                disabled={coverLoading}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#06b6d4]/10 border border-[#06b6d4]/30 hover:bg-[#06b6d4]/20 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-xl bg-[#06b6d4]/20 flex items-center justify-center shrink-0 group-hover:bg-[#06b6d4]/30 transition-colors">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#22d3ee]"><path d="M20 4h-3.17L15 2H9L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 13c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/><path d="M12 10l-3 4h2v3h2v-3h2l-3-4z"/></svg>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-white">Subir imagen personalizada</p>
                  <p className="text-[0.65rem] text-white/40">JPG, PNG o WEBP · Cuadrada recomendada</p>
                </div>
                <span className="ml-auto text-[0.6rem] text-[#22d3ee] font-bold bg-[#06b6d4]/20 px-2 py-0.5 rounded-full">CUSTOM</span>
              </button>
            </div>

            {/* Footer note */}
            <p className="mt-4 text-[0.6rem] text-white/25 text-center">
              Imágenes de Pexels están bajo licencia Creative Commons. La portada personalizada tiene prioridad sobre la auto-generada.
            </p>
          </div>

          {/* Hidden file input */}
          <input
            ref={coverUploadRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleUploadCover(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* ========================================== */}
      {/*  VIRTUAL DJ MIXER — CABINA DUAL INTEGRADA  */}
      {/* ========================================== */}
      {showDJView && (
        <VirtualDJStudio
          catalog={catalog}
          currentTrack={track}
          onTrackChange={onTrackChange}
          onClose={() => handleCloseDJView()}
          onOpenLyrics={() => handleCloseDJView("lyrics")}
          onOpenFocus={() => handleCloseDJView("focus")}
          onOpenQueue={() => handleCloseDJView("queue")}
          onCheckout={onCheckout}

        />
      )}

      {/* ========================================== */}
      {/*  QUEUE MODAL — 3D CARRUSEL DE COLA         */}
      {/* ========================================== */}
      {showQueue && (

        <div
          className="fixed inset-x-0 top-0 bottom-[88px] z-[200] bg-[#04040a]/99 backdrop-blur-3xl flex flex-col animate-[fadeIn_0.25s_ease]"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowQueue(false); onClosePlaylistView?.(); } }}
        >
          
          {/* Header */}
          <div className="flex items-center justify-between shrink-0 px-6 pt-6 pb-4 border-b border-white/[0.04]">
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
                </svg>
                Carrusel de Reproducción
              </h2>
              <p className="text-[0.6rem] text-white/40 mt-0.5">
                {playlist.length} {playlist.length === 1 ? "canción" : "canciones"}
                {playlist.length > 0 && (
                  <span className="ml-2 text-purple-400">
                    · {playlist.findIndex(t => t.id === track.id) + 1}/{playlist.length}
                  </span>
                )}
                {track?.album && (
                  <span className="ml-2 text-[#06b6d4]">· {track.album}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShuffle(!shuffle)}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                  shuffle
                    ? "bg-[#06b6d4]/20 border-[#06b6d4]/40 text-[#06b6d4]"
                    : "bg-white/[0.04] border-white/[0.08] text-white/40 hover:text-white"
                }`}
                title="Aleatorio"
              >
                <IconShuffle size={16} />
              </button>
              <button
                onClick={cycleRepeat}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                  repeat !== "none"
                    ? "bg-[#06b6d4]/20 border-[#06b6d4]/40 text-[#06b6d4]"
                    : "bg-white/[0.04] border-white/[0.08] text-white/40 hover:text-white"
                }`}
                title={`Repetir: ${repeat === "one" ? "Una canción" : repeat === "all" ? "Toda la lista" : "Desactivado"}`}
              >
                {repeat === "one" ? <IconRepeatOne size={16} /> : <IconRepeat size={16} />}
              </button>
              <button
                onClick={() => { setShowQueue(false); onClosePlaylistView?.(); }}
                className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.10] transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Carrusel 3D de canciones - Vista tipo carrete */}
          <div
            className="flex-1 flex items-center justify-center min-h-0 p-4 md:p-6 relative overflow-hidden"
            style={{ perspective: "1500px" }}
          >
            {playlist.length === 0 ? (
              <div className="text-center text-white/30">
                <IconQueue size={48} />
                <p className="mt-4 text-sm font-bold">No hay canciones en la cola</p>
                <p className="text-xs text-white/20 mt-1">Selecciona canciones para reproducir</p>
              </div>
            ) : (
                <div className="relative w-full max-w-5xl flex items-center justify-center py-4">
                  
                  {/* Edge gradients */}
                  <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#04040a] to-transparent z-10 pointer-events-none" />
                  <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#04040a] to-transparent z-10 pointer-events-none" />

                  <div
                    ref={playlistCarouselRef}
                    className="flex gap-4 md:gap-6 overflow-x-auto px-16 py-6 w-full justify-start items-center [&::-webkit-scrollbar]:h-[3px] [&::-webkit-scrollbar-thumb]:bg-white/[0.06] [&::-webkit-scrollbar-thumb]:rounded-full scroll-smooth snap-x snap-mandatory"
                  >
                  {playlist.map((item, idx) => {
                    const isCurrent = item.id === track.id;
                    const itemArt = getArtUrl(item.album_art_path);
                    const currentIdx = playlist.findIndex(t => t.id === track.id);
                    const distance = Math.abs(idx - currentIdx);

                    return (
                      <div
                        key={`${item.id}-${idx}`}
                        ref={isCurrent ? currentTrackRef : null}
                        onClick={() => {
                          onTrackChange(item);
                        }}
                        className="snap-center shrink-0 cursor-pointer transition-all duration-500 ease-out group"
                        style={{
                          transform: `
                            scale(${isCurrent ? 1 : Math.max(0.7, 1 - distance * 0.08)})
                            translateZ(${isCurrent ? 60 : -distance * 30}px)
                            rotateY(${idx < currentIdx ? `${Math.min(distance * 3, 15)}deg` : idx > currentIdx ? `${-Math.min(distance * 3, 15)}deg` : "0deg"})
                            translateY(${isCurrent ? "0px" : `${distance * 5}px`})
                          `,
                          opacity: isCurrent ? 1 : Math.max(0.4, 1 - distance * 0.14),
                          zIndex: isCurrent ? 20 : 20 - distance,
                          filter: isCurrent ? "none" : `brightness(${Math.max(0.45, 1 - distance * 0.12)})`,
                        }}
                      >
                        {/* Card con efecto espejo/brillo */}
                        <div className={`relative transition-all duration-500 ${
                          isCurrent ? "scale-105" : "hover:scale-105"
                        }`}>
                          {/* Album Art Card */}
                          <div className={`w-28 h-28 md:w-40 md:h-40 rounded-2xl overflow-hidden relative shadow-2xl transition-all duration-700 ${
                            isCurrent
                              ? "ring-2 ring-[#06b6d4] shadow-[0_0_50px_rgba(6,182,212,0.3)] ring-offset-2 ring-offset-[#04040a]"
                              : "ring-1 ring-white/[0.06] shadow-lg"
                          }`}>
                            {itemArt ? (
                              <img src={itemArt} alt={item.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-[#7c3aed]/30 to-[#06b6d4]/30 flex items-center justify-center text-white/40">
                                <IconMusicNote size={40} />
                              </div>
                            )}
                            {/* Brillo superior */}
                            <div className={`absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none transition-opacity duration-500 ${
                              isCurrent ? "opacity-100" : "opacity-0"
                            }`} />
                            {/* Overlay play/pause */}
                            <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-all duration-300 ${
                              isCurrent ? "opacity-0" : "opacity-0 group-hover:opacity-100"
                            }`}>
                              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white text-black flex items-center justify-center shadow-2xl transform transition-transform group-hover:scale-110">
                                {isCurrent ? <IconPause size={18} /> : <IconPlay size={18} />}
                              </div>
                            </div>
                            {/* Playing indicator */}
                            {isCurrent && (
                              <div className="absolute bottom-2 left-2 flex gap-[3px] items-end">
                                {[6, 10, 8, 12, 7].map((h, i) => (
                                  <span key={i} className="w-[3px] bg-[#06b6d4] rounded-full animate-bounce" style={{ height: `${h}px`, animationDelay: `${i * 0.12}s` }} />
                                ))}
                              </div>
                            )}
                            {/* Número de pista */}
                            <div className={`absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[0.5rem] font-black backdrop-blur-sm transition-all ${
                              isCurrent
                                ? "bg-[#06b6d4]/80 text-white"
                                : "bg-black/60 text-white/60"
                            }`}>
                              {idx + 1}
                            </div>
                          </div>

                          {/* Info debajo */}
                          <div className="mt-3 text-center max-w-[120px] md:max-w-[160px] mx-auto">
                            <p className={`text-xs font-bold truncate transition-colors ${
                              isCurrent ? "text-[#06b6d4]" : "text-white/80 group-hover:text-white"
                            }`}>
                              {item.title}
                            </p>
                            <p className="text-[0.6rem] text-white/40 truncate mt-0.5">
                              {item.artist}
                            </p>
                            <p className="text-[0.5rem] text-white/20 mt-0.5">
                              {item.duration_seconds ? formatTime(item.duration_seconds) : "--:--"}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </>
  );
}
