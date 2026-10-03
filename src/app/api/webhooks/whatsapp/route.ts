import { MODO_CONTINGENCIA_SUPABASE_ATIVO, respostaContingenciaSupabase } from "@/lib/operacional/contingencia-supabase";
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
  publicarWebhookWhatsappQstash,
} from "@/lib/whatsapp/webhook-queue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buscarPhoneNumberIdsComRecebimentoSuspenso,
  removerMensagensWhatsappPorPhoneNumberIds,
} from "@/lib/whatsapp/inadimplencia";

export const runtime = "nodejs";

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

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
    let rawBody = (await req.json()) as WhatsAppWebhookBody;

    perf("WEBHOOK / body lido", inicioPost);

    if (MODO_CONTINGENCIA_SUPABASE_ATIVO) {
      // Não tocamos no banco durante a indisponibilidade. O 503 sinaliza à
      // Meta que a entrega deve ser tentada novamente mais tarde.
      return respostaContingenciaSupabase("webhook_whatsapp_meta", {
        status: 503,
        retryAfterSegundos: 300,
      });
    }

    if (rawBody.object !== "whatsapp_business_account") {
      return NextResponse.json(
        { success: false, error: "Evento nao e do WhatsApp" },
        { status: 400 }
      );
    }

    const mensagensAntesDoFiltro = extractIncomingMessages(rawBody);

    if (mensagensAntesDoFiltro.length > 0) {
      const phoneNumberIdsSuspensos =
        await buscarPhoneNumberIdsComRecebimentoSuspenso(
          mensagensAntesDoFiltro.map((message) => message.phoneNumberId)
        );

      if (phoneNumberIdsSuspensos.size > 0) {
        rawBody = removerMensagensWhatsappPorPhoneNumberIds(
          rawBody,
          phoneNumberIdsSuspensos
        );

        logOperacional(
          "[WEBHOOK WHATSAPP] Mensagens ignoradas por inadimplencia prolongada",
          {
            phoneNumberIds: Array.from(phoneNumberIdsSuspensos),
            mensagensIgnoradas: mensagensAntesDoFiltro.filter((message) =>
              phoneNumberIdsSuspensos.has(message.phoneNumberId)
            ).length,
          }
        );
      }
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
        "template_category_update",
      ].includes(String(field))
    );

    logOperacional("[WEBHOOK WHATSAPP] Evento recebido:", {
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
      logOperacional("[WEBHOOK WHATSAPP] Evento recebido sem mensagens/status/coex:", {
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
      const eventoId = eventoFila.evento.id;
      const possuiStatuses = incomingStatuses.length > 0;
      const possuiCoexistenciaPesada =
        coexistenceItems.historyMessages > 0 ||
        coexistenceItems.historyStates > 0 ||
        coexistenceItems.contacts > 0;
      const loteMensagens = incomingMessages.length > 1;

      // Status de envio/leitura/falha geram rajadas grandes durante disparos.
      // Eles sempre passam pelo QStash para que o banco receba carga controlada.
      // Mensagens recebidas comuns continuam no caminho direto para preservar
      // a baixa latência do atendimento.
      const deveUsarQstash =
        possuiStatuses || possuiCoexistenciaPesada || loteMensagens;

      if (deveUsarQstash) {
        const publicacao = await publicarWebhookWhatsappQstash(eventoId);

        if (publicacao.ok) {
          logOperacional("[QSTASH] Evento publicado com controle de fluxo", {
            eventoId,
            incomingMessages: incomingMessages.length,
            incomingStatuses: incomingStatuses.length,
            coexistenceItems: coexistenceItems.total,
          });
        } else {
          // O evento já está persistido como pendente. Não fazemos fallback
          // direto aqui, pois isso recriaria a avalanche que o QStash evita.
          console.error(
            "[QSTASH] Falha ao publicar evento. Evento permanecerá pendente para o cron de recuperação:",
            {
              eventoId,
              motivo: publicacao.reason || null,
            }
          );
        }
      } else {
        after(async () => {
          try {
            const resultado = await processarWebhookWhatsappPorId(eventoId);

            if (resultado.ok && resultado.processado) {
              logOperacional(
                "[WEBHOOK WHATSAPP] Mensagem recebida processada direto na Vercel",
                {
                  eventoId,
                  incomingMessages: incomingMessages.length,
                }
              );
            } else {
              console.error(
                "[WEBHOOK WHATSAPP] Evento direto permaneceu sem processamento",
                { eventoId, resultado }
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
