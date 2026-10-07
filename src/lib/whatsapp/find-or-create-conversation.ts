import {
  findOrCreateWhatsAppConversation as findOrCreateWhatsAppConversationCore,
  type WhatsAppConversation,
} from "./find-or-create-conversation-core";

export type { WhatsAppConversation } from "./find-or-create-conversation-core";

type FindOrCreateConversationParams = {
  empresaId: string;
  contatoId: string;
  integracaoWhatsappId: string;
};

export async function findOrCreateWhatsAppConversation(
  params: FindOrCreateConversationParams
): Promise<WhatsAppConversation> {
  return findOrCreateWhatsAppConversationCore(params);
}
