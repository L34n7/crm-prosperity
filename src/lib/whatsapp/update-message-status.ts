import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendMetaPaymentBlockedEmail } from "@/lib/email/send-meta-payment-blocked-email";
import {
  aplicarBloqueioOperacionalWhatsappMeta,
  statusWhatsappMetaBloqueado,
  WHATSAPP_META_BLOCK_DESCRIPTION,
} from "@/lib/whatsapp/meta-block";
import { notificarCampanhaDisparoPausada } from "@/lib/whatsapp/disparo-alertas";
import { resolverPricingRealizado } from "@/lib/whatsapp/pricing-realized";
import {
  codigoErroMetaPagamento,
  limparAvisoFinanceiroMetaAposEnvioConfirmado,
} from "@/lib/whatsapp/meta-payment-block";

type UpdateMessageStatusParams = {
  mensagemExternaId: string;
  status: "enviada" | "entregue" | "lida" | "falha";
  timestamp?: string | null;
  metadata?: Record<string, unknown> | null;
};

type MensagemStatusRow = {
  id: string;
  empresa_id?: string | null;
  conversa_id?: string | null;
  status_envio?: string | null;
  metadata_json?: Record<string, unknown> | null;
  created_at?: string | null;
  pricing_moeda?: string | null;
  pricing_tarifa_unitaria?: number | string | null;
  pricing_custo_usd?: number | string | null;
  pricing_custo_brl?: number | string | null;
  pricing_rate_card_id?: string | null;
};

type ContextoIntegracao = {
  empresaId: string;
  integracaoId: string;
};

type CampanhaPausadaRow = {
  id?: string | null;
  usuario_id?: string | null;
};

const ERRO_META_CONTA_BLOQUEADA = 131031;
const supabaseAdmin = getSupabaseAdmin();

const ORDEM_STATUS: Record<string, n¶»§q«^