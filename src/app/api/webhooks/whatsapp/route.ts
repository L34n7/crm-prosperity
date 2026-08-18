import { after, NextRequest, NextResponse } from "next/server";
import {
  extractIncomingMessages,
  extractMessageStatuses,
  countCoexistenceWebhookItems,
  type WhatsAppWebhookBody,
} from "@/lib/whatsapp/meta";
import {
  countWhatsAppSpecialMessageTypes,
  treatWhatsAppSpecialEvents,
} from "@/lib/whatsapp/process-special-events";
import {
  enfileirarWebhookWhatsapp,
  processarWebhookWhatsappPorId,
  contarMensagensWebhookNoMesmoSegundo,
} from "@/lib/whatsapp/webhook-queue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { qstash } from "@/lib/qstash/client";

export const runtime = "nodejs";

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

function perf(label: string, inicio: number, extra?: Record<string, unknown>) {
  console.log(`[PERF] ${label}`, {
    tempo_ms: Date.now() - inicio,
    ...(extra || {}),
  });
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function prepararEventoEspecialParaProcessamento(params: {
  eventoId: string;
  rawBody: WhatsAppWebhookBody;
  processingBody: WhatsAppWebhookBody;
  metadataAtual?: unknown;
  specialCounts: ReturnType<typeof countWhatsAppSpecialMessageTypes>;
  specialResult: Awaited<ReturnType<typeof treatWhatsAppSpecialEvents>>;
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("whatsapp_webhook_eventos")
    .update({
      body_json: params.processingBody,
      metadata_json: {
        ...metadataObject(params.metadataAtual),
        special_event_counts: params.specialCounts,
        special_event_result: params.specialResult,
        raw_special_webhook_body: params.rawBody,
        raw_special_webhook_preserved_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.eventoId);

  if (error) {
    throw new Error(
      `Erro ao preparar evento especial do WhatsApp: ${error.message}`,
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;

    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    if (!mode || !token || !challenge) {
      return new NextResponse("Parametros ausentes", { status: 400 });
    }

    if (mode !== "subscribe") {
      return new NextResponse("Modo invalido", { status: 400 });
    }

    if (!VERIFY_TOKEN) {
      console.error(
        "WHATSAPP_WEBHOOK_VERIFY_TOKEN nao definido nas variaveis de ambiente"
      );
      return new NextResponse("Erro interno de configuracao", { status: 500 });
    }

    if (token !== VERIFY_TOKEN) {
      return new NextResponse("Token de verificacao invalido", { status: 403 });
    }

    return new NextResponse(challenge, { status: 200 });
  } catch (error) {
    console.error("Erro ao validar webhook do WhatsApp:", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const inicioPost = Date.now();

  try {
    const rawBody = (await req.json()) as WhatsAppWebhookBody;

    perf("WEBHOOK / body lido", inicioPost);

    if (rawBody.object !== "whatsapp_business_account") {
      return NextResponse.json(
        { success: false, error: "Evento nao e do WhatsApp" },
        { status: 400 }
      );
    }

    const specialCounts = countWhatsAppSpecialMessageTypes(rawBody);
    const rawIncomingMessages = extractIncomingMessages(rawBody);
    const rawIncomingStatuses = extractMessageStatuses(rawBody);
    const rawCoexistenceItems = countCoexistenceWebhookItems(rawBody);

    const camposWebhook = rawBody.entry?.flatMap((entry) =>
      entry.changes?.map((change) => change.field)
    ) ?? [];

    const temEventoAdministrativo = camposWebhook.some((field) =>
      [
        "phone_number_name_update",
        "phone_number_quality_update",
        "account_update",
        "message_template_status_update",
      ].includes(String(field))
    );

    console.log("[WEBHOOK WHATSAPP] Evento recebido:", {
      incomingMessages: rawIncomingMessages.length,
      incomingStatuses: rawIncomingStatuses.length,
      coexistenceItems: rawCoexistenceItems,
      specialEvents: specialCounts,
    });

    if (
      rawIncomingMessages.length === 0 &&
      rawIncomingStatuses.length === 0 &&
      rawCoexistenceItems.total === 0 &&
      specialCounts.total === 0 &&
      !temEventoAdministrativo
    ) {
      console.log("[WEBHOOK WHATSAPP] Evento recebido sem mensagens/status/coex:", {
        fields: camposWebhook,
      });

      return NextResponse.json(
        {
          success: true,
          queued: false,
          message: "Evento recebido sem mensagens nem status processaveis",
        },
        { status: 200 }
      );
    }

    const inicioFila = Date.now();

    // A fila e o body_hash recebem exatamente o JSON entregue pela Meta.
    const eventoFila = await enfileirarWebhookWhatsapp(rawBody);

    let processingBody = rawBody;
    let specialResult: Awaited<ReturnType<typeof treatWhatsAppSpecialEvents>> | null = null;

    if (eventoFila.evento?.id && !eventoFila.duplicado && specialCounts.total > 0) {
      processingBody = structuredClone(rawBody);
      specialResult = await treatWhatsAppSpecialEvents(processingBody);

      await prepararEventoEspecialParaProcessamento({
        eventoId: eventoFila.evento.id,
        rawBody,
        processingBody,
        metadataAtual: eventoFila.evento.metadata_json,
        specialCounts,
        specialResult,
      });
    }

    const incomingMessages = extractIncomingMessages(processingBody);
    const incomingStatuses = extractMessageStatuses(processingBody);
    const coexistenceItems = countCoexistenceWebhookItems(processingBody);

    perf("WEBHOOK / enfileirar", inicioFila, {
      duplicado: eventoFila.duplicado,
      eventId: eventoFila.evento?.id ?? null,
      specialEvents: specialResult || specialCounts,
    });

    if (eventoFila.evento?.id && !eventoFila.duplicado) {
      const limiteQstash = Number(
        process.env.WHATSAPP_QSTASH_THRESHOLD_MESSAGES_PER_SECOND || 10
      );
      const limiteQstashStatuses = Number(
        process.env.WHATSAPP_QSTASH_THRESHOLD_STATUSES_PER_SECOND || 5
      );

      const volumeSegundo = await contarMensagensWebhookNoMesmoSegundo(
        eventoFila.evento.created_at
      );

      const deveUsarQstash =
        coexistenceItems.historyMessages > 0 ||
        coexistenceItems.historyStates > 0 ||
        coexistenceItems.contacts > 0 ||
        (incomingStatuses.length > 0 &&
          (volumeSegundo.totalStatuses || 0) > limiteQstashStatuses) ||
        (incomingMessages.length > 0 &&
          volumeSegundo.totalMensagens > limiteQstash);

      if (deveUsarQstash) {
        const qstashWorkerUrl = process.env.QSTASH_WORKER_URL;

        if (!qstashWorkerUrl) {
          console.error("[QSTASH] QSTASH_WORKER_URL não configurada.");

          after(async () => {
            await processarWebhookWhatsappPorId(eventoFila.evento!.id);
          });
        } else {
          try {
            await qstash.publishJSON({
              url: qstashWorkerUrl,
              body: {
                eventoId: eventoFila.evento.id,
              },
              retries: 3,
            });

            console.log("[QSTASH] Evento publicado por pico de mensagens", {
              eventoId: eventoFila.evento.id,
              totalMensagensNoSegundo: volumeSegundo.totalMensagens,
              totalStatusesNoSegundo: volumeSegundo.totalStatuses,
              limiteQstash,
              limiteQstashStatuses,
            });
          } catch (error) {
            console.error("[QSTASH] Erro ao publicar evento. Processando direto:", error);

            after(async () => {
              await processarWebhookWhatsappPorId(eventoFila.evento!.id);
            });
          }
        }
      } else {
        after(async () => {
          try {
            const resultado = await processarWebhookWhatsappPorId(
              eventoFila.evento!.id
            );

            if (resultado.ok && resultado.processado) {
              console.log(
                "[WEBHOOK WHATSAPP] Evento processado direto na Vercel",
                {
                  eventoId: eventoFila.evento.id,
                  totalMensagensNoSegundo: volumeSegundo.totalMensagens,
                  totalStatusesNoSegundo: volumeSegundo.totalStatuses,
                  limiteQstash,
                  limiteQstashStatuses,
                }
              );
            } else {
              console.error(
                "[WEBHOOK WHATSAPP] Evento direto permaneceu sem processamento",
                {
                  eventoId: eventoFila.evento.id,
                  resultado,
                }
              );
            }
          } catch (error) {
            console.error("[WEBHOOK WHATSAPP] Erro ao processar direto:", error);
          }
        });
      }
    }

    perf("WEBHOOK / resposta 200", inicioPost, {
      incomingMessages: incomingMessages.length,
      incomingStatuses: incomingStatuses.length,
      coexistenceItems: coexistenceItems.total,
      specialEvents: specialCounts.total,
    });

    return NextResponse.json(
      {
        success: true,
        queued: true,
        duplicated: eventoFila.duplicado,
        eventId: eventoFila.evento?.id ?? null,
        totals: {
          incomingMessages: incomingMessages.length,
          incomingStatuses: incomingStatuses.length,
          coexistence: coexistenceItems,
          specialEvents: specialResult || specialCounts,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao receber webhook do WhatsApp:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao receber webhook" },
      { status: 500 }
    );
  }
}
