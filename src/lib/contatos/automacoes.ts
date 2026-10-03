import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function automacoesContatoEstaoDesabilitadas(params: {
  empresaId: string;
  contatoId?: string | null;
  conversaId?: string | null;
}) {
  let contatoId = String(params.contatoId || "").trim();

  if (!contatoId && params.conversaId) {
    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select("contato_id")
      .eq("empresa_id", params.empresaId)
      .eq("id", params.conversaId)
      .maybeSingle();

    if (conversaError) {
      throw new Error(
        `Erro ao verificar contato da conversa: ${conversaError.message}`
      );
    }

    contatoId = String(conversa?.contato_id || "").trim();
  }

  if (!contatoId) return false;

  const { data: contato, error } = await supabaseAdmin
    .from("contatos")
    .select("automacoes_desabilitadas")
    .eq("empresa_id", params.empresaId)
    .eq("id", contatoId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao verificar bloqueio de automacoes do contato: ${error.message}`
    );
  }

  return contato?.automacoes_desabilitadas === true;
}

export async function pausarAutomacoesAtivasContato(params: {
  empresaId: string;
  contatoId: string;
  usuarioId: string;
}) {
  const agora = new Date().toISOString();

  const { data: conversas, error: conversasError } = await supabaseAdmin
    .from("conversas")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("contato_id", params.contatoId);

  if (conversasError) {
    throw new Error(
      `Erro ao localizar conversas do contato: ${conversasError.message}`
    );
  }

  const conversaIds = (conversas || []).map((item) => item.id);

  const { data: execucoesContato, error: execucoesContatoError } =
    await supabaseAdmin
      .from("automacao_execucoes")
      .select("id, metadata_json")
      .eq("empresa_id", params.empresaId)
      .eq("contato_id", params.contatoId)
      .in("status", ["rodando", "aguardando"]);

  if (execucoesContatoError) {
    throw new Error(
      `Erro ao localizar automacoes ativas do contato: ${execucoesContatoError.message}`
    );
  }

  let execucoesConversa: Array<{
    id: string;
    metadata_json: Record<string, unknown> | null;
  }> = [];

  if (conversaIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("automacao_execucoes")
      .select("id, metadata_json")
      .eq("empresa_id", params.empresaId)
      .in("conversa_id", conversaIds)
      .in("status", ["rodando", "aguardando"]);

    if (error) {
      throw new Error(
        `Erro ao localizar automacoes das conversas do contato: ${error.message}`
      );
    }

    execucoesConversa = data || [];
  }

  const execucoesPorId = new Map<
    string,
    { id: string; metadata_json: Record<string, unknown> | null }
  >();

  for (const execucao of [...(execucoesContato || []), ...execucoesConversa]) {
    execucoesPorId.set(execucao.id, execucao);
  }

  const execucoes = [...execucoesPorId.values()];

  const resultadosExecucoes = await Promise.all(
    execucoes.map((execucao) =>
      supabaseAdmin
        .from("automacao_execucoes")
        .update({
          status: "cancelado",
          finished_at: agora,
          updated_at: agora,
          metadata_json: {
            ...asRecord(execucao.metadata_json),
            motivo_cancelamento: "automacoes_contato_desabilitadas",
            cancelado_em: agora,
            usuario_responsavel_id: params.usuarioId,
          },
        })
        .eq("empresa_id", params.empresaId)
        .eq("id", execucao.id)
        .in("status", ["rodando", "aguardando"])
    )
  );

  const erroExecucao = resultadosExecucoes.find((item) => item.error)?.error;
  if (erroExecucao) {
    throw new Error(
      `Erro ao cancelar automacao ativa do contato: ${erroExecucao.message}`
    );
  }

  const execucaoIds = execucoes.map((item) => item.id);
  let agendamentosCancelados = 0;

  if (execucaoIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("automacao_agendamentos")
      .update({ status: "cancelado" })
      .eq("empresa_id", params.empresaId)
      .in("execucao_id", execucaoIds)
      .eq("status", "pendente")
      .select("id");

    if (error) {
      throw new Error(
        `Erro ao cancelar agendamentos da automacao: ${error.message}`
      );
    }

    agendamentosCancelados += data?.length || 0;
  }

  for (const conversaId of conversaIds) {
    const { data, error } = await supabaseAdmin
      .from("automacao_agendamentos")
      .update({ status: "cancelado" })
      .eq("empresa_id", params.empresaId)
      .eq("tipo_agendamento", "followup_agente_ia")
      .in("status", ["pendente", "executando"])
      .contains("payload_json", { conversa_id: conversaId })
      .select("id");

    if (error) {
      throw new Error(
        `Erro ao cancelar follow-up do agente de IA: ${error.message}`
      );
    }

    agendamentosCancelados += data?.length || 0;
  }

  const { data: rotinaExecucoes, error: rotinaExecucoesError } =
    await supabaseAdmin
      .from("rotina_automacao_execucoes")
      .select("id")
      .eq("empresa_id", params.empresaId)
      .in("status", ["iniciada", "processando"])
      .contains("contexto_json", { contato_id: params.contatoId });

  if (rotinaExecucoesError) {
    throw new Error(
      `Erro ao localizar rotinas ativas do contato: ${rotinaExecucoesError.message}`
    );
  }

  const rotinaExecucaoIds = (rotinaExecucoes || []).map((item) => item.id);

  if (rotinaExecucaoIds.length > 0) {
    const { error: rotinaJobsError } = await supabaseAdmin
      .from("rotina_automacao_jobs")
      .update({
        status: "cancelado",
        cancelado_por: params.usuarioId,
        cancelado_em: agora,
        cancelamento_solicitado_em: agora,
        cancelamento_solicitado_por: params.usuarioId,
        origem_cancelamento: "contato_automacoes_desabilitadas",
        bloqueado_em: null,
        updated_at: agora,
      })
      .eq("empresa_id", params.empresaId)
      .in("execucao_id", rotinaExecucaoIds)
      .in("status", ["pendente", "processando"]);

    if (rotinaJobsError) {
      throw new Error(
        `Erro ao cancelar jobs das rotinas do contato: ${rotinaJobsError.message}`
      );
    }

    const { error: rotinaExecucoesCancelError } = await supabaseAdmin
      .from("rotina_automacao_execucoes")
      .update({
        status: "cancelada",
        cancelado_por: params.usuarioId,
        cancelado_em: agora,
        motivo_cancelamento: "automacoes_contato_desabilitadas",
        finalizada_em: agora,
        updated_at: agora,
      })
      .eq("empresa_id", params.empresaId)
      .in("id", rotinaExecucaoIds)
      .in("status", ["iniciada", "processando"]);

    if (rotinaExecucoesCancelError) {
      throw new Error(
        `Erro ao cancelar rotinas ativas do contato: ${rotinaExecucoesCancelError.message}`
      );
    }
  }

  const { data: pendenciasIa, error: pendenciasIaError } = await supabaseAdmin
    .from("agente_ia_pendencias")
    .update({
      status: "cancelado",
      erro: "Automações desabilitadas para o contato.",
      lock_token: null,
      locked_at: null,
      updated_at: agora,
    })
    .eq("empresa_id", params.empresaId)
    .eq("contato_id", params.contatoId)
    .in("status", ["pendente", "processando"])
    .select("id");

  if (pendenciasIaError) {
    throw new Error(
      `Erro ao cancelar pendencias do agente de IA: ${pendenciasIaError.message}`
    );
  }

  let conversasAtualizadas = 0;

  if (conversaIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("conversas")
      .update({
        bot_ativo: false,
        agente_ia_id: null,
        agente_ia_protocolo_id: null,
        agente_ia_fallback_ativo: false,
        updated_at: agora,
      })
      .eq("empresa_id", params.empresaId)
      .in("id", conversaIds)
      .select("id");

    if (error) {
      throw new Error(
        `Erro ao desativar automacoes das conversas do contato: ${error.message}`
      );
    }

    conversasAtualizadas = data?.length || 0;
  }

  return {
    execucoesCanceladas: execucoes.length,
    agendamentosCancelados,
    pendenciasIaCanceladas: pendenciasIa?.length || 0,
    rotinasCanceladas: rotinaExecucaoIds.length,
    conversasAtualizadas,
  };
}
