"use client";

export const CRM_CLIENT_SESSION_ID_KEY = "crm-client-session-id";

type SessaoEvento = "login" | "heartbeat" | "logout";

function criarIdSessao() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getClientSessionId() {
  if (typeof window === "undefined") return "";

  const existente = window.sessionStorage.getItem(CRM_CLIENT_SESSION_ID_KEY);
  if (existente) return existente;

  const novoId = criarIdSessao();
  window.sessionStorage.setItem(CRM_CLIENT_SESSION_ID_KEY, novoId);
  return novoId;
}

export function removerClientSessionId() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(CRM_CLIENT_SESSION_ID_KEY);
}

export async function enviarEventoSessao(evento: SessaoEvento) {
  const clientSessionId = getClientSessionId();

  if (!clientSessionId) return;

  await fetch("/api/auth/sessao", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      evento,
      client_session_id: clientSessionId,
    }),
    cache: "no-store",
    keepalive: evento === "logout",
  });
}

export function enviarEventoSessaoBeacon(evento: SessaoEvento) {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) {
    void enviarEventoSessao(evento);
    return;
  }

  const clientSessionId = getClientSessionId();
  if (!clientSessionId) return;

  const body = new Blob(
    [
      JSON.stringify({
        evento,
        client_session_id: clientSessionId,
      }),
    ],
    { type: "application/json" }
  );

  navigator.sendBeacon("/api/auth/sessao", body);
}
