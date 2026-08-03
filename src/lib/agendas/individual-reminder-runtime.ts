/* eslint-disable @typescript-eslint/no-explicit-any */

import { sendAgendaAutomationEmail } from "@/lib/email/send-agenda-automation-email";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { extractTemplateVariablePositions } from "./template-mapping";
import { sendWhatsApp } from "./automation-runtime-whatsapp";
import {
  AgendaAutomationError,
  appointmentTitle,
  contactName,
  dateLabel,
  timeLabel,
  type Job,
} from "./automation-runtime-types";

const supabase = getSupabaseAdmin();

function payload(job: Job) {
  const value = job.payload_json;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function isIndividualReminder(job: Job) {
  const data = payload(job);
  return (
    String((job as any).tipo || "") === "lembrete_individual" ||
    String(data.origem_disparo || data.origem || "") === "lembrete_individual"
  );
}

function defaultTemplateMappings(templatePayload: unknown) {
  const positions = extractTemplateVariablePositions(templatePayload);
  const defaults = [
    { fonte: "contato.nome", formato: "texto" },
    { fonte: "agendamento.inicio_at", formato: "dia_semana_data" },
    { fonte: "agendamento.inicio_at", formato: "hora_numerica" },
    { fonte: "agendamento.titulo", formato: "texto" },
    { fonte: "agenda.nome", formato: "texto" },
    { fonte: "agendamento.local", formato: "texto" },
  ];
  return positions.map((posicao, index) => ({
    posicao,
    ...(defaults[index] || defaults[3]),
    valor_fixo: null,
    valor_padrao: "-",
  }));
}

async function findConversation(appointment: any, companyId: string) {
  const appointmentConversationId = String(appointment?.conversa_id || "").trim();
  if (appointmentConversationId) {
    const { data } = await supabase
      .from("conversas")
      .select(
        "id, empresa_id, contato_id, responsavel_id, integracao_whatsapp_id, status, bot_ativo, aguardando_atendente, last_message_at, last_inbound_message_at, window_expires_at, closed_at"
      )
      .eq("empresa_id", companyId)
      .eq("id", appointmentConversationId)
      .maybeSingle();
    if (data) return data;
  }

  if (!appointment?.contato_id) return null;
  const { data } = await supabase
    .from("conversas")
    .select(
      "id, empresa_id, contato_id, responsavel_id, integracao_whatsapp_id, status, bot_ativo, aguardando_atendente, last_message_at, last_inbound_message_at, window_expires_at, closed_at"
    )
    .eq("empresa_id", companyId)
    .eq("contato_id", appointment.contato_id)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function buildContext(job: Job) {
  const data = payload(job);
  const reminderId = String(data.agenda_lembrete_id || (job as any).agenda_lembrete_id || "").trim();
  if (!reminderId) {
    throw new AgendaAutomationError("O lembrete individual não possui identificação.", {
      permanent: true,
    });
  }

  const [appointmentResult, agendaResult, reminderResult] = await Promise.all([
    supabase
      .from("agenda_agendamentos")
      .select("*")
      .eq("empresa_id", job.empresa_id)
      .eq("id", job.agendamento_id)
      .maybeSingle(),
    supabase
      .from("agenda_calendarios")
      .select("id, empresa_id, nome, timezone, status, metadata_json")
      .eq("empresa_id", job.empresa_id)
      .eq("id", job.agenda_id)
      .maybeSingle(),
    supabase
      .from("agenda_lembretes")
      .select("*")
      .eq("empresa_id", job.empresa_id)
      .eq("id", reminderId)
      .maybeSingle(),
  ]);

  if (appointmentResult.error) throw new Error(appointmentResult.error.message);
  if (agendaResult.error) throw new Error(agendaResult.error.message);
  if (reminderResult.error) throw new Error(reminderResult.error.message);
  const appointment = appointmentResult.data;
  const agenda = agendaResult.data;
  const reminder = reminderResult.data;
  if (!appointment || !agenda || !reminder) {
    throw new AgendaAutomationError(
      "O agendamento ou lembrete individual não foi encontrado.",
      { cancel: true }
    );
  }
  if (agenda.status !== "ativo" || reminder.ativo !== true) {
    throw new AgendaAutomationError("O lembrete individual não está mais ativo.", {
      cancel: true,
    });
  }
  if (!["agendado", "confirmado"].includes(String(appointment.status || ""))) {
    throw new AgendaAutomationError(
      "O compromisso não está mais ativo para receber este lembrete.",
      { cancel: true }
    );
  }
  if (Date.parse(String(appointment.fim_at || "")) < Date.now()) {
    throw new AgendaAutomationError("O horário do compromisso já terminou.", {
      cancel: true,
    });
  }

  const recipient =
    data.destinatario && typeof data.destinatario === "object"
      ? (data.destinatario as Record<string, any>)
      : {};
  const recipientType = String(data.destinatario_tipo || reminder.destinatario_tipo || "");
  const recipientName = String(recipient.nome || "Destinatário").trim();
  const recipientEmail = String(recipient.email || "").trim().toLowerCase();
  const recipientPhone = String(recipient.telefone || "").replace(/\D/g, "");
  const recipientUserId = String(recipient.usuario_id || "").trim() || null;

  const [contactResult, responsibleResult] = await Promise.all([
    appointment.contato_id
      ? supabase
          .from("contatos")
          .select("id, nome, telefone, email, status_lead, classificacao")
          .eq("empresa_id", job.empresa_id)
          .eq("id", appointment.contato_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    appointment.responsavel_id
      ? supabase
          .from("usuarios")
          .select("id, nome, email, telefone, status")
          .eq("empresa_id", job.empresa_id)
          .eq("id", appointment.responsavel_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (contactResult.error) throw new Error(contactResult.error.message);
  if (responsibleResult.error) throw new Error(responsibleResult.error.message);

  const reminderMetadata =
    reminder.metadata_json && typeof reminder.metadata_json === "object"
      ? reminder.metadata_json
      : {};
  const integrationId = String(
    data.integracao_whatsapp_id || reminderMetadata.integracao_whatsapp_id || ""
  ).trim();
  const templateId = String(
    data.whatsapp_template_id || reminderMetadata.whatsapp_template_id || ""
  ).trim();

  const [integrationResult, templateResult] = await Promise.all([
    integrationId
      ? supabase
          .from("integracoes_whatsapp")
          .select(
            "id, empresa_id, nome_conexao, phone_number_id, status, coex_status, provider, config_json, token_ref, meta_messaging_limit, meta_messaging_limit_tier, meta_account_mode, quality_rating"
          )
          .eq("empresa_id", job.empresa_id)
          .eq("id", integrationId)
          .or("status.eq.ativa,coex_status.eq.ativo")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    templateId
      ? supabase
          .from("whatsapp_templates")
          .select(
            "id, empresa_id, integracao_whatsapp_id, nome, idioma, status, categoria, payload, opt_out_habilitado"
          )
          .eq("empresa_id", job.empresa_id)
          .eq("id", templateId)
          .in("status", ["approved", "APPROVED", "aprovado"])
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (integrationResult.error) throw new Error(integrationResult.error.message);
  if (templateResult.error) throw new Error(templateResult.error.message);

  const template = templateResult.data || null;
  const savedMappings = Array.isArray(reminderMetadata.template_variaveis)
    ? reminderMetadata.template_variaveis
    : [];
  const configuration = {
    ...reminderMetadata,
    execucao_habilitada: true,
    marketing_aceito: reminderMetadata.marketing_aceito === true,
    template_variaveis:
      savedMappings.length > 0
        ? savedMappings
        : defaultTemplateMappings(template?.payload),
    template_botoes: [],
  };

  const isClient = recipientType === "cliente";
  const effectiveAppointment = {
    ...appointment,
    nome_cliente: recipientName,
    telefone_cliente: recipientPhone,
    email_cliente: recipientEmail,
    contato_id: isClient ? appointment.contato_id : null,
    conversa_id: isClient ? appointment.conversa_id : null,
  };
  const conversation =
    isClient && String(job.canal) === "whatsapp"
      ? await findConversation(appointment, job.empresa_id)
      : null;
  const effectiveResponsible = recipientUserId
    ? {
        id: recipientUserId,
        nome: recipientName,
        email: recipientEmail,
        telefone: recipientPhone,
        status: "ativo",
      }
    : responsibleResult.data || null;

  return {
    reminderId,
    reminder,
    recipient,
    recipientType,
    recipientName,
    recipientEmail,
    recipientPhone,
    recipientUserId,
    context: {
      job: { ...job, tipo: "lembrete" },
      rule: {
        id: null,
        ativo: true,
        tipo: "lembrete",
        canal: job.canal,
        integracao_whatsapp_id: integrationId || null,
        whatsapp_template_id: templateId || null,
        configuracao_json: configuration,
      },
      agenda,
      appointment: effectiveAppointment,
      contact: isClient ? contactResult.data || null : null,
      responsible: effectiveResponsible,
      conversation,
      integration: integrationResult.data || null,
      template,
      flow: null,
    } as any,
    originalAppointment: appointment,
    originalContact: contactResult.data || null,
  };
}

async function createSystemNotification(built: Awaited<ReturnType<typeof buildContext>>) {
  if (!built.recipientUserId) {
    throw new AgendaAutomationError(
      "A notificação no sistema exige um responsável ou participante interno.",
      { cancel: true }
    );
  }
  const context = built.context;
  const { data: existing } = await supabase
    .from("notificacoes")
    .select("id")
    .eq("empresa_id", context.job.empresa_id)
    .eq("usuario_id", built.recipientUserId)
    .contains("metadata_json", { agenda_automacao_execucao_id: context.job.id })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return { notificationId: existing.id, reused: true };

  const clientName = String(
    built.originalAppointment.nome_cliente || built.originalContact?.nome || "Cliente"
  ).trim();
  const { data, error } = await supabase
    .from("notificacoes")
    .insert({
      empresa_id: context.job.empresa_id,
      usuario_id: built.recipientUserId,
      conversa_id: built.originalAppointment.conversa_id || null,
      contato_id: built.originalAppointment.contato_id || null,
      tipo: "automacao",
      titulo: "Lembrete adicional do agendamento",
      mensagem: `${clientName} possui “${appointmentTitle(context)}” em ${dateLabel(
        built.originalAppointment.inicio_at,
        context.agenda.timezone
      )}, às ${timeLabel(
        built.originalAppointment.inicio_at,
        context.agenda.timezone
      )}.`,
      lida: false,
      metadata_json: {
        tipo_notificacao: "agenda_lembrete_individual",
        agenda_automacao_execucao_id: context.job.id,
        agenda_lembrete_id: built.reminderId,
        agenda_agendamento_id: built.originalAppointment.id,
        agenda_id: context.agenda.id,
        href: `/agendas?agenda=${context.agenda.id}&agendamento=${built.originalAppointment.id}`,
      },
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Erro ao criar notificação do lembrete: ${error?.message || "sem retorno"}`);
  }
  return { notificationId: data.id, reused: false };
}

async function sendIndividualEmail(built: Awaited<ReturnType<typeof buildContext>>) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(built.recipientEmail)) {
    throw new AgendaAutomationError("O destinatário não possui e-mail válido.", {
      cancel: true,
    });
  }
  const context = built.context;
  return sendAgendaAutomationEmail({
    jobId: context.job.id,
    empresaId: context.job.empresa_id,
    kind: "lembrete",
    to: built.recipientEmail,
    recipientName: built.recipientName,
    contactName: String(
      built.originalAppointment.nome_cliente || built.originalContact?.nome || "Cliente"
    ),
    appointmentTitle: appointmentTitle(context),
    dateLabel: dateLabel(
      built.originalAppointment.inicio_at,
      context.agenda.timezone
    ),
    timeLabel: timeLabel(
      built.originalAppointment.inicio_at,
      context.agenda.timezone
    ),
    location: built.originalAppointment.local,
    startAt: built.originalAppointment.inicio_at,
    endAt: built.originalAppointment.fim_at,
    agendaId: context.agenda.id,
    appointmentId: built.originalAppointment.id,
  });
}

export async function processIndividualReminder(job: Job) {
  const built = await buildContext(job);
  if (job.canal === "sistema") {
    const result = await createSystemNotification(built);
    return {
      reminderId: built.reminderId,
      result,
      externalId: result.notificationId,
    };
  }
  if (job.canal === "email") {
    const result = await sendIndividualEmail(built);
    return { reminderId: built.reminderId, result, externalId: result.id };
  }
  if (job.canal === "whatsapp") {
    if (!built.recipientPhone || built.recipientPhone.length < 10) {
      throw new AgendaAutomationError(
        "O destinatário não possui telefone válido para o WhatsApp.",
        { cancel: true }
      );
    }
    const result = await sendWhatsApp(built.context);
    return {
      reminderId: built.reminderId,
      result,
      externalId: result.messageId,
    };
  }
  throw new AgendaAutomationError("Canal inválido para o lembrete individual.", {
    permanent: true,
  });
}

export async function refreshIndividualReminderStatus(job: Job) {
  const data = payload(job);
  const reminderId = String(data.agenda_lembrete_id || (job as any).agenda_lembrete_id || "").trim();
  if (!reminderId) return;
  const { data: executions, error } = await supabase
    .from("agenda_automacao_execucoes")
    .select("status, executado_em, erro")
    .eq("empresa_id", job.empresa_id)
    .eq("agenda_lembrete_id", reminderId);
  if (error || !executions?.length) return;

  const statuses = executions.map((item) => String(item.status || ""));
  let status = "pendente";
  let erro: string | null = null;
  let enviadoEm: string | null = null;
  if (statuses.every((item) => item === "concluido")) {
    status = "enviado";
    enviadoEm = executions
      .map((item) => item.executado_em)
      .filter(Boolean)
      .sort()
      .at(-1) || new Date().toISOString();
  } else if (statuses.some((item) => ["pendente", "processando"].includes(item))) {
    status = "pendente";
  } else if (statuses.some((item) => item === "erro")) {
    status = "falha";
    erro = executions
      .map((item) => String(item.erro || "").trim())
      .filter(Boolean)
      .join(" | ")
      .slice(0, 1500) || "Falha ao executar o lembrete individual.";
  } else if (statuses.every((item) => item === "cancelado")) {
    status = "cancelado";
    erro = executions
      .map((item) => String(item.erro || "").trim())
      .filter(Boolean)
      .join(" | ")
      .slice(0, 1500) || null;
  }

  await supabase
    .from("agenda_lembretes")
    .update({
      status,
      enviado_em: enviadoEm,
      erro,
      updated_at: new Date().toISOString(),
    })
    .eq("empresa_id", job.empresa_id)
    .eq("id", reminderId);
}
