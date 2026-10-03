import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function resolverEscopoAutomacoes(params: {
  empresaId: string;
  contatoId?: string | null;
  conversaId?: string | null;
  integracaoWhatsappId?: string | null;
}) {
  let contatoId = String(params.contatoId || "").trim();
  let integracaoWhatsappId = String(params.integracaoWhatsappId || "").trim();

  if ((!contatoId || !integracaoWhatsappId) && params.conversaId) {
    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select("contato_id, integracao_whatsapp_id")
      .eq("empresa_id", params.empresaId)
      .eq("id", params.conversaId)
      .maybeSingle();

    if (conversaError) {
      throw new Error(
        `Erro ao verificar escopo da conversa: ${conversaError.message}`
      );
    }

    contatoId = contatoId || String(conversa?.contato_id || "").trim();
    integracaoWhatsappId =
      integracaoWhatsappId ||
      String(conversa?.integracao_whatsapp_id || "").trim();
  }

  if (!contatoId || !integracaoWhatsappId) return null;

  return {
    contatoId,
    integracaoWhatsappId,
  };
}

export async function automacoesContatoEstaoDesabilitadas(params: {
  empresaId: string;
  contatoId?: string | null;
  conversaId?: string | null;
  integracaoWhatsappId?: string | null;
}) {
  const escopo = await resolverEscopoAutomacoes(params);
  if (!escopo) return false;

  const { data, error } = await supabaseAdmin
    .from("contato_automacoes_integracoes")
    .select("desabilitadas")
    .eq("empresa_id", params.empresaId)
    .eq("contato_id", escopo.contatoId)
    .eq("integracao_whatsapp_id", escopo.integracaoWhatsappId)
    .eq("desabilitadas", true)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao verificar bloqueio de automacoes do contato na integracao: ${error.message}`
    );
  }

  return data?.desabilitadas === true;
}

async function pausarAutomacoesAtivasContatoIntegracao(params: {
  empresaId: string;
  contatoId: string;
  integracaoWhatsappId: string;
  usuarioId: string;
}) {
  const agora = new Date().toISOString();

  const { data: conversas, error: conversasError } = await supabaseAdmin
    .from("conversas")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("contato_id", params.contatoId)
    .eq("integracao_whatsapp_id", params.integracaoWhatsappId);

  if (conversasError) {
    throw new Error(
      `Erro ao localizar conversas do contato na integracao: ${conversasError.message}`
    );
  }

  const conversaIds = (conversas || []).map((item) => item.id);

  let execucoes: Array<{
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
        `Erro ao localizar automacoes ativas da integracao: ${error.message}`
      );
    }

    execucoes = data || [];
  }

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
            motivo_cancelamento:
              "automacoes_contato_integracao_desabilitadas",
            cancelado_em: agora,
            usuario_responsavel_id: params.usuarioId,
            integracao_whatsapp_id: params.integracaoWhatsappId,
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
      `Erro ao cancelar automacao ativa da integracao: ${erroExecucao.message}`
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
      .contains("contexto_json", {
        contato_id: params.contatoId,
        integracao_whatsapp_id: params.integracaoWhatsappId,
      });

  if (rotinaExecucoesError) {
    throw new Error(
      `Erro ao localizar rotinas ativas da integracao: ${rotinaExecucoesError.message}`
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
        origem_cancelamento:
          "contato_integracao_automacoes_desabilitadas",
        bloqueado_em: null,
        updated_at: agora,
      })
      .eq("empresa_id", params.empresaId)
      .in("execucao_id", rotinaExecucaoIds)
      .in("status", ["pendente", "processando"]);

    if (rotinaJobsError) {
      throw new Error(
        `Erro ao cancelar jobs das rotinas da integracao: ${rotinaJobsError.message}`
      );
    }

    const { error: rotinaExecucoesCancelError } = await supabaseAdmin
      .from("rotina_automacao_execucoes")
      .update({
        status: "cancelada",
        cancelado_por: params.usuarioId,
        cancelado_em: agora,
        motivo_cancelamento:
          "automacoes_contato_integracao_desabilitadas",
        finalizada_em: agora,
        updated_at: agora,
      })
      .eq("empresa_id", params.empresaId)
      .in("id", rotinaExecucaoIds)
      .in("status", ["iniciada", "processando"]);

    if (rotinaExecucoesCancelError) {
      throw new Error(
        `Erro ao cancelar rotinas ativas da integracao: ${rotinaExecucoesCancelError.message}`
      );
    }
  }

  let pendenciasIaCanceladas = 0;

  if (conversaIds.length > 0) {
    const { data: pendenciasIa, error: pendenciasIaError } =
      await supabaseAdmin
        .from("agente_ia_pendencias")
        .update({
          status: "cancelado",
          erro:
            "Automações desabilitadas para o contato nesta integração.",
          lock_token: null,
          locked_at: null,
          updated_at: agora,
        })
        .eq("empresa_id", params.empresaId)
        .in("conversa_id", conversaIds)
        .in("status", ["pendente", "processando"])
        .select("id");

    if (pendenciasIaError) {
      throw new Error(
        `Erro ao cancelar pendencias do agente de IA: ${pendenciasIaError.message}`
      );
    }

    pendenciasIaCanceladas = pendenciasIa?.length || 0;
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
        `Erro ao desativar automacoes das conversas da integracao: ${error.message}`
      );
    }

    conversasAtualizadas = data?.length || 0;
  }

  return {
    execucoesCanceladas: execucoes.length,
    agendamentosCancelados,
    pendenciasIaCanceladas,
    rotinasCanceladas: rotinaExecucaoIds.length,
    conversasAtualizadas,
  };
}

export async function definirAutomacoesContatoIntegracao(params: {
  empresaId: string;
  contatoId: string;
  integracaoWhatsappId: string;
  usuarioId: string;
  desabilitadas: boolean;
}) {
  const agora = new Date().toISOString();

  const { data: configuracao, error } = await supabaseAdmin
    .from("contato_automacoes_integracoes")
    .upsert(
      {
        empresa_id: params.empresaId,
        contato_id: params.contatoId,
        integracao_whatsapp_id: params.integracaoWhatsappId,
        desabilitadas: params.desabilitadas,
        desabilitadas_em: params.desabilitadas ? agora : null,
        desabilitadas_por: params.desabilitadas
          ? params.usuarioId
          : null,
        habilitadas_em: params.desabilitadas ? null : agora,
        habilitadas_por: params.desabilitadas
          ? null
          : params.usuarioId,
        updated_at: agora,
      },
      {
        onConflict: "empresa_id,contato_id,integracao_whatsapp_id",
      }
    )
    .select(
      "id, empresa_id, contato_id, integracao_whatsapp_id, desabilitadas, desabilitadas_em, desabilitadas_por, habilitadas_em, habilitadas_por, updated_at"
    )
    .single();

  if (error) {
    throw new Error(
      `Erro ao atualizar automacoes do contato na integracao: ${error.message}`
    );
  }

  const interrupcoes = params.desabilitadas
    ? await pausarAutomacoesAtivasContatoIntegracao(params)
    : null;

  return {
    configuracao,
    interrupcoes,
  };
}
