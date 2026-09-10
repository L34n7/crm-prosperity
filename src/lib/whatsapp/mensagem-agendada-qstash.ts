import { qstash } from "@/lib/qstash/client";

function obterBaseUrlAplicacao() {
  const preview = process.env.VERCEL_ENV !== "production";
  const host = preview
    ? process.env.VERCEL_URL || process.env.NEXT_PUBLIC_APP_URL
    : process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      process.env.VERCEL_URL ||
      process.env.NEXT_PUBLIC_APP_URL;

  if (!host) return "";
  return (host.startsWith("http") ? host : `https://${host}`).replace(/\/$/, "");
}

export function obterUrlWorkerMensagemAgendada() {
  const configurada = process.env.QSTASH_WHATSAPP_MENSAGEM_AGENDADA_WORKER_URL;
  if (configurada) return configurada;

  const base = obterBaseUrlAplicacao();
  return base ? `${base}/api/worker/whatsapp-mensagem-agendada` : "";
}

function extrairMessageId(resultado: unknown) {
  if (!resultado || typeof resultado !== "object") return null;
  const registro = resultado as Record<string, unknown>;
  return String(registro.messageId || registro.message_id || "").trim() || null;
}

export async function publicarMensagemAgendadaQstash(params: {
  agendamentoId: string;
  empresaId: string;
  executarEm: string;
}) {
  const url = obterUrlWorkerMensagemAgendada();
  if (!process.env.QSTASH_TOKEN || !url) {
    return {
      ok: false as const,
      messageId: null,
      modo: "cron_fallback" as const,
      erro: !process.env.QSTASH_TOKEN
        ? "QSTASH_TOKEN ausente."
        : "URL do worker de mensagem agendada ausente.",
    };
  }

  const executarEmMs = new Date(params.executarEm).getTime();
  const delaySegundos = Math.max(
    1,
    Math.ceil((executarEmMs - Date.now()) / 1000)
  );

  try {
    const resultado = await qstash.publishJSON({
      url,
      body: { agendamentoId: params.agendamentoId },
      delay: delaySegundos,
      retries: 2,
      retryDelay: "30000 * (1 + retried)",
      timeout: 60,
      deduplicationId: `whatsapp-mensagem-agendada-${params.agendamentoId}`,
      label: `whatsapp-mensagem-agendada-${params.empresaId}`,
    });

    const messageId = extrairMessageId(resultado);
    if (!messageId) {
      return {
        ok: false as const,
        messageId: null,
        modo: "cron_fallback" as const,
        erro: "QStash não retornou messageId.",
      };
    }

    return {
      ok: true as const,
      messageId,
      modo: "qstash" as const,
      erro: null,
    };
  } catch (error) {
    return {
      ok: false as const,
      messageId: null,
      modo: "cron_fallback" as const,
      erro:
        error instanceof Error
          ? error.message
          : "Falha ao publicar mensagem agendada no QStash.",
    };
  }
}
