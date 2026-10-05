/* eslint-disable @typescript-eslint/no-explicit-any */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  calendarIntegrationIds,
  flowSupportsCalendar,
  flowSupportsIntegration,
} from "./integration-scope";
import { notifyResponsible, sendEmail, startPostFlow } from "./automation-runtime-actions";
import { cancelJob, completeJob, failJob, loadContext } from "./automation-runtime-context";
import { sendWhatsApp } from "./automation-runtime-whatsapp";
import { AgendaAutomationError, asObject, isApplicable, type Context, type Job } from "./automation-runtime-types";
import { processAgendaResponseFlows } from "./agenda-response-runtime";
import { isIndividualReminder, processIndividualReminder, refreshIndividualReminderStatus } from "./individual-reminder-runtime";

const supabase = getSupabaseAdmin();
const DEFAULT_POST_ATTENDANCE_GRACE_MINUTES = 30;

async function executionStillCurrent(job: Job) {
  const { data, error } = await supabase
    .from("agenda_automacao_execucoes")
    .select("status, regra_id")
    .eq("empresa_id", job.empresa_id)
    .eq("id", job.id)
    .maybeSingle();
  if (error) {
    throw new Error("Erro ao validar a execução atual da agenda: " + error.message);
  }
  return (
    data?.status === "processando" &&
    String(data?.regra_id || "") === String(job.regra_id || "")
  );
}

function postAttendanceExpired(context: Context) {
  if (context.job.tipo !== "pos_atendimento") return false;
  const configured = Number(
    asObject(context.rule?.configuracao_json).tolerancia_atraso_minutos
  );
  const graceMinutes = Number.isFinite(configured)
    ? Math.min(1440, Math.max(5, Math.round(configured)))
    : DEFAULT_POST_ATTENDANCE_GRACE_MINUTES;
  const scheduledAt = Date.parse(String(context.job.executar_em || ""));
  if (!Number.isFinite(scheduledAt)) return true;
  return Date.now() > scheduledAt + graceMinutes * 60_000;
}

function confirmationAdvanceWindowExpiredWhenPlanned(job: Job) {
  if (job.tipo !== "confirmacao") return false;

  const payload = asObject(job.payload_json);
  const plannedAt = Date.parse(String(payload.planejado_em || ""));
  const originallyScheduledAt = Date.parse(
    String(payload.horario_original_programado || job.executar_em || "")
  );

  if (!Number.isFinite(plannedAt) || !Number.isFinite(originallyScheduledAt)) {
    return false;
  }

  return originallyScheduledAt <= plannedAt;
}

function reminderAdvanceWindowExpiredWhenPlanned(job: Job) {
  if (!["lembrete", "aviso_responsavel"].includes(job.tipo)) return false;

  const payload = asObject(job.payload_json);
  const plannedAt = Date.parse(String(payload.planejado_em || ""));
  const originallyScheduledAt = Date.parse(
    String(payload.horario_original_programado || job.executar_em || "")
  );

  if (!Number.isFinite(plannedAt) || !Number.isFinite(originallyScheduledAt)) {
    return false;
  }

  return originallyScheduledAt <= plannedAt;
}

function integrationScopeProblem(context: Context) {
  const allowed = calendarIntegrationIds(context.agenda?.metadata_json);

  if (context.job.canal === "whatsapp") {
    const integrationId = String(context.rule?.integracao_whatsapp_id || "");
    if (allowed.length > 0 && !allowed.includes(integrationId)) {
      return "A integração do disparo não pertence às integrações autorizadas neste calendário.";
    }
  }

  if (context.job.canal === "fluxo") {
    if (!flowSupportsCalendar(context.flow?.configuracao_json, allowed)) {
      return "O fluxo de pós-atendimento não é compatível com as integrações autorizadas neste calendário.";
    }
    const conversationIntegrationId = String(
      context.conversation?.integracao_whatsapp_id || ""
    );
    if (!conversationIntegrationId) {
      return "Não existe conversa com integração do WhatsApp compatível para iniciar o pós-atendimento.";
    }
    if (allowed.length > 0 && !allowed.includes(conversationIntegrationId)) {
      return "A conversa encontrada pertence a uma integração não autorizada neste calendário.";
    }
    if (
      !flowSupportsIntegration(
        context.flow?.configuracao_json,
        conversationIntegrationId
      )
    ) {
      return "O fluxo selecionado não permite a integração da conversa encontrada.";
    }
  }

  return "";
}

async function processJob(job: Job) {
  if (isIndividualReminder(job)) {
    const execution = await processIndividualReminder(job);
    await completeJob(job, execution.result, execution.externalId || null);
    await refreshIndividualReminderStatus(job);
    return "concluido" as const;
  }

  if (job.mensagem_externa_id) {
    await completeJob(job, {
      ...asObject(job.resultado_json),
      recuperado_por_idempotencia: true,
    });
    return "concluido" as const;
  }

  if (confirmationAdvanceWindowExpiredWhenPlanned(job)) {
    await cancelJob(
      job,
      "Confirmação cancelada porque a antecedência configurada já havia passado quando o agendamento foi planejado."
    );
    return "cancelado" as const;
  }

  if (reminderAdvanceWindowExpiredWhenPlanned(job)) {
    await cancelJob(
      job,
      "Lembrete cancelado porque a antecedência configurada já havia passado quando o agendamento foi planejado."
    );
    return "cancelado" as const;
  }

  const context = await loadContext(job);
  if (!context) {
    await cancelJob(job, "Regra, agenda ou agendamento não encontrado.");
    return "cancelado" as const;
  }
  if (postAttendanceExpired(context)) {
    await cancelJob(
      job,
      "Pós-atendimento cancelado porque ultrapassou a tolerância de 30 minutos após o horário programado."
    );
    return "cancelado" as const;
  }
  const scopeProblem = integrationScopeProblem(context);
  if (scopeProblem) {
    await cancelJob(job, scopeProblem);
    return "cancelado" as const;
  }
  if (!isApplicable(context)) {
    await cancelJob(job, "A regra não se aplica mais ao estado atual do agendamento.");
    return "cancelado" as const;
  }
  if (!(await executionStillCurrent(job))) {
    return "cancelado" as const;
  }

  if (job.canal === "whatsapp") {
    const result = await sendWhatsApp(context);
    await completeJob(job, result, result.messageId);
    return "concluido" as const;
  }
  if (job.canal === "email") {
    if (job.tipo === "pos_atendimento") {
      throw new AgendaAutomationError(
        "O canal e-mail não é permitido para pós-atendimento nesta configuração.",
        { permanent: true }
      );
    }
    const result = await sendEmail(context);
    await completeJob(job, result, result.id);
    return "concluido" as const;
  }
  if (job.canal === "sistema") {
    const result = await notifyResponsible(context);
    await completeJob(job, result, result.notificationId);
    return "concluido" as const;
  }
  if (job.canal === "fluxo") {
    const result = await startPostFlow(context);
    await completeJob(job, result, result.automationExecutionId);
    return "concluido" as const;
  }

  throw new AgendaAutomationError("Canal de automação inválido.", {
    permanent: true,
  });
}

export async function processAgendaAutomationById(id: string) {
  const jobId = String(id || "").trim();
  if (!jobId) return { ok: true, ignorado: true, motivo: "id_ausente" };

  const { data: atual, error } = await supabase
    .from("agenda_automacao_execucoes")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw new Error(`Erro ao carregar automação da agenda: ${error.message}`);
  if (!atual) return { ok: true, ignorado: true, motivo: "nao_encontrada" };
  if (atual.status !== "pendente") {
    return { ok: true, ignorado: true, motivo: `status_${atual.status}` };
  }

  const executarEm = String(atual.proxima_tentativa_em || atual.executar_em || "");
  const executarEmMs = Date.parse(executarEm);
  if (Number.isFinite(executarEmMs) && executarEmMs > Date.now() + 1_000) {
    return { ok: true, reagendarEm: new Date(executarEmMs).toISOString() };
  }

  const agora = new Date().toISOString();
  const { data: reivindicado, error: claimError } = await supabase
    .from("agenda_automacao_execucoes")
    .update({
      status: "processando",
      tentativas: Number(atual.tentativas || 0) + 1,
      bloqueado_em: agora,
      erro: null,
      updated_at: agora,
    })
    .eq("id", jobId)
    .eq("status", "pendente")
    .select("*")
    .maybeSingle();

  if (claimError) throw new Error(`Erro ao reivindicar automação da agenda: ${claimError.message}`);
  if (!reivindicado) return { ok: true, ignorado: true, motivo: "concorrencia" };

  const job = reivindicado as Job;
  try {
    const status = await processJob(job);
    return { ok: true, status };
  } catch (processError) {
    console.error("[AGENDA_AUTOMACOES] Erro no processamento orientado a evento:", {
      jobId,
      error: processError,
    });
    const status = await failJob(job, processError);
    if (isIndividualReminder(job)) {
      await refreshIndividualReminderStatus(job).catch((refreshError) =>
        console.warn("[AGENDA_LEMBRETES] Falha ao consolidar lembrete:", refreshError)
      );
    }
    if (status === "reagendado") {
      const { data: reagendado } = await supabase
        .from("agenda_automacao_execucoes")
        .select("proxima_tentativa_em")
        .eq("id", jobId)
        .maybeSingle();
      return { ok: true, status, reagendarEm: reagendado?.proxima_tentativa_em || null };
    }
    return { ok: true, status };
  }
}

export async function processAgendaAutomations(limit = 50) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 50)));
  await supabase.rpc("agenda_automacoes_reconciliar", {
    p_limite: Math.min(500, safeLimit * 10),
  });

  const { data, error } = await supabase.rpc("agenda_automacoes_reivindicar", {
    p_limite: safeLimit,
  });
  if (error) {
    throw new Error(`Erro ao reivindicar automações da agenda: ${error.message}`);
  }

  const jobs = (Array.isArray(data) ? data : []) as Job[];
  const summary = {
    reivindicados: jobs.length,
    concluidos: 0,
    cancelados: 0,
    reagendados: 0,
    erros: 0,
  };

  for (const job of jobs) {
    try {
      const status = await processJob(job);
      if (status === "concluido") summary.concluidos += 1;
      else summary.cancelados += 1;
    } catch (error) {
      console.error("[AGENDA_AUTOMACOES] Erro ao processar execução:", {
        jobId: job.id,
        tipo: job.tipo,
        canal: job.canal,
        agendamentoId: job.agendamento_id,
        error,
      });
      const status = await failJob(job, error);
      if (isIndividualReminder(job)) {
        await refreshIndividualReminderStatus(job).catch((refreshError) =>
          console.warn("[AGENDA_LEMBRETES] Falha ao atualizar status consolidado:", refreshError)
        );
      }
      if (status === "cancelado") summary.cancelados += 1;
      else if (status === "reagendado") summary.reagendados += 1;
      else summary.erros += 1;
    }
  }

  const respostas = await processAgendaResponseFlows(Math.min(50, safeLimit));
  return { ...summary, respostas };
}
