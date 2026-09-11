import { Client as QstashClient } from "@upstash/qstash";

function appUrl() {
  const host =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "";
  if (!host) return "";
  return (host.startsWith("http") ? host : `https://${host}`).replace(/\/$/, "");
}

function workerUrl() {
  return (
    process.env.QSTASH_AGENTE_IA_WORKER_URL?.trim() ||
    (appUrl() ? `${appUrl()}/api/worker/processar-agente-ia` : "")
  );
}

export async function publicarPendenciaAgenteIaQstash(
  pendenciaId: string,
  delayMs: number
) {
  const token = process.env.QSTASH_TOKEN?.trim();
  const url = workerUrl();
  if (!token || !url) return false;

  try {
    const cliente = new QstashClient({ token });
    await cliente.publishJSON({
      url,
      body: { pendenciaId },
      delay: Math.max(1, Math.ceil(delayMs / 1000)),
      retries: 3,
    });
    return true;
  } catch (error) {
    console.error("[AGENTE_IA] Falha ao publicar pendência no QStash:", error);
    return false;
  }
}
