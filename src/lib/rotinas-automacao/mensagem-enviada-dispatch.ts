import { qstash } from "@/lib/qstash/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

function baseUrl() {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_APP_URL;
  if (!host) return "";
  return (host.startsWith("http") ? host : `https://${host}`).replace(/\/$/, "");
}

function workerUrl() {
  const configured = String(process.env.QSTASH_ROTINA_MENSAGEM_WORKER_URL || "").trim();
  if (configured) return configured;
  const base = baseUrl();
  return base ? `${base}/api/worker/processar-evento-mensagem-rotina` : "";
}

async function publicar(params: { empresaId: string; conversaId: string; mensagemId: string }) {
  const url = workerUrl();
  if (!process.env.QSTASH_TOKEN || !url || !params.mensagemId) {
    return { ok: false as const, messageId: null, motivo: "qstash_indisponivel" };
  }
  try {
    const result = await qstash.publishJSON({
      url,
      body: { evento: "mensagem.enviada", ...params },
      retries: 3,
      retryDelay: "30000 * (1 + retried)",
      timeout: 30,
      deduplicationId: `rotina-mensagem-enviada-${params.mensagemId}`,
      label: "rotina-mensagem-enviada",
    });
    const qstashMessageId =
      result && typeof result === "object" && "messageId" in result
        ? String(result.messageId || "").trim() || null
        : null;
    return { ok: true as const, messageId: qstashMessageId, motivo: null };
  } catch (error) {
    console.error("[ROTINA_AUTOMACAO] Falha ao publicar mensagem enviada:", error);
    return { ok: false as const, messageId: null, motivo: "falha_publicacao" };
  }
}

export async function publicarMensagemEnviadaRegistrada(params: {
  empresaId: string;
  conversaId: string;
  mensagemId: string;
}) {
  const { data: outbox, error } = await supabase
    .from("rotina_mensagem_saida_outbox")
    .select("id,status")
    .eq("empresa_id", params.empresaId)
    .eq("mensagem_id", params.mensagemId)
    .maybeSingle();
  if (error) {
    console.error("[ROTINA_AUTOMACAO] Falha ao verificar assinatura da mensagem enviada:", error);
    return { ok: false as const, ignorado: false, motivo: "falha_outbox" };
  }
  if (!outbox || outbox.status !== "pendente") {
    return { ok: true as const, ignorado: true, motivo: "sem_automacao_ativa" };
  }

  const resultado = await publicar(params);
  if (resultado.ok) {
    await supabase
      .from("rotina_mensagem_saida_outbox")
      .update({
        qstash_message_id: resultado.messageId,
        qstash_publicado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", outbox.id);
  }
  return { ...resultado, ignorado: false };
}

export async function republicarMensagensEnviadasPendentes(params: {
  limite?: number;
  idadeMinimaSegundos?: number;
} = {}) {
  const limite = Math.min(Math.max(Number(params.limite || 10), 1), 25);
  const idade = Math.min(Math.max(Number(params.idadeMinimaSegundos || 90), 30), 600);
  const antesDe = new Date(Date.now() - idade * 1000).toISOString();

  const { data, error } = await supabase
    .from("rotina_mensagem_saida_outbox")
    .select("id,empresa_id,conversa_id,mensagem_id")
    .eq("status", "pendente")
    .lt("updated_at", antesDe)
    .order("created_at", { ascending: true })
    .limit(limite);
  if (error) throw error;

  let republicados = 0;
  let falhas = 0;
  for (const item of data || []) {
    const resultado = await publicar({
      empresaId: item.empresa_id,
      conversaId: item.conversa_id,
      mensagemId: item.mensagem_id,
    });
    if (resultado.ok) {
      republicados += 1;
      await supabase
        .from("rotina_mensagem_saida_outbox")
        .update({
          qstash_message_id: resultado.messageId,
          qstash_publicado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
    } else {
      falhas += 1;
    }
  }
  return { buscados: data?.length || 0, republicados, falhas };
}
