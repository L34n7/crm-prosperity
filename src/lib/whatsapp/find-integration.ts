import { supabaseAdmin } from "@/lib/supabase/admin";

export type WhatsAppIntegration = {
  id: string;
  empresa_id: string;
  nome_conexao: string | null;
  numero: string | null;
  provider: string | null;
  status: string | null;
  business_account_id: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  webhook_verificado: boolean | null;
  config_json: Record<string, unknown> | null;
  token_ref: string | null;
  ultimo_sync_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function findWhatsAppIntegrationByPhoneNumberId(
  phoneNumberId: string
): Promise<WhatsAppIntegration | null> {
  const { data, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select(
      `
        id,
        empresa_id,
        nome_conexao,
        numero,
        provider,
        status,
        business_account_id,
        phone_number_id,
        waba_id,
        webhook_verificado,
        config_json,
        token_ref,
        ultimo_sync_at,
        created_at,
        updated_at
      `
    )
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao buscar integração do WhatsApp: ${error.message}`
    );
  }

  if (!data) {
    return null;
  }

  return data as WhatsAppIntegration;
}

export function isWhatsAppIntegrationActive(
  integration: WhatsAppIntegration | null
): integration is WhatsAppIntegration {
  if (!integration) return false;

  return integration.status === "ativa";
}