import { supabaseAdmin } from "@/lib/supabase/admin";

export type WhatsAppIntegration = {
  id: string;
  empresa_id: string;
  nome_conexao: string | null;
  numero: string | null;
  provider: string | null;
  status: string;
  business_account_id: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  webhook_verificado: boolean | null;
  config_json: Record<string, unknown> | null;
  token_ref: string | null;
  ultimo_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function findWhatsAppIntegrationByPhoneNumberId(
  phoneNumberId: string
): Promise<WhatsAppIntegration | null> {
  if (!phoneNumberId) return null;

  const { data, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("*")
    .eq("phone_number_id", phoneNumberId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[WHATSAPP] Erro ao buscar integração por phone_number_id:",
      error
    );
    return null;
  }

  return (data as WhatsAppIntegration | null) ?? null;
}