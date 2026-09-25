import { createHmac } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();
const INTEGRATION_KEY = "crm_prosperity";

type SubscriptionAction =
  | { type: "renew" }
  | { type: "change_plan"; offerReference: string }
  | { type: "add_addon"; addonCode: string; quantity?: number }
  | { type: "remove_addon"; addonCode: string; quantity?: number }
  | { type: "cancel_scheduled_plan_change"; changeId?: string };

type CheckoutIntent = {
  status: "awaiting_payment" | "scheduled" | "cancelled";
  subscriptionId: string;
  changeId?: string;
  amountCents: number;
  targetAmountCents?: number;
  currency: string;
  checkoutUrl?: string;
  expiresAt?: string;
  effectiveAt?: string;
};

function baseUrl() {
  return (process.env.PROSPERITY_PAY_API_BASE_URL || "https://www.prosperitypay.com.br").replace(/\/$/, "");
}

function secret() {
  const value = process.env.PROSPERITY_PAY_WEBHOOK_SECRET;
  if (!value?.trim()) throw new Error("PROSPERITY_PAY_WEBHOOK_SECRET não configurado.");
  return value.trim();
}

async function signedPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `sha256=${createHmac("sha256", secret()).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const response = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-prosperity-integration": INTEGRATION_KEY,
      "x-prosperity-timestamp": timestamp,
      "x-prosperity-signature": signature,
    },
    body: rawBody,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(data.error || data.message || `Prosperity Pay recusou a operação (HTTP ${response.status}).`));
  }
  return data as T;
}

function obj(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function planoRelacao(value: unknown) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function affiliateRef(metadata: unknown) {
  const value = String(obj(metadata).affiliate_ref || "").trim();
  return value && value.length <= 120 && /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

async function ofertaProsperityPorPlanoValor(planoId: string, valorCentavos: number | null, metadata: unknown) {
  const metadataObj = obj(metadata);
  const refs = [
    metadataObj.oferta_referencia,
    metadataObj.offer_reference,
    metadataObj.offer_hash,
  ].map(v => String(v || "").trim()).filter(Boolean);

  if (refs.length) {
    const exact = await supabase.from("ia_token_ofertas")
      .select("referencia,metadata_json")
      .eq("gateway", "prosperity_pay")
      .eq("tipo", "mensalidade")
      .eq("ativa", true)
      .eq("plano_id", planoId)
      .in("referencia", refs)
      .limit(1)
      .maybeSingle();
    if (exact.error) throw exact.error;
    if (exact.data) return exact.data;
  }

  if (valorCentavos) {
    const byValue = await supabase.from("ia_token_ofertas")
      .select("referencia,metadata_json")
      .eq("gateway", "prosperity_pay")
      .eq("tipo", "mensalidade")
      .eq("ativa", true)
      .eq("plano_id", planoId)
      .contains("metadata_json", { valor_oferta_centavos: valorCentavos })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byValue.error) throw byValue.error;
    if (byValue.data) return byValue.data;
  }

  const fallback = await supabase.from("ia_token_ofertas")
    .select("referencia,metadata_json")
    .eq("gateway", "prosperity_pay")
    .eq("tipo", "mensalidade")
    .eq("ativa", true)
    .eq("plano_id", planoId)
    .contains("metadata_json", { tipo_oferta: "normal" })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallback.error || !fallback.data) {
    throw fallback.error ?? new Error("Oferta mensal da Prosperity Pay não configurada para este plano.");
  }
  return fallback.data;
}

async function valorContratadoEmpresa(empresaId: string, planoId: string, metadata: unknown) {
  const meta = obj(metadata);
  const metaValue = Number(meta.valor_contratado_centavos || meta.base_amount_cents || 0);
  if (Number.isSafeInteger(metaValue) && metaValue > 0) return metaValue;

  const { data, error } = await supabase.from("pagamentos")
    .select("valor,offer_preco")
    .eq("empresa_id", empresaId)
    .in("status", ["paid", "approved", "completed"])
    .in("gateway", ["prosperity_pay", "atomo", "manual"])
    .order("paid_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const paid = Number(data?.offer_preco || data?.valor || 0);
  if (Number.isSafeInteger(paid) && paid > 0) return paid;

  const { data: plano, error: planoError } = await supabase.from("planos")
    .select("preco_mensal_centavos")
    .eq("id", planoId)
    .single();
  if (planoError || !plano) throw planoError ?? new Error("Plano não encontrado.");
  return Number(plano.preco_mensal_centavos);
}

async function reconciliarComposicaoImportada(params: {
  empresaId: string;
  empresa: any;
  plano: any;
  assinatura: any;
}) {
  const metadata = obj(params.empresa.assinatura_metadata_json);
  if (metadata.billing_components_v2 !== true) {
    return params.assinatura;
  }

  const baseLimit = Math.max(
    1,
    Number(params.plano?.limite_integracoes_whatsapp || 1),
  );
  const effectiveLimit = Math.max(
    baseLimit,
    Number(params.empresa.limite_integracoes_whatsapp || baseLimit),
  );
  const whatsappNumberQuantity = Math.max(0, effectiveLimit - baseLimit);

  const baseAmountCents = await valorContratadoEmpresa(
    params.empresaId,
    params.empresa.plano_id,
    params.empresa.assinatura_metadata_json,
  );
  const oferta = await ofertaProsperityPorPlanoValor(
    params.empresa.plano_id,
    baseAmountCents,
    params.empresa.assinatura_metadata_json,
  );

  const items = Array.isArray(params.assinatura.items)
    ? params.assinatura.items
    : [];
  const whatsappItem = items.find(
    (item: any) =>
      String(item?.code || "") === "whatsapp_number" &&
      String(item?.type || item?.item_type || "addon") === "addon",
  );
  const currentWhatsappQuantity = Math.max(
    0,
    Number(whatsappItem?.quantity || 0),
  );

  const precisaReconciliar =
    Number(params.assinatura.base_amount_cents || 0) !== baseAmountCents ||
    currentWhatsappQuantity !== whatsappNumberQuantity ||
    String(params.assinatura.external_offer_reference || "") !==
      String(oferta.referencia || "");

  if (!precisaReconciliar) {
    return params.assinatura;
  }

  const resultado = await signedPost<{
    ok: boolean;
    subscription: {
      id: string;
      offer_reference: string;
      base_amount_cents: number;
      current_amount_cents: number;
      items: unknown[];
    };
  }>("/api/integrations/subscriptions/reconcile", {
    subscriptionId: params.assinatura.external_subscription_id,
    offerReference: oferta.referencia,
    baseAmountCents,
    whatsappNumberQuantity,
  });

  const { data: atualizado, error } = await supabase
    .from("prosperity_pay_assinaturas")
    .update({
      external_offer_reference: resultado.subscription.offer_reference,
      base_amount_cents: resultado.subscription.base_amount_cents,
      current_amount_cents: resultado.subscription.current_amount_cents,
      items: resultado.subscription.items,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("empresa_id", params.empresaId)
    .select("*")
    .single();

  if (error || !atualizado) {
    throw error ?? new Error("Falha ao atualizar composição da assinatura.");
  }

  return atualizado;
}

export async function garantirAssinaturaProsperityPay(empresaId: string) {
  const { data: empresa, error } = await supabase.from("empresas")
    .select("id,nome_fantasia,nome_responsavel,email,plano_id,limite_integracoes_whatsapp,assinatura_gateway,assinatura_inicio_em,assinatura_vencimento_em,assinatura_metadata_json,planos:plano_id(id,slug,preco_mensal_centavos,limite_integracoes_whatsapp)")
    .eq("id", empresaId)
    .single();
  if (error || !empresa) throw error ?? new Error("Empresa não encontrada.");

  const plano = planoRelacao(empresa.planos);
  const metadataEmpresa = obj(empresa.assinatura_metadata_json);
  const assinaturaGratuita =
    String(empresa.assinatura_gateway || "") === "CRM_FREE_CHECKOUT_KEY" ||
    metadataEmpresa.free_vitalicio === true ||
    String(metadataEmpresa.tipo_oferta || "") === "free";

  if (assinaturaGratuita) {
    throw new Error(
      "Este é um plano gratuito. Contrate um plano pago antes de usar recursos recorrentes da Prosperity Pay."
    );
  }

  const mirror = await supabase.from("prosperity_pay_assinaturas")
    .select("*")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (mirror.error) throw mirror.error;

  if (mirror.data?.external_subscription_id) {
    return reconciliarComposicaoImportada({
      empresaId,
      empresa,
      plano,
      assinatura: mirror.data,
    });
  }

  const inicio = empresa.assinatura_inicio_em ? new Date(empresa.assinatura_inicio_em) : new Date();
  const fim = empresa.assinatura_vencimento_em ? new Date(empresa.assinatura_vencimento_em) : new Date(inicio.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime()) || fim <= inicio) {
    throw new Error("Ciclo atual da assinatura é inválido para importação.");
  }

  const valor = await valorContratadoEmpresa(empresaId, empresa.plano_id, empresa.assinatura_metadata_json);
  const oferta = await ofertaProsperityPorPlanoValor(empresa.plano_id, valor, empresa.assinatura_metadata_json);
  const lead = await supabase.from("leads_cadastro")
    .select("metadata_json")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (lead.error) throw lead.error;

  const result = await signedPost<{
    subscription: {
      id: string;
      status: string;
      current_amount_cents: number;
      current_period_start: string;
      current_period_end: string;
      next_due_at: string;
    };
    imported: boolean;
  }>("/api/integrations/subscriptions/bootstrap", {
    externalReference: `crm_prosperity:${empresaId}`,
    offerReference: oferta.referencia,
    customerEmail: String(empresa.email || "").trim().toLowerCase(),
    customerName: empresa.nome_responsavel || empresa.nome_fantasia,
    currentPeriodStart: inicio.toISOString(),
    currentPeriodEnd: fim.toISOString(),
    contractedBaseAmountCents: valor,
    ...(affiliateRef(lead.data?.metadata_json || empresa.assinatura_metadata_json)
      ? { affiliateRefCode: affiliateRef(lead.data?.metadata_json || empresa.assinatura_metadata_json) }
      : {}),
  });

  const upsert = await supabase.from("prosperity_pay_assinaturas").upsert({
    empresa_id: empresaId,
    external_subscription_id: result.subscription.id,
    customer_email: String(empresa.email || "").trim().toLowerCase(),
    external_offer_reference: oferta.referencia,
    status: result.subscription.status,
    billing_model: "prepaid",
    base_amount_cents: valor,
    current_amount_cents: Number(result.subscription.current_amount_cents),
    currency: "BRL",
    current_period_start: result.subscription.current_period_start,
    current_period_end: result.subscription.current_period_end,
    next_due_at: result.subscription.next_due_at,
    payload: { bootstrap: result },
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "external_subscription_id" }).select("*").single();
  if (upsert.error || !upsert.data) throw upsert.error ?? new Error("Falha ao salvar assinatura importada.");

  return reconciliarComposicaoImportada({
    empresaId,
    empresa,
    plano,
    assinatura: upsert.data,
  });
}

export async function criarCheckoutAssinaturaProsperityPay(
  empresaId: string,
  action: SubscriptionAction,
): Promise<CheckoutIntent> {
  const subscription = await garantirAssinaturaProsperityPay(empresaId);
  return signedPost<CheckoutIntent>("/api/integrations/subscriptions/checkout-sessions", {
    subscriptionId: subscription.external_subscription_id,
    action,
  });
}

export async function cancelarMudancaPlanoAgendadaProsperityPay(
  empresaId: string,
  changeId?: string,
) {
  const subscription = await garantirAssinaturaProsperityPay(empresaId);
  return signedPost<CheckoutIntent>(
    "/api/integrations/subscriptions/checkout-sessions",
    {
      subscriptionId: subscription.external_subscription_id,
      action: {
        type: "cancel_scheduled_plan_change",
        ...(changeId ? { changeId } : {}),
      },
    },
  );
}

export async function referenciaProsperityPayPorPlanoSlug(slug: "basico" | "essencial") {
  const { data: plano, error } = await supabase.from("planos")
    .select("id")
    .eq("slug", slug)
    .eq("status", "ativo")
    .single();
  if (error || !plano) throw error ?? new Error("Plano não encontrado.");

  const oferta = await ofertaProsperityPorPlanoValor(plano.id, null, {});
  return oferta.referencia;
}
