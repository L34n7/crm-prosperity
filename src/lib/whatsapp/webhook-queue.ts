import { createHash } from "node:crypto";
import {
  extractIncomingMessages,
  extractMessageStatuses,
  countCoexistenceWebhookItems,
  type WhatsAppWebhookBody,
} from "@/lib/whatsapp/meta";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processWhatsAppWebhookBody } from "@/lib/whatsapp/process-webhook";
import { extrairIdentificadoresWebhookWhatsapp } from "@/lib/whatsapp/webhook-recovery";
import { qstash } from "@/lib/qstash/client";
import {
  circuitoSupabaseEstaAberto,
  registrarFalhaCircuitoSupabase,
  registrarSucessoCircuitoSupabase,
} from "@/lib/operacional/contingencia-supabase";

const supabaseAdmin = getSupabaseAdmin();

function logOperacional(...args: unknown[]) {
  if (String(process.env.LOG_OPERACIONAL_DEBUG || "").toLowerCase() !== "true") {
    return;
  }

  console.log(...args);
}

function perf(label: string, inicio: number, extra?: Record<string, unknown>) {
  logOperacional(`[PERF] ${label}`, {
    tempo_ms: Date.now() - inicio,
    ...(extra || {}),
  });
}

type ProcessarFilaParams = {
  limite?: number;
  maxTentativas?: number;
  timeoutLockMinutos?: number;
};

type WebhookEventoMinimo = {
  id: string;
  tentativas?: number | null;
};

type WebhookEventoMetadata = {
  metadata_json?: Record<string, unknown> | null;
};

function compactarBodyProcessado(evento: {
  body_json?: WhatsAppWebhookBody | null;
  metadata_json?: Record<string, unknown> | null;
}) {
  const metadata = evento.metadata_json || {};
  const historyMessages = Number(
    metadata.coexistence_history_messages || 0
  );
  const historyStates = Number(
    metadata.coexistence_history_states || 0
  );

  // Histórico Coexistence pode carregar payloads enormes e já é persistido
  // em uma fila própria, então é compactado imediatamente. Webhooks comuns
  // preservam o payload bruto por 24h para diagnóstico e só depois entram na
  // retenção gradual do cron.
  if (historyMessages <= 0 && historyStates <= 0) return null;

  return {
    object: evento.body_json?.object || "whatsapp_business_account",
    archived: true,
    archived_reason: "coex_history_enqueued",
    incoming_messages: Number(metadata.incoming_messages || 0),
    incoming_statuses: Number(metadata.incoming_statuses || 0),
    coexistence_total: Number(metadata.coexistence_total || 0),
    history_messages: historyMessages,
    history_states: historyStates,
    archived_at: new Date().toISOString(),
  };
}

function normalizarInteiro(
  valor: number | string | undefined,
  fallback: number,
  min: number,
  max: number
) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) return fallback;

  return Math.max(min, Math.min(max, Math.floor(numero)));
}

function normalizarPayloadParaHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizarPayloadParaHash);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizarPayloadParaHash(
          (value as Record<string, unknown>)[key]
        );
        return acc;
      }, {});
  }

  return value;
}

function calcularBodyHash(body: WhatsAppWebhookBody) {
  return createHash("sha256")
    .update(JSON.stringify(normalizarPayloadParaHash(body)))
    .digest("hex");
}

function erroParaTexto(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Erro desconhecido";
}


function getQstashWorkerUrl() {
  return String(process.env.QSTASH_WORKER_URL || "").trim();
}

function getWebhookFlowControlKey() {
  return `whatsapp-webhooks-${process.env.VERCEL_ENV || "production"}`;
}

export async function publicarWebhookWhatsappQstash(
  eventoId: string,
  opcoes: { recuperacao?: boolean } = {}
) {
  const id = String(eventoId || "").trim();
  const url = getQstashWorkerUrl();

  if (!id || !process.env.QSTASH_TOKEN || !url) {
    return {
      ok: false,
      scheduled: false,
      reason: !id
        ? "evento_id_ausente"
        : !process.env.QSTASH_TOKEN
          ? "qstash_token_ausente"
          : "qstash_worker_url_ausente",
    };
  }

  const recuperacao = opcoes.recuperacao === true;

  try {
    const result = await qstash.publishJSON({
      url,
      body: { eventoId: id },
      retries: 5,
      timeout: 60,
      deduplicationId: recuperacao
        ? `whatsapp-webhook-recovery-${id}`
        : `whatsapp-webhook-${id}`,
      flowControl: {
        key: getWebhookFlowControlKey(),
        rate: 10,
        period: 1,
        parallelism: 5,
      },
      label: recuperacao
        ? "whatsapp-webhook-recovery"
        : "whatsapp-webhook",
    });

    return {
      ok: true,
      scheduled: true,
      result,
      reason: null,
    };
  } catch (error) {
    return {
      ok: false,
      scheduled: false,
      reason: erroParaTexto(error),
    };
  }
}

export async function enfileirarWebhookWhatsapp(body: WhatsAppWebhookBody) {
  const inicioEnfileirar = Date.now();
  const incomingMessages = extractIncomingMessages(body);
  const incomingStatuses = extractMessageStatuses(body);
  const coexistenceItems = countCoexistenceWebhookItems(body);
  const bodyHash = calcularBodyHash(body);
  const receivedAt = new Date().toISOString();
  const identificadores = extrairIdentificadoresWebhookWhatsapp(body);
  const payloadInsert = {
    body_hash: bodyHash,
    body_json: body,
    status: "pendente",
    metadata_json: {
      incoming_messages: incomingMessages.length,
      incoming_statuses: incomingStatuses.length,
      coexistence_total: coexistenceItems.total,
      coexistence_message_echoes: coexistenceItems.messageEchoes,
      coexistence_history_messages: coexistenceItems.historyMessages,
      coexistence_history_states: coexistenceItems.historyStates,
      coexistence_contacts: coexistenceItems.contacts,
      coexistence_account_updates: coexistenceItems.accountUpdates,
      phone_number_ids: identificadores.phoneNumberIds,
      mensagem_externa_ids: identificadores.mensagemExternaIds,
      received_at: receivedAt,
    },
    updated_at: receivedAt,
  };

  const { data, error } = await supabaseAdmin
    .from("whatsapp_webhook_eventos")
    .upsert(payloadInsert, {
      onConflict: "body_hash",
      ignoreDuplicates: true,
    })
    .select("*")
    .maybeSingle();

  if (!error && data) {
    perf("FILA / webhook salvo no banco", inicioEnfileirar, {
      eventId: data.id,
      incomingMessages: incomingMessages.length,
      incomingStatuses: incomingStatuses.length,
      coexistenceItems: coexistenceItems.total,
    });

    return {
      evento: data,
      duplicado: false,
      bodyHash,
      incomingMessages: incomingMessages.length,
      incomingStatuses: incomingStatuses.length,
      coexistenceItems: coexistenceItems.total,
    };
  }

  if (error) {
    throw new Error(`Erro ao enfileirar webhook: ${error.message}`);
  }

  const { data: eventoExistente, error: selectError } = await supabaseAdmin
    .from("whatsapp_webhook_eventos")
    .select("*")
    .eq("body_hash", bodyHash)
    .maybeSingle();

  if (selectError || !eventoExistente) {
    throw new Error(
      `Erro ao buscar webhook duplicado: ${
        selectError?.message || "evento nao encontrado"
      }`
    );
  }

  return {
    evento: eventoExistente,
    duplicado: true,
    bodyHash,
    incomingMessages: incomingMessages.length,
    incomingStatuses: incomingStatuses.length,
    coexistenceItems: coexistenceItems.total,
  };
}

async function liberarLocksExpirados(timeoutLockMinutos: number) {
  const agora = new Date();
  const limiteLock = new Date(
    agora.getTime() - timeoutLockMinutos * 60 * 1000
  ).toISOString();

  const { error } = await supabaseAdmin
    .from("whatsapp_webhook_eventos")
    .update({
      status: "erro",
      erro: "Lock de processamento expirado. Evento liberado para nova tentativa.",
      locked_at: null,
      updated_at: agora.toISOString(),
    })
    .eq("status", "processando")
    .lt("locked_at", limiteLock);

  if (error) {
    console.error("[WEBHOOK WHATSAPP] Erro ao liberar locks expirados:", error);
  }
}

async function reivindicarEvento(
  evento: WebhookEventoMinimo,
  maxTentativas: number
) {
  const agora = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("whatsapp_webhook_eventos")
    .update({
      status: "processando",
      tentativas: Number(evento.tentativas || 0) + 1,
      locked_at: agora,
      erro: null,
      updated_at: agora,
    })
    .eq("id", evento.id)
    .in("status", ["pendente", "erro"])
    .lt("tentativas", maxTentativas)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao reivindicar evento do webhook: ${error.message}`);
  }

  return data;
}

export async function processarWebhookWhatsappPorId(eventoId: string) {
  const inicioTotal = Date.now();

  if (!eventoId) {
    return {
      ok: false,
      error: "eventoId obrigatório.",
    };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const maxTentativas = normalizarInteiro(
    process.env.WHATSAPP_WEBHOOK_MAX_TENTATIVAS,
    5,
    1,
    20
  );

  const { data: evento, error } = await supabaseAdmin
    .from("whatsapp_webhook_eventos")
    .select("*")
    .eq("id", eventoId)
    .in("status", ["pendente", "erro"])
    .lt("tentativas", maxTentativas)
    .maybeSingle();

  if (error) {
    console.error(
      "[WEBHOOK QUEUE] Erro ao buscar evento por ID:",
      error
    );

    return {
      ok: false,
      error: error.message,
    };
  }

  if (!evento) {
    return {
      ok: true,
      ignorado: true,
      motivo:
        "Evento não encontrado, já processado ou com tentativas esgotadas.",
    };
  }

  const eventoTravado = await reivindicarEvento(evento, maxTentativas);

  if (!eventoTravado) {
    return {
      ok: true,
      ignorado: true,
      motivo: "Evento já foi travado/processado por outro worker.",
    };
  }

  try {
    const resultado = await processWhatsAppWebhookBody(
      eventoTravado.body_json as WhatsAppWebhookBody
    );
    const bodyCompactado = compactarBodyProcessado(
      eventoTravado
    );

    const agora = new Date().toISOString();

    await supabaseAdmin
      .from("whatsapp_webhook_eventos")
      .update({
        status: "processado",
        processed_at: agora,
        resultado_json: resultado || {},
        erro: null,
        locked_at: null,
        updated_at: agora,
        ...(bodyCompactado
          ? {
              body_json: bodyCompactado,
              compactado_at: agora,
            }
          : {}),
      })
      .eq("id", evento.id);

    logOperacional("[WEBHOOK QUEUE] Evento processado por ID", {
      eventoId: evento.id,
      tempo_ms: Date.now() - inicioTotal,
    });

    return {
      ok: true,
      processado: true,
      eventoId: evento.id,
      tempo_ms: Date.now() - inicioTotal,
    };
  } catch (error) {
    console.error(
      "[WEBHOOK QUEUE] Erro ao processar evento por ID:",
      error
    );

    await supabaseAdmin
      .from("whatsapp_webhook_eventos")
      .update({
        status: "erro",
        erro:
          error instanceof Error
            ? error.message
            : "Erro desconhecido.",
        resultado_json: {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Erro desconhecido.",
        },
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", evento.id);

    return {
      ok: false,
      processado: false,
      eventoId: evento.id,
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido.",
    };
  }
}

export async function processarFilaWebhooksWhatsapp(
  params: ProcessarFilaParams = {}
) {
  const inicioProcessarFila = Date.now();
  const limite = normalizarInteiro(
    params.limite ?? process.env.WHATSAPP_WEBHOOK_QUEUE_BATCH_LIMIT,
    10,
    1,
    100
  );
  const maxTentativas = normalizarInteiro(
    params.maxTentativas ?? process.env.WHATSAPP_WEBHOOK_MAX_TENTATIVAS,
    5,
    1,
    20
  );
  const timeoutLockMinutos = normalizarInteiro(
    params.timeoutLockMinutos ??
      process.env.WHATSAPP_WEBHOOK_LOCK_TIMEOUT_MINUTES,
    5,
    1,
    60
  );

  await liberarLocksExpirados(timeoutLockMinutos);

  const { data: eventos, error } = await supabaseAdmin
    .from("whatsapp_webhook_eventos")
    .select("*")
    .in("status", ["pendente", "erro"])
    .lt("tentativas", maxTentativas)
    .order("created_at", { ascending: true })
    .limit(limite);

  if (error) {
    throw new Error(`Erro ao buscar fila de webhooks: ${error.message}`);
  }

  perf("FILA / buscar eventos pendentes", inicioProcessarFila, {
    encontrados: eventos?.length || 0,
  });

  let processados = 0;
  let erros = 0;
  let ignorados = 0;

  for (const evento of eventos || []) {
    const inicioEventoFila = Date.now();
    const eventoReivindicado = await reivindicarEvento(evento, maxTentativas);

    if (!eventoReivindicado) {
      ignorados += 1;
      continue;
    }

    try {
      const resultado = await processWhatsAppWebhookBody(
        eventoReivindicado.body_json as WhatsAppWebhookBody
      );
      const bodyCompactado = compactarBodyProcessado(
        eventoReivindicado
      );

      perf("FILA / evento processado", inicioEventoFila, {
        eventId: eventoReivindicado.id,
      });

      const agora = new Date().toISOString();

      const { error: updateError } = await supabaseAdmin
        .from("whatsapp_webhook_eventos")
        .update({
          status: "processado",
          resultado_json: resultado,
          erro: null,
          locked_at: null,
          processed_at: agora,
          updated_at: agora,
          ...(bodyCompactado
            ? {
                body_json: bodyCompactado,
                compactado_at: agora,
              }
            : {}),
        })
        .eq("id", eventoReivindicado.id);

      if (updateError) {
        throw new Error(
          `Erro ao marcar webhook como processado: ${updateError.message}`
        );
      }

      processados += 1;
    } catch (error) {
      const agora = new Date().toISOString();
      const erro = erroParaTexto(error);

      console.error("[WEBHOOK WHATSAPP] Erro ao processar evento da fila:", {
        eventId: eventoReivindicado.id,
        erro,
      });

      await supabaseAdmin
        .from("whatsapp_webhook_eventos")
        .update({
          status: "erro",
          resultado_json: {
            success: false,
            error: erro,
          },
          erro,
          locked_at: null,
          updated_at: agora,
        })
        .eq("id", eventoReivindicado.id);

      erros += 1;
    }
  }

  return {
    ok: true,
    buscados: eventos?.length || 0,
    processados,
    erros,
    ignorados,
    limite,
    maxTentativas,
  };
}


export async function republicarFilaWebhooksWhatsapp(
  params: {
    limite?: number;
    idadeMinimaSegundos?: number;
  } = {}
) {
  const servico = "whatsapp-webhook-recovery";

  if (circuitoSupabaseEstaAberto(servico)) {
    return {
      ok: true,
      pausado: true,
      buscados: 0,
      republicados: 0,
      falhas: 0,
    };
  }

  const limite = normalizarInteiro(params.limite, 10, 1, 25);
  const idadeMinimaSegundos = normalizarInteiro(
    params.idadeMinimaSegundos,
    90,
    30,
    600
  );
  const maxTentativas = normalizarInteiro(
    process.env.WHATSAPP_WEBHOOK_MAX_TENTATIVAS,
    5,
    1,
    20
  );
  const timeoutLockMinutos = normalizarInteiro(
    process.env.WHATSAPP_WEBHOOK_LOCK_TIMEOUT_MINUTES,
    5,
    1,
    60
  );

  try {
    await liberarLocksExpirados(timeoutLockMinutos);

    const antesDe = new Date(
      Date.now() - idadeMinimaSegundos * 1000
    ).toISOString();
    const { data: eventos, error } = await supabaseAdmin
      .from("whatsapp_webhook_eventos")
      .select("id")
      .in("status", ["pendente", "erro"])
      .lt("tentativas", maxTentativas)
      .lt("updated_at", antesDe)
      .order("created_at", { ascending: true })
      .limit(limite);

    if (error) {
      throw new Error(
        `Erro ao buscar webhooks órfãos: ${error.message}`
      );
    }

    registrarSucessoCircuitoSupabase(servico);

    let republicados = 0;
    let falhas = 0;

    for (const evento of eventos || []) {
      const result = await publicarWebhookWhatsappQstash(evento.id, {
        recuperacao: true,
      });

      if (result.ok) {
        republicados += 1;
      } else {
        falhas += 1;
        console.warn(
          "[WEBHOOK WHATSAPP] Falha ao republicar evento órfão no QStash:",
          {
            eventoId: evento.id,
            motivo: result.reason || null,
          }
        );
      }
    }

    return {
      ok: true,
      pausado: false,
      buscados: eventos?.length || 0,
      republicados,
      falhas,
    };
  } catch (error) {
    registrarFalhaCircuitoSupabase(servico, error, {
      limiarFalhas: 1,
      pausaMs: 60_000,
    });
    throw error;
  }
}

export async function compactarWebhooksWhatsappProcessados(
  params: { limite?: number; idadeMinimaHoras?: number } = {}
) {
  const servico = "whatsapp-webhook-compaction";

  if (circuitoSupabaseEstaAberto(servico)) {
    return { ok: true, pausado: true, compactados: 0 };
  }

  const limite = normalizarInteiro(params.limite, 500, 1, 500);
  const idadeMinimaHoras = normalizarInteiro(
    params.idadeMinimaHoras,
    24,
    6,
    720
  );
  const antesDe = new Date(
    Date.now() - idadeMinimaHoras * 60 * 60 * 1000
  ).toISOString();

  try {
    const { data: eventos, error } = await supabaseAdmin
      .from("whatsapp_webhook_eventos")
      .select("id")
      .eq("status", "processado")
      .is("compactado_at", null)
      .lt("updated_at", antesDe)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limite);

    if (error) {
      throw new Error(
        `Erro ao buscar webhooks para compactação: ${error.message}`
      );
    }

    const ids = (eventos || []).map((evento) => evento.id);
    if (ids.length === 0) {
      registrarSucessoCircuitoSupabase(servico);
      return { ok: true, pausado: false, compactados: 0 };
    }

    const agora = new Date().toISOString();
    let compactados = 0;

    // Evita URLs muito grandes no PostgREST ao compactar centenas de UUIDs.
    for (let indice = 0; indice < ids.length; indice += 100) {
      const loteIds = ids.slice(indice, indice + 100);
      const { error: updateError } = await supabaseAdmin
        .from("whatsapp_webhook_eventos")
        .update({
          body_json: {
            archived: true,
            archived_reason: "retention_compaction",
            archived_at: agora,
          },
          resultado_json: {
            archived: true,
            archived_reason: "retention_compaction",
          },
          compactado_at: agora,
        })
        .in("id", loteIds)
        .is("compactado_at", null);

      if (updateError) {
        throw new Error(
          `Erro ao compactar webhooks processados: ${updateError.message}`
        );
      }

      compactados += loteIds.length;
    }

    registrarSucessoCircuitoSupabase(servico);

    return {
      ok: true,
      pausado: false,
      compactados,
    };
  } catch (error) {
    registrarFalhaCircuitoSupabase(servico, error, {
      limiarFalhas: 1,
      pausaMs: 60_000,
    });
    throw error;
  }
}

export async function contarMensagensWebhookNoMesmoSegundo(createdAt?: string | null) {
  const dataBase = createdAt ? new Date(createdAt) : new Date();

  dataBase.setMilliseconds(0);

  const inicioSegundo = dataBase.toISOString();
  const fimSegundo = new Date(dataBase.getTime() + 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("whatsapp_webhook_eventos")
    .select("metadata_json")
    .gte("created_at", inicioSegundo)
    .lt("created_at", fimSegundo);

  if (error) {
    console.error("[WEBHOOK QUEUE] Erro ao contar mensagens no segundo:", error);

    return {
      totalMensagens: 0,
      erro: error.message,
    };
  }

  const totalMensagens = ((data || []) as WebhookEventoMetadata[]).reduce((total, item) => {
    return total + Number(item.metadata_json?.incoming_messages || 0);
  }, 0);
  const totalStatuses = ((data || []) as WebhookEventoMetadata[]).reduce((total, item) => {
    return total + Number(item.metadata_json?.incoming_statuses || 0);
  }, 0);

  return {
    totalMensagens,
    totalStatuses,
    inicioSegundo,
    fimSegundo,
  };
}
