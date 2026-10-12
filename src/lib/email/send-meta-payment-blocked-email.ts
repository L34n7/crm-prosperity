import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { META_PAYMENT_SETTINGS_URL } from "@/lib/whatsapp/meta-payment-block";

const supabaseAdmin = getSupabaseAdmin();
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type Pausas = {
  conversasEncerradas?: number;
  execucoesCanceladas?: number;
  agendamentosCancelados?: number;
  pendenciasIaCanceladas?: number;
  execucoesIaCanceladas?: number;
  jobsFilaCancelados?: number;
  campanhasPausadas?: number;
};

type Params = {
  empresaId: string;
  integracaoNome?: string | null;
  numero?: string | null;
  codigoMeta: number;
  detalhe?: string | null;
  ocorridoEm?: string | null;
  pausas?: Pausas;
};

function escaparHtml(valor: string) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dataPtBr(valor?: string | null) {
  const data = valor ? new Date(valor) : new Date();
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

export async function sendMetaPaymentBlockedEmail({
  empresaId,
  integracaoNome,
  numero,
  codigoMeta,
  detalhe,
  ocorridoEm,
  pausas = {},
}: Params) {
  if (!resend) {
    console.warn("[META PAYMENT EMAIL] RESEND_API_KEY nÃ£o configurada.");
    return { enviado: fals¶»§q«^