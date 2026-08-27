import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { obterAccessTokenMercadoPagoEmpresa } from "@/lib/mercado-pago/integracao";
import type { MercadoPagoPayment } from "@/lib/mercado-pago/checkout";
import { processarPagamentoMercadoPagoCheckout } from "./process-automation-engine-checkout-runtime";

const supabaseAdmin = getSupabaseAdmin();
const STATUS_AGUARDANDO = "aguardando_pagamento";

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function mensagemErroApi(payload: any, status: number) {
  return String(
    payload?.message ||
      payload?.error_description ||
      payload?.error ||
      `HTTP ${status}`
  ).slice(0, 700);
}

function escolherPagamentoRelevante(
  resultados: MercadoPagoPayment[],
  referencia: string,
  sellerUserId: string
) {
  const validos = resultados.filter((payment) => {
    const mesmaReferencia = texto(payment.external_reference) === referencia;
    const collector = texto(payment.collector_id);
    const mesmoVendedor = !collector || collector === sellerUserId;
    return mesmaReferencia && mesmoVendedor;
  });

  return (
    validos.find((payment) => texto(payment.status).toLowerCase() === "approved") ||
    validos.find((payment) => texto(payment.status).toLowerCase() === "cancelled") ||
    null
  );
}

async function buscarPagamentoPorReferencia(input: {
  empresaId: string;
  referencia: string;
}) {
  const credencial = await obterAccessTokenMercadoPagoEmpresa(input.empresaId);
  const url = new URL("https://api.mercadopago.com/v1/payments/search");
  url.searchParams.set("external_reference", input.referencia);
  url.searchParams.set("sort", "date_created");
  url.searchParams.set("criteria", "desc");
  url.searchParams.set("limit", "10");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${credencial.accessToken}`,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Nao foi possivel reconciliar pagamento no Mercado Pago: ${mensagemErroApi(
        payload,
        response.status
      )}`
    );
  }

  const resultados = Array.isArray(payload?.results)
    ? (payload.results as MercadoPagoPayment[])
    : [];

  return escolherPagamentoRelevante(
    resultados,
    input.referencia,
    String(credencial.userId)
  );
}

async function registrarErroReconciliacaoSeNovo(transacao: any, error: unknown) {
  const mensagem = error instanceof Error ? error.message : String(error);
  const erroAtual = texto(transacao.ultimo_erro);
  const novoErro = `[reconciliacao] ${mensagem}`.slice(0, 1000);

  if (erroAtual === novoErro) return;

  await supabaseAdmin
    .from("pagamento_gateway_transacoes")
    .update({
      ultimo_erro: novoErro,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transacao.id)
    .eq("empresa_id", transacao.empresa_id)
    .eq("status", STATUS_AGUARDANDO);

  console.error("[CHECKOUT_RECONCILIACAO] Erro:", {
    transacaoId: transacao.id,
    empresaId: transacao.empresa_id,
    error: mensagem,
  });
}

export async function processarReconciliacoesCheckoutPendentes(limite = 50) {
  const limiteSeguro = Math.min(100, Math.max(1, Math.floor(limite)));
  const { data, error } = await supabaseAdmin
    .from("pagamento_gateway_transacoes")
    .select("id,empresa_id,external_reference,status,ultimo_erro,created_at")
    .eq("gateway", "mercado_pago")
    .eq("status", STATUS_AGUARDANDO)
    .order("created_at", { ascending: true })
    .limit(limiteSeguro);

  if (error) {
    throw new Error(`Erro ao buscar checkouts para reconciliacao: ${error.message}`);
  }

  let encontrados = 0;
  let processados = 0;
  let erros = 0;

  for (const transacao of data || []) {
    const referencia = texto(transacao.external_reference) || String(transacao.id);

    try {
      const payment = await buscarPagamentoPorReferencia({
        empresaId: transacao.empresa_id,
        referencia,
      });

      if (!payment) continue;
      encontrados += 1;

      const resultado = await processarPagamentoMercadoPagoCheckout({
        empresaId: transacao.empresa_id,
        payment,
      });

      if (resultado.processado) processados += 1;

      console.info("[CHECKOUT_RECONCILIACAO] Evento reconciliado:", {
        transacaoId: transacao.id,
        empresaId: transacao.empresa_id,
        paymentId: String(payment.id),
        paymentStatus: texto(payment.status).toLowerCase(),
        processado: Boolean(resultado.processado),
        aprovado: Boolean((resultado as any).aprovado),
      });
    } catch (errorItem) {
      erros += 1;
      await registrarErroReconciliacaoSeNovo(transacao, errorItem);
    }
  }

  return {
    consultados: data?.length || 0,
    encontrados,
    processados,
    erros,
  };
}
