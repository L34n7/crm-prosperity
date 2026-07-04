import { qstash } from "@/lib/qstash/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  findWhatsAppIntegrationByPhoneNumberId,
  type WhatsAppIntegration,
} from "@/lib/whatsapp/find-integration";
import {
  extractCoexistenceHistoryMessages,
  type ExtractedCoexistenceHistoryMessage,
  type WhatsAppWebhookBody,
} from "@/lib/whatsapp/meta";
import { normalizeWhatsAppIntegrationMode } from "@/lib/whatsapp/integration-mode";
import { persistCoexistenceHistoryBatch } from "@/lib/whatsapp/persist-coexistence-history";
import { calculateCoexistenceHistoryProgress } from "@/lib/whatsapp/coexistence-history-state";

const supabase = getSupabaseAdmin();

type HistoryQueueRow = {
  id: string;
  integracao_whatsapp_id: string;
  mensagem_externa_id: string;
  payload_json: ExtractedCoexistenceHistoryMessage | Record<string, unknown>;
  tentativas: number;
};

function normalizeInteger(
  value: string | number | undefined,
  fallback: number,
  min: number,
  max: number
) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getBaseUrl() {
  const host =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL;
  if (!host) return "";
  const base = host.startsWith("http") ? host : `https://${host}`;
  return base.replace(/\/$/, "");
}

function getWorkerUrl() {
  const configured =
    process.env.QSTASH_WHATSAPP_COEX_HISTORY_WORKER_URL ||
    process.env.WHATSAPP_COEX_HISTORY_QSTASH_WORKER_URL;
  if (configured) return configured;

  const base = getBaseUrl();
  return base ? `${base}/api/worker/whatsapp-coex-history` : "";
}

function getBatchSize() {
  return normalizeInteger(
    process.env.WHATSAPP_COEX_HISTORY_BATCH_SIZE,
    50,
    10,
    200
  );
}

function getMaxAttempts() {
  return normalizeInteger(
    process.env.WHATSAPP_COEX_HISTORY_MAX_ATTEMPTS,
    5,
    1,
    20
  );
}

function getLockTimeoutMinutes() {
  return normalizeInteger(
    process.env.WHATSAPP_COEX_HISTORY_LOCK_TIMEOUT_MINUTES,
    5,
    1,
    60
  );
}

function normalizeFlowControlKey(value: string) {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9_.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "") || "whatsapp-coex-history"
  );
}

function getFlowControlKey(integrationId: string) {
  const prefix =
    process.env.WHATSAPP_COEX_HISTORY_QSTASH_FLOW_PREFIX ||
    process.env.VERCEL_ENV ||
    "production";

  return normalizeFlowControlKey(
    `whatsapp-coex-history-${prefix}-${integrationId}`
  );
}

function getQstashMessageId(value: unknown) {
  const record = objectValue(value);
  return String(record.messageId || record.message_id || "").trim() || null;
}

function isHistoryMessage(
  value: unknown
): value is ExtractedCoexistenceHistoryMessage {
  const record = objectValue(value);
  return (
    typeof record.phoneNumberId === "string" &&
    typeof record.contactPhone === "string" &&
    typeof record.messageId === "string" &&
    (record.direction === "inbound" || record.direction === "outbound")
  );
}

export async function finishCoexistenceIntegrationIfReady(
  integrationId: string
) {
  const { data: jobs, error } = await supabase
    .from("whatsapp_coex_sync_jobs")
    .select("status")
    .eq("integracao_whatsapp_id", integrationId);

  if (error || jobs?.length !== 2) return;

  const terminal = jobs.every((job) =>
    ["concluido", "recusado_usuario"].includes(job.status)
  );
  if (!terminal) return;

  const { data: integration } = await supabase
    .from("integracoes_whatsapp")
    .select("status")
    .eq("id", integrationId)
    .maybeSingle();

  await supabase
    .from("integracoes_whatsapp")
    .update({
      coex_status:
        integration?.status === "ativa" ? "ativo" : "onboarded",
      coex_sync_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", integrationId);
}

export async function refreshCoexistenceHistoryStats(
  integrationId: string
) {
  const maxAttempts = getMaxAttempts();
  const [
    { count: total, error: totalError },
    { count: processed, error: processedError },
    { count: fatalErrors, error: fatalError },
    { data: job, error: jobError },
  ] = await Promise.all([
    supabase
      .from("whatsapp_coex_historico_itens")
      .select("id", { count: "exact", head: true })
      .eq("integracao_whatsapp_id", integrationId),
    supabase
      .from("whatsapp_coex_historico_itens")
      .select("id", { count: "exact", head: true })
      .eq("integracao_whatsapp_id", integrationId)
      .eq("status", "processado"),
    supabase
      .from("whatsapp_coex_historico_itens")
      .select("id", { count: "exact", head: true })
      .eq("integracao_whatsapp_id", integrationId)
      .eq("status", "erro")
      .gte("tentativas", maxAttempts),
    supabase
      .from("whatsapp_coex_sync_jobs")
      .select("status, meta_concluido, erro_codigo")
      .eq("integracao_whatsapp_id", integrationId)
      .eq("tipo", "history")
      .maybeSingle(),
  ]);

  const firstError =
    totalError || processedError || fatalError || jobError;
  if (firstError) {
    throw new Error(
      `Erro ao calcular progresso do histórico Coex: ${firstError.message}`
    );
  }

  if (
    !job ||
    job.status === "recusado_usuario" ||
    (job.status === "erro" && job.erro_codigo)
  ) {
    return {
      total: total || 0,
      processed: processed || 0,
      fatalErrors: fatalErrors || 0,
      status: job?.status || null,
    };
  }

  const progress = calculateCoexistenceHistoryProgress({
    total: total || 0,
    processed: processed || 0,
    fatalErrors: fatalErrors || 0,
    metaCompleted: job.meta_concluido === true,
  });
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("whatsapp_coex_sync_jobs")
    .update({
      status: progress.status,
      itens_recebidos: progress.total,
      itens_processados: progress.processed,
      itens_com_erro: progress.fatalErrors,
      processamento_progresso: progress.processingProgress,
      concluido_em: progress.completed ? now : null,
      updated_at: now,
    })
    .eq("integracao_whatsapp_id", integrationId)
    .eq("tipo", "history");

  if (updateError) {
    throw new Error(
      `Erro ao atualizar progresso do histórico Coex: ${updateError.message}`
    );
  }

  if (progress.completed) {
    await finishCoexistenceIntegrationIfReady(integrationId);
  }

  return {
    total: progress.total,
    processed: progress.processed,
    fatalErrors: progress.fatalErrors,
    processingProgress: progress.processingProgress,
    status: progress.status,
  };
}

async function findNextQueueItem(integrationId: string) {
  const { data, error } = await supabase
    .from("whatsapp_coex_historico_itens")
    .select("id, tentativas")
    .eq("integracao_whatsapp_id", integrationId)
    .in("status", ["pendente", "erro"])
    .lt("tentativas", getMaxAttempts())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao buscar próximo lote do histórico Coex: ${error.message}`
    );
  }

  return data;
}

export async function scheduleCoexistenceHistoryBatch(
  integrationId: string
) {
  const nextItem = await findNextQueueItem(integrationId);
  if (!nextItem) {
    await supabase
      .from("whatsapp_coex_sync_jobs")
      .update({
        worker_qstash_message_id: null,
        worker_agendado_em: null,
        worker_erro: null,
        updated_at: new Date().toISOString(),
      })
      .eq("integracao_whatsapp_id", integrationId)
      .eq("tipo", "history");

    return { ok: true, scheduled: false };
  }

  const workerUrl = getWorkerUrl();
  if (!process.env.QSTASH_TOKEN || !workerUrl) {
    const error = !process.env.QSTASH_TOKEN
      ? "QSTASH_TOKEN ausente; cron fará o processamento."
      : "URL do worker de histórico ausente; cron fará o processamento.";

    await supabase
      .from("whatsapp_coex_sync_jobs")
      .update({
        worker_qstash_message_id: null,
        worker_agendado_em: null,
        worker_erro: error,
        updated_at: new Date().toISOString(),
      })
      .eq("integracao_whatsapp_id", integrationId)
      .eq("tipo", "history");

    return { ok: false, scheduled: false, error };
  }

  try {
    const result = await qstash.publishJSON({
      url: workerUrl,
      body: {
        integrationId,
      },
      retries: normalizeInteger(
        process.env.WHATSAPP_COEX_HISTORY_QSTASH_RETRIES,
        5,
        0,
        10
      ),
      retryDelay: "30000 * (1 + retried)",
      timeout: 60,
      deduplicationId: `coex-history-${nextItem.id}-${nextItem.tentativas}`,
      flowControl: {
        key: getFlowControlKey(integrationId),
        rate: normalizeInteger(
          process.env.WHATSAPP_COEX_HISTORY_QSTASH_RATE,
          2,
          1,
          20
        ),
        period: 60,
        parallelism: 1,
      },
      label: `whatsapp-coex-history-${integrationId}`,
    });
    const messageId = getQstashMessageId(result);
    const now = new Date().toISOString();

    await supabase
      .from("whatsapp_coex_sync_jobs")
      .update({
        worker_qstash_message_id: messageId,
        worker_agendado_em: now,
        worker_erro: messageId
          ? null
          : "QStash não retornou o identificador da mensagem.",
        updated_at: now,
      })
      .eq("integracao_whatsapp_id", integrationId)
      .eq("tipo", "history");

    return {
      ok: !!messageId,
      scheduled: !!messageId,
      messageId,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao agendar histórico no QStash.";

    await supabase
      .from("whatsapp_coex_sync_jobs")
      .update({
        worker_qstash_message_id: null,
        worker_agendado_em: null,
        worker_erro: message,
        updated_at: new Date().toISOString(),
      })
      .eq("integracao_whatsapp_id", integrationId)
      .eq("tipo", "history");

    return { ok: false, scheduled: false, error: message };
  }
}

export async function enqueueCoexistenceHistory(
  body: WhatsAppWebhookBody
) {
  const messages = extractCoexistenceHistoryMessages(body);
  const groupedByPhone = new Map<
    string,
    ExtractedCoexistenceHistoryMessage[]
  >();

  for (const message of messages) {
    const current = groupedByPhone.get(message.phoneNumberId) || [];
    current.push(message);
    groupedByPhone.set(message.phoneNumberId, current);
  }

  let queued = 0;
  let duplicated = 0;
  const integrations = new Set<string>();

  for (const [phoneNumberId, phoneMessages] of groupedByPhone) {
    const integration =
      await findWhatsAppIntegrationByPhoneNumberId(phoneNumberId);

    if (
      !integration ||
      normalizeWhatsAppIntegrationMode(integration.modo_integracao) !==
        "coexistence"
    ) {
      continue;
    }

    integrations.add(integration.id);
    const rows = phoneMessages.map((message) => ({
      empresa_id: integration.empresa_id,
      integracao_whatsapp_id: integration.id,
      mensagem_externa_id: message.messageId,
      telefone_contato: message.contactPhone,
      direcao: message.direction,
      fase: message.phase,
      chunk_order: message.chunkOrder,
      progresso_meta: message.progress,
      payload_json: message,
      status: "pendente",
      updated_at: new Date().toISOString(),
    }));

    for (const rowChunk of chunk(rows, 200)) {
      const { data, error } = await supabase
        .from("whatsapp_coex_historico_itens")
        .upsert(rowChunk, {
          onConflict: "integracao_whatsapp_id,mensagem_externa_id",
          ignoreDuplicates: true,
        })
        .select("id");

      if (error) {
        throw new Error(
          `Erro ao enfileirar histórico Coex: ${error.message}`
        );
      }

      queued += data?.length || 0;
      duplicated += rowChunk.length - (data?.length || 0);
    }

    await supabase
      .from("whatsapp_coex_sync_jobs")
      .update({
        status: "processando",
        updated_at: new Date().toISOString(),
      })
      .eq("integracao_whatsapp_id", integration.id)
      .eq("tipo", "history")
      .neq("status", "recusado_usuario");

    await refreshCoexistenceHistoryStats(integration.id);
    await scheduleCoexistenceHistoryBatch(integration.id);
  }

  return {
    received: messages.length,
    queued,
    duplicated,
    integrations: [...integrations],
  };
}

async function loadIntegration(
  integrationId: string
): Promise<WhatsAppIntegration> {
  const { data, error } = await supabase
    .from("integracoes_whatsapp")
    .select("*")
    .eq("id", integrationId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `Integração do histórico Coex não encontrada: ${
        error?.message || integrationId
      }`
    );
  }

  return data as WhatsAppIntegration;
}

export async function processCoexistenceHistoryBatch(params: {
  integrationId: string;
  scheduleNext?: boolean;
}) {
  const { data, error } = await supabase.rpc(
    "whatsapp_coex_claim_historico_itens",
    {
      p_integracao_id: params.integrationId,
      p_limite: getBatchSize(),
      p_max_tentativas: getMaxAttempts(),
      p_lock_timeout_minutos: getLockTimeoutMinutes(),
    }
  );

  if (error) {
    throw new Error(
      `Erro ao reservar lote do histórico Coex: ${error.message}`
    );
  }

  const claimed = (data || []) as HistoryQueueRow[];
  if (!claimed.length) {
    const stats = await refreshCoexistenceHistoryStats(
      params.integrationId
    );
    return { ok: true, processed: 0, stats };
  }

  try {
    const integration = await loadIntegration(params.integrationId);
    const messages = claimed
      .map((item) => item.payload_json)
      .filter(isHistoryMessage);

    if (messages.length !== claimed.length) {
      throw new Error(
        "Um ou mais itens do histórico possuem payload inválido."
      );
    }

    const result = await persistCoexistenceHistoryBatch({
      integration,
      messages,
    });
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("whatsapp_coex_historico_itens")
      .update({
        status: "processado",
        erro: null,
        locked_at: null,
        payload_json: {},
        processado_em: now,
        updated_at: now,
      })
      .in(
        "id",
        claimed.map((item) => item.id)
      );

    if (updateError) {
      throw new Error(
        `Erro ao concluir lote do histórico Coex: ${updateError.message}`
      );
    }

    const stats = await refreshCoexistenceHistoryStats(
      params.integrationId
    );
    const next =
      params.scheduleNext === false
        ? null
        : await scheduleCoexistenceHistoryBatch(params.integrationId);

    return {
      ok: true,
      processed: claimed.length,
      result,
      stats,
      next,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao processar lote do histórico Coex.";
    await supabase
      .from("whatsapp_coex_historico_itens")
      .update({
        status: "erro",
        erro: message,
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .in(
        "id",
        claimed.map((item) => item.id)
      );
    await refreshCoexistenceHistoryStats(params.integrationId);
    throw error;
  }
}

export async function processCoexistenceHistoryFallback(params: {
  integrationLimit?: number;
}) {
  const integrationLimit = normalizeInteger(
    params.integrationLimit,
    3,
    1,
    10
  );
  const staleBefore = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { data: jobs, error } = await supabase
    .from("whatsapp_coex_sync_jobs")
    .select("integracao_whatsapp_id")
    .eq("tipo", "history")
    .in("status", ["solicitado", "processando", "erro"])
    .or(
      `worker_agendado_em.is.null,worker_agendado_em.lt.${staleBefore}`
    )
    .order("updated_at", { ascending: true })
    .limit(integrationLimit);

  if (error) {
    throw new Error(
      `Erro ao buscar históricos pendentes: ${error.message}`
    );
  }

  const results = [];
  for (const job of jobs || []) {
    try {
      const nextItem = await findNextQueueItem(
        job.integracao_whatsapp_id
      );
      if (!nextItem) continue;

      results.push(
        await processCoexistenceHistoryBatch({
          integrationId: job.integracao_whatsapp_id,
        })
      );
    } catch (error) {
      results.push({
        ok: false,
        integrationId: job.integracao_whatsapp_id,
        error:
          error instanceof Error ? error.message : "Erro desconhecido.",
      });
    }
  }

  return {
    ok: true,
    integrations: jobs?.length || 0,
    results,
  };
}
