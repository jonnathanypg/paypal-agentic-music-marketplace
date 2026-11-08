/**
 * useTaskStream.ts — Hook para monitoreo de tareas Celery en tiempo real (SSE)
 * ==============================================================================
 * Abre un canal de Server-Sent Events al endpoint /api/producer/task-stream/{taskId}
 * y actualiza el estado reactivo con el progreso de la tarea.
 * 
 * Uso:
 * ```tsx
 * const { status, progress, result, error } = useTaskStream(taskId);
 * ```
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type TaskStatus =
  | "PENDING"
  | "STARTED"
  | "PROGRESS"
  | "SUCCESS"
  | "DONE"
  | "FAILURE"
  | "ERROR"
  | "PAUSED"
  | "STREAM_CLOSED"
  | "IDLE";

export interface TaskStreamState {
  status: TaskStatus;
  progress: number;
  message?: string;
  result?: Record<string, unknown>;
  error?: string;
  isComplete: boolean;
  isRunning: boolean;
}

const DEFAULT_STATE: TaskStreamState = {
  status: "IDLE",
  progress: 0,
  isComplete: false,
  isRunning: false,
};

/**
 * useTaskStream — Subscribes to real-time task progress via Server-Sent Events.
 * @param taskId - The Celery task ID to monitor. Pass null/undefined to disable.
 * @param onComplete - Optional callback invoked when the task completes successfully.
 * @param onError - Optional callback invoked when the task fails.
 */
export function useTaskStream(
  taskId: string | null | undefined,
  options?: {
    onComplete?: (result: Record<string, unknown>) => void;
    onError?: (error: string) => void;
    autoClose?: boolean; // Auto-close SSE when done (default: true)
  }
): TaskStreamState {
  const [state, setState] = useState<TaskStreamState>(DEFAULT_STATE);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { onComplete, onError, autoClose = true } = options || {};

  const closeStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!taskId) {
      setState(DEFAULT_STATE);
      closeStream();
      return;
    }

    // Reset state for new task
    setState({
      status: "PENDING",
      progress: 0,
      isComplete: false,
      isRunning: true,
    });

    closeStream();

    const es = new EventSource(`/api/producer/task-stream/${taskId}`);
    eventSourceRef.current = es;

    es.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const status: TaskStatus = data.status || "PENDING";

        let progress = 0;
        if (typeof data.progress === "number") {
          progress = data.progress;
        } else if (typeof data.current === "number" && typeof data.total === "number" && data.total > 0) {
          progress = Math.round((data.current / data.total) * 100);
        }

        const isComplete = status === "SUCCESS" || status === "DONE";
        const isError = status === "FAILURE" || status === "ERROR";

        setState((prev) => ({
          ...prev,
          status,
          progress: isComplete ? 100 : progress,
          message: data.message || data.step || data.stage || prev.message,
          result: isComplete ? (data.result || {}) : prev.result,
          error: isError ? (data.error || "Error desconocido") : prev.error,
          isComplete,
          isRunning: !isComplete && !isError && status !== "STREAM_CLOSED",
        }));

        if (isComplete) {
          onComplete?.(data.result || {});
          if (autoClose) closeStream();
        } else if (isError) {
          onError?.(data.error || "Task failed");
          if (autoClose) closeStream();
        } else if (status === "STREAM_CLOSED") {
          if (autoClose) closeStream();
        }
      } catch (parseError) {
        console.warn("useTaskStream: Failed to parse SSE event:", parseError);
      }
    };

    es.onerror = () => {
      setState((prev) => ({
        ...prev,
        status: "ERROR",
        error: "Error en la conexión SSE",
        isRunning: false,
        isComplete: false,
      }));
      onError?.("SSE connection error");
      if (autoClose) closeStream();
    };

    return () => {
      closeStream();
    };
  }, [taskId, autoClose, closeStream, onComplete, onError]);

  return state;
}

/**
 * useMultiTaskStream — Monitors multiple tasks simultaneously.
 * Returns a map of taskId -> TaskStreamState.
 */
export function useMultiTaskStream(
  taskIds: string[],
  options?: {
    onAnyComplete?: (taskId: string, result: Record<string, unknown>) => void;
    onAnyError?: (taskId: string, error: string) => void;
  }
): Record<string, TaskStreamState> {
  const [states, setStates] = useState<Record<string, TaskStreamState>>({});
  const eventSourcesRef = useRef<Record<string, EventSource>>({});

  useEffect(() => {
    // Close streams for removed task IDs
    Object.keys(eventSourcesRef.current).forEach((id) => {
      if (!taskIds.includes(id)) {
        eventSourcesRef.current[id].close();
        delete eventSourcesRef.current[id];
      }
    });

    // Open streams for new task IDs
    taskIds.forEach((taskId) => {
      if (eventSourcesRef.current[taskId]) return; // Already subscribed

      setStates((prev) => ({
        ...prev,
        [taskId]: { status: "PENDING", progress: 0, isComplete: false, isRunning: true },
      }));

      const es = new EventSource(`/api/producer/task-stream/${taskId}`);
      eventSourcesRef.current[taskId] = es;

      es.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          const status: TaskStatus = data.status || "PENDING";
          const isComplete = status === "SUCCESS" || status === "DONE";
          const isError = status === "FAILURE" || status === "ERROR";

          let progress = 0;
          if (typeof data.progress === "number") {
            progress = data.progress;
          } else if (data.current && data.total) {
            progress = Math.round((data.current / data.total) * 100);
          }

          setStates((prev) => ({
            ...prev,
            [taskId]: {
              status,
              progress: isComplete ? 100 : progress,
              message: data.message,
              result: isComplete ? data.result : prev[taskId]?.result,
              error: isError ? data.error : prev[taskId]?.error,
              isComplete,
              isRunning: !isComplete && !isError,
            },
          }));

          if (isComplete) {
            options?.onAnyComplete?.(taskId, data.result || {});
            es.close();
            delete eventSourcesRef.current[taskId];
          } else if (isError) {
            options?.onAnyError?.(taskId, data.error || "Task failed");
            es.close();
            delete eventSourcesRef.current[taskId];
          }
        } catch {}
      };

      es.onerror = () => {
        setStates((prev) => ({
          ...prev,
          [taskId]: {
            ...prev[taskId],
            status: "ERROR",
            error: "SSE connection error",
            isRunning: false,
            isComplete: false,
          },
        }));
        es.close();
        delete eventSourcesRef.current[taskId];
      };
    });

    return () => {
      // Cleanup on unmount
      Object.values(eventSourcesRef.current).forEach((es) => es.close());
      eventSourcesRef.current = {};
    };
  }, [taskIds, options]);

  return states;
}
