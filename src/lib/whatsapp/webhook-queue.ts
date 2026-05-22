import { createHash } from "node:crypto";
import {
  extractIncomingMessages,
  extractMessageStatuses,
  type WhatsAppWebhookBody,
} from "@/lib/whatsapp/meta";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processWhatsAppWebhookBody } from "@/lib/whatsapp/process-webhook";

const supabaseAdmin = getSupabaseAdmin();

function perf(label: string, inicio: number, extra?: Record<string, any>) {
  console.log(`[PERF] ${label}`, {
    tempo_ms: Date.now() - inicio,
    ...(extra || {}),
  });
}

type ProcessarFilaParams = {
  limite?: number;
  maxTentativas?: number;
  timeoutLockMinutos?: number;
};

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

export async function enfileirarWebhookWhatsapp(body: WhatsAppWebhookBody) {
  const inicioEnfileirar = Date.now();
  const incomingMessages = extractIncomingMessages(body);
  const incomingStatuses = extractMessageStatuses(body);
  const bodyHash = calcularBodyHash(body);
  const receivedAt = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("whatsapp_webhook_eventos")
    .insert({
      body_hash: bodyHash,
      body_json: body,
      status: "pendente",
      metadata_json: {
        incoming_messages: incomingMessages.length,
        incoming_statuses: incomingStatuses.length,
        received_at: receivedAt,
      },
      updated_at: receivedAt,
    })
    .select("*")
    .single();

  if (!error && data) {

    perf("FILA / webhook salvo no banco", inicioEnfileirar, {
      eventId: data.id,
      incomingMessages: incomingMessages.length,
      incomingStatuses: incomingStatuses.length,
    });

    return {
      evento: data,
      duplicado: false,
      bodyHash,
      incomingMessages: incomingMessages.length,
      incomingStatuses: incomingStatuses.length,
    };
  }

  if (error?.code === "23505") {
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
    };
  }

  throw new Error(`Erro ao enfileirar webhook: ${error?.message}`);
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

async function reivindicarEvento(evento: any, maxTentativas: number) {
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

  const { data: evento, error } = await supabaseAdmin
    .from("whatsapp_webhook_eventos")
    .select("*")
    .eq("id", eventoId)
    .eq("status", "pendente")
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
      motivo: "Evento não encontrado ou já processado.",
    };
  }

  const { data: eventoTravado, error: lockError } = await supabaseAdmin
    .from("whatsapp_webhook_eventos")
    .update({
      status: "processando",
      locked_at: new Date().toISOString(),
      tentativas: (evento.tentativas || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", evento.id)
    .eq("status", "pendente")
    .select("*")
    .maybeSingle();

  if (lockError) {
    console.error("[WEBHOOK QUEUE] Erro ao travar evento:", lockError);

    return {
      ok: false,
      error: lockError.message,
    };
  }

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

    await supabaseAdmin
      .from("whatsapp_webhook_eventos")
      .update({
        status: "processado",
        processed_at: new Date().toISOString(),
        resultado_json: resultado || {},
        updated_at: new Date().toISOString(),
      })
      .eq("id", evento.id);

    console.log("[WEBHOOK QUEUE] Evento processado por ID", {
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
