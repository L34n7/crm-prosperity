import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

const STATUS_EXECUCAO_ATIVA = ["rodando", "aguardando"];

function timestampEmMilissegundos(valor?: string | null) {
  if (!valor) return Number.POSITIVE_INFINITY;

  const timestamp = new Date(valor).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

export type ResultadoAssuncaoBusinessApp = {
  estadoConversaAtualizado: boolean;
  execucoesCanceladas: number;
  agendamentosCancelados: number;
  execucoesNovasPreservadas: number;
};

export async function assumirAtendimentoPeloWhatsappBusinessApp(params: {
  empresaId: string;
  conversaId: string;
  mensagemExternaId: string;
  mensagemEnviadaEm: string;
  atualizarEstadoConversa: boolean;
}): Promise<ResultadoAssuncaoBusinessApp> {
  const {
    empresaId,
    conversaId,
    mensagemExternaId,
    mensagemEnviadaEm,
    atualizarEstadoConversa,
  } = params;
  const agora = new Date().toISOString();
  const momentoAssuncao = timestampEmMilissegundos(mensagemEnviadaEm);

  const { data: execucoesAtivas, error: execucoesError } = await supabase
    .from("automacao_execucoes")
    .select("id, status, started_at, metadata_json")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", STATUS_EXECUCAO_ATIVA);

  if (execucoesError) {
    throw new Error(
      `Erro ao buscar automações ativas antes da assunção pelo WhatsApp Business: ${execucoesError.message}`
    );
  }

  const execucoesElegiveis = (execucoesAtivas || []).filter((execucao) => {
    const inicioExecucao = timestampEmMilissegundos(execucao.started_at);
    return inicioExecucao <= momentoAssuncao;
  });
  const execucoesMaisNovas = (execucoesAtivas || []).filter((execucao) => {
    const inicioExecucao = timestampEmMilissegundos(execucao.started_at);
    return inicioExecucao > momentoAssuncao;
  });

  let estadoConversaAtualizado = false;

  if (atualizarEstadoConversa && execucoesMaisNovas.length === 0) {
    const { data: conversaAtualizada, error: conversaError } = await supabase
      .from("conversas")
      .update({
        status: "em_atendimento",
        origem_atendimento: "whatsapp_business_app",
        bot_ativo: false,
        // Esta flag funciona como trava operacional das automações enquanto
        // o atendimento humano estiver sendo conduzido pelo aplicativo.
        aguardando_atendente: true,
        closed_at: null,
        updated_at: agora,
      })
      .eq("empresa_id", empresaId)
      .eq("id", conversaId)
      .select("id")
      .maybeSingle();

    if (conversaError) {
      throw new Error(
        `Erro ao assumir conversa pelo WhatsApp Business: ${conversaError.message}`
      );
    }

    estadoConversaAtualizado = Boolean(conversaAtualizada?.id);
  }

  const execucoesCanceladasIds: string[] = [];

  for (const execucao of execucoesElegiveis) {
    const { data: execucaoCancelada, error: cancelamentoError } = await supabase
      .from("automacao_execucoes")
      .update({
        status: "cancelado",
        finished_at: agora,
        updated_at: agora,
        metadata_json: {
          ...(execucao.metadata_json || {}),
          motivo_cancelamento:
            "atendimento_assumido_whatsapp_business_app",
          origem_cancelamento: "smb_message_echoes",
          mensagem_echo_id: mensagemExternaId,
          atendimento_assumido_em: mensagemEnviadaEm,
          cancelado_em: agora,
        },
      })
      .eq("empresa_id", empresaId)
      .eq("id", execucao.id)
      .in("status", STATUS_EXECUCAO_ATIVA)
      .select("id")
      .maybeSingle();

    if (cancelamentoError) {
      throw new Error(
        `Erro ao cancelar automação assumida pelo WhatsApp Business: ${cancelamentoError.message}`
      );
    }

    if (execucaoCancelada?.id) {
      execucoesCanceladasIds.push(execucaoCancelada.id);
    }
  }

  let agendamentosCancelados = 0;

  if (execucoesCanceladasIds.length > 0) {
    const { data: agendamentos, error: agendamentosError } = await supabase
      .from("automacao_agendamentos")
      .update({
        status: "cancelado",
      })
      .eq("empresa_id", empresaId)
      .in("execucao_id", execucoesCanceladasIds)
      .eq("status", "pendente")
      .select("id");

    if (agendamentosError) {
      throw new Error(
        `Erro ao cancelar delays após assunção pelo WhatsApp Business: ${agendamentosError.message}`
      );
    }

    agendamentosCancelados = agendamentos?.length || 0;
  }

  return {
    estadoConversaAtualizado,
    execucoesCanceladas: execucoesCanceladasIds.length,
    agendamentosCancelados,
    execucoesNovasPreservadas: execucoesMaisNovas.length,
  };
}
