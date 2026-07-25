/* eslint-disable @typescript-eslint/no-explicit-any */

import { executarNo } from "@/lib/automacoes/process-automation-engine";
import type { AutomacaoNo } from "@/lib/automacoes/types";
import { sendAgendaAutomationEmail } from "@/lib/email/send-agenda-automation-email";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  AgendaAutomationError,
  appointmentTitle,
  contactName,
  customerEmail,
  customerPhone,
  dateLabel,
  humanText,
  timeLabel,
  validEmail,
  type Context,
} from "./automation-runtime-types";

const supabase = getSupabaseAdmin();

export async function sendEmail(context: Context) {
  const isResponsible = context.job.tipo === "aviso_responsavel";
  const recipient = isResponsible
    ? String(context.responsible?.email || "").trim().toLowerCase()
    : customerEmail(context);
  if (!validEmail(recipient)) {
    throw new AgendaAutomationError(
      isResponsible
        ? "O responsável não possui e-mail válido."
        : "O cliente não possui e-mail válido.",
      { cancel: true }
    );
  }

  const result = await sendAgendaAutomationEmail({
    jobId: context.job.id,
    empresaId: context.job.empresa_id,
    kind: context.job.tipo as "confirmacao" | "lembrete" | "aviso_responsavel",
    to: recipient,
    recipientName: isResponsible ? context.responsible?.nome : contactName(context),
    contactName: contactName(context),
    appointmentTitle: appointmentTitle(context),
    dateLabel: dateLabel(context.appointment.inicio_at, context.agenda.timezone),
    timeLabel: timeLabel(context.appointment.inicio_at, context.agenda.timezone),
    location: context.appointment.local,
    agendaId: context.agenda.id,
    appointmentId: context.appointment.id,
  });

  await supabase
    .from("agenda_automacao_execucoes")
    .update({
      mensagem_externa_id: result.id,
      resultado_json: { email_id: result.id, destinatario: result.recipient },
      updated_at: new Date().toISOString(),
    })
    .eq("empresa_id", context.job.empresa_id)
    .eq("id", context.job.id);

  return result;
}

export async function notifyResponsible(context: Context) {
  if (!context.responsible?.id) {
    throw new AgendaAutomationError(
      "O agendamento não possui responsável para receber a notificação.",
      { cancel: true }
    );
  }

  const { data: existing } = await supabase
    .from("notificacoes")
    .select("id")
    .eq("empresa_id", context.job.empresa_id)
    .eq("usuario_id", context.responsible.id)
    .contains("metadata_json", {
      agenda_automacao_execucao_id: context.job.id,
    })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return { notificationId: existing.id, reused: true };

  const { data, error } = await supabase
    .from("notificacoes")
    .insert({
      empresa_id: context.job.empresa_id,
      usuario_id: context.responsible.id,
      conversa_id: context.conversation?.id || null,
      contato_id: context.appointment.contato_id || null,
      tipo: "automacao",
      titulo: "Agendamento próximo",
      mensagem: humanText(context),
      lida: false,
      metadata_json: {
        tipo_notificacao: "agenda_automacao",
        agenda_automacao_execucao_id: context.job.id,
        agenda_agendamento_id: context.appointment.id,
        agenda_id: context.agenda.id,
        href: `/agendas?agenda=${context.agenda.id}&agendamento=${context.appointment.id}`,
      },
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Erro ao criar notificação: ${error?.message || "sem retorno"}`);
  }
  return { notificationId: data.id, reused: false };
}

async function getOrCreateProtocol(context: Context) {
  if (!context.conversation?.id) return null;
  const { data: current } = await supabase
    .from("conversa_protocolos")
    .select("id")
    .eq("empresa_id", context.job.empresa_id)
    .eq("conversa_id", context.conversation.id)
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
      empresa_id: context.job.empresa_id,
      conversa_id: context.conversation.id,
      contato_id: context.appointment.contato_id || context.contact?.id || null,
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

export async function startPostFlow(context: Context) {
  if (!context.flow || context.flow.status !== "ativo") {
    throw new AgendaAutomationError(
      "O fluxo de pós-atendimento não está ativo ou não foi encontrado.",
      { permanent: true }
    );
  }
  if (!context.appointment.contato_id || !context.conversation?.id) {
    throw new AgendaAutomationError(
      "O pós-atendimento exige um contato e uma conversa vinculados ao agendamento.",
      { permanent: true }
    );
  }
  const phone = customerPhone(context);
  if (phone.length < 10) {
    throw new AgendaAutomationError(
      "O contato não possui telefone válido para iniciar o fluxo de pós-atendimento.",
      { permanent: true }
    );
  }

  const { data: existingJobExecution } = await supabase
    .from("automacao_execucoes")
    .select("id, status")
    .eq("empresa_id", context.job.empresa_id)
    .contains("metadata_json", {
      agenda_automacao_execucao_id: context.job.id,
    })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingJobExecution?.id) {
    return {
      automationExecutionId: existingJobExecution.id,
      reused: true,
      status: existingJobExecution.status,
    };
  }

  const humanService =
    context.conversation.status === "em_atendimento" &&
    context.conversation.responsavel_id &&
    context.conversation.bot_ativo !== true;
  if (humanService || context.conversation.aguardando_atendente === true) {
    throw new AgendaAutomationError(
      "A conversa está em atendimento humano; o fluxo será tentado novamente depois."
    );
  }

  const { data: activeExecution } = await supabase
    .from("automacao_execucoes")
    .select("id")
    .eq("empresa_id", context.job.empresa_id)
    .eq("conversa_id", context.conversation.id)
    .in("status", ["rodando", "aguardando"])
    .limit(1)
    .maybeSingle();
  if (activeExecution?.id) {
    throw new AgendaAutomationError(
      "A conversa já possui uma automação ativa; o pós-atendimento será tentado novamente."
    );
  }

  const { data: initialNode, error: nodeError } = await supabase
    .from("automacao_nos")
    .select("*")
    .eq("empresa_id", context.job.empresa_id)
    .eq("fluxo_id", context.flow.id)
    .eq("tipo_no", "inicio")
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (nodeError || !initialNode) {
    throw new AgendaAutomationError(
      "O fluxo de pós-atendimento não possui bloco inicial ativo.",
      { permanent: true }
    );
  }

  const protocolId = await getOrCreateProtocol(context);
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
    .eq("empresa_id", context.job.empresa_id)
    .eq("id", context.conversation.id);
  if (conversationError) {
    throw new Error(`Erro ao preparar conversa para o fluxo: ${conversationError.message}`);
  }

  const { data: execution, error: executionError } = await supabase
    .from("automacao_execucoes")
    .insert({
      empresa_id: context.job.empresa_id,
      fluxo_id: context.flow.id,
      contato_id: context.appointment.contato_id,
      conversa_id: context.conversation.id,
      conversa_protocolo_id: protocolId,
      no_atual_id: initialNode.id,
      status: "rodando",
      metadata_json: {
        gatilho_id: null,
        tipo_inicio: "agenda_pos_atendimento",
        mensagem_inicial: "pos_atendimento_agenda",
        integracao_whatsapp_id: context.conversation.integracao_whatsapp_id || null,
        agenda_automacao_execucao_id: context.job.id,
        agenda_agendamento_id: context.appointment.id,
        agenda_id: context.agenda.id,
        visitas_nos: { [initialNode.id]: 1 },
        variaveis: {
          agenda_agendamento_id: context.appointment.id,
          agenda_id: context.agenda.id,
          agenda_data: dateLabel(
            context.appointment.inicio_at,
            context.agenda.timezone
          ),
          agenda_hora: timeLabel(
            context.appointment.inicio_at,
            context.agenda.timezone
          ),
          agenda_titulo: appointmentTitle(context),
          nome_contato: contactName(context),
        },
      },
    })
    .select("*")
    .single();
  if (executionError || !execution) {
    if (executionError?.code === "23505") {
      throw new AgendaAutomationError(
        "Outra automação iniciou na conversa ao mesmo tempo; nova tentativa será realizada."
      );
    }
    throw new Error(
      `Erro ao iniciar fluxo de pós-atendimento: ${executionError?.message || "sem retorno"}`
    );
  }

  await executarNo({
    empresaId: context.job.empresa_id,
    conversaId: context.conversation.id,
    execucaoId: execution.id,
    fluxoId: context.flow.id,
    no: initialNode as AutomacaoNo,
    mensagemTexto: "pos_atendimento_agenda",
    numeroDestino: phone,
  });

  return {
    automationExecutionId: execution.id,
    reused: false,
    status: "iniciado",
  };
}
