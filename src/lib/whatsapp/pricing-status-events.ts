import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function timestampMetaParaIso(timestamp?: string | null) {
  const valor = String(timestamp || "").trim();
  if (!valor) return new Date().toISOString();

  const epoch = Number(valor);
  if (Number.isFinite(epoch) && epoch > 0) {
    return new Date(epoch * 1000).toISOString();
  }

  const data = new Date(valor);
  if (!Number.isNaN(data.getTime())) {
    return data.toISOString();
  }

  return new Date().toISOString();
}

export async function registrarPricingStatusEventoMeta(params: {
  empresaId: string;
  integracaoWhatsappId: string;
  phoneNumberId: string;
  mensagemExternaId: string;
  recipientId?: string | null;
  status: string;
  timestamp?: string | null;
  pricingCategory?: string | null;
  pricingType?: string | null;
  pricingModel?: string | null;
  pricingBillable?: boolean | null;
}) {
  if (
    !params.empresaId ||
    !params.phoneNumberId ||
    !params.mensagemExternaId
  ) {
    return;
  }

  const { error } = await supabaseAdmin.rpc(
    "registrar_whatsapp_pricing_status_evento",
    {
      p_empresa_id: params.empresaId,
      p_integracao_id: params.integracaoWhatsappId || null,
      p_phone_number_id: params.phoneNumberId,
      p_mensagem_externa_id: params.mensagemExternaId,
      p_recipient_id: params.recipientId || null,
      p_status_meta: params.status,
      p_event_at: timestampMetaParaIso(params.timestamp),
      p_pricing_category: params.pricingCategory || null,
      p_pricing_type: params.pricingType || null,
      p_pricing_model: params.pricingModel || null,
      p_pricing_billable:
        typeof params.pricingBillable === "boolean"
          ? params.pricingBillable
          : null,
    }
  );

  if (error) {
    throw new Error(
      `Erro ao registrar status de pricing da Meta: ${error.message}`
    );
  }
}
