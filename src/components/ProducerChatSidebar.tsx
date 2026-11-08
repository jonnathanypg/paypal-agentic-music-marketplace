"use client";

/**
 * ProducerChatSidebar.tsx — Agente de Producción Autónomo "Director"
 * =====================================================================
 * Sidebar derecho para el panel de administradores/productores.
 * A diferencia del AIChatSidebar (consumidor), este agente:
 *  - Controla operaciones reales de producción (macro/micro-ops)
 *  - Navega la UI del dashboard sin recargar la página
 *  - Muestra progreso en tiempo real vía SSE (Server-Sent Events)
 *  - Renderiza widgets interactivos según el contexto (Pexels grid, task progress, etc.)
 *  - Solo disponible para super_admin y tools_admin
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  isStreaming?: boolean;
  widget?: WidgetData;
}

interface WidgetData {
  type: "task_progress" | "pexels_grid" | "micro_op_request" | "media_summary" | "task_list";
  data: Record<string, unknown>;
}

interface TaskProgressWidget {
  taskId: string;
  operation: string;
  topic?: string;
  progress?: number;
  status?: string;
  navigate?: string;
}

interface PexelsResult {
  id: number;
  url: string;
  thumb: string;
  photographer: string;
  alt: string;
}

interface MicroOpRequest {
  tool: string;
  description: string;
  params?: Record<string, unknown>;
}

interface ActiveTask {
  id: string;
  name: string;
  status: string;
}

interface ProducerChatSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  currentPath?: string;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IconDirector = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
  </svg>
);

const IconSend = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

const IconClose = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const IconMic = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
  </svg>
);

const IconMicOff = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3 3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
  </svg>
);

const IconSpinner = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
    </path>
  </svg>
);

const IconPlay = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const IconTask = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
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

// ─── Initial Message ──────────────────────────────────────────────────────────

const INITIAL_MESSAGE: Message = {
  id: "init",
  sender: "bot",
  text:
    "¡Listo para producir! Soy Director, tu agente de producción autónomo.\n\n" +
    "Puedo ayudarte con:\n" +
    "• Generar audiolibros, Shorts y animaciones\n" +
    "• Editar audio/video con micro-operaciones FFmpeg\n" +
    "• Buscar B-Roll en Pexels\n" +
    "• Navegar el dashboard y monitorear tareas\n" +
    "• Controlar todo el proceso de producción\n\n" +
    "¿Qué vamos a producir hoy?",
};

// ─── Sub-components: Widgets ──────────────────────────────────────────────────

function TaskProgressWidget({ data, onNavigate }: { data: TaskProgressWidget; onNavigate: (path: string) => void }) {
  const [progress, setProgress] = useState(data.progress || 0);
  const [status, setStatus] = useState(data.status || "PENDING");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!data.taskId) return;

    const es = new EventSource(`/api/producer/task-stream/${data.taskId}`, {
    });
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        const s = parsed.status || "PENDING";
        setStatus(s);

        if (typeof parsed.progress === "number") {
          setProgress(parsed.progress);
        } else if (typeof parsed.current === "number" && typeof parsed.total === "number") {
          setProgress(Math.round((parsed.current / parsed.total) * 100));
        }

        if (s === "SUCCESS" || s === "DONE") {
          setProgress(100);
          setResult(parsed.result || {});
          es.close();
        } else if (s === "FAILURE" || s === "ERROR" || s === "STREAM_CLOSED") {
          es.close();
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [data.taskId]);

  const statusColor =
    status === "SUCCESS" || status === "DONE"
      ? "#22c55e"
      : status === "FAILURE" || status === "ERROR"
      ? "#ef4444"
      : "#7c3aed";

  return (
    <div
      style={{
        background: "rgba(124, 58, 237, 0.08)",
        border: "1px solid rgba(124, 58, 237, 0.25)",
        borderRadius: "12px",
        padding: "14px",
        marginTop: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <IconTask size={14} />
        <span style={{ fontSize: "12px", fontWeight: 600, color: "#c4b5fd" }}>
          {data.operation?.replace(/_/g, " ").toUpperCase() || "TAREA"}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "10px",
            padding: "2px 8px",
            borderRadius: "100px",
            background: statusColor + "22",
            color: statusColor,
            fontWeight: 700,
          }}
        >
          {status}
        </span>
      </div>

      {data.topic && (
        <p style={{ fontSize: "12px", color: "#a0a0c0", marginBottom: "10px", lineHeight: 1.4 }}>
          {data.topic}
        </p>
      )}

      {/* Progress Bar */}
      <div
        style={{
          height: "6px",
          background: "rgba(255,255,255,0.06)",
          borderRadius: "100px",
          overflow: "hidden",
          marginBottom: "10px",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: `linear-gradient(90deg, #7c3aed, #06b6d4)`,
            borderRadius: "100px",
            transition: "width 0.5s ease",
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "11px", color: "#6b7280" }}>
          Task ID: {data.taskId?.slice(0, 8)}...
        </span>
        {data.navigate && (
          <button
            onClick={() => onNavigate(data.navigate!)}
            style={{
              fontSize: "11px",
              padding: "4px 10px",
              borderRadius: "6px",
              background: "rgba(124, 58, 237, 0.2)",
              border: "1px solid rgba(124, 58, 237, 0.3)",
              color: "#c4b5fd",
              cursor: "pointer",
            }}
          >
            Ver →
          </button>
        )}
      </div>

      {result && (status === "SUCCESS" || status === "DONE") && (
        <div
          style={{
            marginTop: "10px",
            padding: "8px",
            background: "rgba(34, 197, 94, 0.08)",
            border: "1px solid rgba(34, 197, 94, 0.2)",
            borderRadius: "8px",
            fontSize: "11px",
            color: "#86efac",
          }}
        >
          ✅ Completado exitosamente
        </div>
      )}
    </div>
  );
}

function PexelsGridWidget({
  results,
  query,
}: {
  results: PexelsResult[];
  query: string;
}) {
  return (
    <div style={{ marginTop: "8px" }}>
      <p style={{ fontSize: "11px", color: "#6b7280", marginBottom: "8px" }}>
        Resultados Pexels para: &ldquo;{query}&rdquo;
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "4px",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        {results.slice(0, 9).map((item) => (
          <div
            key={item.id}
            style={{ position: "relative", aspectRatio: "1", overflow: "hidden", cursor: "pointer" }}
            title={item.alt || item.photographer}
          >
            <img
              src={item.thumb}
              alt={item.alt || "Pexels photo"}
              style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.2s" }}
              onMouseEnter={(e) =>
                ((e.target as HTMLImageElement).style.transform = "scale(1.05)")
              }
              onMouseLeave={(e) =>
                ((e.target as HTMLImageElement).style.transform = "scale(1)")
              }
            />
          </div>
        ))}
      </div>
      <p style={{ fontSize: "10px", color: "#4b5563", marginTop: "6px", textAlign: "right" }}>
        Fotos por Pexels
      </p>
    </div>
  );
}

function MicroOpRequestWidget({
  data,
  onFileSelect,
}: {
  data: MicroOpRequest;
  onFileSelect: (tool: string, params: Record<string, unknown>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{
        background: "rgba(6, 182, 212, 0.08)",
        border: "1px solid rgba(6, 182, 212, 0.25)",
        borderRadius: "12px",
        padding: "14px",
        marginTop: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <IconVolumeUp size={14} />
        <span style={{ fontSize: "12px", fontWeight: 600, color: "#67e8f9" }}>
          MICRO-OPERACIÓN
        </span>
      </div>
      <p style={{ fontSize: "12px", color: "#a0a0c0", marginBottom: "12px", lineHeight: 1.4 }}>
        {data.description}
      </p>
      <p style={{ fontSize: "11px", color: "#6b7280", marginBottom: "10px" }}>
        Herramienta: <code style={{ color: "#67e8f9" }}>{data.tool}</code>
      </p>
      <button
        onClick={() => fileInputRef.current?.click()}
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: "8px",
          background: "rgba(6, 182, 212, 0.15)",
          border: "1px dashed rgba(6, 182, 212, 0.4)",
          color: "#67e8f9",
          fontSize: "12px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
        }}
      >
        📁 Seleccionar archivo para procesar
      </button>
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        accept="audio/*,video/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onFileSelect(data.tool, { ...data.params, file_name: file.name });
          }
        }}
      />
    </div>
  );
}

function TaskListWidget({ tasks }: { tasks: ActiveTask[] }) {
  return (
    <div
      style={{
        background: "rgba(245, 158, 11, 0.06)",
        border: "1px solid rgba(245, 158, 11, 0.2)",
        borderRadius: "12px",
        padding: "12px",
        marginTop: "8px",
      }}
    >
      <p style={{ fontSize: "11px", color: "#fbbf24", fontWeight: 600, marginBottom: "8px" }}>
        ⚡ {tasks.length} TAREA{tasks.length !== 1 ? "S" : ""} ACTIVA{tasks.length !== 1 ? "S" : ""}
      </p>
      {tasks.length === 0 ? (
        <p style={{ fontSize: "12px", color: "#6b7280" }}>No hay tareas activas en Celery.</p>
      ) : (
        tasks.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <span style={{ fontSize: "12px", color: "#d1d5db" }}>{t.name}</span>
            <span style={{ fontSize: "10px", color: "#fbbf24" }}>{t.status}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Message bubble component ─────────────────────────────────────────────────

function MessageBubble({
  msg,
  onNavigate,
  onFileSelect,
}: {
  msg: Message;
  onNavigate: (path: string) => void;
  onFileSelect: (tool: string, params: Record<string, unknown>) => void;
}) {
  const isBot = msg.sender === "bot";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isBot ? "row" : "row-reverse",
        alignItems: "flex-start",
        gap: "8px",
        marginBottom: "12px",
        animation: "fadeInUp 0.2s ease",
      }}
    >
      {isBot && (
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: "2px",
          }}
        >
          <IconDirector size={14} />
        </div>
      )}
      <div style={{ maxWidth: "85%", flex: 1 }}>
        <div
          style={{
            padding: "10px 13px",
            borderRadius: isBot ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
            background: isBot
              ? "rgba(124, 58, 237, 0.12)"
              : "rgba(6, 182, 212, 0.15)",
            border: isBot
              ? "1px solid rgba(124, 58, 237, 0.2)"
              : "1px solid rgba(6, 182, 212, 0.2)",
            fontSize: "13px",
            lineHeight: 1.55,
            color: isBot ? "#e2e8f0" : "#f0f9ff",
            whiteSpace: "pre-wrap",
          }}
        >
          {msg.text}
          {msg.isStreaming && (
            <span
              style={{
                display: "inline-block",
                width: "6px",
                height: "14px",
                background: "#7c3aed",
                marginLeft: "3px",
                borderRadius: "2px",
                animation: "blink 0.7s infinite",
              }}
            />
          )}
        </div>

        {/* Widget de la burbuja */}
        {msg.widget && msg.widget.type === "task_progress" && (
          <TaskProgressWidget
            data={msg.widget.data as unknown as TaskProgressWidget}
            onNavigate={onNavigate}
          />
        )}
        {msg.widget && msg.widget.type === "pexels_grid" && (
          <PexelsGridWidget
            results={(msg.widget.data as { results?: PexelsResult[] }).results || []}
            query={(msg.widget.data as { query?: string }).query || ""}
          />
        )}
        {msg.widget && msg.widget.type === "micro_op_request" && (
          <MicroOpRequestWidget
            data={msg.widget.data as unknown as MicroOpRequest}
            onFileSelect={onFileSelect}
          />
        )}
        {msg.widget && msg.widget.type === "task_list" && (
          <TaskListWidget tasks={(msg.widget.data as { tasks?: ActiveTask[] }).tasks || []} />
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProducerChatSidebar({
  isOpen,
  onToggle,
  currentPath,
}: ProducerChatSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("producer_chat_messages");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [INITIAL_MESSAGE];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<unknown>(null);

  // Persist messages
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("producer_chat_messages", JSON.stringify(messages));
    }
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const addMessage = useCallback((msg: Omit<Message, "id">) => {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((prev) => [...prev, { ...msg, id }]);
    return id;
  }, []);

  const handleNavigate = useCallback(
    (path: string) => {
      router.push(path);
    },
    [router]
  );

  const handleFileSelect = useCallback(
    async (tool: string, params: Record<string, unknown>) => {
      addMessage({
        sender: "bot",
        text: `Operación ${tool} registrada. En una próxima versión procesará el archivo automáticamente.`,
      });
    },
    [addMessage]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      setInput("");
      setLoading(true);

      addMessage({ sender: "user", text: text.trim() });

      const botMsgId = `bot-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: botMsgId,
          sender: "bot",
          text: "",
          isStreaming: true,
        },
      ]);

      try {
        const history = messages.slice(-8).map((m) => ({
          sender: m.sender,
          text: m.text,
        }));

        const res = await fetch("/api/producer/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            message: text.trim(),
            conversation_history: history,
            current_path: currentPath || pathname,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Error desconocido" }));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMsgId
                ? {
                    ...m,
                    text: `Error: ${err.detail || res.statusText}`,
                    isStreaming: false,
                  }
                : m
            )
          );
          return;
        }

        const data = await res.json();
        const responseText: string = data.response || "Operación ejecutada.";
        const action: string | null = data.action || null;
        const actionData: Record<string, unknown> = data.action_data || {};
        const taskId: string | null = data.task_id || null;

        // Determinar widget según la acción
        let widget: WidgetData | undefined;

        if (action === "task_started") {
          widget = {
            type: "task_progress",
            data: {
              taskId: taskId || actionData.task_id,
              operation: (actionData.operation as string) || "task",
              topic: actionData.topic as string | undefined,
              navigate: actionData.navigate as string | undefined,
              status: "PENDING",
              progress: 0,
            },
          };
          // Navegar automáticamente si se especifica
          if (actionData.navigate && typeof actionData.navigate === "string") {
            setTimeout(() => handleNavigate(actionData.navigate as string), 1200);
          }
        } else if (action === "show_pexels_results") {
          widget = {
            type: "pexels_grid",
            data: {
              results: (actionData.results as PexelsResult[]) || [],
              query: (actionData.query as string) || "",
            },
          };
        } else if (action === "request_micro_op") {
          widget = {
            type: "micro_op_request",
            data: {
              tool: (actionData.tool as string) || "",
              description: (actionData.description as string) || "",
              params: (actionData.params as Record<string, unknown>) || {},
            },
          };
        } else if (action === "show_tasks") {
          widget = {
            type: "task_list",
            data: {
              tasks: (actionData.tasks as ActiveTask[]) || [],
            },
          };
          if (actionData.navigate) {
            setTimeout(() => handleNavigate(actionData.navigate as string), 800);
          }
        } else if (action === "navigate") {
          const navPath = (actionData.path as string) || "/studio";
          setTimeout(() => handleNavigate(navPath), 500);
        } else if (action === "open_section") {
          // Emitir evento custom para que la página abra el panel correcto
          window.dispatchEvent(
            new CustomEvent("producer:open_section", {
              detail: { section: actionData.section },
            })
          );
        } else if (action === "show_media") {
          if (actionData.navigate) {
            setTimeout(() => handleNavigate(actionData.navigate as string), 800);
          }
        }

        // Limpiar bloques JSON markdown de la respuesta de texto para que no se muestren al usuario
        let cleanedText = responseText;
        cleanedText = cleanedText.replace(/```json[\s\S]*?```/g, "");
        cleanedText = cleanedText.replace(/```[\s\S]*?```/g, ""); // limpieza fallback de cualquier bloque general
        cleanedText = cleanedText.trim();

        // Actualizar el mensaje del bot
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMsgId
              ? { ...m, text: cleanedText, isStreaming: false, widget }
              : m
          )
        );

        // TTS si está habilitado
        if (voiceEnabled && responseText) {
          fetch("/api/tts/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: responseText.substring(0, 400),
              voice: "es-MX-JorgeNeural",
            }),
          }).then(async (r) => {
            if (r.ok) {
              const blob = await r.blob();
              const url = URL.createObjectURL(blob);
              const audio = new Audio(url);
              audio.play().catch(() => {});
              audio.onended = () => URL.revokeObjectURL(url);
            }
          }).catch(() => {});
        }
      } catch (e) {
        console.error("Producer chat error:", e);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMsgId
              ? {
                  ...m,
                  text: "Error de conexión. Verifica que el backend esté corriendo.",
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, addMessage, currentPath, pathname, handleNavigate, voiceEnabled]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const toggleVoiceInput = useCallback(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening) {
      (recognitionRef.current as { stop: () => void } | null)?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new (SpeechRecognition as new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: (e: { results: SpeechRecognitionResultList }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    })();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "es-MX";
    recognition.onresult = (e: { results: SpeechRecognitionResultList }) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, [isListening]);

  const clearHistory = () => {
    setMessages([INITIAL_MESSAGE]);
    sessionStorage.removeItem("producer_chat_messages");
  };

  // Quick action suggestions
  const quickActions = [
    { label: "📚 Audiobook", msg: "Genera un audiolibro sobre productividad de 30 minutos" },
    { label: "🎬 Short", msg: "Crea un short de video sobre tecnología en español" },
    { label: "🎨 Animación", msg: "Genera una animación sobre inteligencia artificial" },
    { label: "📁 Pexels", msg: "Busca B-Roll de naturaleza y montañas" },
    { label: "⚡ Tareas", msg: "Muéstrame las tareas activas en el sistema" },
    { label: "🔊 Normalizar", msg: "Necesito normalizar el audio de un archivo a -14 LUFS" },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* CSS Animations */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
        .producer-sidebar-scrollbar::-webkit-scrollbar { width: 4px; }
        .producer-sidebar-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(124, 58, 237, 0.3);
          border-radius: 100px;
        }
        .producer-quick-btn:hover {
          background: rgba(124, 58, 237, 0.15) !important;
          border-color: rgba(124, 58, 237, 0.4) !important;
        }
        .producer-send-btn:hover {
          background: linear-gradient(135deg, #7c3aed, #06b6d4) !important;
          transform: scale(1.05);
        }
      `}</style>

      {/* Floating Toggle Button (when closed) */}
      {!isOpen && (
        <button
          onClick={onToggle}
          title="Abrir Director AI"
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.04)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
            zIndex: 1000,
            transition: "transform 0.2s, border-color 0.2s, background-color 0.2s",
            color: "rgba(255, 255, 255, 0.8)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 255, 255, 0.15)";
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255, 255, 255, 0.08)";
            (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255, 255, 255, 0.08)";
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255, 255, 255, 0.04)";
            (e.currentTarget as HTMLButtonElement).style.color = "rgba(255, 255, 255, 0.8)";
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
          </svg>
          {/* Dot indicator */}
          <span
            style={{
              position: "absolute",
              top: "4px",
              right: "4px",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#22c55e",
              border: "2px solid #0a0a1a",
            }}
          />
        </button>
      )}

      {/* Sidebar Panel */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "380px",
            zIndex: 900,
            display: "flex",
            flexDirection: "column",
            background: "rgba(10, 10, 26, 0.97)",
            backdropFilter: "blur(24px)",
            borderLeft: "1px solid rgba(124, 58, 237, 0.2)",
            boxShadow: "-8px 0 40px rgba(0,0,0,0.6)",
            animation: "slideInRight 0.25s ease",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px 18px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(124, 58, 237, 0.08)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                position: "relative",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
              </svg>
              <span
                style={{
                  position: "absolute",
                  bottom: "0",
                  right: "0",
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#22c55e",
                  border: "2px solid #0a0a1a",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                Director AI
              </div>
              <div style={{ fontSize: "11px", color: "#7c3aed" }}>
                Agente de Producción Autónomo
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {/* Voice toggle */}
              <button
                onClick={() => setVoiceEnabled((v) => !v)}
                title={voiceEnabled ? "Desactivar lectura por voz" : "Activar lectura por voz"}
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "8px",
                  background: voiceEnabled
                    ? "rgba(124, 58, 237, 0.3)"
                    : "rgba(255,255,255,0.05)",
                  border: `1px solid ${voiceEnabled ? "rgba(124,58,237,0.5)" : "rgba(255,255,255,0.08)"}`,
                  color: voiceEnabled ? "#c4b5fd" : "#6b7280",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {voiceEnabled ? <IconVolumeUp size={14} /> : <IconVolumeMute size={14} />}
              </button>
              {/* Clear */}
              <button
                onClick={clearHistory}
                title="Limpiar historial"
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "#6b7280",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                }}
              >
                🗑️
              </button>
              {/* Close */}
              <button
                onClick={onToggle}
                title="Cerrar"
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "#9ca3af",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <IconClose size={14} />
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          {messages.length <= 1 && (
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                flexShrink: 0,
              }}
            >
              {quickActions.map((qa) => (
                <button
                  key={qa.label}
                  className="producer-quick-btn"
                  onClick={() => sendMessage(qa.msg)}
                  style={{
                    fontSize: "11px",
                    padding: "5px 10px",
                    borderRadius: "100px",
                    background: "rgba(124, 58, 237, 0.08)",
                    border: "1px solid rgba(124, 58, 237, 0.2)",
                    color: "#a78bfa",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {qa.label}
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          <div
            className="producer-sidebar-scrollbar"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
            }}
          >
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onNavigate={handleNavigate}
                onFileSelect={handleFileSelect}
              />
            ))}
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingLeft: "36px" }}>
                <div
                  style={{
                    display: "flex",
                    gap: "4px",
                    padding: "10px 14px",
                    background: "rgba(124, 58, 237, 0.08)",
                    borderRadius: "4px 14px 14px 14px",
                    border: "1px solid rgba(124, 58, 237, 0.15)",
                  }}
                >
                  {[0, 0.15, 0.3].map((delay, i) => (
                    <span
                      key={i}
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#7c3aed",
                        animation: `blink 1s infinite ${delay}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div
            style={{
              padding: "16px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(10, 10, 26, 0.98)",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <textarea
                ref={inputRef as unknown as React.RefObject<HTMLTextAreaElement>}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown as unknown as React.KeyboardEventHandler<HTMLTextAreaElement>}
                placeholder="Escribe una instrucción de producción..."
                rows={2}
                style={{
                  flex: 1,
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(124, 58, 237, 0.2)",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  outline: "none",
                  color: "#f0f0f5",
                  fontSize: "13px",
                  resize: "none",
                  lineHeight: 1.5,
                  fontFamily: "inherit",
                  height: "auto",
                  minHeight: "54px",
                  maxHeight: "160px",
                  overflowY: "auto",
                  transition: "border-color 0.2s",
                }}
                className="producer-sidebar-scrollbar"
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
                }}
              />
              
              {/* Voice input */}
              <button
                onClick={toggleVoiceInput}
                title={isListening ? "Detener grabación" : "Dictar por voz"}
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "12px",
                  background: isListening
                    ? "rgba(239, 68, 68, 0.2)"
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isListening ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.06)"}`,
                  color: isListening ? "#f87171" : "#a1a1aa",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.15s",
                }}
              >
                {isListening ? <IconMicOff size={16} /> : <IconMic size={16} />}
              </button>

              {/* Send button */}
              <button
                className="producer-send-btn"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "12px",
                  background:
                    input.trim() && !loading
                      ? "rgba(124, 58, 237, 0.4)"
                      : "rgba(255,255,255,0.04)",
                  border: `1px solid ${input.trim() && !loading ? "rgba(124,58,237,0.5)" : "rgba(255,255,255,0.06)"}`,
                  color: input.trim() && !loading ? "#c4b5fd" : "#4b5563",
                  cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.15s",
                }}
              >
                {loading ? <IconSpinner size={16} /> : <IconSend size={16} />}
              </button>
            </div>
            <p
              style={{
                fontSize: "10px",
                color: "rgba(255,255,255,0.2)",
                textAlign: "center",
                marginTop: "8px",
              }}
            >
              Director AI · Solo accesible por Administradores de Producción
            </p>
          </div>
        </div>
      )}
    </>
  );
}
