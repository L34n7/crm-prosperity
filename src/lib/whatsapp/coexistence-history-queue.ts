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
import { isCoexistenceSyncTerminalStatus } from "@/lib/whatsapp/coexistence-sync-policy";
import {
  circuitoSupabaseEstaAberto,
  erroSupabaseEhTransitorio,
  registrarFalhaCircuitoSupabase,
  registrarSucessoCircuitoSupabase,
} from "@/lib/operacional/contingencia-supabase";

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
    25,
    10,
    100
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
    isCoexistenceSyncTerminalStatus(job.status)
  );
  if (!terminal) return;

  await supabase
    .from("integracoes_whatsapp")
    .update({
      coex_sync_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", integrationId);
}

type HistoryStatsDelta = {
  processed?: number;
  ignored?: number;
  fatalErrors?: number;
};

function safeCount(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

export async function refreshCoexistenceHistoryStats(
  integrationId: string,
  delta: HistoryStatsDelta = {}
) {
  const servico = `whatsapp-coex-stats:${integrationId}`;

  if (circuitoSupabaseEstaAberto(servico)) {
    throw new Error(
      "Circuit breaker do Supabase aberto para atualização do histórico Coex."
    );
  }

  const { data: job, error: jobError } = await supabase
    .from("whatsapp_coex_sync_jobs")
    .select(
      "status, meta_concluido, erro_codigo, itens_recebidos, itens_processados, itens_ignorados, itens_com_erro"
    )
    .eq("integracao_whatsapp_id", integrationId)
    .eq("tipo", "history")
    .maybeSingle();

  if (jobError) {
    registrarFalhaCircuitoSupabase(servico, jobError);
    throw new Error(
      `Erro ao carregar progresso do histórico Coex: ${jobError.message}`
    );
  }

  registrarSucessoCircuitoSupabase(servico);

  if (!job) {
    return {
      total: 0,
      processed: 0,
      ignored: 0,
      fatalErrors: 0,
      status: null,
    };
  }

  const processed =
    safeCount(job.itens_processados) + safeCount(delta.processed);
  const ignored =
    safeCount(job.itens_ignorados) + safeCount(delta.ignored);
  const fatalErrors =
    safeCount(job.itens_com_erro) + safeCount(delta.fatalErrors);
  const total = Math.max(
    safeCount(job.itens_recebidos),
    processed + ignored + fatalErrors
  );

  if (
    job.status === "recusado_usuario" ||
    (job.status === "erro" && job.erro_codigo)
  ) {
    return {
      total,
      processed,
      ignored,
      fatalErrors,
      status: job.status,
    };
  }

  const progress = calculateCoexistenceHistoryProgress({
    total,
    processed,
    ignored,
    fatalErrors,
    metaCompleted: job.meta_concluido === true,
  });
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("whatsapp_coex_sync_jobs")
    .update({
      status: progress.status,
      itens_recebidos: progress.total,
      itens_processados: progress.processed,
      itens_ignorados: progress.ignored,
      itens_com_erro: progress.fatalErrors,
      processamento_progresso: progress.processingProgress,
      concluido_em: progress.completed || progress.failed ? now : null,
      updated_at: now,
    })
    .eq("integracao_whatsapp_id", integrationId)
    .eq("tipo", "history");

  if (updateError) {
    registrarFalhaCircuitoSupabase(servico, updateError);
    throw new Error(
      `Erro ao atualizar progresso do histórico Coex: ${updateError.message}`
    );
  }

  registrarSucessoCircuitoSupabase(servico);

  if (progress.completed || progress.failed) {
    await finishCoexistenceIntegrationIfReady(integrationId);
  }

  return {
    total: progress.total,
    processed: progress.processed,
    ignored: progress.ignored,
    fatalErrors: progress.fatalErrors,
    processingProgress: progress.processingProgress,
    status: progress.status,
  };
}

async function reconciliarCoexistenceHistoryStatsExato(
  integrationId: string
) {
  const maxAttempts = getMaxAttempts();
  const [
    { count: total, error: totalError },
    { count: processed, error: processedError },
    { count: ignored, error: ignoredError },
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
      .eq("status", "ignorado"),
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
    totalError || processedError || ignoredError || fatalError || jobError;

  if (firstError) {
    throw new Error(
      `Erro ao reconciliar progresso final do histórico Coex: ${firstError.message}`
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
      ignored: ignored || 0,
      fatalErrors: fatalErrors || 0,
      status: job?.status || null,
    };
  }

  const progress = calculateCoexistenceHistoryProgress({
    total: total || 0,
    processed: processed || 0,
    ignored: ignored || 0,
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
      itens_ignorados: progress.ignored,
      itens_com_erro: progress.fatalErrors,
      processamento_progresso: progress.processingProgress,
      concluido_em: progress.completed || progress.failed ? now : null,
      updated_at: now,
    })
    .eq("integracao_whatsapp_id", integrationId)
    .eq("tipo", "history");

  if (updateError) {
    throw new Error(
      `Erro ao salvar reconciliação final do histórico Coex: ${updateError.message}`
    );
  }

  if (progress.completed || progress.failed) {
    await finishCoexistenceIntegrationIfReady(integrationId);
  }

  return {
    total: progress.total,
    processed: progress.processed,
    ignored: progress.ignored,
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
      timeout: 60,
      deduplicationId: `coex-history-${nextItem.id}-${nextItem.tentativas}`,
      flowControl: {
        key: getFlowControlKey(integrationId),
        rate: normalizeInteger(
          process.env.WHATSAPP_COEX_HISTORY_QSTASH_RATE,
          1,
          1,
          10
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

    const { count: totalItensHistorico, error: totalItensError } =
      await supabase
        .from("whatsapp_coex_historico_itens")
        .select("id", { count: "exact", head: true })
        .eq("integracao_whatsapp_id", integration.id);

    if (totalItensError) {
      throw new Error(
        `Erro ao consolidar total recebido do histórico Coex: ${totalItensError.message}`
      );
    }

    await supabase
      .from("whatsapp_coex_sync_jobs")
      .update({
        status: "processando",
        itens_recebidos: totalItensHistorico || 0,
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
  const servico = `whatsapp-coex-worker:${params.integrationId}`;

  if (circuitoSupabaseEstaAberto(servico)) {
    throw new Error(
      "Circuit breaker do Supabase aberto para histórico Coexistence."
    );
  }

  const maxAttempts = getMaxAttempts();
  const { data, error } = await supabase.rpc(
    "whatsapp_coex_claim_historico_itens",
    {
      p_integracao_id: params.integrationId,
      p_limite: getBatchSize(),
      p_max_tentativas: maxAttempts,
      p_lock_timeout_minutos: getLockTimeoutMinutes(),
    }
  );

  if (error) {
    registrarFalhaCircuitoSupabase(servico, error);
    throw new Error(
      `Erro ao reservar lote do histórico Coex: ${error.message}`
    );
  }

  registrarSucessoCircuitoSupabase(servico);

  const claimed = (data || []) as HistoryQueueRow[];
  if (!claimed.length) {
    // COUNTs exatos só rodam quando a fila está drenada. Isso repara qualquer
    // divergência causada por uma falha entre a persistência do lote e a
    // atualização incremental do job, sem pagar esse custo a cada lote.
    const stats = await reconciliarCoexistenceHistoryStatsExato(
      params.integrationId
    );
    return { ok: true, processed: 0, stats };
  }

  let integration: WhatsAppIntegration;

  try {
    integration = await loadIntegration(params.integrationId);
  } catch (loadError) {
    const message =
      loadError instanceof Error
        ? loadError.message
        : "Erro ao carregar integração do histórico Coex.";

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

    registrarFalhaCircuitoSupabase(servico, loadError);
    throw loadError;
  }

  const validItems: Array<{
    item: HistoryQueueRow;
    message: ExtractedCoexistenceHistoryMessage;
  }> = [];
  const ignoredIds: string[] = [];

  for (const item of claimed) {
    if (isHistoryMessage(item.payload_json)) {
      validItems.push({ item, message: item.payload_json });
    } else {
      ignoredIds.push(item.id);
    }
  }

  const processedIds: string[] = [];
  const failedItems: Array<{
    id: string;
    error: string;
    fatal: boolean;
  }> = [];
  const results: Array<
    Awaited<ReturnType<typeof persistCoexistenceHistoryBatch>>
  > = [];
  let infrastructureError: unknown = null;

  if (validItems.length) {
    try {
      const result = await persistCoexistenceHistoryBatch({
        integration,
        messages: validItems.map((entry) => entry.message),
      });

      results.push(result);
      processedIds.push(...validItems.map((entry) => entry.item.id));
    } catch (batchError) {
      if (erroSupabaseEhTransitorio(batchError)) {
        infrastructureError = batchError;
      } else {
        console.warn(
          "[WHATSAPP COEX HISTORY] Lote com erro de dados; isolando itens.",
          batchError
        );

        for (const entry of validItems) {
          try {
            const result = await persistCoexistenceHistoryBatch({
              integration,
              messages: [entry.message],
            });

            results.push(result);
            processedIds.push(entry.item.id);
          } catch (itemError) {
            if (erroSupabaseEhTransitorio(itemError)) {
              infrastructureError = itemError;
              break;
            }

            failedItems.push({
              id: entry.item.id,
              error:
                itemError instanceof Error
                  ? itemError.message
                  : "Erro ao processar item do histórico Coex.",
              fatal: safeCount(entry.item.tentativas) >= maxAttempts,
            });
          }
        }
      }
    }
  }

  const now = new Date().toISOString();
  const processedSet = new Set(processedIds);

  for (const idChunk of chunk(ignoredIds, 100)) {
    const { error: ignoredError } = await supabase
      .from("whatsapp_coex_historico_itens")
      .update({
        status: "ignorado",
        erro: "Payload inválido ignorado pelo worker.",
        locked_at: null,
        payload_json: {},
        processado_em: now,
        updated_at: now,
      })
      .in("id", idChunk);

    if (ignoredError) {
      throw new Error(
        `Erro ao ignorar itens inválidos do histórico Coex: ${ignoredError.message}`
      );
    }
  }

  for (const idChunk of chunk(processedIds, 100)) {
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
      .in("id", idChunk);

    if (updateError) {
      throw new Error(
        `Erro ao concluir lote do histórico Coex: ${updateError.message}`
      );
    }
  }

  if (infrastructureError) {
    const retryIds = validItems
      .map((entry) => entry.item.id)
      .filter((id) => !processedSet.has(id));

    for (const idChunk of chunk(retryIds, 100)) {
      const { error: retryError } = await supabase
        .from("whatsapp_coex_historico_itens")
        .update({
          status: "erro",
          erro:
            infrastructureError instanceof Error
              ? infrastructureError.message
              : "Falha transitória de infraestrutura.",
          locked_at: null,
          updated_at: now,
        })
        .in("id", idChunk);

      if (retryError) {
        console.warn(
          "[WHATSAPP COEX HISTORY] Erro ao liberar lote após falha transitória:",
          retryError
        );
      }
    }

    await refreshCoexistenceHistoryStats(params.integrationId, {
      processed: processedIds.length,
      ignored: ignoredIds.length,
    });

    registrarFalhaCircuitoSupabase(servico, infrastructureError, {
      limiarFalhas: 1,
      pausaMs: 60_000,
    });

    throw infrastructureError;
  }

  for (const failedItem of failedItems) {
    const { error: itemUpdateError } = await supabase
      .from("whatsapp_coex_historico_itens")
      .update({
        status: "erro",
        erro: failedItem.error,
        locked_at: null,
        updated_at: now,
      })
      .eq("id", failedItem.id);

    if (itemUpdateError) {
      throw new Error(
        `Erro ao marcar item com erro no histórico Coex: ${itemUpdateError.message}`
      );
    }
  }

  const stats = await refreshCoexistenceHistoryStats(
    params.integrationId,
    {
      processed: processedIds.length,
      ignored: ignoredIds.length,
      fatalErrors: failedItems.filter((item) => item.fatal).length,
    }
  );
  const next =
    params.scheduleNext === false
      ? null
      : await scheduleCoexistenceHistoryBatch(params.integrationId);

  registrarSucessoCircuitoSupabase(servico);

  return {
    ok: failedItems.length === 0,
    processed: processedIds.length,
    ignored: ignoredIds.length,
    failed: failedItems.length,
    result: results.length === 1 ? results[0] : results,
    stats,
    next,
  };
}

export async function processCoexistenceHistoryFallback(params: {
  integrationLimit?: number;
}) {
  const servico = "whatsapp-coex-fallback";
  const integrationLimit = normalizeInteger(
    params.integrationLimit,
    3,
    1,
    10
  );

  if (circuitoSupabaseEstaAberto(servico)) {
    return {
      ok: true,
      paused: true,
      integrations: 0,
      results: [],
    };
  }

  const staleBefore = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { data: jobs, error } = await supabase
    .from("whatsapp_coex_sync_jobs")
    .select("integracao_whatsapp_id")
    .eq("tipo", "history")
    .in("status", ["solicitado", "processando"])
    .or(
      `worker_agendado_em.is.null,worker_agendado_em.lt.${staleBefore}`
    )
    .order("updated_at", { ascending: true })
    .limit(integrationLimit);

  if (error) {
    registrarFalhaCircuitoSupabase(servico, error);
    throw new Error(
      `Erro ao buscar históricos pendentes: ${error.message}`
    );
  }

  registrarSucessoCircuitoSupabase(servico);

  const results = [];

  for (const job of jobs || []) {
    try {
      const nextItem = await findNextQueueItem(
        job.integracao_whatsapp_id
      );

      if (!nextItem) {
        const stats = await reconciliarCoexistenceHistoryStatsExato(
          job.integracao_whatsapp_id
        );
        results.push({
          ok: true,
          integrationId: job.integracao_whatsapp_id,
          processed: 0,
          reconciled: true,
          stats,
        });
        continue;
      }

      const scheduled = await scheduleCoexistenceHistoryBatch(
        job.integracao_whatsapp_id
      );

      results.push({
        ...scheduled,
        integrationId: job.integracao_whatsapp_id,
        recovered: true,
      });
    } catch (error) {
      const transient = erroSupabaseEhTransitorio(error);

      results.push({
        ok: false,
        integrationId: job.integracao_whatsapp_id,
        transient,
        error:
          error instanceof Error ? error.message : "Erro desconhecido.",
      });

      if (transient) {
        registrarFalhaCircuitoSupabase(servico, error, {
          limiarFalhas: 1,
          pausaMs: 60_000,
        });
        break;
      }
    }
  }

  return {
    ok: true,
    paused: false,
    integrations: jobs?.length || 0,
    results,
  };
}
