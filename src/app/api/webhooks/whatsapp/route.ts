import { NextRequest, NextResponse } from "next/server";
import {
  extractIncomingMessages,
  extractMessageStatuses,
  type WhatsAppWebhookBody,
} from "@/lib/whatsapp/meta";
import { findWhatsAppIntegrationByPhoneNumberId } from "@/lib/whatsapp/find-integration";
import { findOrCreateWhatsAppContact } from "@/lib/whatsapp/find-or-create-contact";
import { findOrCreateWhatsAppConversation } from "@/lib/whatsapp/find-or-create-conversation";
import { saveIncomingWhatsAppMessage } from "@/lib/whatsapp/save-incoming-message";
import { processAutomationEngine } from "@/lib/automacoes/process-automation-engine";
import { updateWhatsAppMessageStatus } from "@/lib/whatsapp/update-message-status";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const supabaseAdmin = getSupabaseAdmin();

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
    const incomingStatuses = extractMessageStatuses(body);

    console.log(
      "[WEBHOOK WHATSAPP] Status extraídos:",
      JSON.stringify(incomingStatuses, null, 2)
    );

    console.log(
      "[WEBHOOK WHATSAPP] Mensagens extraídas:",
      JSON.stringify(incomingMessages, null, 2)
    );

    if (incomingMessages.length === 0 && incomingStatuses.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: "Evento recebido sem mensagens nem status processáveis",
        },
        { status: 200 }
      );
    }

    const processedResults: Array<Record<string, unknown>> = [];

    for (const statusItem of incomingStatuses) {
      try {
        const updateResult = await updateWhatsAppMessageStatus({
          mensagemExternaId: statusItem.mensagemExternaId,
          status: statusItem.status,
          timestamp: statusItem.timestamp,
          metadata: {
            recipient_id: statusItem.recipientId,
            conversation_id: statusItem.conversationId,
            conversation_origin_type: statusItem.conversationOriginType,
            expiration_timestamp: statusItem.expirationTimestamp,
            pricing_category: statusItem.pricingCategory,
            pricing_model: statusItem.pricingModel,
            pricing_billable: statusItem.pricingBillable,
            error_message: statusItem.errorMessage,
            raw_status: statusItem.rawStatus,
          },
        });

        processedResults.push({
          type: "status",
          mensagemExternaId: statusItem.mensagemExternaId,
          status: statusItem.status,
          success: true,
          found: updateResult.found,
          updated: updateResult.updated,
          reason: updateResult.reason ?? null,
          messageIdInterno: updateResult.messageId ?? null,
        });
      } catch (statusError) {
        console.error(
          "[WEBHOOK WHATSAPP] Erro ao processar status individual:",
          statusError
        );

        processedResults.push({
          type: "status",
          mensagemExternaId: statusItem.mensagemExternaId,
          status: statusItem.status,
          success: false,
          reason:
            statusError instanceof Error
              ? statusError.message
              : "Erro desconhecido ao processar status",
        });
      }
    }

    for (const message of incomingMessages) {
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

        const contact = await findOrCreateWhatsAppContact({
          empresaId: integration.empresa_id,
          phone: message.from,
          profileName: message.profileName,
        });

        const conversation = await findOrCreateWhatsAppConversation({
          empresaId: integration.empresa_id,
          contatoId: contact.id,
          integracaoWhatsappId: integration.id,
        });

        const { data: protocoloAtivo, error: protocoloAtivoError } =
          await supabaseAdmin
            .from("conversa_protocolos")
            .select("id")
            .eq("conversa_id", conversation.id)
            .eq("ativo", true)
            .maybeSingle();

        if (protocoloAtivoError) {
          throw new Error(
            `Erro ao buscar protocolo ativo da conversa: ${protocoloAtivoError.message}`
          );
        }

        const payloadSalvarMensagem: any = {
          empresaId: integration.empresa_id,
          conversaId: conversation.id,
          conteudo: message.conteudo,
          tipoMensagem: message.tipoMensagem,
          statusEnvio: "entregue",
          mensagemExternaId: message.messageId,
          timestamp: message.timestamp,
          metadataJson: message.metadataJson,
          conversaProtocoloId: protocoloAtivo?.id ?? null,
        };

        const savedMessage = await saveIncomingWhatsAppMessage(
          payloadSalvarMensagem
        );

        let automationResult:
          | {
              ok: boolean;
              status?: string;
              execucaoId?: string;
              fluxoId?: string;
              error?: string;
            }
          | null = null;

        const podeRodarAutomacao =
          !savedMessage.duplicated &&
          message.tipoMensagem === "texto" &&
          !!message.text?.trim();

        if (podeRodarAutomacao) {
          automationResult = await processAutomationEngine({
            empresaId: integration.empresa_id,
            conversaId: conversation.id,
            contatoId: contact.id,
            mensagemTexto: message.text ?? "",
            numeroDestino: message.from,
          });
        }

        processedResults.push({
          messageId: message.messageId,
          success: true,
          duplicated: savedMessage.duplicated,
          integrationId: integration.id,
          contactId: contact.id,
          conversationId: conversation.id,
          conversaProtocoloId: protocoloAtivo?.id ?? null,
          savedMessageId: savedMessage.messageId,
          tipoMensagem: message.tipoMensagem,
          automationOk: automationResult?.ok ?? false,
          automationStatus: automationResult?.status ?? null,
          automationExecucaoId: automationResult?.execucaoId ?? null,
          automationFluxoId: automationResult?.fluxoId ?? null,
          automationError: automationResult?.error ?? null,
        });
      } catch (messageError) {
        console.error(
          "[WEBHOOK WHATSAPP] Erro ao processar mensagem individual:",
          messageError
        );

        processedResults.push({
          messageId: message.messageId,
          success: false,
          tipoMensagem: message.tipoMensagem,
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