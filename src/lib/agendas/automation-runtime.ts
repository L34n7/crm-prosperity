/* eslint-disable @typescript-eslint/no-explicit-any */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyResponsible, sendEmail, startPostFlow } from "./automation-runtime-actions";
import { cancelJob, completeJob, failJob, loadContext } from "./automation-runtime-context";
import { sendWhatsApp } from "./automation-runtime-whatsapp";
import { AgendaAutomationError, asObject, isApplicable, type Job } from "./automation-runtime-types";

const supabase = getSupabaseAdmin();

async function processJob(job: Job) {
  if (job.mensagem_externa_id) {
    await completeJob(job, {
      ...asObject(job.resultado_json),
      recuperado_por_idempotencia: true,
    });
    return "concluido" as const;
  }

  const context = await loadContext(job);
  if (!context) {
    await cancelJob(job, "Regra, agenda ou agendamento não encontrado.");
    return "cancelado" as const;
  }
  if (!isApplicable(context)) {
    await cancelJob(job, "A regra não se aplica mais ao estado atual do agendamento.");
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
      if (status === "cancelado") summary.cancelados += 1;
      else if (status === "reagendado") summary.reagendados += 1;
      else summary.erros += 1;
    }
  }

  return summary;
}
