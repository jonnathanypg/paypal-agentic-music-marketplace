"use client";
import React, { useEffect, useRef, useState } from "react";

export type UnifiedChatMessage = {
  id: string;
  platform: "youtube" | "twitch" | "kick" | "tiktok" | "facebook" | "instagram" | "studio" | string;
  author_name: string;
  author_color?: string;
  author_photo?: string | null;
  message_text: string;
  is_moderator?: boolean;
  is_subscriber?: boolean;
  is_owner?: boolean;
  published_at?: string;
};

export default function LiveChat({
  roomId,
  channelId,
  onHighlightMessage,
}: {
  roomId?: number | string;
  channelId?: number | "";
  onHighlightMessage?: (msg: UnifiedChatMessage) => void;
}) {
  const [msgs, setMsgs] = useState<UnifiedChatMessage[]>([]);
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [newMessage, setNewMessage] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [ytVideoId, setYtVideoId] = useState("");
  const [twitchChannel, setTwitchChannel] = useState("");
  const [kickChannel, setKickChannel] = useState("");
  const [tiktokUser, setTiktokUser] = useState("");
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    if (!roomId) return;
    try {
      const res = await fetch(`/api/live/chat/rooms/${roomId}/messages?limit=60`);
      if (!res.ok) return;
      const data = await res.json();
      const list: UnifiedChatMessage[] = data.messages || [];
      setMsgs(list);

      // Detectar plataformas activas presentes en los mensajes
      const platforms = Array.from(new Set(list.map((m) => m.platform)));
      setConnectedPlatforms(platforms);
    } catch {}
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 2500); // Polling rápido cada 2.5s
    return () => clearInterval(interval);
  }, [roomId]);

  useEffect(() => {
    // Auto-scroll hacia abajo al recibir mensajes
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgs]);

  const saveConfig = async () => {
    if (!roomId) return;
    try {
      await fetch(`/api/live/chat/rooms/${roomId}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtube_video_id: ytVideoId || undefined,
          twitch_channel: twitchChannel || undefined,
          kick_channel: kickChannel || undefined,
          tiktok_username: tiktokUser || undefined,
        }),
      });
      setShowConfig(false);
      fetchMessages();
    } catch {}
  };

  const sendStudioBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !roomId) return;
    try {
      await fetch(
        `/api/live/chat/rooms/${roomId}/broadcast?author=Director&message=${encodeURIComponent(
          newMessage.trim()
        )}&platform=studio`,
        { method: "POST" }
      );
      setNewMessage("");
      fetchMessages();
    } catch {}
  };

  const getPlatformBadge = (platform: string) => {
    switch (platform) {
      case "youtube":
        return <span className="bg-red-600/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold">YT</span>;
      case "twitch":
        return <span className="bg-purple-600/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold">TWITCH</span>;
      case "kick":
        return <span className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold">KICK</span>;
      case "tiktok":
        return <span className="bg-pink-600/20 text-pink-400 border border-pink-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold">TIKTOK</span>;
      case "facebook":
        return <span className="bg-blue-600/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold">FB</span>;
      case "instagram":
        return <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-1.5 py-0.5 rounded text-[9px] font-bold">IG</span>;
      default:
        return <span className="bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold">STUDIO</span>;
    }
  };

  const filtered = filterPlatform === "all" ? msgs : msgs.filter((m) => m.platform === filterPlatform);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col h-[480px] shadow-lg overflow-hidden">
      {/* Header del Chat Unificado */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
        <div className="flex items-center gap-2">
          <span className="text-base">💬</span>
          <div>
            <h3 className="font-bold text-xs text-white flex items-center gap-1.5">
              Chat Multistream Unificado
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </h3>
            <p className="text-[10px] text-zinc-400">
              {msgs.length} mensajes recibidos
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowConfig((v) => !v)}
          className="text-zinc-400 hover:text-white px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg transition font-medium flex items-center gap-1"
          title="Configurar canales y redes para el chat"
        >
          ⚙ Vincular Canales
        </button>
      </div>

      {/* Modal / Acordeón de Configuración de Cuentas */}
      {showConfig && (
        <div className="p-3 bg-zinc-950 border-b border-zinc-800 text-xs space-y-2 animate-in fade-in max-h-60 overflow-y-auto">
          <div className="font-bold text-zinc-300 text-[11px] flex items-center justify-between">
            <span>Sincronizar Canales de Chat:</span>
            <span className="text-[10px] text-emerald-400 font-normal">● 100% Gratis</span>
          </div>

          <div>
            <label className="text-[10px] text-zinc-400 block mb-0.5">Twitch (Usuario o Canal):</label>
            <input
              value={twitchChannel}
              onChange={(e) => setTwitchChannel(e.target.value)}
              placeholder="ej. mi_canal (sin #)"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
            />
          </div>

          <div>
            <label className="text-[10px] text-zinc-400 block mb-0.5">YouTube Live (URL o ID del video):</label>
            <input
              value={ytVideoId}
              onChange={(e) => setYtVideoId(e.target.value)}
              placeholder="ej. youtube.com/watch?v=XXXX o el ID"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
            />
          </div>

          <div>
            <label className="text-[10px] text-zinc-400 block mb-0.5">Kick (Usuario de canal):</label>
            <input
              value={kickChannel}
              onChange={(e) => setKickChannel(e.target.value)}
              placeholder="ej. mi_usuario_kick"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
            />
          </div>

          <div>
            <label className="text-[10px] text-zinc-400 block mb-0.5">TikTok Live (@usuario creador):</label>
            <input
              value={tiktokUser}
              onChange={(e) => setTiktokUser(e.target.value)}
              placeholder="ej. @streamer_oficial"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={saveConfig}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded py-1.5 font-bold text-xs shadow"
            >
              Guardar y Conectar Chats
            </button>
            <button
              onClick={() => setShowConfig(false)}
              className="px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded py-1.5 text-xs"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Barra de Filtros con todas las Plataformas */}
      <div className="px-3 py-1.5 border-b border-zinc-800/80 bg-zinc-900/40 flex items-center gap-1 overflow-x-auto text-[10px] no-scrollbar">
        <button
          onClick={() => setFilterPlatform("all")}
          className={`px-2 py-0.5 rounded-full font-semibold whitespace-nowrap transition ${
            filterPlatform === "all" ? "bg-white text-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          Todos ({msgs.length})
        </button>
        <button
          onClick={() => setFilterPlatform("youtube")}
          className={`px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 whitespace-nowrap transition ${
            filterPlatform === "youtube" ? "bg-red-600 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          🔴 YouTube
        </button>
        <button
          onClick={() => setFilterPlatform("twitch")}
          className={`px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 whitespace-nowrap transition ${
            filterPlatform === "twitch" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          🟣 Twitch
        </button>
        <button
          onClick={() => setFilterPlatform("kick")}
          className={`px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 whitespace-nowrap transition ${
            filterPlatform === "kick" ? "bg-emerald-600 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          🟢 Kick
        </button>
        <button
          onClick={() => setFilterPlatform("tiktok")}
          className={`px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 whitespace-nowrap transition ${
            filterPlatform === "tiktok" ? "bg-pink-600 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          🎵 TikTok
        </button>
        <button
          onClick={() => setFilterPlatform("facebook")}
          className={`px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 whitespace-nowrap transition ${
            filterPlatform === "facebook" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          🔵 FB
        </button>
        <button
          onClick={() => setFilterPlatform("instagram")}
          className={`px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 whitespace-nowrap transition ${
            filterPlatform === "instagram" ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          📸 IG
        </button>
      </div>

      {/* Feed de Comentarios */}
      <div ref={scrollRef} className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-center p-4">
            <span className="text-2xl mb-1">💬</span>
            <p className="text-[11px] font-medium text-zinc-400">Esperando comentarios en vivo...</p>
            <p className="text-[10px] text-zinc-600 mt-1 max-w-[240px]">
              Pulsa <b>⚙ Vincular Canales</b> arriba para ingresar tu usuario de Twitch, YouTube, Kick o TikTok.
            </p>
          </div>
        ) : (
          filtered.map((m) => (
            <div
              key={m.id}
              className="group p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 transition flex items-start gap-2 shadow-sm"
            >
              <div className="mt-0.5 shrink-0">{getPlatformBadge(m.platform)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 leading-none mb-1">
                  <span
                    className="font-bold text-[11px] truncate"
                    style={{ color: m.author_color || "#cbd5e1" }}
                  >
                    {m.author_name}
                  </span>
                  {m.is_moderator && (
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded font-bold">MOD</span>
                  )}
                  {m.is_owner && (
                    <span className="text-[9px] bg-red-500/20 text-red-300 px-1 rounded font-bold">HOST</span>
                  )}
                </div>
                <p className="text-zinc-200 text-xs break-words leading-relaxed select-text">
                  {m.message_text}
                </p>
              </div>

              {/* Botón para proyectar mensaje en pantalla */}
              {onHighlightMessage && (
                <button
                  onClick={() => onHighlightMessage(m)}
                  className="opacity-0 group-hover:opacity-100 transition px-1.5 py-0.5 bg-zinc-800 hover:bg-indigo-600 text-[10px] rounded text-zinc-300 hover:text-white shrink-0 font-semibold"
                  title="Mostrar este comentario en la pantalla del stream"
                >
                  ⭐ Proyectar
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input de Anuncios y Moderación del Director */}
      <form onSubmit={sendStudioBroadcast} className="p-2 border-t border-zinc-800 bg-zinc-950/80 flex gap-1.5">
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Escribe un anuncio o mensaje al chat..."
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
