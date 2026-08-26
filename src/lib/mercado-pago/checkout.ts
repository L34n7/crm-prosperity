import { createHmac, timingSafeEqual } from "node:crypto";
import { obterAccessTokenMercadoPagoEmpresa } from "@/lib/mercado-pago/integracao";

export type MercadoPagoPayment = {
  id: string | number;
  status?: string;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount?: number | string | null;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
  collector_id?: string | number | null;
  date_approved?: string | null;
  date_created?: string | null;
};

function urlWebhookMercadoPago() {
  const configurada = String(
    process.env.MERCADOPAGO_WEBHOOK_URL || ""
  ).trim();
  if (configurada) return configurada;

  const redirectUri = String(
    process.env.MERCADOPAGO_REDIRECT_URI || ""
  ).trim();

  if (redirectUri) {
    try {
      return `${new URL(redirectUri).origin}/api/webhooks/mercado-pago`;
    } catch {
      // Usa dominio oficial abaixo.
    }
  }

  return "https://crmprosperity.com/api/webhooks/mercado-pago";
}

function mensagemErroApi(payload: any, status: number) {
  return String(
    payload?.message ||
      payload?.error_description ||
      payload?.error ||
      `HTTP ${status}`
  ).slice(0, 700);
}

export async function criarPreferenciaCheckoutMercadoPago(input: {
  empresaId: string;
  transacaoId: string;
  produtoId: string;
  titulo: string;
  quantidade: number;
  valorUnitario: number;
  expiraEm: string;
}) {
  const credencial = await obterAccessTokenMercadoPagoEmpresa(input.empresaId);

  const response = await fetch(
    "https://api.mercadopago.com/checkout/preferences",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credencial.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            id: input.produtoId,
            title: input.titulo.slice(0, 250),
            quantity: input.quantidade,
            currency_id: "BRL",
            unit_price: Number(input.valorUnitario.toFixed(2)),
          },
        ],
        external_reference: input.transacaoId,
        notification_url: urlWebhookMercadoPago(),
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: input.expiraEm,
      }),
      cache: "no-store",
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.id) {
    throw new Error(
      `Mercado Pago recusou a criacao do checkout: ${mensagemErroApi(
        payload,
        response.status
      )}`
    );
  }

  const checkoutUrl = String(
    !credencial.liveMode && payload.sandbox_init_point
      ? payload.sandbox_init_point
      : payload.init_point || payload.sandbox_init_point || ""
  ).trim();

  if (!checkoutUrl) {
    throw new Error("Mercado Pago nao retornou a URL do Checkout Pro");
  }

  return {
    preferenceId: String(payload.id),
    checkoutUrl,
    liveMode: credencial.liveMode,
    sellerUserId: credencial.userId,
    payload,
  };
}

export async function consultarPagamentoMercadoPago(input: {
  empresaId: string;
  paymentId: string;
}) {
  const credencial = await obterAccessTokenMercadoPagoEmpresa(input.empresaId);
  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(
      input.paymentId
    )}`,
    {
      headers: {
        Authorization: `Bearer ${credencial.accessToken}`,
      },
      cache: "no-store",
    }
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.id) {
    throw new Error(
      `Nao foi possivel consultar o pagamento no Mercado Pago: ${mensagemErroApi(
        payload,
        response.status
      )}`
    );
  }

  return payload as MercadoPagoPayment;
}

function extrairParteAssinatura(
  assinatura: string,
  chave: "ts" | "v1"
) {
  for (const parte of String(assinatura || "").split(",")) {
    const [nome, valor] = parte.split("=", 2);
    if (nome?.trim() === chave && valor?.trim()) return valor.trim();
  }
  return "";
}

export function validarAssinaturaWebhookMercadoPago(input: {
  xSignature: string;
  xRequestId: string;
  dataId: string;
}) {
  const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || "").trim();

  if (!secret) {
    throw new Error("MERCADOPAGO_WEBHOOK_SECRET nao configurado");
  }

  const ts = extrairParteAssinatura(input.xSignature, "ts");
  const assinaturaRecebida = extrairParteAssinatura(input.xSignature, "v1");
  const dataId = String(input.dataId || "").trim().toLowerCase();
  const requestId = String(input.xRequestId || "").trim();

  if (!ts || !assinaturaRecebida || !dataId || !requestId) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const assinaturaCalculada = createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  const recebida = Buffer.from(assinaturaRecebida, "hex");
  const calculada = Buffer.from(assinaturaCalculada, "hex");

  return (
    recebida.length === calculada.length && timingSafeEqual(recebida, calculada)
  );
}
