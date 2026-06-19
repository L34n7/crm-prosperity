"use client";

export const CRM_CLIENT_SESSION_ID_KEY = "crm-client-session-id";
const CRM_SESSION_LAST_ACTIVITY_SYNC_KEY = "crm-session-last-activity-sync-at";
const SESSION_ACTIVITY_THROTTLE_MS = 15 * 60_000;

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
  window.sessionStorage.removeItem(CRM_SESSION_LAST_ACTIVITY_SYNC_KEY);
}

function getUltimaSincronizacaoAtividade() {
  if (typeof window === "undefined") return 0;

  const valor = Number(
    window.sessionStorage.getItem(CRM_SESSION_LAST_ACTIVITY_SYNC_KEY) || 0
  );

  return Number.isFinite(valor) ? valor : 0;
}

function salvarSincronizacaoAtividade(timestamp = Date.now()) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    CRM_SESSION_LAST_ACTIVITY_SYNC_KEY,
    String(timestamp)
  );
}

export async function enviarEventoSessao(evento: SessaoEvento) {
  const clientSessionId = getClientSessionId();

  if (!clientSessionId) return;

  const res = await fetch("/api/auth/sessao", {
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

  if (res.ok && evento !== "logout") {
    salvarSincronizacaoAtividade();
  }
}

export async function registrarAtividadeSessao() {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return;
  }

  const agora = Date.now();
  const ultimaSincronizacao = getUltimaSincronizacaoAtividade();

  if (agora - ultimaSincronizacao < SESSION_ACTIVITY_THROTTLE_MS) {
    return;
  }

  salvarSincronizacaoAtividade(agora);
  await enviarEventoSessao("heartbeat");
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
