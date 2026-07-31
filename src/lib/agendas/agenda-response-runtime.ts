/* eslint-disable @typescript-eslint/no-explicit-any */

import { executarNo } from "@/lib/automacoes/process-automation-engine";
import type { AutomacaoNo } from "@/lib/automacoes/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { formatAgendaDateTime } from "./template-mapping";

const supabase = getSupabaseAdmin();

type ResponseJob = {
  id: string;
  empresa_id: string;
  agenda_id: string;
  agendamento_id: string;
  conversa_id: string;
  mensagem_id: string;
  fluxo_id: string | null;
  acao: "confirmar" | "cancelar" | "reagendar";
  status: string;
  tentativas: number;
  max_tentativas: number;
  resultado_json: Record<string, any> | null;
};

class ResponseFlowError extends Error {
  permanent: boolean;
  cancel: boolean;

  constructor(message: string, options?: { permanent?: boolean; cancel?: boolean }) {
    super(message);
    this.name = "ResponseFlowError";
    this.permanent = options?.permanent === true;
    this.cancel = options?.cancel === true;
  }
}

async function patch(job: ResponseJob, values: Record<string, unknown>) {
  const { error } = await supabase
    .from("agenda_automacao_respostas")
    .update({ ...values, bloqueado_em: null, updated_at: new Date().toISOString() })
    .eq("empresa_id", job.empresa_id)
    .eq("id", job.id);
  if (error) throw new Error(`Erro ao atualizar resposta da agenda: ${error.message}`);
}

async function getOrCreateProtocol(params: {
  empresaId: string;
  conversaId: string;
  contatoId: string;
}) {
  const { data: current } = await supabase
    .from("conversa_protocolos")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("conversa_id", params.conversaId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (current?.id) return current.id;

  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const { data, error } = await supabase
    .from("conversa_protocolos")
    .insert({
      empresa_id: params.empresaId,
      conversa_id: params.conversaId,
      contato_id: params.contatoId,
      protocolo: `AG-${day}-${suffix}`,
      tipo: "reabertura",
      ativo: true,
      iniciado_com_bot: true,
      resultado: "em_andamento",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Erro ao criar protocolo para o fluxo: ${error?.message || "sem retorno"}`);
  }
  return data.id;
}

async function processResponse(job: ResponseJob) {
  if (!job.fluxo_id) {
    throw new ResponseFlowError("Nenhum fluxo foi mapeado para esta ação.", {
      cancel: true,
    });
  }

  const [appointmentResult, agendaResult, conversationResult, flowResult] =
    await Promise.all([
      supabase
        .from("agenda_agendamentos")
        .select("*")
        .eq("empresa_id", job.empresa_id)
        .eq("id", job.agendamento_id)
        .maybeSingle(),
      supabase
        .from("agenda_calendarios")
        .select("id, nome, timezone, status")
        .eq("empresa_id", job.empresa_id)
        .eq("id", job.agenda_id)
        .maybeSingle(),
      supabase
        .from("conversas")
        .select(
          "id, contato_id, integracao_whatsapp_id, status, responsavel_id, bot_ativo, aguardando_atendente"
        )
        .eq("empresa_id", job.empresa_id)
        .eq("id", job.conversa_id)
        .maybeSingle(),
      supabase
        .from("automacao_fluxos")
        .select("id, nome, status")
        .eq("empresa_id", job.empresa_id)
        .eq("id", job.fluxo_id)
        .maybeSingle(),
    ]);

  for (const result of [appointmentResult, agendaResult, conversationResult, flowResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  const appointment = appointmentResult.data;
  const agenda = agendaResult.data;
  const conversation = conversationResult.data;
  const flow = flowResult.data;
  if (!appointment || !agenda || !conversation || !flow) {
    throw new ResponseFlowError(
      "Agendamento, agenda, conversa ou fluxo não foi encontrado.",
      { permanent: true }
    );
  }
  if (flow.status !== "ativo") {
    throw new ResponseFlowError("O fluxo mapeado não está ativo.", {
      permanent: true,
    });
  }
  if (!appointment.contato_id || !conversation.contato_id) {
    throw new ResponseFlowError(
      "A resposta da agenda não possui contato vinculado.",
      { permanent: true }
    );
  }
  if (appointment.contato_id !== conversation.contato_id) {
    throw new ResponseFlowError(
      "A conversa não pertence ao contato do agendamento.",
      { permanent: true }
    );
  }

  const { data: existing } = await supabase
    .from("automacao_execucoes")
    .select("id, status")
    .eq("empresa_id", job.empresa_id)
    .contains("metadata_json", { agenda_automacao_resposta_id: job.id })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    await patch(job, {
      status: "concluido",
      executado_em: new Date().toISOString(),
      automacao_execucao_id: existing.id,
      proxima_tentativa_em: null,
      erro: null,
      resultado_json: { reutilizado: true, status_execucao: existing.status },
    });
    return;
  }

  const humanService =
    conversation.status === "em_atendimento" &&
    conversation.responsavel_id &&
    conversation.bot_ativo !== true;
  if (humanService || conversation.aguardando_atendente === true) {
    throw new ResponseFlowError(
      "A conversa está em atendimento humano; o fluxo será tentado novamente."
    );
  }

  const { data: activeExecution } = await supabase
    .from("automacao_execucoes")
    .select("id")
    .eq("empresa_id", job.empresa_id)
    .eq("conversa_id", conversation.id)
    .in("status", ["rodando", "aguardando"])
    .limit(1)
    .maybeSingle();
  if (activeExecution?.id) {
    throw new ResponseFlowError(
      "A conversa já possui uma automação ativa; o fluxo será tentado novamente."
    );
  }

  const { data: initialNode, error: nodeError } = await supabase
    .from("automacao_nos")
    .select("*")
    .eq("empresa_id", job.empresa_id)
    .eq("fluxo_id", flow.id)
    .eq("tipo_no", "inicio")
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (nodeError || !initialNode) {
    throw new ResponseFlowError(
      "O fluxo mapeado não possui bloco inicial ativo.",
      { permanent: true }
    );
  }

  const protocolId = await getOrCreateProtocol({
    empresaId: job.empresa_id,
    conversaId: conversation.id,
    contatoId: appointment.contato_id,
  });
  const now = new Date().toISOString();
  const { error: conversationError } = await supabase
    .from("conversas")
    .update({
      status: "bot",
      bot_ativo: true,
      aguardando_atendente: false,
      responsavel_id: null,
      closed_at: null,
      updated_at: now,
      last_message_at: now,
    })
    .eq("empresa_id", job.empresa_id)
    .eq("id", conversation.id);
  if (conversationError) {
    throw new Error(`Erro ao preparar conversa: ${conversationError.message}`);
  }

  const phone = String(appointment.telefone_cliente || "").replace(/\D/g, "");
  if (phone.length < 10) {
    throw new ResponseFlowError(
      "O agendamento não possui telefone válido para iniciar o fluxo.",
      { permanent: true }
    );
  }

  const variables = {
    agenda_agendamento_id: appointment.id,
    agenda_id: agenda.id,
    agenda_acao: job.acao,
    agenda_data: formatAgendaDateTime(
      appointment.inicio_at,
      agenda.timezone,
      "data_numerica"
    ),
    agenda_hora: formatAgendaDateTime(
      appointment.inicio_at,
      agenda.timezone,
      "hora_numerica"
    ),
    agenda_data_hora: formatAgendaDateTime(
      appointment.inicio_at,
      agenda.timezone,
      "data_hora_numerica"
    ),
    agenda_titulo: appointment.titulo || agenda.nome || "Agendamento",
    agenda_local: appointment.local || "",
    agenda_link_reuniao: appointment.link_reuniao || "",
    nome_contato: appointment.nome_cliente || "Cliente",
    nome_whatsapp: appointment.nome_cliente || "Cliente",
  };

  const { data: execution, error: executionError } = await supabase
    .from("automacao_execucoes")
    .insert({
      empresa_id: job.empresa_id,
      fluxo_id: flow.id,
      contato_id: appointment.contato_id,
      conversa_id: conversation.id,
      conversa_protocolo_id: protocolId,
      no_atual_id: initialNode.id,
      status: "rodando",
      metadata_json: {
        gatilho_id: null,
        tipo_inicio: "agenda_resposta_whatsapp",
        mensagem_inicial: `agenda_${job.acao}`,
        integracao_whatsapp_id: conversation.integracao_whatsapp_id || null,
        agenda_automacao_resposta_id: job.id,
        agenda_agendamento_id: appointment.id,
        agenda_id: agenda.id,
        agenda_acao: job.acao,
        mensagem_resposta_id: job.mensagem_id,
        visitas_nos: { [initialNode.id]: 1 },
        variaveis: variables,
      },
    })
    .select("*")
    .single();
  if (executionError || !execution) {
    if (executionError?.code === "23505") {
      throw new ResponseFlowError(
        "Outra automação iniciou na conversa ao mesmo tempo; nova tentativa será realizada."
      );
    }
    throw new Error(
      `Erro ao iniciar fluxo da resposta: ${executionError?.message || "sem retorno"}`
    );
  }

  await executarNo({
    empresaId: job.empresa_id,
    conversaId: conversation.id,
    execucaoId: execution.id,
    fluxoId: flow.id,
    no: initialNode as AutomacaoNo,
    mensagemTexto: `agenda_${job.acao}`,
    numeroDestino: phone,
  });

  await patch(job, {
    status: "concluido",
    executado_em: new Date().toISOString(),
    automacao_execucao_id: execution.id,
    proxima_tentativa_em: null,
    erro: null,
    resultado_json: {
      fluxo_id: flow.id,
      fluxo_nome: flow.nome,
      automacao_execucao_id: execution.id,
      variaveis: variables,
    },
  });
}

async function fail(job: ResponseJob, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Erro desconhecido");
  const custom = error as { permanent?: boolean; cancel?: boolean };
  const final = custom.permanent || custom.cancel || job.tentativas >= job.max_tentativas;
  const delayMinutes = Math.min(60, Math.max(2, 2 ** Math.max(1, job.tentativas)));
  await patch(job, {
    status: custom.cancel ? "cancelado" : final ? "erro" : "pendente",
    proxima_tentativa_em: final
      ? null
      : new Date(Date.now() + delayMinutes * 60_000).toISOString(),
    erro: message.slice(0, 1500),
    resultado_json: {
      ...(job.resultado_json || {}),
      ultima_falha_em: new Date().toISOString(),
      tentativa: job.tentativas,
      permanente: final,
    },
  });
  return custom.cancel ? "cancelado" : final ? "erro" : "reagendado";
}

export async function processAgendaResponseFlows(limit = 30) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 30)));
  const { data, error } = await supabase.rpc(
    "agenda_automacoes_respostas_reivindicar",
    { p_limite: safeLimit }
  );
  if (error) {
    throw new Error(`Erro ao reivindicar respostas da agenda: ${error.message}`);
  }

  const jobs = (Array.isArray(data) ? data : []) as ResponseJob[];
  const summary = {
    reivindicadas: jobs.length,
    concluidas: 0,
    canceladas: 0,
    reagendadas: 0,
    erros: 0,
  };
  for (const job of jobs) {
    try {
      await processResponse(job);
      summary.concluidas += 1;
    } catch (error) {
      console.error("[AGENDA_RESPOSTAS] Erro ao iniciar fluxo:", {
        respostaId: job.id,
        acao: job.acao,
        agendamentoId: job.agendamento_id,
        error,
      });
      const status = await fail(job, error);
      if (status === "cancelado") summary.canceladas += 1;
      else if (status === "reagendado") summary.reagendadas += 1;
      else summary.erros += 1;
    }
  }
  return summary;
}
