"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import type { LiveLayout } from "@/components/live/SceneMixer";

export type LiveSource = {
  id: string;
  kind: "cam" | "screen" | "audio" | "bg" | "dj" | "overlay";
  label: string;
  device?: string;
  videoDeviceId?: string;
  audioDeviceId?: string;
  enableVideo?: boolean;
  enableAudio?: boolean;
  gain: number;
  muted: boolean;
  audioDelayMs?: number; // Retardo de audio en ms (0..2500ms) para sincronización con cámara remota
};

export type LiveScene = {
  id: string | number;
  name: string;
  layout: LiveLayout;
  slots: string[];
  is_program: boolean;
};

export type LiveRoom = {
  id: number;
  name: string;
  slug: string;
  status: string;
  whip_program: string;
  join_url: string;
  invite_code: string;
  destinations: { id: number; platform: string; label: string; mode: string; orientation: string }[];
};

const uid = () => Math.random().toString(36).slice(2, 8);

type Ctx = {
  room: LiveRoom | null;
  sources: LiveSource[];
  scenes: LiveScene[];
  previewId: string | null;
  programId: string | null;
  setSources: (s: LiveSource[]) => void;
  setScenes: (s: LiveScene[]) => void;
  setPreviewId: (id: string | null) => void;
  setProgramId: (id: string | null) => void;
  addSource: (kind: LiveSource["kind"], label: string, device?: string) => void;
  addScene: (layout: LiveLayout, name?: string) => void;
  cut: () => void;
  auto: () => void;
  loadScenes: () => Promise<void>;
  saveScene: (scene: LiveScene) => Promise<void>;
  deleteScene: (sceneId: number) => Promise<void>;
  setProgramScene: (sceneId: number) => Promise<void>;
};

const LiveCtx = createContext<Ctx | null>(null);

export function LiveProvider({
  slug,
  room: initialRoom,
  children,
}: {
  slug: string;
  room?: LiveRoom | null;
  children: React.ReactNode;
}) {
  const [room, setRoom] = useState<LiveRoom | null>(initialRoom || null);
  const [sources, setSources] = useState<LiveSource[]>([]);
  const [scenes, setScenes] = useState<LiveScene[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [programId, setProgramId] = useState<string | null>(null);

  useEffect(() => {
    if (initialRoom) {
      setRoom(initialRoom);
      return;
    }
    fetch(`/api/live/rooms`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.rooms) {
          const match = data.rooms.find((r: any) => r.slug === slug || String(r.id) === slug);
          if (match) setRoom(match);
        }
      })
      .catch(() => {});
  }, [slug, initialRoom]);

  // Cargar escenas del servidor
  const loadScenes = async () => {
    if (!room) return;
    try {
      const r = await fetch(`/api/live/rooms/${room.id}/scenes`);
      if (r.ok) {
        const data = await r.json();
        const loaded = data.scenes.map((s: any) => ({
          ...s,
          slots: s.slots || [],
        }));
        setScenes(loaded);
        const prog = loaded.find((s: LiveScene) => s.is_program);
        const first = loaded[0];
        setPreviewId(prog?.id?.toString() || first?.id?.toString() || null);
        setProgramId(prog?.id?.toString() || first?.id?.toString() || null);
      }
    } catch {}
  };

  useEffect(() => {
    loadScenes();
  }, [room]);

  const addSource: Ctx["addSource"] = (kind, label, device) => {
    const name =
      label ||
      ({ cam: "Cámara", screen: "Pantalla", audio: "Micrófono", bg: "Fondo", dj: "DJ Música", overlay: "Texto/Overlay" }[kind] +
        " " +
        (sources.length + 1));
    setSources([...sources, { id: uid(), kind, label: name, device, gain: 80, muted: false }]);
  };

  const addScene: Ctx["addScene"] = (layout, name) => {
    const sceneName = name || `Escena ${scenes.length + 1}`;
    const newSc: LiveScene = { id: uid(), name: sceneName, layout, slots: [], is_program: false };
    setScenes([...scenes, newSc]);
    saveScene(newSc).catch(() => {});
  };

  const saveScene = async (scene: LiveScene) => {
    if (!room) return;
    const body = {
      name: scene.name,
      layout: scene.layout,
      slots: scene.slots,
      is_program: scene.is_program,
    };
    let res: Response;
    if (typeof scene.id === "string" || Number(scene.id) > 1000000) {
      // nuevo local (uid) -> crear
      res = await fetch(`/api/live/rooms/${room.id}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const created = await res.json();
        setScenes((prev) =>
          prev.map((s) => (String(s.id) === String(scene.id) ? { ...scene, id: created.id } : s))
        );
        setPreviewId((pid) => (String(pid) === String(scene.id) ? String(created.id) : pid));
        setProgramId((pgid) => (String(pgid) === String(scene.id) ? String(created.id) : pgid));
      }
    } else {
      // existente -> actualizar
      res = await fetch(`/api/live/rooms/${room.id}/scenes/${scene.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
  };

  const deleteScene = async (sceneId: number) => {
    if (!room) return;
    if (sceneId > 1000000) {
      // local-only
      setScenes(scenes.filter((s) => s.id !== sceneId));
      return;
    }
    const res = await fetch(`/api/live/rooms/${room.id}/scenes/${sceneId}`, { method: "DELETE" });
    if (res.ok) {
      loadScenes();
      toast.success("Escena eliminada");
    } else {
      toast.error("Error eliminando escena");
    }
  };

  const setProgramScene = async (sceneId: number) => {
    if (!room) return;
    const res = await fetch(`/api/live/rooms/${room.id}/scenes/${sceneId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_program: true }),
    });
    if (res.ok) loadScenes();
  };

  const cut = () => {
    if (previewId) setProgramId(previewId);
  };
  const auto = () => {
    if (previewId) setTimeout(() => setProgramId(previewId), 300);
  };

  return (
    <LiveCtx.Provider
      value={{ room, sources, scenes, previewId, programId, setSources, setScenes, setPreviewId, setProgramId, addSource, addScene, cut, auto, loadScenes, saveScene, deleteScene, setProgramScene }}
    >
      {children}
    </LiveCtx.Provider>
  );
}

export function useLive(): Ctx {
  const c = useContext(LiveCtx);
  if (!c) throw new Error("useLive fuera de LiveProvider");
  return c;
}

// import toast aquí para evitar circular
import toast from "react-hot-toast";