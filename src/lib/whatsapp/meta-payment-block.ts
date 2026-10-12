import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { deveLimparAvisoPagamentoMeta } from "@/lib/whatsapp/meta-payment-warning-policy";

export const META_PAYMENT_ERROR_CODES = [131042, 131044] as const;

export const META_PAYMENT_SETTINGS_URL =
  "https://business.facebook.com/latest/billing_hub/accounts";

type JsonRecord = Record<string, unknown>;

export type MetaPaymentBlockState = {
  ativo: boolean;
  codigo: number | null;
  detalhe: string | null;
  ocorrido_em: string | null;
  ultima_falha_em: string | null;
  mensagem_externa_id: string | null;
  pausas: {
    conversas_encerradas: number;
    execucoes_canceladas: number;
    agendamentos_cancelados: number;
    pendencias_ia_canceladas: number;
    execucoes_ia_canceladas: number;
    jobs_fila_cancelados: number;
    campanhas_pausadas: number;
  };
};

const supabaseAdmin = getSupabaseAdmin();

function objeto(valor: unknown): JsonRecord {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as JsonRecord)
    : {};
}

export function codigoErroMetaPagamento(codigo?: number | null) {
  return META_PAYMENT_ERROR_CODES.includes(
    Number(codigo || 0) as (typeof META_PAYMENT_ERROR_CODES)[number]
  );
}

export function lerBloqueioFinanceiroMeta(
  raw: unknown
): MetaPaymentBlockState | null {
  const bloqueio = objeto(objeto(raw).bloqueio_financeiro_meta);

  if (bloqueio.ativo !== true) return null;

  const pausas = objeto(bloqueio.pausas);

  return {
    ativo: true¶»§q«^