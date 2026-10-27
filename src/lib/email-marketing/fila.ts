import { qstash } from "@/lib/qstash/client";

const MAX_DELAY_SEGUNDOS = 6 * 24 * 60 * 60;

function baseUrlAplicacao() {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (!host) return "";
  return (host.startsWith("http") ? host : "https://" + host).replace(/\/$/, "");
}

export function urlWorkerEmailMarketing() {
  const configurada = process.env.QSTASH_EMAIL_MARKETING_WORKER_URL;
  if (configurada) return configurada;

  const base = baseUrlAplicacao();
  return base ? base + "/api/worker/email-marketing-campanha" : "";
}

export function urlPublicaEmailMarketing() {
  const configurada = process.env.EMAIL_MARKETING_PUBLIC_URL;
  if (configurada) {
    return configurada.replace(/\/$/, "");
  }

  const app = process.env.NEXT_PUBLIC_APP_URL;
  if (app) {
    return (app.startsWith("http") ? app : "https://" + app).replace(/\/$/, "");
  }

  return "https://crmprosperity.com";
}

function extrairMessageId(resultado: unknown) {
  if (!resultado || typeof resultado !== "object") return null;

  const item = resultado as Record<string, unknown>;
  return String(item.messageId || item.message_id || "").trim() || null;
}

export async function publicarCampanhaEmailQstash(params: {
  campanhaId: string;
  executarEm?: string | null;
  dedupeSuffix?: string | null;
}) {
  const url = urlWorkerEmailMarketing();

  if (!process.env.QSTASH_TOKEN || !url) {
    return {
      ok: false as const,
      messageId: null,
      erro: !process.env.QSTASH_TOKEN
        ? "QSTASH_TOKEN ausente."
        : "URL do worker de E-mail Marketing ausente.",
    };
  }

  const agora = Date.now();
  const alvo = params.executarEm
    ? new Date(params.executarEm).getTime()
    : agora + 1000;
  const alvoValido = Number.isFinite(alvo) ? Math.max(alvo, agora + 1000) : agora + 1000;
  const entrega = Math.min(alvoValido, agora + MAX_DELAY_SEGUNDOS * 1000);
  const delay = Math.max(1, Math.ceil((entrega - agora) / 1000));
  const dedupe =
    params.dedupeSuffix ||
    String(Math.floor(alvoValido / 1000));

  try {
    const resultado = await qstash.publishJSON({
      url,
      body: {
        campanhaId: params.campanhaId,
      },
      delay,
      retries: 5,
      retryDelay: "max(30000, pow(2, retried) * 30000)",
      timeout: 120,
      deduplicationId:
        "email-marketing-campanha-" + params.campanhaId + "-" + dedupe,
      flowControl: {
        key: "email-marketing-" + (process.env.VERCEL_ENV || "production"),
        rate: 1,
        period: 1,
        parallelism: 1,
      },
      label: "email-marketing-campanha-" + params.campanhaId,
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
