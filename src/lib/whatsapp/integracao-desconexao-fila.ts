import { qstash } from "@/lib/qstash/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { obterFlowControlKeyDisparo } from "@/lib/whatsapp/disparo-fila";

const supabaseAdmin = getSupabaseAdmin();

type JobDesconexaoClaim = {
  job_id: string;
  empresa_id: string;
  integracao_id: string;
  usuario_id: string | null;
  backup_id: string | null;
  tentativas: number;
  max_tentativas: number;
};

function obterBaseUrlAplicacao() {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (!host) return "";

  const base = host.startsWith("http") ? host : `https://${host}`;
  return base.replace(/\/$/, "");
}

function obterUrlWorkerDesconexao() {
  const configurada =
    process.env.QSTASH_WHATSAPP_INTEGRACAO_DESCONEXAO_WORKER_URL ||
    process.env.WHATSAPP_INTEGRACAO_DESCONEXAO_WORKER_URL;

  if (configurada) return configurada;

  const base = obterBaseUrlAplicacao();
  return base ? `${base}/api/worker/whatsapp-integracao-desconectar` : "";
}

function extrairMessageId(resultado: unknown) {
  if (!resultado || typeof resultado !== "object") return null;
  const registro = resultado as Record<string, unknown>;
  return String(registro.messageId || registro.message_id || "").trim() || null;
}

function backoffSegundos(tentativas: number) {
  const base = Math.max(1, Number(tentativas || 1));
  return Math.min(30 * Math.pow(2, Math.min(base - 1, 5)), 15 * 60);
}

export async function pausarDisparosIntegracaoQstash(
  integracaoWhatsappId: string
) {
  if (!process.env.QSTASH_TOKEN || !integracaoWhatsappId) return;

  try {
    await qstash.flowControl.pause(
      obterFlowControlKeyDisparo(integracaoWhatsappId)
    );
  } catch (error) {
    console.warn("[WHATSAPP DESCONEXAO] Falha ao pausar fila de disparos:", {
      integracaoWhatsappId,
      erro: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function publicarDesconexaoIntegracaoQstash(jobId: string) {
  const url = obterUrlWorkerDesconexao();

  if (!process.env.QSTASH_TOKEN || !url) {
    return {
      ok: false,
      messageId: null as string | null,
      erro: !process.env.QSTASH_TOKEN
        ? "QSTASH_TOKEN ausente; cron fallback fará a limpeza."
        : "URL do worker de desconexão ausente; cron fallback fará a limpeza.",
    };
  }

  try {
    const resultado = await qstash.publishJSON({
      url,
      body: { jobId },
      retries: 5,
      retryDelay: "30000 * (1 + retried)",
      timeout: 60,
      deduplicationId: `whatsapp-integracao-desconexao-${jobId}`,
      flowControl: {
        key: `whatsapp-integracao-desconexao-${
          process.env.VERCEL_ENV || "production"
        }`,
        rate: 1,
        period: 5,
        parallelism: 1,
      },
      label: `whatsapp-integracao-desconexao-${jobId}`,
    });

    const messageId = extrairMessageId(resultado);

    return {
      ok: Boolean(messageId),
      messageId,
      erro: messageId ? null : "QStash não retornou messageId.",
    };
  } catch (error) {
    return {
      ok: false,
      messageId: null as string | null,
      erro:
        error instanceof Error
          ? error.message
          : "Erro ao publicar limpeza de integração no QStash.",
    };
  }
}

async function reivindicarJob(jobId?: string | null) {
  const { data, error } = await supabaseAdmin.rpc(
    "reivindicar_whatsapp_integracao_desconexao",
    {
      p_job_id: jobId || null,
    }
  );

  if (error) {
    throw new Error(
      `Erro ao reivindicar desconexão em background: ${error.message}`
    );
  }

  const registro = Array.isArray(data) ? data[0] || null : data || null;
  return (registro || null) as JobDesconexaoClaim | null;
}

async function registrarFalhaJob(job: JobDesconexaoClaim, erro: string) {
  const delaySegundos = backoffSegundos(job.tentativas);
  const nextAttemptAt = new Date(
    Date.now() + delaySegundos * 1000
  ).toISOString();

  const { error } = await supabaseAdmin
    .from("whatsapp_integracao_desconexao_jobs")
    .update({
      status: "erro",
      locked_at: null,
      next_attempt_at: nextAttemptAt,
      erro: erro.slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.job_id);

  if (error) {
    console.error(
      "[WHATSAPP DESCONEXAO] Falha ao registrar erro do job:",
      error
    );
  }

  return {
    delaySegundos,
    esgotado: job.tentativas >= job.max_tentativas,
  };
}

export async function processarDesconexaoIntegracaoJob(
  jobId?: string | null
) {
  const job = await reivindicarJob(jobId);

  if (!job) {
    return {
      ok: true as const,
      processado: false,
      status: "sem_trabalho",
      jobId: jobId || null,
    };
  }

  try {
    const { data: backupId, error } = await supabaseAdmin.rpc(
      "finalizar_whatsapp_integracao_desconexao",
      {
        p_job_id: job.job_id,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    return {
      ok: true as const,
      processado: true,
      status: "concluido",
      jobId: job.job_id,
      integracaoId: job.integracao_id,
      backupId: backupId || job.backup_id,
      tentativas: job.tentativas,
    };
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro desconhecido na limpeza.";
    const falha = await registrarFalhaJob(job, mensagem);

    console.error("[WHATSAPP DESCONEXAO] Limpeza em background falhou:", {
      jobId: job.job_id,
      integracaoId: job.integracao_id,
      tentativas: job.tentativas,
      maxTentativas: job.max_tentativas,
      proximaTentativaEmSegundos: falha.delaySegundos,
      esgotado: falha.esgotado,
      erro: mensagem,
    });

    return {
      ok: false as const,
      processado: false,
      status: falha.esgotado ? "erro_final" : "reagendado",
      jobId: job.job_id,
      integracaoId: job.integracao_id,
      tentativas: job.tentativas,
      maxTentativas: job.max_tentativas,
      proximaTentativaEmSegundos: falha.delaySegundos,
      erro: mensagem,
    };
  }
}

export async function processarFilaDesconexoesWhatsapp() {
  return processarDesconexaoIntegracaoJob(null);
}
