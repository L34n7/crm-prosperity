import { registrarLogAuditoriaSeguro } from "@/lib/auditoria/logs";
import { resolverAtribuicaoTransferencia } from "@/lib/conversas/resolver-atribuicao-transferencia";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

export type AcaoRotina = {
  id: string;
  automacao_id: string;
  ordem: number;
  tipo_acao: string;
  configuracao_json: Record<string, unknown> | null;
  ativo: boolean;
};

export function tituloAcaoRotina(tipo: string) {
  if (tipo === "fluxo.interromper") return "Interromper fluxo atual";
  if (tipo === "conversa.transferir_setor") return "Transferir conversa";
  return tipo;
}

async function interromperFluxosAtivos(empresaId: string, conversaId: string) {
  const { data: execucoes, error } = await supabase
    .from("automacao_execucoes")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", ["rodando", "aguardando"]);
  if (error) throw error;

  const ids = (execucoes || []).map((item) => item.id).filter(Boolean);
  if (!ids.length) return { execucoes_canceladas: 0, agendamentos_cancelados: 0 };

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

async function transferir(params: {
  empresaId: string;
  conversaId: string;
  automacaoId: string;
  execucaoId: string;
  config: Record<string, unknown>;
}) {
  const setorId = String(params.config.setor_id || "").trim();
  if (!setorId) throw new Error("A ação de transferência precisa de um setor.");

  const { data: setor, error: setorError } = await supabase
    .from("setores")
    .select("id,nome")
    .eq("empresa_id", params.empresaId)
    .eq("id", setorId)
    .eq("ativo", true)
    .is("archived_at", null)
    .maybeSingle();
  if (setorError) throw setorError;
  if (!setor) throw new Error("Setor de destino não encontrado ou inativo.");

  const { data: antes, error: antesError } = await supabase
    .from("conversas")
    .select("id,status,setor_id,responsavel_id,bot_ativo,aguardando_atendente")
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId)
    .maybeSingle();
  if (antesError) throw antesError;
  if (!antes) throw new Error("Conversa não encontrada para transferência.");

  const atribuicao = await resolverAtribuicaoTransferencia({
    empresaId: params.empresaId,
    setorId,
    escopoFila: "setor",
    estrategia: params.config.estrategia_transferencia,
    atendenteId: params.config.atendente_id,
  });

  const interrupcao = await interromperFluxosAtivos(params.empresaId, params.conversaId);
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
    .select("id,status,setor_id,responsavel_id,bot_ativo,aguardando_atendente")
    .single();
  if (conversaError) throw conversaError;

  await registrarLogAuditoriaSeguro({
    empresa_id: params.empresaId,
    categoria: "conversas",
    entidade: "conversa",
    entidade_id: params.conversaId,
    acao: "conversa_transferida_automacao",
    descricao: `Conversa transferida automaticamente para ${setor.nome}`,
    antes,
    depois: conversa,
    detalhes: {
      automacao_id: params.automacaoId,
      execucao_id: params.execucaoId,
      origem: "rotina_automacao",
      interrupcao_fluxo: interrupcao,
    },
  });

  return { conversa, setor, atribuicao, interrupcao };
}

export async function executarAcaoRotina(params: {
  empresaId: string;
  conversaId: string;
  automacaoId: string;
  execucaoId: string;
  acao: AcaoRotina;
}) {
  if (params.acao.tipo_acao === "fluxo.interromper") {
    return {
      interromper_fluxo_atual: true,
      ...(await interromperFluxosAtivos(params.empresaId, params.conversaId)),
    };
  }
  if (params.acao.tipo_acao === "conversa.transferir_setor") {
    return {
      interromper_fluxo_atual: true,
      ...(await transferir({
        empresaId: params.empresaId,
        conversaId: params.conversaId,
        automacaoId: params.automacaoId,
        execucaoId: params.execucaoId,
        config: params.acao.configuracao_json || {},
      })),
    };
  }
  throw new Error(`A ação ${params.acao.tipo_acao} ainda não possui executor para mensagem recebida.`);
}
