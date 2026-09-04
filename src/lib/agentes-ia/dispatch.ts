import { Client as QstashClient } from "@upstash/qstash";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AutomationEngineInput } from "@/lib/automacoes/types";
import { processarPendenciaAgenteIa } from "./processar-pendencia-configurada";
import { calcularDebounceAdaptativo } from "./protecao-automacao-externa";

const supabaseAdmin = getSupabaseAdmin();

type AgenteDespacho = {
  id: string;
  debounce_ms?: number | null;
};

type PendenciaRow = { id: string };

function numeroInteiro(valor: unknown, fallback: number, minimo: number, maximo: number) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return fallback;
  return Math.min(maximo, Math.max(minimo, Math.floor(numero)));
}

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

async function publicarPendenciaQstash(pendenciaId: string, delayMs: number) {
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

async function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cancelarFluxosConversacionaisAtivos(empresaId: string, conversaId: string) {
  const { data: execucoes, error } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, metadata_json")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", ["rodando", "aguardando"]);
  if (error) throw new Error(error.message);

  const agora = new Date().toISOString();
  for (const execucao of execucoes || []) {
    await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        status: "cancelado",
        finished_at: agora,
        updated_at: agora,
        metadata_json: {
          ...(execucao.metadata_json || {}),
          motivo_cancelamento: "agente_ia_assumiu_conversa",
          cancelado_em: agora,
        },
      })
      .eq("empresa_id", empresaId)
      .eq("id", execucao.id)
      .in("status", ["rodando", "aguardando"]);

    await supabaseAdmin
      .from("automacao_agendamentos")
      .update({ status: "cancelado" })
      .eq("empresa_id", empresaId)
      .eq("execucao_id", execucao.id)
      .eq("status", "pendente");
  }
}

async function protocoloAtivoDaConversa(empresaId: string, conversaId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id || null;
}

export async function despacharMensagemParaAgente(params: {
  input: AutomationEngineInput;
  agente: AgenteDespacho;
  contatoId?: string | null;
}) {
  const texto = String(params.input.mensagemTexto || "").trim();
  const mensagemId = String(params.input.mensagemId || "").trim() || null;
  if (!texto || !mensagemId) return null;

  await cancelarFluxosConversacionaisAtivos(
    params.input.empresaId,
    params.input.conversaId
  );

  const protocoloId = await protocoloAtivoDaConversa(
    params.input.empresaId,
    params.input.conversaId
  );
  const agora = new Date().toISOString();

  const { error: conversaError } = await supabaseAdmin
    .from("conversas")
    .update({
      status: "bot",
      bot_ativo: true,
      aguardando_atendente: false,
      origem_atendimento: "bot",
      responsavel_id: null,
      agente_ia_id: params.agente.id,
      agente_ia_protocolo_id: protocoloId,
      agente_ia_fallback_ativo: false,
      closed_at: null,
      updated_at: agora,
    })
    .eq("id", params.input.conversaId)
    .eq("empresa_id", params.input.empresaId);
  if (conversaError) throw new Error(conversaError.message);

  const debounceBaseMs = numeroInteiro(params.agente.debounce_ms, 1200, 250, 10000);
  const debounce = await calcularDebounceAdaptativo({
    empresaId: params.input.empresaId,
    conversaId: params.input.conversaId,
    debounceBaseMs,
    mensagemTipo: params.input.mensagemTipo || null,
  });
  const debounceMs = debounce.debounceMs;

  const { data: pendencia, error: pendenciaError } = await supabaseAdmin.rpc(
    "agente_ia_enfileirar_mensagem",
    {
      p_empresa_id: params.input.empresaId,
      p_agente_id: params.agente.id,
      p_conversa_id: params.input.conversaId,
      p_contato_id: params.input.contatoId || params.contatoId || null,
      p_numero_destino: params.input.numeroDestino || "",
      p_mensagem_id: mensagemId,
      p_conteudo: texto,
      p_debounce_ms: debounceMs,
    }
  );

  if (pendenciaError || !pendencia) {
    console.error("[AGENTE_IA] Erro ao enfileirar mensagem:", pendenciaError);
    return null;
  }

  const pendenciaId = (pendencia as PendenciaRow).id;
  const publicou = await publicarPendenciaQstash(pendenciaId, debounceMs);
  if (!publicou) {
    await esperar(debounceMs + 50);
    await processarPendenciaAgenteIa(pendenciaId, { forcar: true }).catch((error) =>
      console.error("[AGENTE_IA] Falha no processamento inline:", error)
    );
  }

  return {
    ok: true,
    status: "agente_ia_agendado",
    agenteId: params.agente.id,
    pendenciaId,
    debounceMs,
    debounceAdaptativo: debounce.adaptado,
    debounceMotivo: debounce.motivo,
  };
}
