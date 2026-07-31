/* eslint-disable @typescript-eslint/no-explicit-any */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { canSendFreeformWhatsAppMessage } from "@/lib/whatsapp/can-send-message";
import { atualizarReservaLimiteMeta, reservarLimiteMeta } from "@/lib/whatsapp/meta-limites";
import { registrarContextoOptOutTemplate, telefoneEstaSuprimido } from "@/lib/whatsapp/opt-out";
import { sendWhatsAppTemplateMessage } from "@/lib/whatsapp/send-template-message";
import {
  AgendaAutomationError,
  contactName,
  customerPhone,
  humanText,
  normalize,
  quickReplyButtons,
  templateParameters,
  type Context,
} from "./automation-runtime-types";

const supabase = getSupabaseAdmin();

async function logWhatsApp(
  context: Context,
  values: {
    status: string;
    error?: string | null;
    statusHttp?: number | null;
    messageId?: string | null;
    raw?: unknown;
    variables?: string[];
    variablesSnapshot?: Record<string, string>;
  }
) {
  await supabase.from("whatsapp_disparos_logs").insert({
    empresa_id: context.job.empresa_id,
    conversa_id: context.conversation?.id || null,
    conversa_protocolo_id: context.appointment.conversa_protocolo_id || null,
    contato_id: context.appointment.contato_id || context.contact?.id || null,
    integracao_whatsapp_id: context.integration?.id || null,
    numero: customerPhone(context),
    nome_contato: contactName(context),
    template_id: context.template?.id || null,
    template_nome: context.template?.nome || null,
    template_idioma: context.template?.idioma || null,
    mensagem: humanText(context),
    status: values.status,
    erro: values.error || null,
    status_http: values.statusHttp || null,
    message_id: values.messageId || null,
    variaveis: values.variables || [],
    meta_response: values.raw || null,
    metadata_json: {
      origem: "agenda_automacao",
      agenda_automacao_execucao_id: context.job.id,
      agenda_agendamento_id: context.appointment.id,
      agenda_id: context.agenda.id,
      tipo: context.job.tipo,
      canal: context.job.canal,
      template_categoria: context.template?.categoria || null,
      variaveis_enviadas: values.variablesSnapshot || {},
    },
  });
}

async function recordOutboundMessage(
  context: Context,
  messageId: string | null,
  raw: unknown,
  variablesSnapshot: Record<string, string>
) {
  if (!context.conversation?.id) return;
  if (
    context.conversation.integracao_whatsapp_id &&
    context.integration?.id &&
    context.conversation.integracao_whatsapp_id !== context.integration.id
  ) {
    return;
  }

  const { error } = await supabase.from("mensagens").insert({
    empresa_id: context.job.empresa_id,
    conversa_id: context.conversation.id,
    conversa_protocolo_id: context.appointment.conversa_protocolo_id || null,
    remetente_tipo: "sistema",
    remetente_id: null,
    conteudo: humanText(context),
    tipo_mensagem: "template",
    origem: "automatica",
    status_envio: "enviada",
    mensagem_externa_id: messageId,
    tipo_original_meta: "template",
    metadata_json: {
      agenda_automacao: true,
      agenda_automacao_execucao_id: context.job.id,
      agenda_agendamento_id: context.appointment.id,
      agenda_tipo: context.job.tipo,
      template_id: context.template?.id || null,
      template_nome: context.template?.nome || null,
      template_categoria: context.template?.categoria || null,
      variaveis_enviadas: variablesSnapshot,
      meta_response: raw,
    },
  });
  if (error) {
    console.warn("[AGENDA_AUTOMACOES] Mensagem enviada, mas não registrada:", error);
  }

  await supabase
    .from("conversas")
    .update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("empresa_id", context.job.empresa_id)
    .eq("id", context.conversation.id);
}

export async function sendWhatsApp(context: Context) {
  if (!context.integration?.phone_number_id) {
    throw new AgendaAutomationError(
      "A integração do WhatsApp selecionada não está ativa ou não possui phone_number_id.",
      { permanent: true }
    );
  }
  if (!context.template) {
    throw new AgendaAutomationError(
      "O template selecionado não está aprovado ou não foi encontrado.",
      { permanent: true }
    );
  }
  if (
    context.template.integracao_whatsapp_id &&
    context.template.integracao_whatsapp_id !== context.integration.id
  ) {
    throw new AgendaAutomationError(
      "O template selecionado pertence a outra integração do WhatsApp.",
      { permanent: true }
    );
  }

  const category = normalize(context.template.categoria);
  if (!["utility", "marketing"].includes(category)) {
    throw new AgendaAutomationError(
      "Somente templates aprovados como Utility ou Marketing podem ser usados nas automações da agenda.",
      { permanent: true }
    );
  }
  const config = context.rule?.configuracao_json || {};
  if (category === "marketing" && config.marketing_aceito !== true) {
    throw new AgendaAutomationError(
      "O template foi classificado pela Meta como Marketing e precisa de aceite explícito na configuração da agenda.",
      { permanent: true }
    );
  }

  const phone = customerPhone(context);
  if (phone.length < 10) {
    throw new AgendaAutomationError(
      "O cliente não possui telefone válido para receber a automação.",
      { cancel: true }
    );
  }

  if (
    await telefoneEstaSuprimido({
      empresaId: context.job.empresa_id,
      telefone: phone,
      categoria: category,
    })
  ) {
    throw new AgendaAutomationError(
      `Envio cancelado porque o contato solicitou opt-out de mensagens ${category}.`,
      { cancel: true }
    );
  }

  const accessToken = getWhatsAppAccessToken(context.integration);
  if (!accessToken) {
    throw new AgendaAutomationError(
      "A integração do WhatsApp não possui token de acesso válido.",
      { permanent: true }
    );
  }

  let resolved;
  try {
    resolved = templateParameters(context);
  } catch (error) {
    throw new AgendaAutomationError(
      error instanceof Error ? error.message : "O mapeamento das variáveis do template está incompleto.",
      { permanent: true }
    );
  }
  const buttons = quickReplyButtons(context);
  const sameIntegration =
    context.conversation?.integracao_whatsapp_id === context.integration.id;
  const window =
    sameIntegration && context.conversation?.id
      ? await canSendFreeformWhatsAppMessage({ conversaId: context.conversation.id })
      : null;

  let reservationIds: string[] = [];
  if (!window?.podeEnviarMensagemLivre) {
    const reservation = await reservarLimiteMeta({
      empresaId: context.job.empresa_id,
      integracao: context.integration,
      telefones: [phone],
      origem: "agenda_automacao",
      templateId: context.template.id,
      templateNome: context.template.nome,
      metadataJson: {
        agenda_automacao_execucao_id: context.job.id,
        agenda_agendamento_id: context.appointment.id,
        agenda_tipo: context.job.tipo,
        template_categoria: category,
        variaveis_enviadas: resolved.snapshot,
      },
    });
    if (!reservation.ok) {
      throw new AgendaAutomationError(reservation.error, { permanent: true });
    }
    reservationIds = reservation.reservaIds;
  }

  const result = await sendWhatsAppTemplateMessage({
    phoneNumberId: context.integration.phone_number_id,
    accessToken,
    to: phone,
    templateName: context.template.nome,
    languageCode: context.template.idioma || "pt_BR",
    bodyParameters: resolved.values,
    quickReplyButtons: buttons,
  });

  if (!result.ok) {
    if (reservationIds.length > 0) {
      await atualizarReservaLimiteMeta({
        reservaIds: reservationIds,
        telefone: phone,
        status: "falha",
        contatoId: context.contact?.id || null,
        conversaId: context.conversation?.id || null,
        metadataJson: {
          agenda_automacao_execucao_id: context.job.id,
          erro: result.error,
        },
      }).catch(() => undefined);
    }
    await logWhatsApp(context, {
      status: "falha",
      error: result.error,
      statusHttp: result.status,
      raw: result.raw,
      variables: resolved.values,
      variablesSnapshot: resolved.snapshot,
    }).catch(() => undefined);
    throw new AgendaAutomationError(
      result.error || "Falha ao enviar o template pelo WhatsApp.",
      { permanent: !result.transient }
    );
  }

  await supabase
    .from("agenda_automacao_execucoes")
    .update({
      mensagem_externa_id: result.messageId,
      resultado_json: {
        meta_response: result.raw,
        template_id: context.template.id,
        template_nome: context.template.nome,
        template_categoria: category,
        variaveis_enviadas: resolved.snapshot,
        botoes_mapeados: buttons,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("empresa_id", context.job.empresa_id)
    .eq("id", context.job.id);

  if (reservationIds.length > 0) {
    await atualizarReservaLimiteMeta({
      reservaIds: reservationIds,
      telefone: phone,
      status: "enviado",
      messageId: result.messageId,
      contatoId: context.contact?.id || context.appointment.contato_id || null,
      conversaId: context.conversation?.id || null,
      metadataJson: {
        agenda_automacao_execucao_id: context.job.id,
        template_categoria: category,
        variaveis_enviadas: resolved.snapshot,
      },
    });
  }

  await registrarContextoOptOutTemplate({
    empresaId: context.job.empresa_id,
    contatoId: context.contact?.id || context.appointment.contato_id || null,
    telefone: phone,
    integracaoWhatsappId: context.integration.id,
    conversaId: context.conversation?.id || null,
    templateId: context.template.id,
    templateCategoria: category,
    optOutHabilitado: context.template.opt_out_habilitado === true,
    mensagemExternaId: result.messageId,
    origem: "agenda_automacao",
  }).catch((error) =>
    console.warn("[AGENDA_AUTOMACOES] Falha ao registrar contexto de opt-out:", error)
  );

  await recordOutboundMessage(context, result.messageId, result.raw, resolved.snapshot);
  await logWhatsApp(context, {
    status: "processando",
    statusHttp: result.status,
    messageId: result.messageId,
    raw: result.raw,
    variables: resolved.values,
    variablesSnapshot: resolved.snapshot,
  });

  return {
    messageId: result.messageId,
    templateId: context.template.id,
    templateName: context.template.nome,
    templateCategory: category,
    variables: resolved.snapshot,
    buttons,
    metaResponse: result.raw,
  };
}
