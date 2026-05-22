import { after, NextRequest, NextResponse } from "next/server";
import {
  extractIncomingMessages,
  extractMessageStatuses,
  type WhatsAppWebhookBody,
} from "@/lib/whatsapp/meta";
import {
  enfileirarWebhookWhatsapp,
  processarWebhookWhatsappPorId,
} from "@/lib/whatsapp/webhook-queue";
import { salvarMensagensRecebidasRapido } from "@/lib/whatsapp/save-incoming-message-fast";

export const runtime = "nodejs";

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

function perf(label: string, inicio: number, extra?: Record<string, any>) {
  console.log(`[PERF] ${label}`, {
    tempo_ms: Date.now() - inicio,
    ...(extra || {}),
  });
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
    const body = (await req.json()) as WhatsAppWebhookBody;

    perf("WEBHOOK / body lido", inicioPost);
    
    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json(
        { success: false, error: "Evento nao e do WhatsApp" },
        { status: 400 }
      );
    }

    const incomingMessages = extractIncomingMessages(body);
    const incomingStatuses = extractMessageStatuses(body);

    console.log("[WEBHOOK WHATSAPP] Evento recebido:", {
      incomingMessages: incomingMessages.length,
      incomingStatuses: incomingStatuses.length,
    });

    if (incomingMessages.length === 0 && incomingStatuses.length === 0) {
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

    const eventoFila = await enfileirarWebhookWhatsapp(body);

    const inicioSalvarRapido = Date.now();

    let resultadoSalvarRapido: any = null;

    if (incomingMessages.length > 0) {
      try {
        resultadoSalvarRapido = await salvarMensagensRecebidasRapido(body);

        perf("WEBHOOK / salvar mensagens rápido", inicioSalvarRapido, {
          salvas: resultadoSalvarRapido.salvas,
          duplicadas: resultadoSalvarRapido.duplicadas,
          ignoradas: resultadoSalvarRapido.ignoradas,
          erros: resultadoSalvarRapido.erros,
        });
      } catch (error) {
        console.error("[WEBHOOK WHATSAPP] Erro no salvamento rápido:", error);

        perf("WEBHOOK / salvar mensagens rápido erro", inicioSalvarRapido, {
          erro: error instanceof Error ? error.message : String(error),
        });
      }
    }

    perf("WEBHOOK / enfileirar", inicioFila, {
      duplicado: eventoFila.duplicado,
      eventId: eventoFila.evento?.id ?? null,
    });    

    if (incomingMessages.length > 0 && eventoFila.evento?.id && !eventoFila.duplicado) {
      after(async () => {
        try {
          const resultadoAtual = await processarWebhookWhatsappPorId(
            eventoFila.evento!.id
          );

          console.log(
            "[WEBHOOK WHATSAPP] Mensagem atual processada:",
            resultadoAtual
          );
        } catch (error) {
          console.error(
            "[WEBHOOK WHATSAPP] Erro ao processar mensagem atual:",
            error
          );
        }
      });
    }

    perf("WEBHOOK / resposta 200", inicioPost, {
      incomingMessages: incomingMessages.length,
      incomingStatuses: incomingStatuses.length,
    });

    return NextResponse.json(
      {
        success: true,
        queued: true,
        fastSaved: resultadoSalvarRapido,
        duplicated: eventoFila.duplicado,
        eventId: eventoFila.evento?.id ?? null,
        totals: {
          incomingMessages: incomingMessages.length,
          incomingStatuses: incomingStatuses.length,
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
