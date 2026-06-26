import {
  extractIncomingMessages,
  type WhatsAppWebhookBody,
} from "@/lib/whatsapp/meta";
import { findWhatsAppIntegrationByPhoneNumberId } from "@/lib/whatsapp/find-integration";
import { findOrCreateWhatsAppContact } from "@/lib/whatsapp/find-or-create-contact";
import { findOrCreateWhatsAppConversation } from "@/lib/whatsapp/find-or-create-conversation";
import { saveIncomingWhatsAppMessage } from "@/lib/whatsapp/save-incoming-message";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { atribuirCampanhaPorMensagemWhatsApp } from "@/lib/rastreamento/atribuir-campanha-whatsapp";

const supabaseAdmin = getSupabaseAdmin();

function perf(label: string, inicio: number, extra?: Record<string, any>) {
  console.log(`[PERF] ${label}`, {
    tempo_ms: Date.now() - inicio,
    ...(extra || {}),
  });
}

export async function salvarMensagensRecebidasRapido(
  body: WhatsAppWebhookBody
) {
  const inicioTotal = Date.now();

  if (body.object !== "whatsapp_business_account") {
    return {
      ok: false,
      salvas: 0,
      ignoradas: 0,
      erros: 0,
      motivo: "Evento não é do WhatsApp.",
    };
  }

  const incomingMessages = extractIncomingMessages(body);

  if (incomingMessages.length === 0) {
    return {
      ok: true,
      salvas: 0,
      ignoradas: 0,
      erros: 0,
      motivo: "Nenhuma mensagem recebida.",
    };
  }

  let salvas = 0;
  let duplicadas = 0;
  let ignoradas = 0;
  let erros = 0;

  for (const message of incomingMessages) {
    const inicioMensagem = Date.now();

    try {
      const integration = await findWhatsAppIntegrationByPhoneNumberId(
        message.phoneNumberId
      );

      if (!integration) {
        ignoradas += 1;

        console.warn("[FAST_MESSAGE] Integração não encontrada", {
          phoneNumberId: message.phoneNumberId,
          messageId: message.messageId,
        });

        continue;
      }

      if (integration.status !== "ativa") {
        ignoradas += 1;

        console.warn("[FAST_MESSAGE] Integração inativa", {
          integracaoId: integration.id,
          messageId: message.messageId,
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

      await atribuirCampanhaPorMensagemWhatsApp({
        empresaId: integration.empresa_id,
        contatoId: contact.id,
        conversaId: conversation.id,
        conteudo: message.conteudo || message.text,
      });

      const { data: protocoloAtivo, error: protocoloAtivoError } =
        await supabaseAdmin
          .from("conversa_protocolos")
          .select("id")
          .eq("conversa_id", conversation.id)
          .eq("ativo", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (protocoloAtivoError) {
        throw new Error(
          `Erro ao buscar protocolo ativo da conversa: ${protocoloAtivoError.message}`
        );
      }

      const metadataJson = (message.metadataJson || {}) as any;

      const savedMessage = await saveIncomingWhatsAppMessage({
        empresaId: integration.empresa_id,
        conversaId: conversation.id,
        conteudo: message.conteudo,
        tipoMensagem: message.tipoMensagem,
        statusEnvio: "entregue",
        mensagemExternaId: message.messageId,
        timestamp: message.timestamp,
        conversaProtocoloId: protocoloAtivo?.id ?? null,
        metadataJson: {
          ...metadataJson,
          whatsapp_profile_name: message.profileName || null,
          whatsapp_wa_id: message.waId || null,
          salvo_rapido_webhook: true,
          automacao_processada: false,
          salvo_rapido_em: new Date().toISOString(),
        },
      });

      if (savedMessage.duplicated) {
        duplicadas += 1;
      } else {
        salvas += 1;
      }

      await supabaseAdmin
        .from("conversas")
        .update({
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversation.id)
        .eq("empresa_id", integration.empresa_id);

      perf("FAST_MESSAGE / mensagem salva no chat", inicioMensagem, {
        messageId: message.messageId,
        mensagemInternaId: savedMessage.messageId,
        duplicated: savedMessage.duplicated,
        conversaId: conversation.id,
      });
    } catch (error) {
      erros += 1;

      console.error("[FAST_MESSAGE] Erro ao salvar mensagem rápida:", {
        messageId: message.messageId,
        erro: error instanceof Error ? error.message : String(error),
      });
    }
  }

  perf("FAST_MESSAGE / total", inicioTotal, {
    recebidas: incomingMessages.length,
    salvas,
    duplicadas,
    ignoradas,
    erros,
  });

  return {
    ok: erros === 0,
    recebidas: incomingMessages.length,
    salvas,
    duplicadas,
    ignoradas,
    erros,
  };
}
