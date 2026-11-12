"use client";

/**
 * Contexto de página para el copiloto Saori.
 *
 * Cada página registra en qué módulo / sección está el usuario para que el
 * agente pueda responder con precisión y navegar sin adivinar. Se guarda en
 * sessionStorage para sobrevivir a la navegación del App Router.
 */

export type AgentPageContext = {
  module?: string;
  section?: string;
  title?: string;
  path?: string;
  artist_slug?: string;
};

const STORAGE_KEY = "exito_agent_page_context";

let currentContext: AgentPageContext = {};

export function setAgentPageContext(next: AgentPageContext): void {
  currentContext = { ...currentContext, ...next };
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(currentContext));
  } catch {}
  window.dispatchEvent(
    new CustomEvent("exito:agent-context", { detail: currentContext })
  );
}

export function getAgentPageContext(): AgentPageContext {
  if (typeof window === "undefined") return currentContext;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        currentContext = { ...currentContext, ...parsed };
      }
    }
  } catch {}
  return currentContext;
}

export function deriveModule(pathname: string): string {
  if (!pathname) return "home";
  if (pathname === "/") return "home";
  if (pathname.startsWith("/artist-studio")) return "artist-studio";
  if (pathname.startsWith("/portal")) return "portal";
  if (pathname.startsWith("/channel/") || pathname.startsWith("/@")) return "channel";
  if (pathname.startsWith("/login")) return "login";
  if (pathname.startsWith("/shop")) return "shop";
  return "home";
}
