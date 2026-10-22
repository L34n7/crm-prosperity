import { createHmac } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sincronizarAssinaturaProsperityPay } from "@/lib/prosperity-pay/sync-subscription";

const supabase = getSupabaseAdmin();
const INTEGRATION_KEY = "crm_prosperity";

type SubscriptionAction =
  | { type: "renew" }
  | { type: "change_plan"; offerReference: string }
  | { type: "add_addon"; addonCode: string; quantity?: number }
  | { type: "remove_addon"; addonCode: string; quantity?: number }
  | { type: "cancel_scheduled_plan_change"; changeId?: string }
  | { type: "cancel_scheduled_addon_change"; changeId: string }
  | { type: "cancel_pending_checkout"; sessionId: string };

type CheckoutIntent = {
  status:
    | "awaiting_payment"
    | "scheduled"
    | "cancelled"
    | "payment_confirmed";
  subscriptionId: string;
  changeId?: string;
  sessionId?: string;
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

type EstadoRemotoAssinaturaProsperityPay = {
  ok: boolean;
  subscription: {
    id: string;
    status: string;
    billing_model: string;
    base_amount_cents: number;
    current_amount_cents: number;
    currency: string;
    current_period_start: string | null;
    current_period_end: string | null;
    next_due_at: string | null;
    cycle_number: number;
    items: Array<{
      id?: string;
      type?: string;
      code?: string;
      description?: string;
      unit_amount_cents?: number;
      quantity?: number;
      total_amount_cents?: number;
      offer_id?: string | null;
      addon_id?: string | null;
    }>;
  };
  offer: {
    id: string;
    name: string;
    checkout_slug: string;
    reference: string;
  };
  customer: {
    id: string;
    name: string | null;
    email: string | null;
  };
};

function dataMs(valor: unknown) {
  if (!valor) return Number.NaN;
  const ms = new Date(String(valor)).getTime();
  return Number.isFinite(ms) ? ms : Number.NaN;
}

export async function reconciliarEstadoAssinaturaProsperityPay(
  empresaId: string,
) {
  const { data: mirror, error: mirrorError } = await supabase
    .from("prosperity_pay_assinaturas")
    .select(
      "external_subscription_id,status,current_period_start,current_period_end,next_due_at,cycle_number,items,pending_payment",
    )
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (mirrorError) throw mirrorError;
  if (!mirror?.external_subscription_id) {
    return { atualizado: false, motivo: "sem_assinatura_prosperity_pay" };
  }

  const remoto = await signedPost<EstadoRemotoAssinaturaProsperityPay>(
    "/api/integrations/subscriptions/status",
    { subscriptionId: mirror.external_subscription_id },
  );

  const periodoAnteriorFim = dataMs(mirror.current_period_end);
  const periodoRemotoFim = dataMs(remoto.subscription.current_period_end);
  const periodoAnteriorInicio = dataMs(mirror.current_period_start);
  const periodoRemotoInicio = dataMs(remoto.subscription.current_period_start);
  const periodoAvancou =
    (Number.isFinite(periodoRemotoFim) &&
      (!Number.isFinite(periodoAnteriorFim) ||
        periodoRemotoFim > periodoAnteriorFim + 60_000)) ||
    (Number.isFinite(periodoRemotoInicio) &&
      (!Number.isFinite(periodoAnteriorInicio) ||
        periodoRemotoInicio > periodoAnteriorInicio + 60_000));

  const remotoAtivo =
    String(remoto.subscription.status || "").toLowerCase() === "active" &&
    Number.isFinite(periodoRemotoFim) &&
    periodoRemotoFim > Date.now();

  if (remotoAtivo) {
    const evento = periodoAvancou ? "subscription.renewed" : "subscription.changed";

    await sincronizarAssinaturaProsperityPay({
      event_id: `reconcile:${remoto.subscription.id}:${remoto.subscription.current_period_start || remoto.subscription.current_period_end || Date.now()}`,
      event: evento,
      occurred_at: new Date().toISOString(),
      subscription: remoto.subscription,
      offer: remoto.offer,
      customer: remoto.customer,
      change: null,
    });

    return {
      atualizado: true,
      ativo: true,
      periodoAvancou,
      subscriptionId: remoto.subscription.id,
    };
  }

  const agora = new Date().toISOString();
  const { error: updateMirrorError } = await supabase
    .from("prosperity_pay_assinaturas")
    .update({
      status: remoto.subscription.status,
      billing_model: remoto.subscription.billing_model,
      base_amount_cents: remoto.subscription.base_amount_cents,
      current_amount_cents: remoto.subscription.current_amount_cents,
      currency: remoto.subscription.currency,
      cycle_number: remoto.subscription.cycle_number || null,
      current_period_start: remoto.subscription.current_period_start,
      current_period_end: remoto.subscription.current_period_end,
      next_due_at: remoto.subscription.next_due_at,
      items: remoto.subscription.items || [],
      synced_at: agora,
      updated_at: agora,
    })
    .eq("empresa_id", empresaId);

  if (updateMirrorError) throw updateMirrorError;

  return {
    atualizado: true,
    ativo: false,
    periodoAvancou,
    subscriptionId: remoto.subscription.id,
  };
}

export async function atualizarEmailClienteAssinaturaProsperityPay(params: {
  subscriptionId: string;
  customerEmail: string;
}) {
  return signedPost<{
    ok: boolean;
    changed: boolean;
    customer: {
      id: string;
      email: string;
      name: string | null;
    };
  }>("/api/integrations/subscriptions/customer-email", {
    subscriptionId: params.subscriptionId,
    customerEmail: params.customerEmail.trim().toLowerCase(),
  });
}

export async function criarSessaoPrefillCheckoutProsperityPay(params: {
  offerSlug: string;
  customerName: string;
  customerEmail: string;
  affiliateRef?: string | null;
  sourceReference?: string | null;
}) {
  return signedPost<{
    ok: boolean;
    checkout_url: string;
    expires_at: string;
  }>("/api/integrations/checkout-prefill", {
    offerSlug: params.offerSlug,
    customerName: params.customerName,
    customerEmail: params.customerEmail,
    ...(params.affiliateRef ? { affiliateRef: params.affiliateRef } : {}),
    ...(params.sourceReference ? { sourceReference: params.sourceReference } : {}),
  });
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

async function sincronizarAfiliadoAssinatura(params: {
  subscriptionId: string;
  affiliateRefCode: string;
}) {
  return signedPost<{
    ok: boolean;
    subscription_id: string;
    affiliate_ref: string;
    affiliate_membership_id: string;
    affiliate_link_id: string;
    synced_at: string;
  }>("/api/integrations/subscriptions/affiliate", {
    subscriptionId: params.subscriptionId,
    affiliateRefCode: params.affiliateRefCode,
  });
}

async function ofertaProsperityPorPlanoValor(planoId: string, valorCentavos: number | null, metadata: unknown) {
  const metadataObj = obj(metadata);
  const refs = [
    metadataObj.prosperity_pay_offer_reference,
    metadataObj.offer_reference,
    metadataObj.oferta_referencia,
    metadataObj.offer_hash,
  ].map(v => String(v || "").trim()).filter(Boolean);

  // O valor contratado é a fonte de verdade para migrações legadas.
  // Uma referência antiga pode apontar para o plano padrão mesmo quando o
  // cliente possui preço VIP, portanto o valor precisa ter prioridade.
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

function baseAmountFromMetadata(value: unknown) {
  const metadata = obj(value);
  const directCandidates = [
    metadata.plano_base_cents,
    metadata.base_amount_cents,
  ];

  for (const candidate of directCandidates) {
    const amount = Number(candidate || 0);
    if (Number.isSafeInteger(amount) && amount > 0) return amount;
  }

  for (const nestedValue of Object.values(metadata)) {
    const nested = obj(nestedValue);
    const nestedCandidates = [
      nested.plano_base_cents,
      nested.base_amount_cents,
    ];

    for (const candidate of nestedCandidates) {
      const amount = Number(candidate || 0);
      if (Number.isSafeInteger(amount) && amount > 0) return amount;
    }
  }

  return 0;
}

async function valorContratadoEmpresa(empresaId: string, planoId: string, metadata: unknown) {
  const meta = obj(metadata);
  const baseExplicita = baseAmountFromMetadata(meta);
  if (baseExplicita > 0) {
    return baseExplicita;
  }

  const valorContratado = Number(meta.valor_contratado_centavos || 0);
  if (Number.isSafeInteger(valorContratado) && valorContratado > 0) {
    return valorContratado;
  }

  const vipLegado =
    String(meta.tipo_oferta || "").trim().toLowerCase() === "vip" ||
    /beta.*60|r\\$\\s*60/i.test(
      [
        meta.oferta_nome,
        meta.offer_title,
        meta.nome_oferta,
      ].map((value) => String(value || "")).join(" ")
    );

  if (vipLegado) {
    const { data: pagamentoVip, error: pagamentoVipError } = await supabase
      .from("pagamentos")
      .select("valor,offer_preco")
      .eq("empresa_id", empresaId)
      .in("status", ["paid", "approved", "completed"])
      .in("gateway", ["atomo", "atomopay"])
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pagamentoVipError) throw pagamentoVipError;

    const valorVip = Number(
      pagamentoVip?.offer_preco || pagamentoVip?.valor || 0
    );
    if (Number.isSafeInteger(valorVip) && valorVip > 0) {
      return valorVip;
    }
  }

  const { data, error } = await supabase.from("pagamentos")
    .select("valor,offer_preco,payload")
    .eq("empresa_id", empresaId)
    .in("status", ["paid", "approved", "completed"])
    .in("gateway", ["prosperity_pay", "atomo", "atomopay", "manual"])
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  const basePagamento = baseAmountFromMetadata(data?.payload);
  if (basePagamento > 0) {
    return basePagamento;
  }

  const paid = Number(data?.offer_preco || data?.valor || 0);
  const paymentPayload = obj(data?.payload);
  const addonsCents = Number(paymentPayload.valor_numeros_adicionais_cents || 0);

  if (
    Number.isSafeInteger(paid) &&
    paid > 0 &&
    Number.isSafeInteger(addonsCents) &&
    addonsCents > 0 &&
    paid > addonsCents
  ) {
    return paid - addonsCents;
  }

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
  const affiliateRefCode = affiliateRef(params.empresa.assinatura_metadata_json);
  const gatewayEmpresa = String(
    params.empresa.assinatura_gateway || ""
  ).trim().toLowerCase();
  const assinaturaImportadaLegada =
    metadata.billing_components_v2 === true ||
    Boolean(String(metadata.billing_legacy_gateway || "").trim()) ||
    Number(metadata.valor_contratado_centavos || 0) > 0 ||
    gatewayEmpresa === "manual" ||
    gatewayEmpresa === "atomo" ||
    gatewayEmpresa === "atomopay";

  if (!assinaturaImportadaLegada) {
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
      affiliate_ref?: string | null;
      affiliate_membership_id?: string | null;
      affiliate_link_id?: string | null;
      items: unknown[];
    };
  }>("/api/integrations/subscriptions/reconcile", {
    subscriptionId: params.assinatura.external_subscription_id,
    offerReference: oferta.referencia,
    baseAmountCents,
    whatsappNumberQuantity,
    ...(affiliateRefCode ? { affiliateRefCode } : {}),
  });

  const { data: atualizado, error } = await supabase
    .from("prosperity_pay_assinaturas")
    .update({
      external_offer_reference: resultado.subscription.offer_reference,
      base_amount_cents: resultado.subscription.base_amount_cents,
      current_amount_cents: resultado.subscription.current_amount_cents,
      items: resultado.subscription.items,
      payload: affiliateRefCode
        ? {
            ...obj(params.assinatura.payload),
            affiliate: {
              ...obj(obj(params.assinatura.payload).affiliate),
              ref: affiliateRefCode,
              membership_id:
                resultado.subscription.affiliate_membership_id ?? null,
              link_id: resultado.subscription.affiliate_link_id ?? null,
            },
            attribution: {
              ...obj(obj(params.assinatura.payload).attribution),
              source: "crm_prosperity_subscription_sync",
              affiliate_ref: affiliateRefCode,
              affiliate_membership_id:
                resultado.subscription.affiliate_membership_id ?? null,
            },
            renewal_affiliate_ref: affiliateRefCode,
            affiliate_synced_at: new Date().toISOString(),
          }
        : params.assinatura.payload,
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
    let assinaturaAtual = mirror.data;
    const affiliateRefCode = affiliateRef(empresa.assinatura_metadata_json);

    if (affiliateRefCode) {
      const attribution = await sincronizarAfiliadoAssinatura({
        subscriptionId: mirror.data.external_subscription_id,
        affiliateRefCode,
      });

      const payloadAtual = obj(mirror.data.payload);
      const { data: espelhoAtualizado, error: espelhoAtualizadoError } =
        await supabase
          .from("prosperity_pay_assinaturas")
          .update({
            payload: {
              ...payloadAtual,
              affiliate: {
                ...obj(payloadAtual.affiliate),
                ref: affiliateRefCode,
                membership_id: attribution.affiliate_membership_id,
                link_id: attribution.affiliate_link_id,
              },
              attribution: {
                ...obj(payloadAtual.attribution),
                source: "crm_prosperity_subscription_sync",
                affiliate_ref: affiliateRefCode,
                affiliate_membership_id: attribution.affiliate_membership_id,
              },
              renewal_affiliate_ref: affiliateRefCode,
              affiliate_synced_at: attribution.synced_at,
            },
            synced_at: attribution.synced_at,
            updated_at: new Date().toISOString(),
          })
          .eq("empresa_id", empresaId)
          .select("*")
          .single();

      if (espelhoAtualizadoError || !espelhoAtualizado) {
        throw (
          espelhoAtualizadoError ??
          new Error("Falha ao registrar sincronização do afiliado da assinatura.")
        );
      }

      assinaturaAtual = espelhoAtualizado;
    }

    return reconciliarComposicaoImportada({
      empresaId,
      empresa,
      plano,
      assinatura: assinaturaAtual,
    });
  }

  const inicio = empresa.assinatura_inicio_em ? new Date(empresa.assinatura_inicio_em) : new Date();
  const fim = empresa.assinatura_vencimento_em ? new Date(empresa.assinatura_vencimento_em) : new Date(inicio.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime()) || fim <= inicio) {
    throw new Error("Ciclo atual da assinatura é inválido para importação.");
  }

  const valor = await valorContratadoEmpresa(
    empresaId,
    empresa.plano_id,
    empresa.assinatura_metadata_json,
  );
  const oferta = await ofertaProsperityPorPlanoValor(
    empresa.plano_id,
    valor,
    empresa.assinatura_metadata_json,
  );
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

export async function sincronizarAssinaturasLegadasAtomoProsperityPay(
  limite = 20,
) {
  const maximo = Math.max(1, Math.min(50, Math.floor(limite)));

  const { data: candidatas, error: candidatasError } = await supabase
    .from("empresas")
    .select(
      "id,assinatura_gateway,assinatura_status,assinatura_vencimento_em,assinatura_metadata_json",
    )
    .in("assinatura_gateway", ["atomo", "atomopay"])
    .in("assinatura_status", ["ativa", "vencida"])
    .not("assinatura_vencimento_em", "is", null)
    .order("assinatura_vencimento_em", { ascending: true })
    .limit(Math.max(100, maximo * 5));

  if (candidatasError) throw candidatasError;
  if (!candidatas?.length) {
    return {
      encontradas: 0,
      pendentes: 0,
      sincronizadas: 0,
      erros: 0,
    };
  }

  const empresaIds = candidatas.map((empresa) => empresa.id);
  const { data: espelhos, error: espelhosError } = await supabase
    .from("prosperity_pay_assinaturas")
    .select("empresa_id,external_subscription_id")
    .in("empresa_id", empresaIds)
    .not("external_subscription_id", "is", null);

  if (espelhosError) throw espelhosError;

  const jaEspelhadas = new Set(
    (espelhos || [])
      .map((item) => String(item.empresa_id || ""))
      .filter(Boolean),
  );

  const targets = candidatas
    .filter((empresa) => !jaEspelhadas.has(empresa.id))
    .slice(0, maximo);

  let sincronizadas = 0;
  let erros = 0;

  async function sincronizarEmpresa(empresa: (typeof targets)[number]) {
    await garantirAssinaturaProsperityPay(empresa.id);

    const metadataAtual = obj(empresa.assinatura_metadata_json);
    const agora = new Date().toISOString();
    const { error: metadataError } = await supabase
      .from("empresas")
      .update({
        assinatura_metadata_json: {
          ...metadataAtual,
          prosperity_pay_billing_mirror: true,
          prosperity_pay_billing_mirror_at: agora,
          billing_migration_status: "mirrored",
          billing_legacy_gateway: String(
            empresa.assinatura_gateway || "atomo",
          ),
        },
        updated_at: agora,
      })
      .eq("id", empresa.id);

    if (metadataError) throw metadataError;
  }

  for (let index = 0; index < targets.length; index += 3) {
    const lote = targets.slice(index, index + 3);
    const resultados = await Promise.allSettled(
      lote.map((empresa) => sincronizarEmpresa(empresa)),
    );

    resultados.forEach((resultado, offset) => {
      if (resultado.status === "fulfilled") {
        sincronizadas += 1;
        return;
      }

      erros += 1;
      console.error(
        "[PROSPERITY_PAY] Falha ao espelhar assinatura legada Atomo",
        lote[offset]?.id,
        resultado.reason,
      );
    });
  }

  return {
    encontradas: candidatas.length,
    pendentes: candidatas.length - jaEspelhadas.size,
    processadas: targets.length,
    sincronizadas,
    erros,
  };
}

export async function sincronizarAfiliadosAssinaturasProsperityPay() {
  const { data: mirrors, error: mirrorsError } = await supabase
    .from("prosperity_pay_assinaturas")
    .select("empresa_id,external_subscription_id")
    .not("external_subscription_id", "is", null);

  if (mirrorsError) throw mirrorsError;

  const empresaIds = Array.from(
    new Set(
      (mirrors || [])
        .map((item) => item.empresa_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (!empresaIds.length) {
    return { encontradas: 0, sincronizadas: 0, erros: 0 };
  }

  const { data: empresas, error: empresasError } = await supabase
    .from("empresas")
    .select("id,assinatura_metadata_json")
    .in("id", empresaIds);

  if (empresasError) throw empresasError;

  const targets = (empresas || []).filter((empresa) =>
    Boolean(affiliateRef(empresa.assinatura_metadata_json)),
  );

  let sincronizadas = 0;
  let erros = 0;

  for (let index = 0; index < targets.length; index += 3) {
    const lote = targets.slice(index, index + 3);
    const resultados = await Promise.allSettled(
      lote.map((empresa) => garantirAssinaturaProsperityPay(empresa.id)),
    );

    for (const resultado of resultados) {
      if (resultado.status === "fulfilled") {
        sincronizadas += 1;
      } else {
        erros += 1;
        console.error(
          "[PROSPERITY_PAY] Falha ao sincronizar afiliado de assinatura legada",
          resultado.reason,
        );
      }
    }
  }

  return {
    encontradas: targets.length,
    sincronizadas,
    erros,
  };
}

export async function criarCheckoutAssinaturaProsperityPay(
  empresaId: string,
  action: SubscriptionAction,
  options: { renewalSessionTtlHours?: number } = {},
): Promise<CheckoutIntent> {
  const subscription = await garantirAssinaturaProsperityPay(empresaId);
  const ttl = Number(options.renewalSessionTtlHours);
  return signedPost<CheckoutIntent>("/api/integrations/subscriptions/checkout-sessions", {
    subscriptionId: subscription.external_subscription_id,
    action,
    ...(action.type === "renew" && Number.isFinite(ttl)
      ? { renewalSessionTtlHours: Math.max(1, Math.min(24 * 30, Math.floor(ttl))) }
      : {}),
  });
}

export async function registrarPagamentoAssinaturaPendenteProsperityPay(params: {
  empresaId: string;
  tipo: "add_whatsapp" | "change_plan" | "renewal";
  changeId?: string | null;
  sessionId?: string | null;
  expiresAt?: string | null;
  targetAmountCents?: number | null;
}) {
  const agora = new Date();
  const expiraEmRecebido = params.expiresAt
    ? new Date(params.expiresAt)
    : null;
  const expiraEm =
    expiraEmRecebido && Number.isFinite(expiraEmRecebido.getTime())
      ? expiraEmRecebido
      : new Date(
          agora.getTime() +
            (params.tipo === "renewal" ? 24 * 60 : 30) * 60_000,
        );

  const desbloqueioPadrao = new Date(agora.getTime() + 30 * 60_000);
  const desbloqueiaEm =
    expiraEm.getTime() < desbloqueioPadrao.getTime()
      ? expiraEm
      : desbloqueioPadrao;

  const { data: cancelamentos, error: cancelamentosError } = await supabase
    .from("prosperity_pay_recursos_agendados")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("addon_code", "whatsapp_number")
    .eq("acao", "remove")
    .eq("status", "scheduled");

  if (cancelamentosError) throw cancelamentosError;

  const cancellationIds = (cancelamentos || [])
    .map((item) => String(item.id || "").trim())
    .filter(Boolean);

  const pendingPayment = {
    type: params.tipo,
    change_id: params.changeId || null,
    session_id: params.sessionId || null,
    expires_at: expiraEm.toISOString(),
    undo_locked_until: desbloqueiaEm.toISOString(),
    target_amount_cents:
      Number.isFinite(Number(params.targetAmountCents))
        ? Number(params.targetAmountCents)
        : null,
    cancellation_ids: cancellationIds,
    created_at: agora.toISOString(),
  };

  const { error } = await supabase
    .from("prosperity_pay_assinaturas")
    .update({
      pending_payment: pendingPayment,
      updated_at: agora.toISOString(),
    })
    .eq("empresa_id", params.empresaId);

  if (error) throw error;

  return pendingPayment;
}

export async function cancelarCheckoutAssinaturaPendenteProsperityPay(
  empresaId: string,
  sessionId: string,
) {
  const subscription = await garantirAssinaturaProsperityPay(empresaId);
  return signedPost<CheckoutIntent>(
    "/api/integrations/subscriptions/checkout-sessions",
    {
      subscriptionId: subscription.external_subscription_id,
      action: {
        type: "cancel_pending_checkout",
        sessionId,
      },
    },
  );
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

export async function cancelarMudancaAddonAgendadaProsperityPay(
  empresaId: string,
  changeId: string,
) {
  const subscription = await garantirAssinaturaProsperityPay(empresaId);
  return signedPost<CheckoutIntent>(
    "/api/integrations/subscriptions/checkout-sessions",
    {
      subscriptionId: subscription.external_subscription_id,
      action: {
        type: "cancel_scheduled_addon_change",
        changeId,
      },
    },
  );
}

export async function referenciaProsperityPayPorPlanoSlug(slug: "basico" | "essencial") {
  const { data: plano, error } = await supabase.from("planos")
    .select("id,preco_mensal_centavos")
    .eq("slug", slug)
    .eq("status", "ativo")
    .single();
  if (error || !plano) throw error ?? new Error("Plano não encontrado.");

  const precoCatalogo = Math.max(
    1,
    Number(plano.preco_mensal_centavos || 0),
  );
  const oferta = await ofertaProsperityPorPlanoValor(
    plano.id,
    precoCatalogo,
    {},
  );
  return oferta.referencia;
}
