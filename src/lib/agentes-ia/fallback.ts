import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolverAtribuicaoTransferencia } from "@/lib/conversas/resolver-atribuicao-transferencia";
import { fluxoPermiteIntegracaoWhatsapp } from "@/lib/automacoes/normalizar-configuracao-fluxo";
import { executarNo } from "@/lib/automacoes/process-automation-engine-agenda";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text-message";

const supabaseAdmin = getSupabaseAdmin();

export type AgenteContingencia = {
  id: string;
  empresa_id: string;
  fallback_tipo?: string | null;
  fallback_fluxo_id?: string | null;
  fallback_transferencia_json?: Record<string, unknown> | null;
};

export type PendenciaContingencia = {
  id: string;
  empresa_id: string;
  agente_id: string;
  conversa_id: string;
  contato_id?: string | null;
  numero_destino?: string | null;
  mensagem_ids: string[];
  conteudo_agregado: string;
};

async function buscarProtocoloAtivo(empresaId: string, conversaId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("id, protocolo")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function buscarOuCriarProtocolo(params: {
  empresaId: string;
  conversaId: string;
  contatoId?: string | null;
}) {
  const existente = await buscarProtocoloAtivo(params.empresaId, params.conversaId);
  if (existente) return existente;

  const agora = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .insert({
      empresa_id: params.empresaId,
      conversa_id: params.conversaId,
      contato_id: params.contatoId || null,
      protocolo: `AI-FB-${crypto.randomUUID()}`,
      tipo: "automacao",
      ativo: true,
      iniciado_com_bot: true,
      started_at: agora,
      created_at: agora,
      updated_at: agora,
    })
    .select("id, protocolo")
    .single();

  if (error || !data) {
    const criadoConcorrente = await buscarProtocoloAtivo(params.empresaId, params.conversaId);
    if (criadoConcorrente) return criadoConcorrente;
    throw new Error(error?.message || "Não foi possível criar protocolo para a contingência.");
  }

  return data;
}

async function enviarMensagemContingencia(params: {
  empresaId: string;
  conversaId: string;
  agenteId: string;
  numeroDestino: string;
  texto: string;
}) {
  const texto = String(params.texto || "").trim();
  if (!texto || !params.numeroDestino) return { ok: true, ignorada: true };

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("integracao_whatsapp_id")
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId)
    .maybeSingle();
  if (conversaError || !conversa?.integracao_whatsapp_id) {
    throw new Error("Conversa sem integração WhatsApp para enviar a contingência.");
  }

  const { data: integracao, error: integracaoError } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id, phone_number_id, token_ref, config_json")
    .eq("empresa_id", params.empresaId)
    .eq("id", conversa.integracao_whatsapp_id)
    .maybeSingle();
  if (integracaoError || !integracao?.phone_number_id) {
    throw new Error("Integração WhatsApp indisponível para a contingência.");
  }

  const accessToken = getWhatsAppAccessToken(integracao);
  if (!accessToken) throw new Error("Token do WhatsApp indisponível para a contingência.");

  const envio = await sendWhatsAppTextMessage({
    phoneNumberId: integracao.phone_number_id,
    accessToken,
    to: params.numeroDestino,
    body: texto,
  });

  const protocolo = await buscarOuCriarProtocolo({
    empresaId: params.empresaId,
    conversaId: params.conversaId,
  });
  const agora = new Date().toISOString();

  const { error: mensagemError } = await supabaseAdmin.from("mensagens").insert({
    empresa_id: params.empresaId,
    conversa_id: params.conversaId,
    conversa_protocolo_id: protocolo.id,
    remetente_tipo: "bot",
    remetente_id: null,
    conteudo: texto,
    tipo_mensagem: "texto",
    origem: "automatica",
    status_envio: envio.ok ? "enviada" : "falha",
    mensagem_externa_id: envio.messageId,
    metadata_json: {
      origem: "agente_ia_contingencia",
      agente_id: params.agenteId,
      meta_status: envio.status,
      meta_error: envio.error,
    },
    created_at: agora,
    updated_at: agora,
  });

  if (mensagemError) {
    console.error("[AGENTE_IA] Falha ao persistir mensagem de contingência:", mensagemError);
  }
  if (!envio.ok) throw new Error(envio.error || "Falha ao enviar mensagem de contingência.");

  await supabaseAdmin
    .from("conversas")
    .update({ last_message_at: agora, updated_at: agora })
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId);

  return { ok: true, messageId: envio.messageId };
}

async function cancelarExecucoesDeFluxoAtivas(empresaId: string, conversaId: string) {
  const { data: execucoes } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, metadata_json")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .in("status", ["rodando", "aguardando"]);

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
          motivo_cancelamento: "agente_ia_contingencia",
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

async function executarFluxoFallback(agente: AgenteContingencia, pendencia: PendenciaContingencia) {
  const fluxoId = String(agente.fallback_fluxo_id || "").trim();
  if (!fluxoId) return { ok: false, tipo: "fluxo", error: "Fluxo de fallback não configurado." };

  const [{ data: fluxo, error: fluxoError }, { data: conversa, error: conversaError }] = await Promise.all([
    supabaseAdmin
      .from("automacao_fluxos")
      .select("id, nome, status, configuracao_json")
      .eq("empresa_id", pendencia.empresa_id)
      .eq("id", fluxoId)
      .eq("status", "ativo")
      .maybeSingle(),
    supabaseAdmin
      .from("conversas")
      .select("id, integracao_whatsapp_id")
      .eq("empresa_id", pendencia.empresa_id)
      .eq("id", pendencia.conversa_id)
      .maybeSingle(),
  ]);

  if (fluxoError || !fluxo) {
    return { ok: false, tipo: "fluxo", error: fluxoError?.message || "Fluxo de fallback inativo ou inexistente." };
  }
  if (conversaError || !conversa) {
    return { ok: false, tipo: "fluxo", error: conversaError?.message || "Conversa não encontrada." };
  }
  if (!fluxoPermiteIntegracaoWhatsapp(fluxo.configuracao_json, conversa.integracao_whatsapp_id)) {
    return { ok: false, tipo: "fluxo", error: "O fluxo de fallback não está habilitado para a integração desta conversa." };
  }

  const { data: noInicial, error: noError } = await supabaseAdmin
    .from("automacao_nos")
    .select("*")
    .eq("empresa_id", pendencia.empresa_id)
    .eq("fluxo_id", fluxo.id)
    .eq("tipo_no", "inicio")
    .eq("ativo", true)
    .maybeSingle();
  if (noError || !noInicial) {
    return { ok: false, tipo: "fluxo", error: noError?.message || "Fluxo de fallback sem bloco inicial." };
  }

  await cancelarExecucoesDeFluxoAtivas(pendencia.empresa_id, pendencia.conversa_id);
  const protocolo = await buscarOuCriarProtocolo({
    empresaId: pendencia.empresa_id,
    conversaId: pendencia.conversa_id,
    contatoId: pendencia.contato_id || null,
  });
  const agora = new Date().toISOString();

  const { data: execucao, error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .insert({
      empresa_id: pendencia.empresa_id,
      fluxo_id: fluxo.id,
      contato_id: pendencia.contato_id || null,
      conversa_id: pendencia.conversa_id,
      conversa_protocolo_id: protocolo.id,
      no_atual_id: noInicial.id,
      status: "rodando",
      metadata_json: {
        tipo_inicio: "agente_ia_fallback",
        agente_ia_id: agente.id,
        mensagem_inicial: pendencia.conteudo_agregado,
        integracao_whatsapp_id: conversa.integracao_whatsapp_id,
        visitas_nos: { [noInicial.id]: 1 },
      },
      started_at: agora,
      created_at: agora,
      updated_at: agora,
    })
    .select("id")
    .single();
  if (execucaoError || !execucao) {
    return { ok: false, tipo: "fluxo", error: execucaoError?.message || "Não foi possível iniciar o fluxo de fallback." };
  }

  await supabaseAdmin
    .from("conversas")
    .update({
      status: "bot",
      bot_ativo: true,
      aguardando_atendente: false,
      origem_atendimento: "bot",
      responsavel_id: null,
      agente_ia_id: null,
      agente_ia_protocolo_id: protocolo.id,
      agente_ia_fallback_ativo: true,
      closed_at: null,
      updated_at: agora,
    })
    .eq("empresa_id", pendencia.empresa_id)
    .eq("id", pendencia.conversa_id);

  await executarNo({
    empresaId: pendencia.empresa_id,
    conversaId: pendencia.conversa_id,
    execucaoId: execucao.id,
    fluxoId: fluxo.id,
    no: noInicial,
    mensagemTexto: pendencia.conteudo_agregado,
    numeroDestino: pendencia.numero_destino || "",
  });

  return { ok: true, tipo: "fluxo", fluxoId: fluxo.id, execucaoId: execucao.id };
}

async function executarTransferenciaFallback(agente: AgenteContingencia, pendencia: PendenciaContingencia) {
  const config = (agente.fallback_transferencia_json || {}) as Record<string, unknown>;
  const escopoFila = String(config.escopo_fila || "setor") === "geral" ? "geral" : "setor";
  const setorId = escopoFila === "geral" ? null : String(config.setor_id || "").trim() || null;
  const mensagem = String(config.mensagem ?? "").trim();

  if (mensagem && pendencia.numero_destino) {
    await enviarMensagemContingencia({
      empresaId: pendencia.empresa_id,
      conversaId: pendencia.conversa_id,
      agenteId: agente.id,
      numeroDestino: pendencia.numero_destino,
      texto: mensagem,
    });
  }

  const atribuicao = await resolverAtribuicaoTransferencia({
    empresaId: pendencia.empresa_id,
    setorId,
    escopoFila,
    estrategia: config.estrategia_transferencia,
    atendenteId: config.atendente_id,
    incluirAdministradores: config.incluir_administradores_distribuicao,
  });
  const protocolo = await buscarOuCriarProtocolo({
    empresaId: pendencia.empresa_id,
    conversaId: pendencia.conversa_id,
    contatoId: pendencia.contato_id || null,
  });
  const agora = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("conversas")
    .update({
      setor_id: atribuicao.setorId,
      escopo_fila: atribuicao.escopoFila,
      status: atribuicao.responsavelId ? "em_atendimento" : "fila",
      responsavel_id: atribuicao.responsavelId,
      bot_ativo: false,
      aguardando_atendente: !atribuicao.responsavelId,
      agente_ia_id: null,
      agente_ia_protocolo_id: protocolo.id,
      agente_ia_fallback_ativo: true,
      updated_at: agora,
    })
    .eq("empresa_id", pendencia.empresa_id)
    .eq("id", pendencia.conversa_id);
  if (error) throw new Error(error.message);

  return {
    ok: true,
    tipo: "transferir_humano",
    setorId: atribuicao.setorId,
    responsavelId: atribuicao.responsavelId,
    estrategiaAplicada: atribuicao.estrategiaAplicada,
    fallbackMotivo: atribuicao.fallbackMotivo,
  };
}

export async function executarContingenciaAgente(
  agente: AgenteContingencia,
  pendencia: PendenciaContingencia
) {
  const tipo = String(agente.fallback_tipo || "nenhum");

  if (tipo === "fluxo") {
    return executarFluxoFallback(agente, pendencia);
  }
  if (tipo === "transferir_humano") {
    return executarTransferenciaFallback(agente, pendencia);
  }

  return {
    ok: true,
    tipo: "nenhum",
    executado: false,
    motivo: "contingencia_nao_configurada",
  };
}
