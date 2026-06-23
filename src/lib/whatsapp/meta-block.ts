import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const WHATSAPP_META_MANAGER_URL =
  "https://business.facebook.com/latest/whatsapp_manager";

const HELP_WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_COMERCIAL || "5531975117638";

export const WHATSAPP_META_BLOCK_HELP_MESSAGE =
  "Ola! Preciso de ajuda com minha conta WhatsApp Business banida pela Meta.";

export const WHATSAPP_META_BLOCK_HELP_URL = `https://api.whatsapp.com/send?phone=${HELP_WHATSAPP_NUMBER}&text=${encodeURIComponent(
  WHATSAPP_META_BLOCK_HELP_MESSAGE
)}`;

export const WHATSAPP_META_BLOCK_TITLE =
  "Conta WhatsApp Business banida pela Meta";

export const WHATSAPP_META_BLOCK_DESCRIPTION =
  "A Meta desativou a conta WhatsApp Business vinculada a este numero. Enquanto a conta estiver banida, o CRM nao consegue enviar, receber, responder mensagens, executar bots ou automacoes pelo WhatsApp.";

export const WHATSAPP_META_BLOCK_CUSTOMER_ACTION =
  "Acesse o Gerenciador do WhatsApp da Meta para ver os detalhes e solicitar analise, se acreditar que a desativacao foi um engano.";

type BloquearWhatsappMetaParams = {
  empresaId: string;
  integracaoId: string;
  motivo?: string | null;
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
}: BloquearWhatsappMetaParams) {
  if (!empresaId || !integracaoId) {
    return {
      conversasEncerradas: 0,
      fluxosPausados: 0,
      execucoesCanceladas: 0,
      agendamentosCancelados: 0,
    };
  }

  const agora = new Date().toISOString();
  const motivoFinal =
    motivo ||
    "Conta WhatsApp Business banida/desativada pela Meta. Recursos de WhatsApp interrompidos pelo CRM.";

  const { data: conversasAtivas, error: conversasError } = await supabaseAdmin
    .from("conversas")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("integracao_whatsapp_id", integracaoId)
    .eq("bot_ativo", true);

  if (conversasError) {
    console.warn("[WHATSAPP META BLOCK] Erro ao buscar conversas:", conversasError);
  }

  const conversaIds = (conversasAtivas || [])
    .map((item) => item.id)
    .filter(Boolean);

  if (conversaIds.length > 0) {
    const { error: conversasUpdateError } = await supabaseAdmin
      .from("conversas")
      .update({
        status: "encerrado_aut",
        bot_ativo: false,
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
        tipo: "whatsapp_meta_bloqueado",
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

  const { data: fluxosWhatsapp, error: fluxosSelectError } = await supabaseAdmin
    .from("automacao_fluxos")
    .select("id, status")
    .eq("empresa_id", empresaId)
    .eq("canal", "whatsapp")
    .neq("status", "arquivado");

  if (fluxosSelectError) {
    console.warn("[WHATSAPP META BLOCK] Erro ao buscar fluxos:", fluxosSelectError);
  }

  const fluxoIdsWhatsapp = (fluxosWhatsapp || [])
    .map((item) => item.id)
    .filter(Boolean);
  const fluxoIdsAtivos = (fluxosWhatsapp || [])
    .filter((item) => item.status === "ativo")
    .map((item) => item.id)
    .filter(Boolean);

  if (fluxoIdsAtivos.length > 0) {
    const { error: fluxosError } = await supabaseAdmin
      .from("automacao_fluxos")
      .update({
        status: "pausado",
        updated_at: agora,
      })
      .eq("empresa_id", empresaId)
      .in("id", fluxoIdsAtivos)
      .eq("status", "ativo");

    if (fluxosError) {
      console.warn("[WHATSAPP META BLOCK] Erro ao pausar fluxos:", fluxosError);
    }
  }

  const { data: conversasDaIntegracao, error: conversasIntegracaoError } =
    await supabaseAdmin
      .from("conversas")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("integracao_whatsapp_id", integracaoId);

  if (conversasIntegracaoError) {
    console.warn(
      "[WHATSAPP META BLOCK] Erro ao buscar conversas da integracao:",
      conversasIntegracaoError
    );
  }

  const conversaIdsIntegracao = (conversasDaIntegracao || [])
    .map((item) => item.id)
    .filter(Boolean);
  const execucoesPorId = new Map<string, { id: string; metadata_json: unknown }>();

  if (fluxoIdsWhatsapp.length > 0) {
    const { data: execucoesPorFluxo, error: execucoesFluxoError } =
      await supabaseAdmin
        .from("automacao_execucoes")
        .select("id, metadata_json")
        .eq("empresa_id", empresaId)
        .in("status", ["rodando", "aguardando", "pausado"])
        .in("fluxo_id", fluxoIdsWhatsapp);

    if (execucoesFluxoError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao buscar execucoes por fluxo:",
        execucoesFluxoError
      );
    }

    for (const execucao of execucoesPorFluxo || []) {
      execucoesPorId.set(execucao.id, execucao);
    }
  }

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
        "[WHATSAPP META BLOCK] Erro ao buscar execucoes por conversa:",
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
          motivo_cancelamento: "whatsapp_meta_bloqueado",
          integracao_whatsapp_id: integracaoId,
          detalhe: motivoFinal,
        },
      })
      .eq("empresa_id", empresaId)
      .eq("id", execucao.id);

    if (execucaoError) {
      console.warn(
        "[WHATSAPP META BLOCK] Erro ao cancelar execucao:",
        execucaoError
      );
    }
  }

  const { data: agendamentosPendentes, error: agendamentosSelectError } =
    await supabaseAdmin
      .from("automacao_agendamentos")
      .select("id, payload_json")
      .eq("empresa_id", empresaId)
      .eq("status", "pendente")
      .eq("tipo_agendamento", "disparo_template")
      .eq("payload_json->>integracao_whatsapp_id", integracaoId);

  if (agendamentosSelectError) {
    console.warn(
      "[WHATSAPP META BLOCK] Erro ao buscar agendamentos:",
      agendamentosSelectError
    );
  }

  const agendamentoIds = (agendamentosPendentes || [])
    .map((item) => item.id)
    .filter(Boolean);

  for (const agendamento of agendamentosPendentes || []) {
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
          motivo_cancelamento: "whatsapp_meta_bloqueado",
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
    fluxosPausados: fluxoIdsAtivos.length,
    execucoesCanceladas: execucaoIds.length,
    agendamentosCancelados: agendamentoIds.length,
  };
}
