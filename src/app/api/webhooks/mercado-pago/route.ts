import { NextResponse } from "next/server";
import {
  consultarPagamentoMercadoPago,
  validarAssinaturaWebhookMercadoPago,
} from "@/lib/mercado-pago/checkout";
import { obterEmpresaMercadoPagoPorUserId } from "@/lib/mercado-pago/integracao";
import { processarPagamentoMercadoPagoCheckout } from "@/lib/automacoes/process-automation-engine-checkout-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: any = {};

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const url = new URL(request.url);
  const tipo = String(url.searchParams.get("type") || payload?.type || "").trim();
  const dataId = String(
    url.searchParams.get("data.id") || payload?.data?.id || ""
  ).trim();

  if (tipo && tipo !== "payment") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!dataId) {
    return NextResponse.json({ ok: false, error: "Missing data.id" }, { status: 400 });
  }

  try {
    const assinaturaValida = validarAssinaturaWebhookMercadoPago({
      xSignature: request.headers.get("x-signature") || "",
      xRequestId: request.headers.get("x-request-id") || "",
      dataId,
    });

    if (!assinaturaValida) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }
  } catch (error) {
    console.error("[MERCADO_PAGO_WEBHOOK] Falha ao validar assinatura:", error);
    return NextResponse.json(
      { ok: false, error: "Webhook validation unavailable" },
      { status: 503 }
    );
  }

  try {
    const sellerUserId = String(payload?.user_id || "").trim();
    const integracao = await obterEmpresaMercadoPagoPorUserId(sellerUserId);

    if (!integracao?.empresa_id) {
      console.warn("[MERCADO_PAGO_WEBHOOK] Vendedor nao vinculado", {
        sellerUserId,
        dataId,
      });
      return NextResponse.json({ ok: true, ignored: true });
    }

    const payment = await consultarPagamentoMercadoPago({
      empresaId: integracao.empresa_id,
      paymentId: dataId,
    });

    if (
      payment.collector_id !== null &&
      payment.collector_id !== undefined &&
      String(payment.collector_id) !== String(integracao.mercado_pago_user_id)
    ) {
      console.error("[MERCADO_PAGO_WEBHOOK] Collector divergente", {
        dataId,
        sellerUserId,
        collectorId: payment.collector_id,
      });
      return NextResponse.json({ ok: true, ignored: true });
    }

    const resultado = await processarPagamentoMercadoPagoCheckout({
      empresaId: integracao.empresa_id,
      payment,
    });

    return NextResponse.json({ ok: true, resultado });
  } catch (error) {
    console.error("[MERCADO_PAGO_WEBHOOK] Erro ao processar pagamento:", error);
    return NextResponse.json(
      { ok: false, error: "Payment processing failed" },
      { status: 500 }
    );
  }
}
