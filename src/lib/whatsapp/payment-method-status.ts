import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { getWhatsAppGraphUrl } from "@/lib/whatsapp/graph-api";

type ConfigJson = Record<string, unknown> | null;

export type IntegracaoPagamentoMeta = {
  id: string;
  empresa_id: string;
  waba_id: string | null;
  token_ref?: string | null;
  config_json?: ConfigJson;
  payment_method_added?: boolean | null;
  meta_payment_status?: string | null;
  meta_primary_funding_id?: string | null;
  meta_payment_checked_at?: string | null;
  meta_payment_check_error?: string | null;
};

type MetaPaymentResponse = {
  id?: string;
  primary_funding_id?: string | number | null;
  currency?: string | null;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    error_user_title?: string;
    error_user_msg?: string;
  };
};

const supabaseAdmin = getSupabaseAdmin();

function objeto(valor: ConfigJson) {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? valor
    : {};
}

function mensagemErroMeta(json: MetaPaymentResponse, statusHttp: number) {
  const codigo = Number(json?.error?.code);
  const detalhe =
    String(json?.error?.error_user_msg || "").trim() ||
    String(json?.error?.message || "").trim();

  if (codigo === 10 || codigo === 200) {
    return "A Meta não autorizou a consulta da forma de pagamento com o token atual. Verifique a permissão whatsapp_business_management da integração.";
  }

  if (codigo === 190) {
    return "O token da Meta expirou ou não é mais válido. Reconecte a integração para verificar a forma de pagamento.";
  }

  return detalhe || `A Meta retornou HTTP ${statusHttp} ao consultar a forma de pagamento.`;
}

async function salvarResultado(params: {
  integracao: IntegracaoPagamentoMeta;
  status: "configurado" | "nao_configurado" | "erro";
  paymentMethodAdded?: boolean;
  primaryFundingId?: string | null;
  checkedAt: string;
  error?: string | null;
  meta?: unknown;
}) {
  const configAtual = objeto(params.integracao.config_json || null);
  const update: Record<string, unknown> = {
    meta_payment_status: params.status,
    meta_payment_checked_at: params.checkedAt,
    meta_payment_check_error: params.error || null,
    updated_at: params.checkedAt,
    config_json: {
      ...configAtual,
      meta_payment_method: {
        status: params.status,
        primary_funding_id: params.primaryFundingId || null,
        checked_at: params.checkedAt,
        error: params.error || null,
        raw: params.meta || null,
      },
    },
  };

  if (typeof params.paymentMethodAdded === "boolean") {
    update.payment_method_added = params.paymentMethodAdded;
  }

  if (params.status !== "erro") {
    update.meta_primary_funding_id = params.primaryFundingId || null;
  }

  const { error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .update(update)
    .eq("id", params.integracao.id)
    .eq("empresa_id", params.integracao.empresa_id);

  if (error) {
    throw new Error(
      `Erro ao salvar validação da forma de pagamento: ${error.message}`
    );
  }
}

export async function verificarFormaPagamentoMeta(
  integracao: IntegracaoPagamentoMeta
) {
  const checkedAt = new Date().toISOString();
  const wabaId = String(integracao.waba_id || "").trim();

  if (!wabaId) {
    const error = "Esta integração não possui WABA ID configurado.";

    await salvarResultado({
      integracao,
      status: "erro",
      checkedAt,
      error,
    });

    return {
      ok: false as const,
      status: "erro" as const,
      paymentMethodAdded: Boolean(integracao.payment_method_added),
      primaryFundingId: integracao.meta_primary_funding_id || null,
      checkedAt,
      error,
      meta: null,
    };
  }

  const accessToken = getWhatsAppAccessToken(integracao);

  if (!accessToken) {
    const error = "Token da Meta não encontrado para esta integração.";

    await salvarResultado({
      integracao,
      status: "erro",
      checkedAt,
      error,
    });

    return {
      ok: false as const,
      status: "erro" as const,
      paymentMethodAdded: Boolean(integracao.payment_method_added),
      primaryFundingId: integracao.meta_primary_funding_id || null,
      checkedAt,
      error,
      meta: null,
    };
  }

  let response: Response;
  let json: MetaPaymentResponse;

  try {
    response = await fetch(
      getWhatsAppGraphUrl(
        `${encodeURIComponent(wabaId)}?fields=primary_funding_id,currency`
      ),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    json = (await response.json()) as MetaPaymentResponse;
  } catch (error) {
    const mensagem =
      error instanceof Error
        ? `Falha de rede ao consultar a cobrança na Meta: ${error.message}`
        : "Falha de rede ao consultar a cobrança na Meta.";

    await salvarResultado({
      integracao,
      status: "erro",
      checkedAt,
      error: mensagem,
    });

    return {
      ok: false as const,
      status: "erro" as const,
      paymentMethodAdded: Boolean(integracao.payment_method_added),
      primaryFundingId: integracao.meta_primary_funding_id || null,
      checkedAt,
      error: mensagem,
      meta: null,
    };
  }

  if (!response.ok) {
    const error = mensagemErroMeta(json, response.status);

    await salvarResultado({
      integracao,
      status: "erro",
      checkedAt,
      error,
      meta: json,
    });

    return {
      ok: false as const,
      status: "erro" as const,
      paymentMethodAdded: Boolean(integracao.payment_method_added),
      primaryFundingId: integracao.meta_primary_funding_id || null,
      checkedAt,
      error,
      meta: json,
    };
  }

  const primaryFundingId = String(json.primary_funding_id || "").trim() || null;
  const paymentMethodAdded = Boolean(primaryFundingId);
  const status = paymentMethodAdded
    ? ("configurado" as const)
    : ("nao_configurado" as const);

  await salvarResultado({
    integracao,
    status,
    paymentMethodAdded,
    primaryFundingId,
    checkedAt,
    meta: json,
  });

  return {
    ok: true as const,
    status,
    paymentMethodAdded,
    primaryFundingId,
    checkedAt,
    error: null,
    meta: json,
  };
}
