import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cancelarFollowupsPendentesAgenteIa } from "@/lib/agentes-ia/followup-inatividade";
import {
  assumirAtendimentoPeloWhatsappBusinessApp as assumirAtendimentoCore,
  type ResultadoAssuncaoBusinessApp,
} from "./assumir-atendimento-business-app-core";

export type { ResultadoAssuncaoBusinessApp } from "./assumir-atendimento-business-app-core";

const supabase = getSupabaseAdmin();
const STATUS_FLUXO_ATIVO = ["rodando", "aguardando"];
const STATUS_IA_PENDENTE = ["pendente", "processando"];
const JANELA_ECHO_ATUAL_MS = 5 * 60 * 1000;

function timestampMs(valor?: string | null) {
  if (!valor) return Number.NaN;
  const numero = new Date(valor).getTime();
  return Number.isNaN(numero) ? Number.NaN : numero;
}

async function echoBusinessAppEhAtual(params: {
  empresaId: string;
  conversaId: string;
  mensagemExternaId: string;
  mensagemEnviadaEm: string;
  atualizarEstadoConversa: boolean;
}) {
  if (params.atualizarEstadoConversa) return true;

  const momento = timestampMs(params.mensagemEnviadaEm);
  if (Number.isFinite(momento)) {
    const idade = Date.now() - momento;
    if (idade >= -30_000 && idade <= JANELA_ECHO_ATUAL_MS) return true;
  }

  const { data, error } = await supabase
    .from("mensagens")
    .select("mensagem_externa_id, remetente_tipo, created_at")
    .eq("empresa_id", params.empresaId)
    .eq("conversa_id", params.conversaId)
    .neq("remetente_tipo", "sistema")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[COEX BUSINESS APP] Falha ao validar atualidade do echo:", error);
    return false;
  }

  return String(data?.mensagem_externa_id || "") === params.mensagemExternaId;
}

async function invalidarAgenteIa(empresaId: string, conversaId: string) {
  const agora = new Date().toISOString();
  const { data: pendencias, error: pendenciasError } = await supabase
    .from("agente_ia_pendencias")
    .select("id, versao, status")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", STATUS_IA_PENDENTE);
  if (pendenciasError) throw new Error(pendenciasError.message);

  for (const pendencia of pendencias || []) {
    const versao = Number(pendencia.versao || 0);
    const { error } = await supabase
      .from("agente_ia_pendencias")
      .update({
        status: "cancelado",
        versao: versao + 1,
        erro: "atendimento_assumido_whatsapp_business_app",
        updated_at: agora,
      })
      .eq("empresa_id", empresaId)
      .eq("id", pendencia.id)
      .eq("versao", versao)
      .in("status", STATUS_IA_PENDENTE);
    if (error) throw new Error(error.message);
  }

  const { data: execucoesIa, error: execucoesBuscaError } = await supabase
    .from("agente_ia_execucoes")
    .select("id, metadata_json")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", STATUS_IA_PENDENTE);
  if (execucoesBuscaError) throw new Error(execucoesBuscaError.message);

  for (const execucao of execucoesIa || []) {
    const { error: execucaoError } = await supabase
      .from("agente_ia_execucoes")
      .update({
        status: "cancelado",
        erro: "atendimento_assumido_whatsapp_business_app",
        finished_at: agora,
        updated_at: agora,
        metadata_json: {
          ...(execucao.metadata_json || {}),
          motivo_cancelamento: "atendimento_assumido_whatsapp_business_app",
          cancelado_em: agora,
        },
      })
      .eq("empresa_id", empresaId)
      .eq("id", execucao.id)
      .in("status", STATUS_IA_PENDENTE);
    if (execucaoError) throw new Error(execucaoError.message);
  }

  await cancelarFollowupsPendentesAgenteIa({
    empresaId,
    conversaId,
    motivo: "atendimento_assumido_whatsapp_business_app",
  });
}

async function invalidarFluxos(empresaId: string, conversaId: string) {
  const agora = new Date().toISOString();
  const { data: execucoes, error } = await supabase
    .from("automacao_execucoes")
    .select("id, metadata_json")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", STATUS_FLUXO_ATIVO);
  if (error) throw new Error(error.message);

  const ids = (execucoes || []).map((item) => item.id).filter(Boolean);
  for (const execucao of execucoes || []) {
    const { error: cancelamentoError } = await supabase
      .from("automacao_execucoes")
      .update({
        status: "cancelado",
        finished_at: agora,
        updated_at: agora,
        metadata_json: {
          ...(execucao.metadata_json || {}),
          motivo_cancelamento: "atendimento_assumido_whatsapp_business_app",
          origem_cancelamento: "smb_message_echoes",
          cancelado_em: agora,
        },
      })
      .eq("empresa_id", empresaId)
      .eq("id", execucao.id)
      .in("status", STATUS_FLUXO_ATIVO);
    if (cancelamentoError) throw new Error(cancelamentoError.message);
  }

  if (ids.length) {
    const { error: agendamentosError } = await supabase
      .from("automacao_agendamentos")
      .update({ status: "cancelado" })
      .eq("empresa_id", empresaId)
      .in("execucao_id", ids)
      .eq("status", "pendente");
    if (agendamentosError) throw new Error(agendamentosError.message);
  }
}

async function assumirEstadoHumanoImediatamente(params: {
  empresaId: string;
  conversaId: string;
}) {
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("conversas")
    .update({
      status: "em_atendimento",
      origem_atendimento: "whatsapp_business_app",
      bot_ativo: false,
      aguardando_atendente: false,
      agente_ia_id: null,
      agente_ia_protocolo_id: null,
      agente_ia_fallback_ativo: false,
      closed_at: null,
      updated_at: agora,
    })
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId);
  if (error) throw new Error(error.message);
}

export async function assumirAtendimentoPeloWhatsappBusinessApp(params: {
  empresaId: string;
  conversaId: string;
  mensagemExternaId: string;
  mensagemEnviadaEm: string;
  atualizarEstadoConversa: boolean;
}): Promise<ResultadoAssuncaoBusinessApp> {
  const echoAtual = await echoBusinessAppEhAtual(params);

  if (echoAtual) {
    await assumirEstadoHumanoImediatamente(params);
    await Promise.all([
      invalidarAgenteIa(params.empresaId, params.conversaId),
      invalidarFluxos(params.empresaId, params.conversaId),
    ]);
  }

  const resultado = await assumirAtendimentoCore({
    ...params,
    atualizarEstadoConversa: echoAtual || params.atualizarEstadoConversa,
  });

  if (echoAtual) {
    await assumirEstadoHumanoImediatamente(params);
  }

  return resultado;
}
