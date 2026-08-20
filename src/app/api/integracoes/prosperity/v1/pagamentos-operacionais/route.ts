import { NextRequest } from "next/server";
import {
  autenticarProsperityApi,
  lerPaginacao,
  objetoSeguro,
  prosperityApiSupabase,
  respostaLista,
  respostaProsperityErro,
  textoOuNull,
} from "@/lib/integracoes/prosperity-external-api";

const STATUS_PAGOS = ["paid", "approved", "completed"];

function estaPago(status: unknown) {
  return STATUS_PAGOS.includes(String(status || "").trim().toLowerCase());
}

function assinaturaEmDia(empresa: Record<string, any> | null) {
  if (!empresa) return false;
  if (String(empresa.assinatura_status || "").toLowerCase() !== "ativa") return false;
  if (!empresa.assinatura_vencimento_em) return true;
  const vencimento = new Date(empresa.assinatura_vencimento_em).getTime();
  return Number.isFinite(vencimento) && vencimento > Date.now();
}

export async function GET(request: NextRequest) {
  const auth = await autenticarProsperityApi(request, "pagamentos:read");
  if (!auth.ok) return auth.response;

  try {
    const { limite, pagina, inicio, fim } = lerPaginacao(request);
    const params = request.nextUrl.searchParams;

    let query = prosperityApiSupabase
      .from("pagamentos")
      .select(
        "id,empresa_id,lead_id,gateway,evento,transaction_id,status,metodo,valor,valor_liquido,customer_id,customer_nome,customer_email,customer_telefone,offer_hash,offer_titulo,offer_preco,paid_at,refunded_at,payload,created_at,updated_at",
        { count: "exact" },
      );

    if (params.get("id")) query = query.eq("id", params.get("id")!);
    if (params.get("transaction_id")) query = query.eq("transaction_id", params.get("transaction_id")!);
    if (params.get("status")) query = query.eq("status", params.get("status")!);
    if (params.get("metodo")) query = query.eq("metodo", params.get("metodo")!);
    if (params.get("lead_id")) query = query.eq("lead_id", params.get("lead_id")!);
    if (params.get("empresa_id")) query = query.eq("empresa_id", params.get("empresa_id")!);
    if (params.get("criado_desde")) query = query.gte("created_at", params.get("criado_desde")!);
    if (params.get("atualizado_desde")) query = query.gte("updated_at", params.get("atualizado_desde")!);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(inicio, fim);
    if (error) throw new Error(error.message);

    const pagamentos = data || [];
    const leadIds = Array.from(new Set(pagamentos.map((item: any) => item.lead_id).filter(Boolean)));

    const leadsResult = leadIds.length
      ? await prosperityApiSupabase
          .from("leads_cadastro")
          .select("id,nome,email,telefone,status,pago,pago_em,empresa_id")
          .in("id", leadIds)
      : { data: [], error: null };
    if (leadsResult.error) throw new Error(leadsResult.error.message);

    const leads = new Map<string, any>((leadsResult.data || []).map((item: any) => [item.id, item]));
    const empresaIds = Array.from(
      new Set(
        pagamentos
          .map((item: any) => item.empresa_id || leads.get(String(item.lead_id || ""))?.empresa_id)
          .filter(Boolean),
      ),
    );

    const empresasResult = empresaIds.length
      ? await prosperityApiSupabase
          .from("empresas")
          .select("id,nome_fantasia,razao_social,assinatura_status,assinatura_inicio_em,assinatura_vencimento_em,assinatura_bloqueio_em,assinatura_renovada_em,assinatura_gateway,assinatura_referencia")
          .in("id", empresaIds)
      : { data: [], error: null };
    if (empresasResult.error) throw new Error(empresasResult.error.message);
    const empresas = new Map<string, any>((empresasResult.data || []).map((item: any) => [item.id, item]));

    const historicoPagoResult = leadIds.length
      ? await prosperityApiSupabase
          .from("pagamentos")
          .select("lead_id")
          .in("lead_id", leadIds)
          .in("status", STATUS_PAGOS)
      : { data: [], error: null };
    if (historicoPagoResult.error) throw new Error(historicoPagoResult.error.message);
    const leadsQueJaPagaram = new Set(
      (historicoPagoResult.data || []).map((item: any) => String(item.lead_id || "")).filter(Boolean),
    );

    const itens = pagamentos.map((item: any) => {
      const lead = item.lead_id ? leads.get(String(item.lead_id)) || null : null;
      const empresaId = item.empresa_id || lead?.empresa_id || null;
      const empresa = empresaId ? empresas.get(String(empresaId)) || null : null;
      const payload = objetoSeguro(item.payload);
      const transaction = objetoSeguro(payload.transaction);
      const pix = objetoSeguro(transaction.pix);
      const transacaoPaga = estaPago(item.status);
      const clienteJaPagou = Boolean(lead?.pago === true || (item.lead_id && leadsQueJaPagaram.has(String(item.lead_id))));
      const emDia = assinaturaEmDia(empresa);
      const referenciaAtual = String(empresa?.assinatura_referencia || "").trim();
      const tipoCobranca = empresaId && referenciaAtual && referenciaAtual !== String(item.transaction_id || "")
        ? "renovacao"
        : empresaId && clienteJaPagou && !transacaoPaga
          ? "renovacao"
          : "contratacao";

      return {
        id: item.id,
        empresa_id: empresaId,
        lead_id: item.lead_id,
        gateway: item.gateway,
        evento: item.evento || textoOuNull(payload.event),
        transaction_id: item.transaction_id,
        status: item.status,
        metodo: item.metodo,
        valor_centavos: item.valor,
        valor_liquido_centavos: item.valor_liquido,
        transacao_paga: transacaoPaga,
        pago_atualmente: transacaoPaga,
        cliente_ja_pagou: clienteJaPagou,
        tipo_cobranca: tipoCobranca,
        pago_em: item.paid_at,
        reembolsado_em: item.refunded_at,
        checkout_url: textoOuNull(transaction.checkout_url) || textoOuNull(payload.checkout_url) || textoOuNull(transaction.url),
        pix_url: textoOuNull(pix.url),
        cliente: {
          nome: lead?.nome || item.customer_nome,
          email: lead?.email || item.customer_email,
          telefone: lead?.telefone || item.customer_telefone,
          status: lead?.status || null,
          ja_pagou: clienteJaPagou,
          pago_em: lead?.pago_em || null,
        },
        assinatura: empresa
          ? {
              status: empresa.assinatura_status,
              em_dia: emDia,
              inicio_em: empresa.assinatura_inicio_em,
              vencimento_em: empresa.assinatura_vencimento_em,
              bloqueio_em: empresa.assinatura_bloqueio_em,
              renovada_em: empresa.assinatura_renovada_em,
              gateway: empresa.assinatura_gateway,
              referencia: empresa.assinatura_referencia,
            }
          : null,
        empresa: empresa
          ? { id: empresa.id, nome: empresa.nome_fantasia || empresa.razao_social }
          : null,
        oferta: {
          hash: item.offer_hash,
          titulo: item.offer_titulo,
          preco_centavos: item.offer_preco,
        },
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    });

    return respostaLista("pagamentos_operacionais", itens, pagina, limite, count, {
      semantica: {
        transacao_paga: "Indica somente se esta transação específica foi paga.",
        cliente_ja_pagou: "Indica se o cliente possui algum pagamento aprovado no histórico.",
        assinatura_em_dia: "Indica se a assinatura atual está ativa e ainda não venceu.",
      },
    });
  } catch (error) {
    return respostaProsperityErro(error);
  }
}
