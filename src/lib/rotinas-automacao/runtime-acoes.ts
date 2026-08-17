import { registrarLogAuditoriaSeguro } from "@/lib/auditoria/logs";
import { resolverAtribuicaoTransferencia } from "@/lib/conversas/resolver-atribuicao-transferencia";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { canSendFreeformWhatsAppMessage } from "@/lib/whatsapp/can-send-message";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text-message";

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
  if (tipo === "contato.adicionar_etiqueta") return "Adicionar etiqueta";
  if (tipo === "whatsapp.enviar_mensagem") return "Enviar mensagem";
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
  const escopoFila = String(params.config.escopo_fila || "").trim() === "geral"
    ? "geral"
    : "setor";
  const setorId = escopoFila === "geral"
    ? null
    : String(params.config.setor_id || "").trim() || null;

  if (escopoFila === "setor" && !setorId) {
    throw new Error("A ação de transferência precisa de um setor ou da Fila geral.");
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
    .select("id,status,setor_id,escopo_fila,responsavel_id,bot_ativo,aguardando_atendente")
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
    .select("id,status,setor_id,escopo_fila,responsavel_id,bot_ativo,aguardando_atendente")
    .single();
  if (conversaError) throw conversaError;

  const destinoNome = atribuicao.escopoFila === "geral"
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
    },
  });

  return { conversa, setor, atribuicao };
}

async function adicionarEtiqueta(params: {
  empresaId: string;
  conversaId: string;
  automacaoId: string;
  execucaoId: string;
  config: Record<string, unknown>;
}) {
  const etiquetaId = String(params.config.etiqueta_id || "").trim();
  if (!etiquetaId) throw new Error("A ação de etiqueta precisa de uma etiqueta.");

  const [{ data: etiqueta, error: etiquetaError }, { data: antes, error: conversaError }] =
    await Promise.all([
      supabase
        .from("etiquetas")
        .select("id,nome,cor")
        .eq("empresa_id", params.empresaId)
        .eq("id", etiquetaId)
        .eq("ativo", true)
        .maybeSingle(),
      supabase
        .from("conversas")
        .select("id,etiqueta_id,etiqueta_cor")
        .eq("empresa_id", params.empresaId)
        .eq("id", params.conversaId)
        .maybeSingle(),
    ]);

  if (etiquetaError) throw etiquetaError;
  if (conversaError) throw conversaError;
  if (!etiqueta) throw new Error("Etiqueta não encontrada ou inativa.");
  if (!antes) throw new Error("Conversa não encontrada para aplicar etiqueta.");

  const { data: conversa, error: updateError } = await supabase
    .from("conversas")
    .update({
      etiqueta_id: etiqueta.id,
      etiqueta_cor: etiqueta.cor,
      updated_at: new Date().toISOString(),
    })
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId)
    .select("id,etiqueta_id,etiqueta_cor")
    .single();
  if (updateError) throw updateError;

  await registrarLogAuditoriaSeguro({
    empresa_id: params.empresaId,
    categoria: "conversas",
    entidade: "conversa",
    entidade_id: params.conversaId,
    acao: "conversa_etiqueta_automacao",
    descricao: `Etiqueta ${etiqueta.nome} aplicada automaticamente à conversa`,
    antes,
    depois: conversa,
    detalhes: {
      automacao_id: params.automacaoId,
      execucao_id: params.execucaoId,
      etiqueta_id: etiqueta.id,
      origem: "rotina_automacao",
    },
  });

  return { etiqueta, conversa };
}

async function enviarMensagem(params: {
  empresaId: string;
  conversaId: string;
  automacaoId: string;
  execucaoId: string;
  acaoId: string;
  config: Record<string, unknown>;
}) {
  const conteudo = String(params.config.mensagem || "").trim();
  if (!conteudo) throw new Error("A ação Enviar mensagem precisa de um texto.");

  const { data: conversa, error: conversaError } = await supabase
    .from("conversas")
    .select("id,contato_id,integracao_whatsapp_id")
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId)
    .maybeSingle();
  if (conversaError) throw conversaError;
  if (!conversa) throw new Error("Conversa não encontrada para envio da mensagem.");
  if (!conversa.contato_id) throw new Error("A conversa não possui contato vinculado.");
  if (!conversa.integracao_whatsapp_id) {
    throw new Error("A conversa não possui integração WhatsApp vinculada.");
  }

  const [protocoloResult, contatoResult, integracaoResult] = await Promise.all([
    supabase
      .from("conversa_protocolos")
      .select("id")
      .eq("empresa_id", params.empresaId)
      .eq("conversa_id", params.conversaId)
      .eq("ativo", true)
      .maybeSingle(),
    supabase
      .from("contatos")
      .select("id,telefone")
      .eq("empresa_id", params.empresaId)
      .eq("id", conversa.contato_id)
      .maybeSingle(),
    supabase
      .from("integracoes_whatsapp")
      .select("id,status,phone_number_id,token_ref,config_json")
      .eq("empresa_id", params.empresaId)
      .eq("id", conversa.integracao_whatsapp_id)
      .maybeSingle(),
  ]);

  if (protocoloResult.error) throw protocoloResult.error;
  if (contatoResult.error) throw contatoResult.error;
  if (integracaoResult.error) throw integracaoResult.error;

  const protocolo = protocoloResult.data;
  const contato = contatoResult.data;
  const integracao = integracaoResult.data;

  if (!protocolo) throw new Error("Nenhum protocolo ativo encontrado para esta conversa.");
  if (!contato?.telefone) throw new Error("Contato sem telefone válido.");
  if (!integracao) throw new Error("Integração WhatsApp não encontrada.");
  if (integracao.status !== "ativa") throw new Error("A integração WhatsApp está inativa.");

  const phoneNumberId = String(
    integracao.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  ).trim();
  const accessToken = getWhatsAppAccessToken(integracao);
  if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID não configurado.");
  if (!accessToken) throw new Error("WHATSAPP_ACCESS_TOKEN não configurado.");

  const janela24h = await canSendFreeformWhatsAppMessage({ conversaId: params.conversaId });
  if (!janela24h.podeEnviarMensagemLivre) {
    throw new Error(janela24h.motivoBloqueio || "A janela de 24h do WhatsApp está fechada.");
  }

  const envio = await sendWhatsAppTextMessage({
    phoneNumberId,
    accessToken,
    to: contato.telefone,
    body: conteudo,
  });
  if (!envio.ok) {
    throw new Error(envio.error || "Falha ao enviar mensagem ao WhatsApp.");
  }

  const { data: mensagem, error: mensagemError } = await supabase
    .from("mensagens")
    .insert({
      empresa_id: params.empresaId,
      conversa_id: params.conversaId,
      conversa_protocolo_id: protocolo.id,
      remetente_tipo: "bot",
      remetente_id: null,
      conteudo,
      tipo_mensagem: "texto",
      tipo_original_meta: "text",
      origem: "automatica",
      status_envio: "enviada",
      mensagem_externa_id: envio.messageId,
      metadata_json: {
        tipo_original_whatsapp: "text",
        rotina_automacao: {
          automacao_id: params.automacaoId,
          execucao_id: params.execucaoId,
          acao_id: params.acaoId,
        },
        whatsapp: {
          phone_number_id: phoneNumberId,
          destino: contato.telefone,
          janela_24h: {
            ultima_mensagem_recebida_em: janela24h.ultimaMensagemRecebidaEm,
            expira_em: janela24h.janelaExpiraEm,
          },
          envio_meta: envio.raw,
        },
      },
      automacao_execucao_id: null,
      automacao_no_id: null,
    })
    .select("id,status_envio,mensagem_externa_id")
    .single();
  if (mensagemError) throw mensagemError;

  const { error: conversaUpdateError } = await supabase
    .from("conversas")
    .update({ last_message_at: new Date().toISOString() })
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId);
  if (conversaUpdateError) throw conversaUpdateError;

  return {
    mensagem_id: mensagem.id,
    mensagem_externa_id: mensagem.mensagem_externa_id,
    status_envio: mensagem.status_envio,
  };
}

export async function executarAcaoRotina(params: {
  empresaId: string;
  conversaId: string;
  automacaoId: string;
  execucaoId: string;
  acao: AcaoRotina;
}): Promise<Record<string, unknown>> {
  if (params.acao.tipo_acao === "fluxo.interromper") {
    return {
      interromper_fluxo_atual: true,
      ...(await interromperFluxosAtivos(params.empresaId, params.conversaId)),
    };
  }

  if (params.acao.tipo_acao === "conversa.transferir_setor") {
    return transferir({
      empresaId: params.empresaId,
      conversaId: params.conversaId,
      automacaoId: params.automacaoId,
      execucaoId: params.execucaoId,
      config: params.acao.configuracao_json || {},
    });
  }

  if (params.acao.tipo_acao === "contato.adicionar_etiqueta") {
    return adicionarEtiqueta({
      empresaId: params.empresaId,
      conversaId: params.conversaId,
      automacaoId: params.automacaoId,
      execucaoId: params.execucaoId,
      config: params.acao.configuracao_json || {},
    });
  }

  if (params.acao.tipo_acao === "whatsapp.enviar_mensagem") {
    return enviarMensagem({
      empresaId: params.empresaId,
      conversaId: params.conversaId,
      automacaoId: params.automacaoId,
      execucaoId: params.execucaoId,
      acaoId: params.acao.id,
      config: params.acao.configuracao_json || {},
    });
  }

  throw new Error(`A ação ${params.acao.tipo_acao} ainda não possui executor para mensagem recebida.`);
}
