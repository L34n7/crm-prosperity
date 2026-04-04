import { NextRequest, NextResponse } from "next/server";
import {
  extractIncomingMessages,
  extractTextMessages,
  type WhatsAppWebhookBody,
} from "@/lib/whatsapp/meta";
import {
  findWhatsAppIntegrationByPhoneNumberId,
  isWhatsAppIntegrationActive,
} from "@/lib/whatsapp/find-integration";

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;

    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    if (!mode || !token || !challenge) {
      return new NextResponse("Parâmetros ausentes", { status: 400 });
    }

    if (mode !== "subscribe") {
      return new NextResponse("Modo inválido", { status: 400 });
    }

    if (!VERIFY_TOKEN) {
      console.error(
        "WHATSAPP_WEBHOOK_VERIFY_TOKEN não definido no .env.local"
      );
      return new NextResponse("Erro interno de configuração", { status: 500 });
    }

    if (token !== VERIFY_TOKEN) {
      return new NextResponse("Token de verificação inválido", { status: 403 });
    }

    return new NextResponse(challenge, { status: 200 });
  } catch (error) {
    console.error("Erro ao validar webhook do WhatsApp:", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as WhatsAppWebhookBody;

    console.log(
      "[WEBHOOK WHATSAPP] Payload recebido:",
      JSON.stringify(body, null, 2)
    );

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json(
        { success: false, error: "Evento não é do WhatsApp" },
        { status: 400 }
      );
    }

    const incomingMessages = extractIncomingMessages(body);
    const textMessages = extractTextMessages(body);

    console.log(
      "[WEBHOOK WHATSAPP] Mensagens extraídas:",
      JSON.stringify(incomingMessages, null, 2)
    );

    console.log(
      "[WEBHOOK WHATSAPP] Mensagens de texto:",
      JSON.stringify(textMessages, null, 2)
    );

    if (textMessages.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: "Evento recebido sem mensagens de texto processáveis",
        },
        { status: 200 }
      );
    }

    const firstMessage = textMessages[0];

    const integration = await findWhatsAppIntegrationByPhoneNumberId(
      firstMessage.phoneNumberId
    );

    if (!integration) {
      console.warn(
        "[WEBHOOK WHATSAPP] Integração não encontrada para phoneNumberId:",
        firstMessage.phoneNumberId
      );

      return NextResponse.json(
        {
          success: true,
          message:
            "Evento recebido, mas nenhuma integração correspondente foi encontrada",
        },
        { status: 200 }
      );
    }

    if (!isWhatsAppIntegrationActive(integration)) {
      console.warn(
        "[WEBHOOK WHATSAPP] Integração encontrada, mas inativa:",
        integration.id
      );

      return NextResponse.json(
        {
          success: true,
          message: "Evento recebido, mas a integração está inativa",
        },
        { status: 200 }
      );
    }

    console.log(
      "[WEBHOOK WHATSAPP] Integração encontrada:",
      JSON.stringify(integration, null, 2)
    );

    return NextResponse.json(
      {
        success: true,
        message: "Evento recebido com sucesso",
        totals: {
          incomingMessages: incomingMessages.length,
          textMessages: textMessages.length,
        },
        integration: {
          id: integration.id,
          empresa_id: integration.empresa_id,
          status: integration.status,
          phone_number_id: integration.phone_number_id,
          numero: integration.numero,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao processar webhook do WhatsApp:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao processar webhook" },
      { status: 500 }
    );
  }
}