"use client";

/**
 * AIChatSidebar.tsx — Sidebar Lateral Derecho Retráctil con Chat Agéntico
 * ===========================================================================
 * - Burbuja flotante en esquina inferior derecha cuando está cerrado
 * - Al abrir: sidebar fijo de ancho 380px
 * - Chat agéntico que controla la interfaz (play, filter, checkout, lyrics)
 * - Soporte de entrada por voz (Web Speech API)
 * - Respuestas por voz (Edge-TTS streaming)
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/contexts/PlayerContext";
import { useDJ } from "@/contexts/DJContext";
import { ExitoLogoIcon } from "@/components/ExitoLogo";
import { deriveModule, getAgentPageContext } from "@/utils/agentPageContext";
import type { Track } from "./StreamPlayer";



interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  isStreaming?: boolean;
  action?: string;
  actionData?: { item?: Track; items?: Track[]; type?: string; genre?: string };
}

interface CreatorContext {
  slug?: string;
  name?: string;
  type?: string;
  language?: string;
}

interface AIChatSidebarProps {
  catalog: Track[];
  onPlay: (track: Track) => void;
  onFilter: (type: string) => void;
  onCheckout: (track: Track) => void;
  onShowLyrics?: () => void;
  currentTrack: Track | null;
  isOpen: boolean;
  onToggle: () => void;
  hasActivePlayer?: boolean;
  creatorContext?: CreatorContext;
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────
const IconChat = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
  </svg>
);

const IconClose = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const IconSend = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

const IconMic = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
  </svg>
);

const IconMicOff = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3 3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
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

const IconPlay = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const IconDownload = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
  </svg>
);

const IconMusicNote = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
  </svg>
);

const IconHeadphones = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z" />
  </svg>
);

const CHAT_STORAGE_KEY = "mediasuite_chat_messages_v2";

function buildInitialMessage(): Message {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  let storedRole = "";
  try {
    storedRole = sessionStorage.getItem("exito_user_role") || "";
  } catch {}
  const isArtist = path.startsWith("/artist-studio") || storedRole === "artist";

  if (isArtist) {
    return {
      id: "init",
      sender: "bot",
      text:
        "¡Hola! Soy Saori, tu copiloto en el Artist Studio de Éxito.cyou.\n\n" +
        "Puedo analizar tu cuenta y ayudarte a gestionar tu música y tus ingresos:\n" +
        "• Analizar tus ventas, saldo y retiros de PayPal\n" +
        "• Abrir tu catálogo, tus álbumes y tus precios\n" +
        "• Revisar tu audiencia, suscriptores y votaciones\n" +
        "• Configurar tu agente de ventas y WhatsApp\n" +
        "• Controlar la reproducción y explicar tus letras\n\n" +
        "¿Quieres un análisis de tu cuenta o abrir alguna sección?",
    };
  }

  const isFan = path.startsWith("/portal");
  return {
    id: "init",
    sender: "bot",
    text:
      "¡Hola! Soy Saori, tu copiloto musical en Éxito.cyou.\n\n" +
      "Puedo ayudarte a:\n" +
      "• Recomendarte música según tu estado de ánimo\n" +
      "• Reproducir pistas y controlar el reproductor\n" +
      "• Explicar la letra y el significado de cada canción\n" +
      "• Comprar y descargar música con PayPal\n" +
      (isFan ? "• Abrir tu biblioteca, compras y descargas\n" : "") +
      "\n¿Qué te gustaría escuchar hoy?",
  };
}


export default function AIChatSidebar({
  catalog,
  onPlay,
  onFilter,
  onCheckout,
  onShowLyrics,
  currentTrack,
  isOpen,
  onToggle,
  hasActivePlayer = false,
  creatorContext,
}: AIChatSidebarProps) {
  const router = useRouter();
  const { setIsAgentSpeaking, setShowDJView } = usePlayer();
  const { setIsOpen: setDJOpen, loadTrackToDeck, smoothCrossfade, autoDJMix } = useDJ();

  const [messages, setMessages] = useState<Message[]>(() => {

    if (typeof window !== "undefined") {
      try {
        const savedTime = localStorage.getItem("mediasuite_chat_messages_timestamp");
        if (savedTime) {
          const timeDiff = Date.now() - parseInt(savedTime, 10);
          if (timeDiff > 24 * 60 * 60 * 1000) {
            sessionStorage.removeItem(CHAT_STORAGE_KEY);
            localStorage.removeItem("mediasuite_chat_messages_timestamp");
            return [buildInitialMessage()];
          }
        }
        const saved = sessionStorage.getItem(CHAT_STORAGE_KEY);
        if (saved) {
          return JSON.parse(saved);
        }
      } catch (e) {}
    }
    return [buildInitialMessage()];
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
      if (messages.length > 1 && !localStorage.getItem("mediasuite_chat_messages_timestamp")) {
        localStorage.setItem("mediasuite_chat_messages_timestamp", Date.now().toString());
      }
    }
  }, [messages]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // ── Identidad real del usuario para el copiloto (fan, artista o invitado) ──
  const [accountRole, setAccountRole] = useState<"artist" | "fan" | "guest">("guest");
  const [accountName, setAccountName] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    fetch("/api/ecommerce/me/info")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.authenticated && data?.user) {
          setAccountName(data.user.username || "");
          let storedRole = "";
          try {
            storedRole = sessionStorage.getItem("exito_user_role") || "";
          } catch {}
          const isArtist =
            storedRole === "artist" || window.location.pathname.startsWith("/artist-studio");
          setAccountRole(isArtist ? "artist" : "fan");
        } else {
          setAccountRole("guest");
          setAccountName("");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Rating de satisfacción ──
  const [showRating, setShowRating] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const ratingSkipped = useRef(false);

  // ── Modal de confirmación (reemplaza confirm() nativo del navegador) ──
  const [showClearModal, setShowClearModal] = useState(false);

  // ── Carousel drag ──
  const carouselRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScroll = useRef(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const currentAudioController = useRef<AbortController | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const cancelCurrentAudio = useCallback(() => {
    if (currentAudioController.current) {
      currentAudioController.current.abort();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setIsAgentSpeaking(false);
  }, [setIsAgentSpeaking]);

  const speakResponse = useCallback(async (text: string) => {
    if (!voiceEnabled) return;
    cancelCurrentAudio();

    const controller = new AbortController();
    currentAudioController.current = controller;

    try {
      const res = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.replace(/\*\*/g, "").substring(0, 500), voice: "es-MX-DaliaNeural" }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      audioRef.current.src = url;
      audioRef.current.volume = 0.9;
      audioRef.current.play().then(() => {
        setIsAgentSpeaking(true);
      }).catch(() => {});
      
      audioRef.current.onended = () => {
        URL.revokeObjectURL(url);
        setIsAgentSpeaking(false);
      };
    } catch (e: any) {
      if (e.name !== "AbortError") console.warn("TTS error:", e);
      setIsAgentSpeaking(false);
    }
  }, [voiceEnabled, cancelCurrentAudio, setIsAgentSpeaking]);

  // ── Carousel drag-to-scroll ──
  const handleCarouselMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    if (carouselRef.current) {
      dragStartScroll.current = carouselRef.current.scrollLeft;
    }
  }, []);

  const handleCarouselMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !carouselRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStartX.current;
    carouselRef.current.scrollLeft = dragStartScroll.current - dx;
  }, []);

  const handleCarouselMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // ── Rating trigger logic ──
  const maybeShowRating = useCallback((userText: string, botAction?: string) => {
    if (ratingSubmitted || showRating) return;
    // Detectar gratitud en mensaje del usuario
    const gratitudeWords = ["gracias", "excelente", "genial", "perfecto", "buen trabajo",
      "great", "awesome", "thanks", "me encanta", "muy bien", "super", "increíble",
      "espectacular", "maravilloso", "fantástico", "buena", "excelente servicio"];
    const hasGratitude = gratitudeWords.some(w => userText.toLowerCase().includes(w));
    // Mostrar rating si: hay gratitud O después de algunas interacciones
    if (hasGratitude || (messages.filter(m => m.sender === "bot").length >= 3 && !ratingSkipped.current)) {
      setShowRating(true);
    }
  }, [messages, ratingSubmitted, showRating]);

  const handleRate = useCallback(async (rating: number) => {
    setRatingValue(rating);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 2500);
    try {
      await fetch("/api/tts/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          metrics: {
            messages_count: messages.length,
            has_current_track: !!currentTrack,
          }
        }),
      });
    } catch {}
    setTimeout(() => {
      setRatingSubmitted(true);
      setShowRating(false);
    }, 800);
  }, [messages, currentTrack]);

  const handleRateLater = useCallback(() => {
    ratingSkipped.current = true;
    setShowRating(false);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    // Detener grabación al enviar
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      setIsListening(false);
    }

    const userMsg: Message = { id: Date.now().toString(), sender: "user", text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const botMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: botMsgId, sender: "bot", text: "...", isStreaming: true }]);

    try {
      const res = await fetch("/api/tts/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          catalog_context: catalog,
          current_track: currentTrack ? {
            id: currentTrack.id,
            title: currentTrack.title,
            artist: currentTrack.artist,
            album: (currentTrack as any).album || "",
            genre: (currentTrack as any).genre || "",
            language: (currentTrack as any).language || "es",
            creator: (currentTrack as any).creator || creatorContext?.name || "",
            creator_slug: (currentTrack as any).creator_slug || creatorContext?.slug || "",
            lyrics_path: (currentTrack as any).lyrics_path || "",
            description: (currentTrack as any).description || "",
          } : null,
          conversation_history: messages.slice(-8).map(m => ({
            sender: m.sender,
            text: m.text,
          })),
          user_language: "es",
          current_path: typeof window !== "undefined" ? window.location.pathname : "",
          creator_slug: creatorContext?.slug || "",
          creator_name: creatorContext?.name || "",
          creator_type: creatorContext?.type || "",
          creator_language: creatorContext?.language || "",
          // Copiloto: identidad real + ubicación exacta en la interfaz
          user_role: accountRole,
          page_context: (() => {
            const path = typeof window !== "undefined" ? window.location.pathname : "/";
            const stored = getAgentPageContext();
            return {
              module: deriveModule(path),
              section: stored.section || "",
              title: stored.title || "",
              path,
              artist_slug: stored.artist_slug || creatorContext?.slug || "",
            };
          })(),
          ui_state: {
            chat_open: isOpen,
            player: currentTrack ? "playing" : "idle",
            user_name: accountName,
          },
        }),
      });

      const data = await res.json();
      const rawResponseText = data.response || "No pude procesar tu solicitud.";
      // Defensa en profundidad: eliminar cualquier fragmento JSON que el backend no haya podido limpiar
      const responseText = rawResponseText
        .replace(/\{[^{}]{0,500}\}/g, "")
        .replace(/\*\*/g, "")
        .replace(/_{2}/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      const action = data.action;
      const actionData = data.action_data || {};

      setMessages(prev =>
          prev.map(m =>
              m.id === botMsgId
                  ? { ...m, text: responseText, isStreaming: false, action, actionData }
                  : m
          )
      );

      if (action === "play" && actionData.item) {
        setTimeout(() => onPlay(actionData.item!), 500);
      } else if (action === "navigate_creator" && actionData.slug) {
        // Guardar la pista de auto-reproducción en sessionStorage para que el nuevo componente la reproduzca al montar
        if (actionData.autoplay_track) {
          sessionStorage.setItem("mediasuite_current_track", JSON.stringify(actionData.autoplay_track));
        }
        // Redireccionar al perfil del creador/artista de manera fluida preservando el reproductor de audio
        router.push(`/channel/${actionData.slug}`);
      } else if (action === "navigate" && (actionData.path || actionData.url)) {
        // Navegación controlada por el copiloto (paneles, portal, sandbox)
        const targetPath = String(actionData.path || actionData.url || "/");
        const targetSection = String(actionData.section || "");
        if (targetPath.startsWith("/artist-studio")) {
          if (targetSection) {
            try {
              sessionStorage.setItem("exito_studio_tab", targetSection);
            } catch {}
          }
          if (typeof window !== "undefined" && window.location.pathname.startsWith("/artist-studio")) {
            window.dispatchEvent(
              new CustomEvent("exito:navigate-section", {
                detail: { path: targetPath, section: targetSection },
              })
            );
          } else {
            router.push("/artist-studio");
          }
        } else {
          router.push(targetPath);
        }
      } else if (action === "play_first" && catalog.length) {
        setTimeout(() => onPlay(catalog[0]), 500);
      } else if (action === "filter" && actionData.type) {
        setTimeout(() => onFilter(actionData.type!), 300);
      } else if (action === "checkout" && actionData.item) {
        // Guardar item en sessionStorage y navegar a home para checkout
        if (typeof window !== "undefined" && window.location.pathname !== "/") {
          sessionStorage.setItem("mediasuite_checkout_item", JSON.stringify(actionData.item));
          router.push("/");
        } else {
          setTimeout(() => onCheckout(actionData.item!), 800);
        }
      } else if (action === "show_lyrics" && actionData.item) {
        // Si se encontró la canción, reproducirla primero y luego mostrar letras
        onPlay(actionData.item!);
        setTimeout(() => onShowLyrics?.(), 600);
      } else if (action === "show_lyrics_current") {
        onShowLyrics?.();
      } else if (action === "open_dj") {
        setDJOpen(true);
        setShowDJView(true);
      } else if (action === "dj_load" && actionData.item) {
        setDJOpen(true);
        setShowDJView(true);
        loadTrackToDeck((actionData.deck as "A" | "B") || "A", actionData.item);
      } else if (action === "dj_crossfade") {
        setDJOpen(true);
        setShowDJView(true);
        smoothCrossfade(actionData.target ?? 0.5, actionData.duration_sec || 4);
      } else if (action === "dj_autodj") {
        setDJOpen(true);
        setShowDJView(true);
        autoDJMix(actionData.trackA, actionData.trackB);
      }



      maybeShowRating(text, action);
      speakResponse(responseText);
    } catch {
      setMessages(prev =>
          prev.map(m =>
              m.id === botMsgId
                  ? { ...m, text: "Error de conexión. Por favor intenta nuevamente.", isStreaming: false }
                  : m
          )
      );
    } finally {
      setLoading(false);
    }
  }, [catalog, currentTrack, loading, messages, creatorContext, accountRole, accountName, isOpen, onPlay, onFilter, onCheckout, onShowLyrics, speakResponse, router, maybeShowRating]);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Tu navegador no soporta reconocimiento de voz. Usa Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "es-ES";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptSegment = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptSegment;
        } else {
          interimTranscript += transcriptSegment;
        }
      }

      // Combinar texto final con el texto parcial en tiempo real
      if (finalTranscript || interimTranscript) {
        const currentSpoken = (finalTranscript + interimTranscript).trim();
        setInput(currentSpoken);
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const renderText = (text: string) => {
    // Eliminar fragmentos JSON residuales por seguridad (defensa final antes del render)
    const safeText = text
      .replace(/\{[^{}]{0,500}\}/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return safeText.split("\n").map((line, i) => (
        <p key={i} className={`leading-relaxed ${i > 0 ? "mt-1" : ""}`}>
          {line.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
              part.startsWith("**") && part.endsWith("**")
                  ? <strong key={j} className="font-bold text-white">{part.slice(2, -2)}</strong>
                  : part
          )}
        </p>
    ));
  };

  return (
      <>
        {/* Sidebar */}
        <div
            className={`fixed top-0 right-0 z-[160] flex flex-col transition-all duration-500 ${
                isOpen ? "w-full md:w-[380px] shadow-[-20px_0_60px_rgba(0,0,0,0.5)]" : "w-0 overflow-hidden"
            }`}
            style={{ height: hasActivePlayer ? "calc(100vh - 88px)" : "100vh" }}
        >
          <div className="w-full md:w-[380px] h-full bg-[#08080f]/98 backdrop-blur-2xl border-l border-white/[0.06] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04] shrink-0">
              <div className="flex items-center gap-2.5">
                <ExitoLogoIcon size={30} />
                <div>
                  <h2 className="text-sm font-black text-white tracking-tight flex items-center gap-1.5">
                    Saori <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono font-bold">Éxito.cyou</span>
                  </h2>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[0.6rem] text-white/40 uppercase tracking-wider">Activo</span>
                  {creatorContext?.name && (
                    <span className="text-[0.55rem] text-[#a78bfa]/80 uppercase tracking-wider truncate max-w-[140px]">
                      · {creatorContext.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Voice toggle */}
              <button
                onClick={() => { setVoiceEnabled(!voiceEnabled); cancelCurrentAudio(); }}
                className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
                  voiceEnabled
                    ? "bg-[#7c3aed]/20 border-[#7c3aed]/40 text-[#a78bfa]"
                    : "border-white/[0.06] text-white/30 hover:text-white/60"
                }`}
                title={voiceEnabled ? "Desactivar voz" : "Activar voz"}
                aria-label={voiceEnabled ? "Desactivar voz" : "Activar voz"}
              >
                {voiceEnabled ? <IconVolumeUp size={14} /> : <IconVolumeMute size={14} />}
              </button>
              {/* Limpiar chat */}
              <button
                onClick={() => setShowClearModal(true)}
                className="w-7 h-7 rounded-lg border border-white/[0.06] text-white/30 hover:text-red-400 hover:border-red-400/30 flex items-center justify-center transition-all"
                title="Limpiar conversación"
                aria-label="Limpiar conversación"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
              {/* Close */}
              <button
                onClick={onToggle}
                className="w-7 h-7 rounded-lg border border-white/[0.06] text-white/40 hover:text-white hover:border-white/20 flex items-center justify-center transition-all"
                title="Cerrar chat"
                aria-label="Cerrar chat"
              >
                <IconClose size={16} />
              </button>
            </div>
          </div>

          {/* Current track context */}
          {currentTrack && (
            <div className="px-4 py-3 border-b border-white/[0.04] shrink-0">
              <div className="flex items-center gap-2.5 bg-white/[0.03] rounded-xl p-2.5">
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/[0.05] shrink-0 relative">
                  {currentTrack.album_art_path ? (
                    <Image
                      src={currentTrack.album_art_path.includes("media_library/")
                        ? currentTrack.album_art_path.replace(/.*media_library\//, "/media-static/")
                        : currentTrack.album_art_path}
                      alt=""
                      fill
                      sizes="32px"
                      className="object-cover"
                    />
                  ) : <div className="w-full h-full flex items-center justify-center text-white/30"><IconMusicNote size={16} /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.65rem] text-white/40 uppercase tracking-wider">Reproduciendo</p>
                  <p className="text-xs font-bold text-white truncate">{currentTrack.title}</p>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-thumb]:bg-white/[0.06] [&::-webkit-scrollbar-thumb]:rounded-full">
            {messages.map(msg => (
              <div key={msg.id} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-[#7c3aed] text-white rounded-br-sm"
                      : "bg-white/[0.04] border border-white/[0.06] text-white/70 rounded-bl-sm"
                  } ${msg.isStreaming ? "animate-pulse" : ""}`}
                >
                  {msg.sender === "bot" ? renderText(msg.text) : msg.text}
                </div>

                {/* Action Cards */}
                {msg.actionData?.item && (
                  <div className="mt-2 w-full max-w-[88%] bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex gap-3 items-center animate-[fadeIn_0.3s_ease]">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.05] shrink-0 relative">
                      {msg.actionData.item.album_art_path ? (
                        <Image
                          src={msg.actionData.item.album_art_path.includes("media_library/")
                            ? msg.actionData.item.album_art_path.replace(/.*media_library\//, "/media-static/")
                            : msg.actionData.item.album_art_path}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      ) : <div className="w-full h-full flex items-center justify-center text-white/30"><IconMusicNote size={16} /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.7rem] font-bold text-white truncate">{msg.actionData.item.title}</p>
                      <p className="text-[0.6rem] text-white/40 truncate">{msg.actionData.item.artist}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => onPlay(msg.actionData!.item!)}
                        className="bg-[#06b6d4]/20 text-[#06b6d4] text-[0.6rem] font-bold px-2 py-1.5 rounded-lg border border-[#06b6d4]/30 hover:bg-[#06b6d4]/30 transition-colors flex items-center gap-1"
                      >
                        <IconPlay size={12} /> Play
                      </button>
                      <button
                        onClick={() => {
                          if (typeof window !== "undefined" && window.location.pathname !== "/") {
                            sessionStorage.setItem("mediasuite_checkout_item", JSON.stringify(msg.actionData!.item!));
                            router.push("/");
                          } else {
                            onCheckout(msg.actionData!.item!);
                          }
                        }}
                        className="bg-[#7c3aed]/20 text-[#a78bfa] text-[0.6rem] font-bold px-2 py-1.5 rounded-lg border border-[#7c3aed]/30 hover:bg-[#7c3aed]/30 transition-colors flex items-center gap-1"
                      >
                        <IconDownload size={12} /> Comprar
                      </button>
                    </div>
                  </div>
                )}

                {/* Multiple results — Carousel tipo Instagram/Amazon con drag */}
                {msg.actionData?.items && msg.actionData.items.length > 0 && (
                  <div
                    ref={carouselRef}
                    onMouseDown={handleCarouselMouseDown}
                    onMouseMove={handleCarouselMouseMove}
                    onMouseUp={handleCarouselMouseUp}
                    onMouseLeave={handleCarouselMouseUp}
                    className="mt-2 w-full max-w-[95%] overflow-x-auto flex gap-3 pb-2 pt-1 scrollbar-none select-none snap-x snap-mandatory"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {msg.actionData.items.map(item => (
                      <div
                        key={item.id}
                        onClick={() => { if (!isDragging.current) onPlay(item); }}
                        className="w-[125px] shrink-0 snap-start bg-[#0d0d1e]/80 border border-white/[0.08] rounded-xl p-2 cursor-pointer transition-all hover:bg-white/[0.04] hover:border-[#7c3aed]/50 hover:-translate-y-0.5 group active:scale-95"
                      >
                        <div className="w-full aspect-square rounded-lg overflow-hidden bg-white/[0.05] relative mb-1.5 shadow-md">
                          {item.album_art_path ? (
                            <Image
                              src={item.album_art_path.includes("media_library/")
                                ? item.album_art_path.replace(/.*media_library\//, "/media-static/")
                                : item.album_art_path}
                              alt=""
                              fill
                              sizes="125px"
                              className="object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/20">
                              <IconMusicNote size={20} />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <div className="w-7 h-7 rounded-full bg-[#7c3aed] text-white flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100 transition-all duration-300">
                              <IconPlay size={12} />
                            </div>
                          </div>
                        </div>
                        <p className="text-[0.65rem] font-bold text-white truncate w-full" title={item.title}>
                          {item.title}
                        </p>
                        <p className="text-[0.55rem] text-white/40 truncate w-full">
                          {item.artist || item.creator || "IA Artist"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {/* Rating Survey */}
            {showRating && !ratingSubmitted && (
              <div className="w-full animate-fade-in">
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 mt-2">
                  <p className="text-[0.65rem] text-white/60 text-center mb-2.5 leading-relaxed">
                    ¿Cómo calificas tu experiencia con Saori?
                  </p>
                  <div className="flex items-center justify-center gap-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        onClick={() => handleRate(star)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                          ratingValue >= star
                            ? 'text-yellow-400 scale-110'
                            : 'text-white/20 hover:text-yellow-400/60 hover:scale-105'
                        }`}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill={ratingValue >= star ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleRateLater}
                    className="w-full text-center text-[0.55rem] text-white/30 hover:text-white/60 transition-colors mt-2 py-1"
                  >
                    Pregúntame más tarde
                  </button>
                </div>
              </div>
            )}

            {/* Confetti animation */}
            {showConfetti && (
              <div className="fixed inset-0 pointer-events-none z-[200] overflow-hidden">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute animate-confetti"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: `-5%`,
                      width: `${6 + Math.random() * 6}px`,
                      height: `${6 + Math.random() * 6}px`,
                      backgroundColor: ['#7c3aed', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e', '#a78bfa', '#34d399'][i % 7],
                      borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                      animationDuration: `${1.5 + Math.random() * 1.5}s`,
                      animationDelay: `${Math.random() * 0.3}s`,
                      opacity: 0.9,
                    }}
                  />
                ))}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-white/[0.04] shrink-0">
            <div className="flex gap-2 items-center">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
                  placeholder={isListening ? "Escuchando dictado..." : "Pregunta o pide una canción..."}
                  disabled={loading}
                  className={`w-full bg-white/[0.03] border rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/20 outline-none transition-all ${
                    isListening
                      ? "border-[#a78bfa]/50 bg-[#7c3aed]/5 focus:border-[#7c3aed]"
                      : "border-white/[0.08] focus:border-[#7c3aed]/50 focus:bg-white/[0.05]"
                  }`}
                />
              </div>
              
              {/* Voice button */}
              <button
                onClick={isListening ? stopListening : startListening}
                disabled={loading}
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                  isListening
                    ? "bg-[#ef4444] text-white shadow-lg shadow-red-500/25 animate-pulse"
                    : "bg-white/[0.04] border border-white/[0.08] text-white/40 hover:text-white hover:border-white/20"
                }`}
                title={isListening ? "Detener" : "Hablar"}
                aria-label={isListening ? "Detener" : "Hablar"}
              >
                {isListening ? <IconMicOff size={16} /> : <IconMic size={16} />}
              </button>

              {/* Send button */}
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-xl bg-[#7c3aed] text-white flex items-center justify-center shrink-0 hover:bg-[#9333ea] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Enviar mensaje"
              >
                {loading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : <IconSend size={16} />}
              </button>
            </div>

            {voiceEnabled && (
              <p className="text-[0.6rem] text-[#a78bfa]/60 text-center mt-2 flex items-center justify-center gap-1">
                <IconVolumeUp size={10} />
                Respuestas por voz activas
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bubble / Toggle Button (cuando está cerrado) */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className={`fixed z-[160] w-12 h-12 rounded-full bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] text-white/80 hover:text-white shadow-2xl flex items-center justify-center hover:scale-110 hover:border-white/[0.15] hover:bg-white/[0.08] active:scale-95 transition-all ${hasActivePlayer ? "bottom-[120px] md:bottom-[106px]" : "bottom-5"} right-5`}
          title="Asistente de Streaming"
          aria-label="Asistente de Streaming"
        >
          <IconChat size={20} />
        </button>
      )}

      {/* ── Modal de Confirmación: Limpiar Conversación ── */}
      {showClearModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowClearModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-sm rounded-3xl bg-[#0e0e1e] border border-white/[0.08] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.7)] animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>
            <h3 className="text-lg font-black text-white text-center mb-2">Limpiar conversación</h3>
            <p className="text-sm text-white/40 text-center mb-7">¿Estás seguro? Se eliminarán todos los mensajes de esta sesión. Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearModal(false)}
                className="flex-1 py-3 rounded-2xl border border-white/[0.08] text-white/50 text-sm font-bold hover:bg-white/[0.04] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setMessages([buildInitialMessage()]);
                  sessionStorage.removeItem(CHAT_STORAGE_KEY);
                  localStorage.removeItem("mediasuite_chat_messages_timestamp");
                  cancelCurrentAudio();
                  setShowClearModal(false);
                }}
                className="flex-1 py-3 rounded-2xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-bold hover:bg-red-500/30 transition-all"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
