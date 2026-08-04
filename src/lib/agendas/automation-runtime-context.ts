/* eslint-disable @typescript-eslint/no-explicit-any */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { asObject, type Context, type Job } from "./automation-runtime-types";

const supabase = getSupabaseAdmin();
const APPROVED = ["approved", "APPROVED", "aprovado"]; // CRM_AGENDA_POST_ATTENDANCE_TEMPLATE_V1

async function findConversation(appointment: any, companyId: string) {
  const appointmentConversationId = String(appointment.conversa_id || "").trim();
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

  if (!appointment.contato_id) return null;
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

export async function loadContext(job: Job): Promise<Context | null> {
  const [appointmentResult, agendaResult, ruleResult] = await Promise.all([
    supabase
      .from("agenda_agendamentos")
      .select("*")
      .eq("empresa_id", job.empresa_id)
      .eq("id", job.agendamento_id)
      .maybeSingle(),
    supabase
      .from("calendarios")
      .select("id, empresa_id, nome, timezone, status, metadata_json")
      .eq("empresa_id", job.empresa_id)
      .eq("id", job.agenda_id)
      .maybeSingle(),
    job.regra_id
      ? supabase
          .from("agenda_automacao_regras")
          .select("*")
          .eq("empresa_id", job.empresa_id)
          .eq("id", job.regra_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (appointmentResult.error) throw new Error(appointmentResult.error.message);
  if (agendaResult.error) throw new Error(agendaResult.error.message);
  if (ruleResult.error) throw new Error(ruleResult.error.message);
  if (!appointmentResult.data || !agendaResult.data || !ruleResult.data) return null;

  const appointment = appointmentResult.data;
  const rule = ruleResult.data;
  const [contactResult, responsibleResult, conversation] = await Promise.all([
    appointment.contato_id
      ? supabase
          .from("contatos")
          .select(
            "id, nome, whatsapp_profile_name, telefone, email, origem, campanha, status_lead, classificacao"
          )
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
    findConversation(appointment, job.empresa_id),
  ]);

  if (contactResult.error) throw new Error(contactResult.error.message);
  if (responsibleResult.error) throw new Error(responsibleResult.error.message);

  const [
    integrationResult,
    templateResult,
    flowResult,
    variablesResult,
    currentProtocolResult,
    lastProtocolResult,
  ] = await Promise.all([
    rule.integracao_whatsapp_id
      ? supabase
          .from("integracoes_whatsapp")
          .select(
            "id, empresa_id, nome_conexao, phone_number_id, status, coex_status, provider, config_json, token_ref, meta_messaging_limit, meta_messaging_limit_tier, meta_account_mode, quality_rating"
          )
          .eq("empresa_id", job.empresa_id)
          .eq("id", rule.integracao_whatsapp_id)
          .or("status.eq.ativa,coex_status.eq.ativo")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    rule.whatsapp_template_id
      ? supabase
          .from("whatsapp_templates")
          .select(
            "id, empresa_id, integracao_whatsapp_id, nome, idioma, status, categoria, payload, opt_out_habilitado"
          )
          .eq("empresa_id", job.empresa_id)
          .eq("id", rule.whatsapp_template_id)
          .in("status", APPROVED)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    rule.fluxo_id
      ? supabase
          .from("automacao_fluxos")
          .select("id, empresa_id, nome, status, canal, configuracao_json")
          .eq("empresa_id", job.empresa_id)
          .eq("id", rule.fluxo_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("automacao_variaveis")
      .select("chave, valor")
      .eq("empresa_id", job.empresa_id)
      .is("execucao_id", null)
      .is("contato_id", null)
      .eq("metadata_json->>tipo", "global_empresa")
      .eq("metadata_json->>ativo", "true"),
    conversation?.id
      ? supabase
          .from("conversa_protocolos")
          .select("protocolo")
          .eq("empresa_id", job.empresa_id)
          .eq("conversa_id", conversation.id)
          .eq("ativo", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    appointment.contato_id
      ? supabase
          .from("conversa_protocolos")
          .select("protocolo")
          .eq("empresa_id", job.empresa_id)
          .eq("contato_id", appointment.contato_id)
          .eq("ativo", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (integrationResult.error) throw new Error(integrationResult.error.message);
  if (templateResult.error) throw new Error(templateResult.error.message);
  if (flowResult.error) throw new Error(flowResult.error.message);
  if (variablesResult.error) throw new Error(variablesResult.error.message);
  if (currentProtocolResult.error) throw new Error(currentProtocolResult.error.message);
  if (lastProtocolResult.error) throw new Error(lastProtocolResult.error.message);

  const variables = Object.fromEntries(
    (variablesResult.data || []).map((item: any) => [
      String(item.chave || "").trim(),
      String(item.valor || ""),
    ])
  );

  return {
    job,
    rule,
    agenda: agendaResult.data,
    appointment,
    contact: contactResult.data || null,
    responsible: responsibleResult.data || null,
    conversation,
    integration: integrationResult.data || null,
    template: templateResult.data || null,
    flow: flowResult.data || null,
    variables,
    protocols: {
      protocolo_atual: String(currentProtocolResult.data?.protocolo || ""),
      ultimo_protocolo: String(lastProtocolResult.data?.protocolo || ""),
    },
  };
}

async function patchJob(job: Job, values: Record<string, unknown>) {
  const { error } = await supabase
    .from("agenda_automacao_execucoes")
    .update({
      ...values,
      bloqueado_em: null,
      updated_at: new Date().toISOString(),
    })
    .eq("empresa_id", job.empresa_id)
    .eq("id", job.id)
    .eq("status", "processando");
  if (error) throw new Error(`Erro ao atualizar execução da agenda: ${error.message}`);
}

export async function completeJob(
  job: Job,
  result: Record<string, unknown>,
  externalId?: string | null
) {
  await patchJob(job, {
    status: "concluido",
    executado_em: new Date().toISOString(),
    proxima_tentativa_em: null,
    mensagem_externa_id: externalId || job.mensagem_externa_id || null,
    erro: null,
    resultado_json: result,
  });
}

export async function cancelJob(job: Job, reason: string) {
  await patchJob(job, {
    status: "cancelado",
    proxima_tentativa_em: null,
    erro: reason.slice(0, 1500),
    resultado_json: {
      ...asObject(job.resultado_json),
      cancelado_em: new Date().toISOString(),
      motivo: reason,
    },
  });
}

export async function failJob(job: Job, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Erro desconhecido");
  const custom = error as { permanent?: boolean; cancel?: boolean };
  if (custom.cancel) {
    await cancelJob(job, message);
    return "cancelado" as const;
  }

  const final = custom.permanent || job.tentativas >= job.max_tentativas;
  const delayMinutes = Math.min(60, Math.max(2, 2 ** Math.max(1, job.tentativas)));
  await patchJob(job, {
    status: final ? "erro" : "pendente",
    proxima_tentativa_em: final
      ? null
      : new Date(Date.now() + delayMinutes * 60_000).toISOString(),
    erro: message.slice(0, 1500),
    resultado_json: {
      ...asObject(job.resultado_json),
      ultima_falha_em: new Date().toISOString(),
      tentativa: job.tentativas,
      permanente: final,
    },
  });
  return final ? ("erro" as const) : ("reagendado" as const);
}
