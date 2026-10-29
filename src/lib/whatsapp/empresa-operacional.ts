import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Verifica o estado atual na origem, sem cache: evita novos envios de workers
 * já iniciados após o cancelamento da empresa.
 */
export async function exigirEmpresaWhatsappOperacional(phoneNumberId: string) {
  if (process.env.WHATSAPP_TEST_MODE === "true") return;
  const supabase = getSupabaseAdmin();
  const {data,error} = await supabase.from("integracoes_whatsapp")
    .select("id, empresas!inner(status)")
    .eq("phone_number_id",phoneNumberId)
    .eq("status","ativa")
    .eq("empresas.status","ativa")
    .limit(1).maybeSingle();
  if (error || !data) {
    throw new Error("Envio WhatsApp bloqueado: integração inativa ou empresa cancelada.");
  }
}
