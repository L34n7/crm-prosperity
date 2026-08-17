import { registrarLogAuditoriaSeguro } from "@/lib/auditoria/logs";
import { resolverAtribuicaoTransferencia } from "@/lib/conversas/resolver-atribuicao-transferencia";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

export async function interromperFluxosAtivos(
  empresaId: string,
  conversaId: string,
) {
  const { data: execucoes, error } = await supabase
    .from("automacao_execucoes")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", ["rodando", "aguardando"]);
  if (error) throw error;

  const ids = (execucoes || []).map((item) => item.id).filter(Boolean);
  if (!ids.length) {
    return { execucoes_canceladas: 0, agendamentos_cancelados: 0 };
  }

  const agora = new Date().toISOString();
  const { data: canceladas, error: cancelError } = await supabase
    .from("automacao_execucoes")
    .update({ status: "cancelado", finished_at: agora, updated_at: agora })
    .eq("empresa_id", empresaId)
    .in("id", ids)
    .in("status", ["rodando", "aguardando"])
    .select("id");
  if (cancelError) throw cancelError;

  const { data: agendamentos, error: agendaError } = await supabase
    .from("automacao_agendamentos")
    .update({ status: "cancelado" })
    .eq("empresa_id", empresaId)
    .in("execucao_id", ids)
    .eq("status", "pendente")
    .select("id");
  if (agendaError) throw agendaError;

  return {
    execucoes_canceladas: canceladas?.length || 0,
    agendamentos_cancelados: agendamentos?.length || 0,
  };
}

export async function transferirConversaRotina(params: {
  empresaId: string;
  conversaId: string;
  automacaoId: string;
  execucaoId: string;
  config: Record<string, unknown>;
}) {
  const escopoFila =
    String(params.config.escopo_fila || "").trim() === "geral"
      ? "geral"
      : "setor";
  const setorId =
    escopoFila === "geral"
      ? null
      : String(params.config.setor_id || "").trim() || null;

  if (escopoFila === "setor" && !setorId) {
    throw new Error(
      "A ação de transferência precisa de um setor ou da Fila geral.",
    );
  }

  let setor: { id: string; nome: string } | null = null;
  if (setorId) {
    const { data, error: setorError } = await supabase
      .from("setores")
      .select("id,nome")
      .eq("empresa_id", params.empresaId)
      .eq("id", setorId)
      .eq("ativo", true)
      .is("archived_at", null)
      .maybeSingle();
    if (setorError) throw setorError;
    if (!data) throw new Error("Setor de destino não encontrado ou inativo.");
    setor = data;
  }

  const { data: antes, error: antesError } = await supabase
    .from("conversas")
    .select(
      "id,status,setor_id,escopo_fila,responsavel_id,bot_ativo,aguardando_atendente",
    )
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId)
    .maybeSingle();
  if (antesError) throw antesError;
  if (!antes) throw new Error("Conversa não encontrada para transferência.");

  const atribuicao = await resolverAtribuicaoTransferencia({
    empresaId: params.empresaId,
    setorId,
    escopoFila,
    estrategia: params.config.estrategia_transferencia,
    atendenteId: params.config.atendente_id,
    incluirAdministradores:
      params.config.incluir_administradores_distribuicao,
  });

  const { data: conversa, error: conversaError } = await supabase
    .from("conversas")
    .update({
      setor_id: atribuicao.setorId,
      escopo_fila: atribuicao.escopoFila,
      status: atribuicao.responsavelId ? "em_atendimento" : "fila",
      responsavel_id: atribuicao.responsavelId,
      bot_ativo: false,
      aguardando_atendente: !atribuicao.responsavelId,
      closed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId)
    .select(
      "id,status,setor_id,escopo_fila,responsavel_id,bot_ativo,aguardando_atendente",
    )
    .single();
  if (conversaError) throw conversaError;

  const destinoNome =
    atribuicao.escopoFila === "geral"
      ? "Fila geral"
      : setor?.nome || "setor configurado";

  await registrarLogAuditoriaSeguro({
    empresa_id: params.empresaId,
    categoria: "conversas",
    entidade: "conversa",
    entidade_id: params.conversaId,
    acao: "conversa_transferida_automacao",
    descricao: `Conversa transferida automaticamente para ${destinoNome}`,
    antes,
    depois: conversa,
    detalhes: {
      automacao_id: params.automacaoId,
      execucao_id: params.execucaoId,
      origem: "rotina_automacao",
      escopo_fila: atribuicao.escopoFila,
      estrategia_solicitada: atribuicao.estrategiaSolicitada,
      estrategia_aplicada: atribuicao.estrategiaAplicada,
      fallback_motivo: atribuicao.fallbackMotivo,
      incluir_administradores_distribuicao:
        params.config.incluir_administradores_distribuicao === true,
      atendente_id: atribuicao.responsavelId,
    },
  });

  return { conversa, setor, atribuicao };
}
