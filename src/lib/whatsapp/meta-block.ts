import { montarWhatsappUrl } from "@/lib/contatos/sistema";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const WHATSAPP_META_MANAGER_URL =
  "https://business.facebook.com/latest/whatsapp_manager";

export const WHATSAPP_META_BLOCK_HELP_MESSAGE =
  "Olá! Preciso de ajuda com minha conta WhatsApp Business desativada pela Meta.";

export const WHATSAPP_META_BLOCK_HELP_URL = montarWhatsappUrl(
  WHATSAPP_META_BLOCK_HELP_MESSAGE
);

export const WHATSAPP_META_BLOCK_TITLE =
  "Conta WhatsApp Business desativada pela Meta";

export const WHATSAPP_META_BLOCK_DESCRIPTION =
  "A Meta desativou a conta WhatsApp Business vinculada a este número. Enquanto a conta estiver desativada, o CRM não consegue enviar, receber, responder mensagens, executar bots ou automações pelo WhatsApp.";

export const WHATSAPP_META_BLOCK_CUSTOMER_ACTION =
  "Acesse o Gerenciador do WhatsApp da Meta para ver os detalhes e solicitar análise, se acreditar que a desativação foi um engano.";

type TipoBloqueioOperacional =
  | "conta_meta_bloqueada"
  | "limite_service_atingido";

type BloquearWhatsappMetaParams = {
  empresaId: string;
  integracaoId: string;
  motivo?: string | null;
  tipoBloqueio?: TipoBloqueioOperacional;
};

const supabaseAdmin = getSupabaseAdmin();

export function statusWhatsappMetaBloqueado(valor?: string | null) {
  return ["bloqueado", "banido", "blocked", "banned"].includes(
    String(valor || "").trim().toLowerCase()
  );
}

export async function aplicarBl���q�^