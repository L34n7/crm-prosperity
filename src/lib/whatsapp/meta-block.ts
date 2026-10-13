import { montarWhatsappUrl } from "@/lib/contatos/sistema";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const WHATSAPP_META_MANAGER_URL =
  "https://business.facebook.com/latest/whatsapp_manager";

export const WHATSAPP_META_BLOCK_HELP_MESSAGE =
  "Olá! Preciso de ajuda com minha conta WhatsApp Business desativada pela Meta.";

export const WHATSAPP_META_BLOCK_HELP_URL = montarWhatsappUrl(
  WHATSAPP_META_BLOCK_HELP_MESSAGE
);

export const WHATSAPP_META_BLOCK_TITLE =
  "Conta WhatsApp Business desativada pela Meta";

export const WHATSAPP_META_BLOCK_DESCRIPTION =
  "A Meta desativou a conta WhatsApp Business vinculada a este número. Enquanto a conta estiver desativada, o CRM não consegue enviar, receber, responder mensagens, executar bots ou automações pelo WhatsApp.";

export const WHATSAPP_META_BLOCK_CUSTOMER_ACTION =
  "Acesse o Gerenciador do WhatsApp da Meta para ver os detalhes e solicitar análise, se acreditar que a desativação foi um engano.";

type TipoBloqueioOperacional =
  | "conta_meta_bloqueada"
  | "pagamento_meta_pendente"
  | "limite_service_atingido";

type BloquearWhatsappMetaParams = {
  empresaId: string;
  integracaoId: string;
  motivo?: string | null;
  tipoBloqueio?: TipoBloqueioOperacional;
};

const supabaseAdmin = getSupabaseAdmin();

export function statusWhatsappMetaBloqueado(valor?: string | null) {
  return ["bloqueado", "banido", "blocked", "banned"].includes(
    String(valor || "").trim().toLowerCase()
  );
}

export async function aplicarBloqueioOperacionalWhatsappMeta({
  empresaId,
  integracaoId,
  motivo,
  tipoBloqueio = "conta_meta_bloqueada",
}: BloquearWhatsappMetaParams) {
  if (!empresaId || !integracaoId) {
    return {
      conversasEncerradas: 0,
      fluxosPausados: 0,
      execucoesCanceladas: 0,
      agendamentosCancelados: 0,
      pendenciasIaCanceladas: 0,
      execucoesIaCanceladas: 0,
      jobsFilaCancelados: 0,
    };
  }

  const agora = new Date().toISOString();
  const ehPagamento = tipoBloqueio === "pagamento_meta_pendente";
  const ehLimiteService = tipoBloqueio === "limite_service_atingido";
  const bloqueioNaoDestrutivo = ehPagamento || ehLimiteService;
  const motivoCancelamento = ehPagamento
    ? "pagamento_meta_pendente"
    : ehLimiteService
      ? "limite_meta_service_atingido"
      : "whatsapp_meta_bloqueado";
  const tipoMensagemSistema = ehPagamento
    ? "whatsapp_meta_pagamento_pendente"
    : ehLimiteService
      ? "whatsapp_meta_service_limite_atingido"
      : "whatsapp_meta_bloqueado";
  const motivoFinal =
    motivo ||
    (ehPagamento
      ? "A Meta recusou o envio por pendência financeira. As automações vinculadas a este número foram interrompidas pelo CRM até a regularização."
      : ehLimiteService
        ? "O limite mensal configurado para Meta Service foi atingido. Fluxos e agentes de IA vinculados a este número foram pausados pelo CRM até o próximo ciclo ou alteração do limite."
        : "Conta WhatsApp Business bloqueada/desativada pela Meta. Recursos de WhatsApp interrompidos pelo CRM.");

  const { data: conversasAtivas, error: conversasError } = await supabaseAdmin
    .from("conversas")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("integracao_whatsapp_id", integracaoId)
    .eq("bot_ativo", true);

  if (conversasError) {
    console.warn("[WHATSAPP META BLOCK] Erro ao buscar conversas:", conversasError);
  }

  // Pendência financeira e limite de Service não encerram conversas nem protocolos.
  // O recebimento e o atendimento humano continuam normais; somente a camada
  // automática de saída fica suspensa.
  const conversaIds = bloqueioNaoDestrutivo
    ? []
    : (conversasAtivas || []).map((item) => item.id).filter(Boolean);

  if (conversaIds.length > 0) {
    const { error: conversasUpdateError } = await supabaseAdmin
      .from("conversas")
      .update({
        status: "encerrado_aut",
        bot_ativo: false,
        aguardando_atendente: false,
        closed_at: agora,
        updated_at: agora,
      })
      .eq("empresa_id", empresaId)
      .eq("integracao_whatsapp_id", integracaoId)
      .in("id", conversaIds);

    if (conversasUpdateError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao encerrar conversas:",
        conversasUpdateError
      );
    }

    const { error: protocolosError } = await supabaseAdmin
      .from("conversa_protocolos")
      .update({
        ativo: false,
        closed_at: agora,
        updated_at: agora,
      })
      .eq("empresa_id", empresaId)
      .in("conversa_id", conversaIds)
      .eq("ativo", true);

    if (protocolosError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao encerrar protocolos:",
        protocolosError
      );
    }

    const mensagensSistema = conversaIds.map((conversaId) => ({
      empresa_id: empresaId,
      conversa_id: conversaId,
      remetente_tipo: "sistema",
      conteudo: motivoFinal,
      tipo_mensagem: "texto",
      origem: "automatica",
      status_envio: "lida",
      created_at: agora,
      updated_at: agora,
      metadata_json: {
        tipo: tipoMensagemSistema,
        integracao_whatsapp_id: integracaoId,
        motivo: motivoFinal,
      },
    }));

    const { error: mensagensError } = await supabaseAdmin
      .from("mensagens")
      .insert(mensagensSistema);

    if (mensagensError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao registrar mensagens:",
        mensagensError
      );
    }
  }

  // O bloqueio é sempre por integração. Não desativamos definições globais de
  // fluxo/agente porque elas podem atender outros números saudáveis da empresa.
  const { data: conversasDaIntegracao, error: conversasIntegracaoError } =
    await supabaseAdmin
      .from("conversas")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("integracao_whatsapp_id", integracaoId);

  if (conversasIntegracaoError) {
    console.warn(
      "[WHATSAPP META BLOCK] Erro ao buscar conversas da integração:",
      conversasIntegracaoError
    );
  }

  const conversaIdsIntegracao = (conversasDaIntegracao || [])
    .map((item) => item.id)
    .filter(Boolean);

  let pendenciasIaCanceladas = 0;
  let execucoesIaCanceladas = 0;
  let jobsFilaCancelados = 0;

  if (conversaIdsIntegracao.length > 0) {
    const { data: pendenciasIa, error: pendenciasIaError } = await supabaseAdmin
      .from("agente_ia_pendencias")
      .update({
        status: "cancelado",
        erro: motivoFinal,
        locked_at: null,
        updated_at: agora,
      })
      .eq("empresa_id", empresaId)
      .in("conversa_id", conversaIdsIntegracao)
      .in("status", ["pendente", "processando"])
      .select("id");

    if (pendenciasIaError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao cancelar pendências do agente de IA:",
        pendenciasIaError
      );
    } else {
      pendenciasIaCanceladas = (pendenciasIa || []).length;
    }

    const { data: execucoesIa, error: execucoesIaError } = await supabaseAdmin
      .from("agente_ia_execucoes")
      .update({
        status: "cancelado",
        erro: motivoFinal,
        finished_at: agora,
        updated_at: agora,
      })
      .eq("empresa_id", empresaId)
      .in("conversa_id", conversaIdsIntegracao)
      .in("status", ["pendente", "processando"])
      .select("id");

    if (execucoesIaError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao cancelar execuções do agente de IA:",
        execucoesIaError
      );
    } else {
      execucoesIaCanceladas = (execucoesIa || []).length;
    }
  }

  if (conversaIdsIntegracao.length > 0) {
    const { data: jobsFila, error: jobsFilaError } = await supabaseAdmin
      .from("fila_processamento_auto")
      .update({
        status: "cancelado",
        locked_at: null,
        executed_at: agora,
        erro: motivoFinal,
        updated_at: agora,
      })
      .eq("empresa_id", empresaId)
      .in("conversa_id", conversaIdsIntegracao)
      .in("status", ["pendente", "executando"])
      .select("id");

    if (jobsFilaError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao cancelar fila de processamento automático:",
        jobsFilaError
      );
    } else {
      jobsFilaCancelados = (jobsFila || []).length;
    }
  }

  const execucoesPorId = new Map<string, { id: string; metadata_json: unknown }>();

  if (conversaIdsIntegracao.length > 0) {
    const { data: execucoesPorConversa, error: execucoesConversaError } =
      await supabaseAdmin
        .from("automacao_execucoes")
        .select("id, metadata_json")
        .eq("empresa_id", empresaId)
        .in("status", ["rodando", "aguardando", "pausado"])
        .in("conversa_id", conversaIdsIntegracao);

    if (execucoesConversaError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao buscar execuções por conversa:",
        execucoesConversaError
      );
    }

    for (const execucao of execucoesPorConversa || []) {
      execucoesPorId.set(execucao.id, execucao);
    }
  }

  const execucoesAtivas = Array.from(execucoesPorId.values());
  const execucaoIds = execucoesAtivas.map((item) => item.id).filter(Boolean);

  for (const execucao of execucoesAtivas) {
    const metadataAtual =
      execucao.metadata_json &&
      typeof execucao.metadata_json === "object" &&
      !Array.isArray(execucao.metadata_json)
        ? execucao.metadata_json
        : {};

    const { error: execucaoError } = await supabaseAdmin
      .from("automacao_execucoes")
      .update({
        status: "cancelado",
        finished_at: agora,
        updated_at: agora,
        metadata_json: {
          ...metadataAtual,
          motivo_cancelamento: motivoCancelamento,
          integracao_whatsapp_id: integracaoId,
          detalhe: motivoFinal,
        },
      })
      .eq("empresa_id", empresaId)
      .eq("id", execucao.id);

    if (execucaoError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao cancelar execução:",
        execucaoError
      );
    }
  }

  const agendamentosPorId = new Map<
    string,
    { id: string; payload_json: unknown }
  >();

  const { data: agendamentosPorIntegracao, error: agendamentosSelectError } =
    await supabaseAdmin
      .from("automacao_agendamentos")
      .select("id, payload_json")
      .eq("empresa_id", empresaId)
      .eq("status", "pendente")
      .eq("payload_json->>integracao_whatsapp_id", integracaoId);

  if (agendamentosSelectError) {
    console.warn(
      "[WHATSAPP META BLOCK] Erro ao buscar agendamentos por integração:",
      agendamentosSelectError
    );
  }

  for (const agendamento of agendamentosPorIntegracao || []) {
    agendamentosPorId.set(agendamento.id, agendamento);
  }

  if (execucaoIds.length > 0) {
    const { data: agendamentosPorExecucao, error: agendamentosExecucaoError } =
      await supabaseAdmin
        .from("automacao_agendamentos")
        .select("id, payload_json")
        .eq("empresa_id", empresaId)
        .eq("status", "pendente")
        .in("execucao_id", execucaoIds);

    if (agendamentosExecucaoError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao buscar agendamentos por execução:",
        agendamentosExecucaoError
      );
    }

    for (const agendamento of agendamentosPorExecucao || []) {
      agendamentosPorId.set(agendamento.id, agendamento);
    }
  }

  const agendamentosPendentes = Array.from(agendamentosPorId.values());

  for (const agendamento of agendamentosPendentes) {
    const payloadAtual =
      agendamento.payload_json &&
      typeof agendamento.payload_json === "object" &&
      !Array.isArray(agendamento.payload_json)
        ? agendamento.payload_json
        : {};

    const { error: agendamentoError } = await supabaseAdmin
      .from("automacao_agendamentos")
      .update({
        status: "cancelado",
        updated_at: agora,
        executed_at: agora,
        payload_json: {
          ...payloadAtual,
          motivo_cancelamento: motivoCancelamento,
          integracao_whatsapp_id: integracaoId,
          detalhe: motivoFinal,
        },
      })
      .eq("empresa_id", empresaId)
      .eq("id", agendamento.id);

    if (agendamentoError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao cancelar agendamento:",
        agendamentoError
      );
    }
  }

  return {
    conversasEncerradas: conversaIds.length,
    fluxosPausados: 0,
    execucoesCanceladas: execucaoIds.length,
    agendamentosCancelados: agendamentosPendentes.length,
    pendenciasIaCanceladas,
    execucoesIaCanceladas,
    jobsFilaCancelados,
  };
}
