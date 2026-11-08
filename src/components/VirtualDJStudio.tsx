"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import { useDJ } from "@/contexts/DJContext";
import { ExitoLogoIcon } from "@/components/ExitoLogo";
import type { Track } from "./StreamPlayer";

interface VirtualDJStudioProps {
  catalog: Track[];
  onClose: () => void;
  currentTrack?: Track | null;
  onTrackChange?: (track: Track) => void;
  onOpenLyrics?: () => void;
  onOpenFocus?: () => void;
  onOpenQueue?: () => void;
  onCheckout?: (track: Track) => void;
}

function formatDJTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms}`;
}

// ─── SVG ICONS MINIMALISTAS (SIN EMOJIS) ──────────────────────────────────────
const IconPlay = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M8 5v14l11-7z" />
  </svg>
);

const IconPause = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const IconSearch = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconClose = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconMusic = ({ size = 18, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const IconMic = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const IconSparkles = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" />
    <path d="M19 17v4" />
    <path d="M3 5h4" />
    <path d="M17 19h4" />
  </svg>
);

const IconQueue = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const IconDownload = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconBack = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const IconSync = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const IconBot = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" />
    <line x1="8" y1="16" x2="8.01" y2="16" />
    <line x1="16" y1="16" x2="16.01" y2="16" />
  </svg>
);

const IconSliders = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </svg>
);

const IconPlus = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// ─── VINILO / JOG WHEEL TÁCTIL Y SCRATCH INTELIGENTE ─────────────────────────
interface DJJogWheelProps {
  deck: "A" | "B";
  isPlaying: boolean;
  color: "cyan" | "pink";
  track: Track | null;
  onTogglePlay: () => void;
  onOpenSearch: () => void;
  startScratch: (deck: "A" | "B") => void;
  scratchMove: (deck: "A" | "B", velocity: number) => void;
  stopScratch: (deck: "A" | "B") => void;
}

function DJJogWheel({
  deck,
  isPlaying,
  color,
  track,
  onTogglePlay,
  onOpenSearch,
  startScratch,
  scratchMove,
  stopScratch,
}: DJJogWheelProps) {
  const [rotation, setRotation] = useState(0);
  const [isScratching, setIsScratching] = useState(false);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const lastAngle = useRef(0);
  const lastTime = useRef(0);
  const isDragging = useRef(false);
  const hasMoved = useRef(false);
  const clickTimer = useRef<NodeJS.Timeout | null>(null);

  // Giro constante durante la reproducción regular
  useEffect(() => {
    let animId: number;
    const step = () => {
      if (isPlaying && !isDragging.current) {
        setRotation((r) => (r + 1.2) % 360);
      }
      animId = requestAnimationFrame(step);
    };
    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!wheelRef.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    isDragging.current = true;
    hasMoved.current = false;
    setIsScratching(true);

    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    lastAngle.current = Math.atan2(e.clientY - cy, e.clientX - cx);
    lastTime.current = performance.now();

    startScratch(deck);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !wheelRef.current) return;

    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    let delta = currentAngle - lastAngle.current;

    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;

    if (Math.abs(delta) > 0.02) {
      hasMoved.current = true;
    }

    const now = performance.now();
    const dt = Math.max(2, now - lastTime.current) / 1000;
    const angularVelocity = delta / dt;

    lastAngle.current = currentAngle;
    lastTime.current = now;

    setRotation((r) => r + (delta * 180) / Math.PI);
    scratchMove(deck, angularVelocity * 0.35);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
      isDragging.current = false;
      setIsScratching(false);
      stopScratch(deck);
    }
  };

  // Manejo de clicks en el centro: tap simple = play/pause, doble tap = abrir búsqueda
  const handleCenterClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasMoved.current) return;

    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onOpenSearch();
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        if (!track) {
          onOpenSearch();
        } else {
          onTogglePlay();
        }
      }, 260);
    }
  };

  const isCyan = color === "cyan";

  return (
    <div className="flex flex-col items-center justify-center my-1 select-none w-full">
      <div
        ref={wheelRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`w-32 h-32 xs:w-36 xs:h-36 sm:w-40 sm:h-40 md:w-44 md:h-44 rounded-full border-4 ${
          isCyan
            ? isScratching
              ? "border-cyan-300 shadow-[0_0_40px_rgba(6,182,212,0.6)]"
              : "border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.2)]"
            : isScratching
            ? "border-pink-300 shadow-[0_0_40px_rgba(236,72,153,0.6)]"
            : "border-pink-500/40 shadow-[0_0_20px_rgba(236,72,153,0.2)]"
        } bg-[#060611] flex items-center justify-center relative cursor-grab active:cursor-grabbing touch-none transition-shadow`}
      >
        {/* Superficie giratoria del vinilo */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden pointer-events-none"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle,#141426_20%,#080812_60%,#030307_100%)]" />
          <div className="absolute inset-2 rounded-full border border-white/[0.06]" />
          <div className="absolute inset-4 rounded-full border border-white/[0.04]" />
          <div className="absolute inset-7 rounded-full border border-white/[0.05]" />
          <div className="absolute inset-10 rounded-full border border-white/[0.04]" />
          <div className="absolute inset-13 rounded-full border border-white/[0.06]" />

          {/* Marcador estroboscópico de posición */}
          <div
            className={`absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-5 rounded-full ${
              isCyan ? "bg-cyan-300 shadow-[0_0_8px_cyan]" : "bg-pink-300 shadow-[0_0_8px_pink]"
            }`}
          />
        </div>

        {/* Centro del plato (Slipmat) */}
        <div
          onClick={handleCenterClick}
          className={`w-13 h-13 xs:w-14 xs:h-14 sm:w-16 sm:h-16 rounded-full ${
            isCyan
              ? "bg-cyan-950/90 border-2 border-cyan-400/80 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
              : "bg-pink-950/90 border-2 border-pink-400/80 text-pink-300 shadow-[0_0_15px_rgba(236,72,153,0.3)]"
          } flex flex-col items-center justify-center shadow-2xl z-10 pointer-events-auto cursor-pointer transition-transform hover:scale-105 active:scale-95`}
          title={track ? "Tap: Play/Pausa | Doble Tap: Cambiar Pista" : "Tap: Cargar Canción"}
        >
          {!track ? (
            <div className="flex flex-col items-center justify-center text-center p-1">
              <IconPlus size={16} />
              <span className="text-[7px] font-bold uppercase tracking-widest mt-0.5">Cargar</span>
            </div>
          ) : isScratching ? (
            <span className="text-[9px] font-black tracking-wider leading-tight">SCRATCH</span>
          ) : isPlaying ? (
            <IconPause size={18} />
          ) : (
            <IconPlay size={18} />
          )}
          <span className="text-[7px] text-white/50 uppercase tracking-widest font-mono mt-0.5">
            {deck}
          </span>
        </div>
      </div>
      <p className="text-[8px] text-white/40 uppercase tracking-wider mt-1 font-mono text-center">
        {isScratching
          ? "Scratching DSP..."
          : !track
          ? "Toca el disco para buscar pista"
          : "Gira para scratchear · Doble tap para buscar"}
      </p>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL VIRTUAL DJ STUDIO ──────────────────────────────────
export function VirtualDJStudio({
  catalog,
  onClose,
  currentTrack,
  onTrackChange,
  onOpenLyrics,
  onOpenFocus,
  onOpenQueue,
  onCheckout,
}: VirtualDJStudioProps) {
  const {
    deckA,
    deckB,
    crossfader,
    loadTrackToDeck,
    togglePlayDeck,
    setDeckVolume,
    setDeckPitch,
    setDeckEQ,
    setDeckFilter,
    setCue,
    jumpToCue,
    setCrossfader,
    smoothCrossfade,
    startScratch,
    scratchMove,
    stopScratch,
    syncBPM,
    autoDJMix,
    analyserA,
    analyserB,
  } = useDJ();

  // Estados de búsqueda modal
  const [modalOpen, setModalOpen] = useState(false);
  const [targetDeckForModal, setTargetDeckForModal] = useState<"A" | "B">("A");
  const [modalSearchQuery, setModalSearchQuery] = useState("");
  const [modalSelectedGenre, setModalSelectedGenre] = useState<string>("all");

  // Canvas visualizers
  const canvasRefA = useRef<HTMLCanvasElement | null>(null);
  const canvasRefB = useRef<HTMLCanvasElement | null>(null);

  // Sincronizar con la pista actual del reproductor al abrir (si no está ya cargada en A o B)
  useEffect(() => {
    if (currentTrack) {
      const isAlreadyInA = deckA.track?.id === currentTrack.id;
      const isAlreadyInB = deckB.track?.id === currentTrack.id;
      if (!isAlreadyInA && !isAlreadyInB) {
        // Cargar en el deck dominante según posición del crossfader
        const targetDeck = crossfader > 0.5 ? "B" : "A";
        loadTrackToDeck(targetDeck, currentTrack, true);
      }
    }
  }, [currentTrack, deckA.track, deckB.track, crossfader, loadTrackToDeck]);

  // Si Deck B no tiene canción, precargar sugerencia de la biblioteca
  useEffect(() => {
    if (!deckB.track && catalog.length > 0) {
      const nextCandidate = catalog.find((t) => t.id !== currentTrack?.id && t.id !== deckA.track?.id) || catalog[0];
      if (nextCandidate) {
        loadTrackToDeck("B", nextCandidate, false);
      }
    }
  }, [catalog, currentTrack, deckA.track, deckB.track, loadTrackToDeck]);

  // Filtrado de canciones para el modal
  const filteredModalCatalog = useMemo(() => {
    return catalog.filter((t) => {
      const matchQuery =
        !modalSearchQuery ||
        t.title.toLowerCase().includes(modalSearchQuery.toLowerCase()) ||
        t.artist.toLowerCase().includes(modalSearchQuery.toLowerCase()) ||
        (t.genre && t.genre.toLowerCase().includes(modalSearchQuery.toLowerCase()));
      const matchGenre =
        modalSelectedGenre === "all" ||
        (t.genre && t.genre.toLowerCase() === modalSelectedGenre.toLowerCase());
      return matchQuery && matchGenre;
    });
  }, [catalog, modalSearchQuery, modalSelectedGenre]);

  const genres = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((t) => {
      if (t.genre) set.add(t.genre);
    });
    return Array.from(set);
  }, [catalog]);

  // Renderizado dinámico de frecuencias de audio (FFT) en canvas
  useEffect(() => {
    let animId: number;

    const render = () => {
      if (canvasRefA.current && analyserA.current) {
        const canvas = canvasRefA.current;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const bufferLength = analyserA.current.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          analyserA.current.getByteFrequencyData(dataArray);

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const barWidth = (canvas.width / bufferLength) * 2;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height;
            ctx.fillStyle = `rgb(${30 + dataArray[i]}, 150, 240)`;
            ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
            x += barWidth;
          }
        }
      }

      if (canvasRefB.current && analyserB.current) {
        const canvas = canvasRefB.current;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const bufferLength = analyserB.current.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          analyserB.current.getByteFrequencyData(dataArray);

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const barWidth = (canvas.width / bufferLength) * 2;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height;
            ctx.fillStyle = `rgb(230, 40, ${100 + dataArray[i]})`;
            ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
            x += barWidth;
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [analyserA, analyserB]);

  const handleOpenSearchForDeck = (deck: "A" | "B") => {
    setTargetDeckForModal(deck);
    setModalSearchQuery("");
    setModalOpen(true);
  };

  const handleSelectTrackForDeck = (track: Track) => {
    loadTrackToDeck(targetDeckForModal, track, true);
    setModalOpen(false);
  };

  const handlePromoteDeckB = () => {
    if (deckB.track && onTrackChange) {
      onTrackChange(deckB.track);
      setCrossfader(0);
    }
  };

  const activePlayingTrack = crossfader > 0.5 ? deckB.track || deckA.track : deckA.track || deckB.track;

  return (
    <div className="fixed inset-x-0 top-0 bottom-[88px] z-[180] bg-[#060613]/98 backdrop-blur-3xl text-white flex flex-col overflow-hidden animate-fade-in select-none border-b border-white/10">
      {/* ── Top Navigation & Switcher Header ── */}
      <header className="h-14 border-b border-white/10 px-3 md:px-6 flex items-center justify-between shrink-0 bg-black/40 gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Volver al Catálogo */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white transition-all"
            title="Volver a explorar canciones"
          >
            <IconBack size={14} />
            <span className="hidden sm:inline">Catálogo</span>
          </button>

          {/* Vistas directas integradas */}
          {onOpenLyrics && (
            <button
              onClick={onOpenLyrics}
              className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 transition-all"
              title="Letras sincronizadas"
            >
              <IconMic size={14} />
              <span className="hidden md:inline">Letras</span>
            </button>
          )}

          {onOpenFocus && (
            <button
              onClick={onOpenFocus}
              className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 transition-all"
              title="Vista Focus"
            >
              <IconSparkles size={14} />
              <span className="hidden md:inline">Focus</span>
            </button>
          )}

          {onOpenQueue && (
            <button
              onClick={onOpenQueue}
              className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 transition-all"
              title="Cola de reproducción"
            >
              <IconQueue size={14} />
              <span className="hidden md:inline">Cola</span>
            </button>
          )}

          {activePlayingTrack && onCheckout && (
            <button
              onClick={() => onCheckout(activePlayingTrack)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-[#7c3aed]/20 border border-[#7c3aed]/40 text-xs font-bold text-[#a78bfa] hover:bg-[#7c3aed]/30 transition-all"
              title="Descargar pista activa"
            >
              <IconDownload size={14} />
              <span className="hidden md:inline">Descargar</span>
            </button>
          )}
        </div>

        {/* Brand Center Title */}
        <div className="hidden lg:flex items-center gap-2">
          <ExitoLogoIcon size={20} />
          <span className="text-xs font-black tracking-wider uppercase bg-gradient-to-r from-white via-[#e9d5ff] to-[#06b6d4] bg-clip-text text-transparent">
            Éxito<span className="text-cyan-400">.cyou</span> Stream DJ
          </span>
        </div>

        {/* Global Action / AI DJ Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => autoDJMix(deckA.track || undefined, deckB.track || undefined)}
            className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-accent to-pink-600 hover:brightness-110 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all"
            title="Mezcla automática con IA"
          >
            <IconBot size={14} />
            <span className="hidden sm:inline">Auto-Mix IA</span>
          </button>
          <button
            onClick={syncBPM}
            className="px-2 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs flex items-center gap-1 transition-all"
            title="Sincronizar BPM y pitch"
          >
            <IconSync size={14} />
            <span className="hidden sm:inline">Sync</span>
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-red-500/30 text-white hover:text-red-400 flex items-center justify-center transition-all ml-1"
            title="Cerrar vista DJ"
          >
            <IconClose size={14} />
          </button>
        </div>
      </header>

      {/* ── Main DJ Workspace: Decks & Mixer ── */}
      <div className="flex-1 flex flex-col p-2.5 sm:p-4 gap-2.5 sm:gap-3 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 sm:gap-4 flex-1">
          {/* ══════════════════════════════════════════════════════════════
              DECK A (Cyan / Canal Izquierdo - Sincronizado con Reproductor)
          ══════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-5 bg-[#0a0a1a]/95 border border-cyan-500/30 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-[0_0_25px_rgba(6,182,212,0.1)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-28 h-28 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black tracking-widest text-cyan-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  DECK A (MASTER)
                </span>
                <span className="text-xs font-mono font-bold text-cyan-300">
                  {formatDJTime(deckA.currentTime)} / {formatDJTime(deckA.duration)}
                </span>
              </div>

              {/* Info Card con botón de búsqueda */}
              <div className="p-2 rounded-xl bg-black/40 border border-cyan-500/20 flex items-center justify-between gap-2 mb-2">
                <div
                  onClick={() => handleOpenSearchForDeck("A")}
                  className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer group"
                  title="Cambiar pista en Deck A"
                >
                  <div className="w-10 h-10 rounded-lg bg-cyan-950 border border-cyan-500/30 overflow-hidden relative shrink-0">
                    {deckA.track?.album_art_path ? (
                      <Image
                        src={deckA.track.album_art_path.includes("media_library/")
                          ? deckA.track.album_art_path.replace(/.*media_library\//, "/media-static/")
                          : deckA.track.album_art_path}
                        alt={deckA.track.title}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-cyan-400">
                        <IconMusic size={16} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-bold text-white truncate group-hover:text-cyan-300 transition-colors">
                      {deckA.track ? deckA.track.title : "Toca para cargar canción"}
                    </h3>
                    <p className="text-[10px] text-text-muted truncate">
                      {deckA.track ? deckA.track.artist : "Explorar catálogo"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenSearchForDeck("A")}
                  className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-all shrink-0"
                  title="Buscar y cargar otra canción en Deck A"
                >
                  <IconSearch size={14} />
                </button>
              </div>

              {/* Waveform Canvas */}
              <div className="w-full h-8 sm:h-10 bg-black/60 rounded-xl overflow-hidden border border-cyan-500/20 mb-2 relative">
                <canvas ref={canvasRefA} width={400} height={40} className="w-full h-full" />
                {deckA.duration > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 shadow-[0_0_8px_cyan]"
                    style={{ left: `${(deckA.currentTime / deckA.duration) * 100}%` }}
                  />
                )}
              </div>
            </div>

            {/* Turntable / Interactive Scratch Jog Wheel */}
            <DJJogWheel
              deck="A"
              isPlaying={deckA.isPlaying}
              color="cyan"
              track={deckA.track}
              onTogglePlay={() => togglePlayDeck("A")}
              onOpenSearch={() => handleOpenSearchForDeck("A")}
              startScratch={startScratch}
              scratchMove={scratchMove}
              stopScratch={stopScratch}
            />

            {/* Deck Controls */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => togglePlayDeck("A")}
                  className={`flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md ${
                    deckA.isPlaying
                      ? "bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.5)]"
                      : "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-500 hover:text-black"
                  }`}
                >
                  {deckA.isPlaying ? <IconPause size={14} /> : <IconPlay size={14} />}
                  <span>{deckA.isPlaying ? "PAUSA" : "PLAY"}</span>
                </button>
                <button
                  onClick={() => jumpToCue("A")}
                  onMouseDown={() => setCue("A")}
                  className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-400 text-xs font-bold text-cyan-300 transition-all"
                >
                  CUE
                </button>
                <button
                  onClick={() => setDeckPitch("A", 1.0)}
                  className="px-2 py-2 rounded-xl bg-white/5 border border-white/10 hover:text-white text-[10px] text-text-muted font-mono"
                >
                  0%
                </button>
              </div>

              {/* Pitch Slider */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-cyan-400 w-8">-8%</span>
                <input
                  type="range"
                  min="0.92"
                  max="1.08"
                  step="0.005"
                  value={deckA.pitch}
                  onChange={(e) => setDeckPitch("A", parseFloat(e.target.value))}
                  className="flex-1 h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
                <span className="text-[9px] font-mono text-cyan-400 w-8 text-right">+8%</span>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              CENTRAL MIXER (Crossfader, EQ Strips & Real Blending)
          ══════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-2 bg-[#080814] border border-white/10 rounded-2xl p-3 flex flex-col justify-between shadow-2xl">
            <div>
              <div className="flex items-center justify-center gap-1 text-[10px] font-black text-text-muted tracking-widest uppercase mb-2.5">
                <IconSliders size={12} />
                <span>MEZCLADOR</span>
              </div>

              {/* Dual EQ Strips */}
              <div className="grid grid-cols-2 gap-2 text-center mb-2.5">
                {/* Channel A Knobs */}
                <div className="space-y-2">
                  <span className="text-[9px] font-bold text-cyan-400 block">CH A</span>
                  <div>
                    <label className="text-[8px] text-text-muted block">HI ({deckA.eqHigh}dB)</label>
                    <input
                      type="range"
                      min="-24"
                      max="12"
                      value={deckA.eqHigh}
                      onChange={(e) => setDeckEQ("A", "high", parseFloat(e.target.value))}
                      className="w-full h-1 bg-black rounded appearance-none cursor-pointer accent-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] text-text-muted block">MID ({deckA.eqMid}dB)</label>
                    <input
                      type="range"
                      min="-24"
                      max="12"
                      value={deckA.eqMid}
                      onChange={(e) => setDeckEQ("A", "mid", parseFloat(e.target.value))}
                      className="w-full h-1 bg-black rounded appearance-none cursor-pointer accent-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] text-text-muted block">LOW ({deckA.eqLow}dB)</label>
                    <input
                      type="range"
                      min="-24"
                      max="12"
                      value={deckA.eqLow}
                      onChange={(e) => setDeckEQ("A", "low", parseFloat(e.target.value))}
                      className="w-full h-1 bg-black rounded appearance-none cursor-pointer accent-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] text-cyan-300 block">FILTRO</label>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={deckA.filter}
                      onChange={(e) => setDeckFilter("A", parseFloat(e.target.value))}
                      className="w-full h-1 bg-black rounded appearance-none cursor-pointer accent-cyan-300"
                    />
                  </div>
                </div>

                {/* Channel B Knobs */}
                <div className="space-y-2">
                  <span className="text-[9px] font-bold text-pink-400 block">CH B</span>
                  <div>
                    <label className="text-[8px] text-text-muted block">HI ({deckB.eqHigh}dB)</label>
                    <input
                      type="range"
                      min="-24"
                      max="12"
                      value={deckB.eqHigh}
                      onChange={(e) => setDeckEQ("B", "high", parseFloat(e.target.value))}
                      className="w-full h-1 bg-black rounded appearance-none cursor-pointer accent-pink-400"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] text-text-muted block">MID ({deckB.eqMid}dB)</label>
                    <input
                      type="range"
                      min="-24"
                      max="12"
                      value={deckB.eqMid}
                      onChange={(e) => setDeckEQ("B", "mid", parseFloat(e.target.value))}
                      className="w-full h-1 bg-black rounded appearance-none cursor-pointer accent-pink-400"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] text-text-muted block">LOW ({deckB.eqLow}dB)</label>
                    <input
                      type="range"
                      min="-24"
                      max="12"
                      value={deckB.eqLow}
                      onChange={(e) => setDeckEQ("B", "low", parseFloat(e.target.value))}
                      className="w-full h-1 bg-black rounded appearance-none cursor-pointer accent-pink-400"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] text-pink-300 block">FILTRO</label>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={deckB.filter}
                      onChange={(e) => setDeckFilter("B", parseFloat(e.target.value))}
                      className="w-full h-1 bg-black rounded appearance-none cursor-pointer accent-pink-300"
                    />
                  </div>
                </div>
              </div>

              {/* Faders de volumen de canal */}
              <div className="grid grid-cols-2 gap-2.5 my-2 px-1">
                <div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={deckA.volume}
                    onChange={(e) => setDeckVolume("A", parseFloat(e.target.value))}
                    className="w-full h-2 bg-cyan-950 rounded appearance-none cursor-pointer accent-cyan-400"
                    title="Volumen Canal A"
                  />
                </div>
                <div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={deckB.volume}
                    onChange={(e) => setDeckVolume("B", parseFloat(e.target.value))}
                    className="w-full h-2 bg-pink-950 rounded appearance-none cursor-pointer accent-pink-400"
                    title="Volumen Canal B"
                  />
                </div>
              </div>
            </div>

            {/* Crossfader */}
            <div className="space-y-1.5 pt-2 border-t border-white/10">
              <div className="flex justify-between text-[8px] font-mono font-bold">
                <span className="text-cyan-400">A ({((1 - crossfader) * 100).toFixed(0)}%)</span>
                <span
                  className="text-text-muted cursor-pointer hover:text-white"
                  onClick={() => setCrossfader(0.5)}
                  title="Centrar Mezcla 50/50"
                >
                  50/50
                </span>
                <span className="text-pink-400">B ({(crossfader * 100).toFixed(0)}%)</span>
              </div>

              <div className="relative flex items-center">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.002"
                  value={crossfader}
                  onChange={(e) => setCrossfader(parseFloat(e.target.value))}
                  onInput={(e) => setCrossfader(parseFloat((e.target as HTMLInputElement).value))}
                  className="w-full h-3 bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 rounded-lg appearance-none cursor-pointer accent-white shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all"
                  title="Crossfader: Mezcla y atenúa entre Deck A y Deck B con volumen equilibrado"
                />
              </div>

              {/* Botones de Transición Rápida */}
              <div className="grid grid-cols-3 gap-1 mt-1">
                <button
                  onClick={() => smoothCrossfade(0, 3)}
                  className="py-1 rounded bg-cyan-950/60 border border-cyan-500/30 text-[8px] text-cyan-300 hover:bg-cyan-500 hover:text-black font-bold transition-all"
                >
                  Deck A
                </button>
                <button
                  onClick={() => smoothCrossfade(0.5, 2)}
                  className="py-1 rounded bg-purple-950/60 border border-purple-500/30 text-[8px] text-purple-300 hover:bg-purple-500 hover:text-white font-bold transition-all"
                >
                  Centro
                </button>
                <button
                  onClick={() => smoothCrossfade(1, 3)}
                  className="py-1 rounded bg-pink-950/60 border border-pink-500/30 text-[8px] text-pink-300 hover:bg-pink-500 hover:text-white font-bold transition-all"
                >
                  Deck B
                </button>
              </div>

              {/* Botón Promover Deck B a Master */}
              {deckB.track && (
                <button
                  onClick={handlePromoteDeckB}
                  className="w-full py-1.5 mt-1 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:brightness-110 text-white font-bold text-[9px] flex items-center justify-center gap-1 shadow-md transition-all"
                  title="Hacer que la canción de Deck B sea la pista principal"
                >
                  <IconSparkles size={12} />
                  <span>Hacer Master Deck B</span>
                </button>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              DECK B (Pink / Canal Derecho)
          ══════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-5 bg-[#0a0a1a]/95 border border-pink-500/30 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between shadow-[0_0_25px_rgba(236,72,153,0.1)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-28 h-28 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black tracking-widest text-pink-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse" />
                  DECK B (MEZCLA)
                </span>
                <span className="text-xs font-mono font-bold text-pink-300">
                  {formatDJTime(deckB.currentTime)} / {formatDJTime(deckB.duration)}
                </span>
              </div>

              {/* Info Card con botón de búsqueda */}
              <div className="p-2 rounded-xl bg-black/40 border border-pink-500/20 flex items-center justify-between gap-2 mb-2">
                <div
                  onClick={() => handleOpenSearchForDeck("B")}
                  className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer group"
                  title="Cambiar pista en Deck B"
                >
                  <div className="w-10 h-10 rounded-lg bg-pink-950 border border-pink-500/30 overflow-hidden relative shrink-0">
                    {deckB.track?.album_art_path ? (
                      <Image
                        src={deckB.track.album_art_path.includes("media_library/")
                          ? deckB.track.album_art_path.replace(/.*media_library\//, "/media-static/")
                          : deckB.track.album_art_path}
                        alt={deckB.track.title}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-pink-400">
                        <IconMusic size={16} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-bold text-white truncate group-hover:text-pink-300 transition-colors">
                      {deckB.track ? deckB.track.title : "Toca para cargar canción"}
                    </h3>
                    <p className="text-[10px] text-text-muted truncate">
                      {deckB.track ? deckB.track.artist : "Explorar catálogo"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenSearchForDeck("B")}
                  className="p-2 rounded-lg bg-pink-500/10 border border-pink-500/30 text-pink-300 hover:bg-pink-500/20 transition-all shrink-0"
                  title="Buscar y cargar otra canción en Deck B"
                >
                  <IconSearch size={14} />
                </button>
              </div>

              {/* Waveform Canvas */}
              <div className="w-full h-8 sm:h-10 bg-black/60 rounded-xl overflow-hidden border border-pink-500/20 mb-2 relative">
                <canvas ref={canvasRefB} width={400} height={40} className="w-full h-full" />
                {deckB.duration > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-pink-400 shadow-[0_0_8px_pink]"
                    style={{ left: `${(deckB.currentTime / deckB.duration) * 100}%` }}
                  />
                )}
              </div>
            </div>

            {/* Turntable / Interactive Scratch Jog Wheel */}
            <DJJogWheel
              deck="B"
              isPlaying={deckB.isPlaying}
              color="pink"
              track={deckB.track}
              onTogglePlay={() => togglePlayDeck("B")}
              onOpenSearch={() => handleOpenSearchForDeck("B")}
              startScratch={startScratch}
              scratchMove={scratchMove}
              stopScratch={stopScratch}
            />

            {/* Deck Controls */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => togglePlayDeck("B")}
                  className={`flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md ${
                    deckB.isPlaying
                      ? "bg-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.5)]"
                      : "bg-pink-500/20 border border-pink-500/50 text-pink-300 hover:bg-pink-500 hover:text-white"
                  }`}
                >
                  {deckB.isPlaying ? <IconPause size={14} /> : <IconPlay size={14} />}
                  <span>{deckB.isPlaying ? "PAUSA" : "PLAY"}</span>
                </button>
                <button
                  onClick={() => jumpToCue("B")}
                  onMouseDown={() => setCue("B")}
                  className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-pink-400 text-xs font-bold text-pink-300 transition-all"
                >
                  CUE
                </button>
                <button
                  onClick={() => setDeckPitch("B", 1.0)}
                  className="px-2 py-2 rounded-xl bg-white/5 border border-white/10 hover:text-white text-[10px] text-text-muted font-mono"
                >
                  0%
                </button>
              </div>

              {/* Pitch Slider */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-pink-400 w-8">-8%</span>
                <input
                  type="range"
                  min="0.92"
                  max="1.08"
                  step="0.005"
                  value={deckB.pitch}
                  onChange={(e) => setDeckPitch("B", parseFloat(e.target.value))}
                  className="flex-1 h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-pink-400"
                />
                <span className="text-[9px] font-mono text-pink-400 w-8 text-right">+8%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          POPUP MODAL: BUSCADOR DE CANCIONES MINIMALISTA
      ══════════════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg bg-[#0b0b1c] border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    targetDeckForModal === "A" ? "bg-cyan-400" : "bg-pink-400"
                  }`}
                />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Cargar Pista en Deck {targetDeckForModal}
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-all"
              >
                <IconClose size={14} />
              </button>
            </div>

            {/* Inputs de búsqueda */}
            <div className="py-3 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-white/40">
                  <IconSearch size={14} />
                </div>
                <input
                  type="text"
                  placeholder="Buscar por título o artista..."
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full bg-black/60 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:border-cyan-400 outline-none transition-all placeholder:text-white/30"
                />
              </div>
              <select
                value={modalSelectedGenre}
                onChange={(e) => setModalSelectedGenre(e.target.value)}
                className="bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-cyan-400 outline-none transition-all"
              >
                <option value="all">Todos los géneros</option>
                {genres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* Grid de Pistas */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1 py-1">
              {filteredModalCatalog.length === 0 ? (
                <div className="py-12 text-center text-xs text-text-muted">
                  No se encontraron canciones con ese criterio.
                </div>
              ) : (
                filteredModalCatalog.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleSelectTrackForDeck(t)}
                    className={`p-2 rounded-xl bg-white/[0.02] border border-white/5 hover:border-${
                      targetDeckForModal === "A" ? "cyan-500/50" : "pink-500/50"
                    } hover:bg-white/[0.05] flex items-center justify-between gap-3 cursor-pointer transition-all group`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-black/60 overflow-hidden relative shrink-0 border border-white/10">
                        {t.album_art_path ? (
                          <Image
                            src={t.album_art_path.includes("media_library/")
                              ? t.album_art_path.replace(/.*media_library\//, "/media-static/")
                              : t.album_art_path}
                            alt={t.title}
                            fill
                            sizes="36px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/40">
                            <IconMusic size={14} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate group-hover:text-accent transition-colors">
                          {t.title}
                        </p>
                        <p className="text-[10px] text-text-muted truncate">{t.artist}</p>
                      </div>
                    </div>

                    <span
                      className={`text-[9px] font-bold px-2 py-1 rounded-lg ${
                        targetDeckForModal === "A"
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                          : "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                      } shrink-0`}
                    >
                      Cargar en {targetDeckForModal}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
