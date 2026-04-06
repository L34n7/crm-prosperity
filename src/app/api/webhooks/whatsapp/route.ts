import { NextRequest, NextResponse } from "next/server";
import {
  extractIncomingMessages,
  extractTextMessages,
  type WhatsAppWebhookBody,
} from "@/lib/whatsapp/meta";
import { findWhatsAppIntegrationByPhoneNumberId } from "@/lib/whatsapp/find-integration";
import { findOrCreateWhatsAppContact } from "@/lib/whatsapp/find-or-create-contact";
import { findOrCreateWhatsAppConversation } from "@/lib/whatsapp/find-or-create-conversation";
import { saveIncomingWhatsAppMessage } from "@/lib/whatsapp/save-incoming-message";

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
        "WHATSAPP_WEBHOOK_VERIFY_TOKEN não definido nas variáveis de ambiente"
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

    if (incomingMessages.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: "Evento recebido sem mensagens processáveis",
        },
        { status: 200 }
      );
    }

    if (textMessages.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message:
            "Evento recebido, mas sem mensagens de texto processáveis por enquanto",
        },
        { status: 200 }
      );
    }

    const processedResults: Array<Record<string, unknown>> = [];

    for (const message of textMessages) {
      try {
        const integration = await findWhatsAppIntegrationByPhoneNumberId(
          message.phoneNumberId
        );

        if (!integration) {
          console.warn(
            "[WEBHOOK WHATSAPP] Integração não encontrada para phoneNumberId:",
            message.phoneNumberId
          );

          processedResults.push({
            messageId: message.messageId,
            success: false,
            reason: "integração não encontrada",
            phoneNumberId: message.phoneNumberId,
          });

          continue;
        }

        if (integration.status !== "ativa") {
          console.warn(
            "[WEBHOOK WHATSAPP] Integração encontrada, mas inativa:",
            integration.id
          );

          processedResults.push({
            messageId: message.messageId,
            success: false,
            reason: "integração inativa",
            integrationId: integration.id,
          });

          continue;
        }

        console.log(
          "[WEBHOOK WHATSAPP] Integração encontrada:",
          JSON.stringify(integration, null, 2)
        );

        const contact = await findOrCreateWhatsAppContact({
          empresaId: integration.empresa_id,
          phone: message.from,
          profileName: message.profileName,
        });

        console.log(
          "[WEBHOOK WHATSAPP] Contato localizado/criado:",
          JSON.stringify(contact, null, 2)
        );

        const conversation = await findOrCreateWhatsAppConversation({
          empresaId: integration.empresa_id,
          contatoId: contact.id,
          integracaoWhatsappId: integration.id,
        });

        console.log(
          "[WEBHOOK WHATSAPP] Conversa localizada/criada:",
          JSON.stringify(conversation, null, 2)
        );

        const savedMessage = await saveIncomingWhatsAppMessage({
          empresaId: integration.empresa_id,
          conversaId: conversation.id,
          conteudo: message.text ?? "",
          tipoMensagem: "texto",
          statusEnvio: "recebida",
          mensagemExternaId: message.messageId,
          timestamp: message.timestamp,
        });

        console.log(
          "[WEBHOOK WHATSAPP] Resultado do salvamento da mensagem:",
          JSON.stringify(savedMessage, null, 2)
        );

        processedResults.push({
          messageId: message.messageId,
          success: true,
          duplicated: savedMessage.duplicated,
          integrationId: integration.id,
          contactId: contact.id,
          conversationId: conversation.id,
          savedMessageId: savedMessage.messageId,
        });
      } catch (messageError) {
        console.error(
          "[WEBHOOK WHATSAPP] Erro ao processar mensagem individual:",
          messageError
        );

        processedResults.push({
          messageId: message.messageId,
          success: false,
          reason:
            messageError instanceof Error
              ? messageError.message
              : "Erro desconhecido ao processar mensagem",
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Webhook processado",
        totals: {
          incomingMessages: incomingMessages.length,
          textMessages: textMessages.length,
          processed: processedResults.length,
          successCount: processedResults.filter((item) => item.success).length,
          errorCount: processedResults.filter((item) => !item.success).length,
        },
        results: processedResults,
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