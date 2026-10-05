import { qstash } from "@/lib/qstash/client";

export type EventoAgendadoTipo =
  | "conversa_expirar"
  | "agenda_execucao"
  | "agenda_resposta"
  | "google_fila"
  | "google_integracao"
  | "integracao_outbox"
  | "rotina_job"
  | "checkout_recuperacao"
  | "checkout_expiracao";

function baseUrlAplicacao() {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (!host) return "";
  return (host.startsWith("http") ? host : `https://${host}`).replace(/\/$/, "");
}

export function urlWorkerEventoAgendado() {
  const configurada = process.env.QSTASH_EVENTOS_DB_WORKER_URL;
  if (configurada) return configurada;
  const base = baseUrlAplicacao();
  return base ? `${base}/api/worker/processar-evento-agendado` : "";
}

function extrairMessageId(resultado: unknown) {
  if (!resultado || typeof resultado !== "object") return null;
  const item = resultado as Record<string, unknown>;
  return String(item.messageId || item.message_id || "").trim() || null;
}

function maxDelaySegundos() {
  const configurado = Number(process.env.QSTASH_MAX_DELAY_SECONDS);
  if (Number.isFinite(configurado) && configurado >= 60) {
    return Math.floor(configurado);
  }
  return 6 * 24 * 60 * 60;
}

export async function publicarEventoAgendadoQstash(params: {
  tipo: EventoAgendadoTipo;
  id: string;
  executarEm?: string | null;
  etapa?: number;
}) {
  const url = urlWorkerEventoAgendado();
  if (!process.env.QSTASH_TOKEN || !url) {
    return {
      ok: false as const,
      messageId: null,
      erro: !process.env.QSTASH_TOKEN
        ? "QSTASH_TOKEN ausente."
        : "URL do worker de eventos ausente.",
    };
  }

  const agoraMs = Date.now();
  const alvoMs = params.executarEm
    ? new Date(params.executarEm).getTime()
    : agoraMs;
  const alvoValido = Number.isFinite(alvoMs) ? alvoMs : agoraMs;
  const maximoMs = agoraMs + maxDelaySegundos() * 1000;
  const entregaMs = Math.min(Math.max(alvoValido, agoraMs), maximoMs);
  const delaySegundos = Math.max(1, Math.ceil((entregaMs - agoraMs) / 1000));
  const etapa = Math.max(0, Math.floor(Number(params.etapa || 0)));
  const alvoChave = Math.floor(alvoValido / 1000);

  try {
    const resultado = await qstash.publishJSON({
      url,
      body: {
        tipo: params.tipo,
        id: params.id,
        executarEm: params.executarEm || null,
        etapa,
      },
      delay: delaySegundos,
      retries: 3,
      retryDelay: "max(30000, pow(2, retried) * 30000)",
      timeout: 120,
      deduplicationId:
        `crm-evento-${params.tipo}-${params.id}-${alvoChave}-${etapa}`,
      label: `crm-evento-${params.tipo}`,
    });

    return {
      ok: true as const,
      messageId: extrairMessageId(resultado),
      erro: null,
    };
  } catch (error) {
    return {
      ok: false as const,
      messageId: null,
      erro: error instanceof Error ? error.message : String(error),
    };
  }
}
