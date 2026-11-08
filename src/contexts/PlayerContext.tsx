"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import type { Track } from "@/components/StreamPlayer";

interface PlayerContextType {
  currentTrack: Track | null;
  chatOpen: boolean;
  playlist: Track[];
  catalog: Track[];
  adminMode: boolean;
  isAuthenticated: boolean;
  checkoutHandler: ((track: Track) => void) | null;
  addToPlaylistHandler: ((track: Track) => void) | null;
  filterHandler: ((type: string) => void) | null;
  creatorContext: { slug?: string; name?: string; type?: string; language?: string } | undefined;
  isAgentSpeaking: boolean;
  showPlaylistView: boolean;
  showDJView: boolean;

  play: (track: Track) => void;
  setCurrentTrack: (track: Track | null) => void;
  setChatOpen: (open: boolean) => void;
  setPlaylist: (tracks: Track[]) => void;
  setCatalog: (tracks: Track[]) => void;
  setAdminMode: (admin: boolean) => void;
  setIsAuthenticated: (auth: boolean) => void;
  setCheckoutHandler: (fn: ((track: Track) => void) | null) => void;
  setAddToPlaylistHandler: (fn: ((track: Track) => void) | null) => void;
  setFilterHandler: (fn: ((type: string) => void) | null) => void;
  setCreatorContext: (ctx: { slug?: string; name?: string; type?: string; language?: string } | undefined) => void;
  setIsAgentSpeaking: (speaking: boolean) => void;
  setShowPlaylistView: (open: boolean) => void;
  setShowDJView: (open: boolean) => void;
}


const PlayerContext = createContext<PlayerContextType | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [catalog, setCatalog] = useState<Track[]>([]);
  const [adminMode, setAdminMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkoutHandler, setCheckoutHandler] = useState<((track: Track) => void) | null>(null);
  const [addToPlaylistHandler, setAddToPlaylistHandler] = useState<((track: Track) => void) | null>(null);
  const [filterHandler, setFilterHandler] = useState<((type: string) => void) | null>(null);
  const [creatorContext, setCreatorContext] = useState<{ slug?: string; name?: string; type?: string; language?: string } | undefined>(undefined);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [showPlaylistView, setShowPlaylistView] = useState(false);
  const [showDJView, setShowDJView] = useState(false);
  const initialized = useRef(false);

  // Restaurar estado desde sessionStorage al montar
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const saved = sessionStorage.getItem("mediasuite_current_track");
      if (saved) {
        const parsed = JSON.parse(saved);
        setCurrentTrack(parsed);
      }
      const chatSaved = sessionStorage.getItem("mediasuite_chat_open");
      if (chatSaved === "true") {
        setChatOpen(true);
      }
    } catch {}
  }, []);

  // Persistir currentTrack
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (currentTrack) {
        sessionStorage.setItem("mediasuite_current_track", JSON.stringify(currentTrack));
      } else {
        sessionStorage.removeItem("mediasuite_current_track");
      }
    }
  }, [currentTrack]);

  // Persistir chatOpen
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("mediasuite_chat_open", chatOpen ? "true" : "false");
    }
  }, [chatOpen]);

  const play = useCallback((track: Track) => {
    setCurrentTrack(track);
    fetch(`/api/ecommerce/catalog/${track.id}/play`, { method: "POST" }).catch(() => {});
  }, []);

  return (
    <PlayerContext.Provider value={{
      currentTrack, chatOpen, playlist, catalog, adminMode, isAuthenticated,
      checkoutHandler, addToPlaylistHandler, filterHandler, creatorContext, isAgentSpeaking, showPlaylistView, showDJView,
      play, setCurrentTrack, setChatOpen, setPlaylist, setCatalog, setAdminMode, setIsAuthenticated,
      setCheckoutHandler, setAddToPlaylistHandler, setFilterHandler, setCreatorContext, setIsAgentSpeaking, setShowPlaylistView, setShowDJView,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}


export function usePlayer(): PlayerContextType {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
