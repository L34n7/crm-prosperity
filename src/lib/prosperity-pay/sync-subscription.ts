import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

type SubscriptionEventPayload = {
  event_id?: string;
  event?: string;
  occurred_at?: string;
  order?: { id?: string; billing_reason?: string };
  subscription?: {
    id?: string;
    status?: string;
    billing_model?: string;
    base_amount_cents?: number;
    current_amount_cents?: number;
    currency?: string;
    current_period_start?: string | null;
    current_period_end?: string | null;
    next_due_at?: string | null;
    cycle_number?: number;
    items?: Array<{
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
  change?: Record<string, unknown> | null;
  offer?: { id?: string; checkout_slug?: string; reference?: string };
  customer?: { id?: string; name?: string | null; email?: string | null };
};

function email(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function validDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function blockDate(periodEnd: string | null) {
  if (!periodEnd) return null;
  const date = new Date(periodEnd);
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

async function findCompany(payload: SubscriptionEventPayload) {
  const subscriptionId = String(payload.subscription?.id || "").trim();
  if (subscriptionId) {
    const mirror = await supabase.from("prosperity_pay_assinaturas")
      .select("empresa_id")
      .eq("external_subscription_id", subscriptionId)
      .maybeSingle();
    if (mirror.error) throw mirror.error;
    if (mirror.data?.empresa_id) return mirror.data.empresa_id as string;
  }

  const customerEmail = email(payload.customer?.email);
  if (!customerEmail) return null;

  const company = await supabase.from("empresas")
    .select("id")
    .ilike("email", customerEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (company.error) throw company.error;
  if (company.data?.id) return company.data.id as string;

  const lead = await supabase.from("leads_cadastro")
    .select("empresa_id")
    .ilike("email", customerEmail)
    .not("empresa_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lead.error) throw lead.error;
  return lead.data?.empresa_id as string | null ?? null;
}

async function planForBaseItem(payload: SubscriptionEventPayload) {
  const items = payload.subscription?.items || [];
  const base = items.find(item => item.type === "base");
  const references = [
    base?.code,
    payload.offer?.checkout_slug,
    payload.offer?.reference,
  ].map(value => String(value || "").trim()).filter(Boolean);

  if (!references.length) throw new Error("Evento de assinatura sem referência do plano base.");

  const { data, error } = await supabase.from("ia_token_ofertas")
    .select("referencia,plano_id,planos(id,slug,limite_integracoes_whatsapp,limite_tokens_ia)")
    .eq("gateway", "prosperity_pay")
    .eq("tipo", "mensalidade")
    .in("referencia", references)
    .limit(1)
    .maybeSingle();
  if (error || !data?.plano_id) {
    throw error ?? new Error(`Plano da assinatura não mapeado no CRM: ${references.join(", ")}.`);
  }
  const plan = Array.isArray(data.planos) ? data.planos[0] : data.planos;
  return { mapping: data, plan, base };
}

function addonWhatsappQuantity(payload: SubscriptionEventPayload) {
  return (payload.subscription?.items || [])
    .filter(item => item.type === "addon" && item.code === "whatsapp_number")
    .reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
}

async function preserveTokenUsageOnPlanChange(empresaId: string, newLimit: number | null) {
  const { data, error } = await supabase.from("empresa_tokens_ia")
    .select("tokens_mensais_usados,saldo_avulso_restante")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (error || !data) {
    if (error) throw error;
    return;
  }

  const used = Math.max(0, Number(data.tokens_mensais_usados || 0));
  const avulso = Math.max(0, Number(data.saldo_avulso_restante || 0));
  const monthlyRemaining = newLimit === null ? null : Math.max(newLimit - used, 0);
  const totalRemaining = monthlyRemaining === null ? null : monthlyRemaining + avulso;

  const update = await supabase.from("empresa_tokens_ia").update({
    limite_mensal: newLimit,
    limite_mensal_personalizado: null,
    saldo_mensal_restante: monthlyRemaining,
    tokens_restantes: totalRemaining,
    updated_at: new Date().toISOString(),
  }).eq("empresa_id", empresaId);
  if (update.error) throw update.error;
}

async function aplicarCancelamentosWhatsappAgendados(
  empresaId: string,
  payload: SubscriptionEventPayload,
) {
  if (payload.event !== "subscription.renewed") return;

  const inicioNovoCiclo = validDate(payload.subscription?.current_period_start);
  const referenciaTempo = inicioNovoCiclo || validDate(payload.occurred_at) || new Date().toISOString();

  const { data: agendados, error } = await supabase
    .from("prosperity_pay_recursos_agendados")
    .select("id,recurso_id,recurso_tipo,effective_at,metadata_json")
    .eq("empresa_id", empresaId)
    .eq("addon_code", "whatsapp_number")
    .in("recurso_tipo", ["whatsapp_integration", "whatsapp_addon_slot"])
    .eq("acao", "remove")
    .eq("status", "scheduled")
    .lte("effective_at", referenciaTempo);

  if (error) throw error;

  for (const agendado of agendados || []) {
    let recursoId = agendado.recurso_id || null;

    if (
      !recursoId &&
      agendado.recurso_tipo === "whatsapp_addon_slot"
    ) {
      const metadata =
        agendado.metadata_json &&
        typeof agendado.metadata_json === "object" &&
        !Array.isArray(agendado.metadata_json)
          ? (agendado.metadata_json as Record<string, unknown>)
          : {};
      const addonIndex = Math.max(
        0,
        Number(metadata.addon_index || 0),
      );

      if (addonIndex > 0) {
        const { data: empresa, error: empresaError } = await supabase
          .from("empresas")
          .select("plano_id,planos:plano_id(limite_integracoes_whatsapp)")
          .eq("id", empresaId)
          .single();

        if (empresaError) throw empresaError;

        const plano = Array.isArray(empresa?.planos)
          ? empresa.planos[0]
          : empresa?.planos;
        const limiteBase = Math.max(
          1,
          Number(plano?.limite_integracoes_whatsapp || 1),
        );
        const posicaoAlvo = limiteBase + addonIndex;

        const { data: integracaoSlot, error: integracaoSlotError } =
          await supabase
            .from("integracoes_whatsapp")
            .select("id")
            .eq("empresa_id", empresaId)
            .eq("provider", "meta_official")
            .eq("posicao", posicaoAlvo)
            .maybeSingle();

        if (integracaoSlotError) throw integracaoSlotError;
        recursoId = integracaoSlot?.id || null;
      }
    }

    if (recursoId) {
      const { data: integracao, error: integracaoError } = await supabase
        .from("integracoes_whatsapp")
        .select("id,status,config_json")
        .eq("id", recursoId)
        .eq("empresa_id", empresaId)
        .maybeSingle();

      if (integracaoError) throw integracaoError;

      if (integracao) {
        const configAtual =
          integracao.config_json &&
          typeof integracao.config_json === "object" &&
          !Array.isArray(integracao.config_json)
            ? (integracao.config_json as Record<string, unknown>)
            : {};

        const updateIntegracao = await supabase
          .from("integracoes_whatsapp")
          .update({
            status: "desconectada",
            config_json: {
              ...configAtual,
              subscription_access_disabled: true,
              subscription_access_disabled_at: referenciaTempo,
              subscription_access_disabled_reason: "whatsapp_addon_cancelled",
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", integracao.id)
          .eq("empresa_id", empresaId);

        if (updateIntegracao.error) throw updateIntegracao.error;
      }
    }

    const applied = await supabase
      .from("prosperity_pay_recursos_agendados")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", agendado.id)
      .eq("status", "scheduled");

    if (applied.error) throw applied.error;
  }
}

export async function sincronizarAssinaturaProsperityPay(payload: SubscriptionEventPayload) {
  const subscription = payload.subscription;
  const subscriptionId = String(subscription?.id || "").trim();
  if (!subscriptionId) throw new Error("Evento sem subscription.id.");

  const empresaId = await findCompany(payload);
  if (!empresaId) {
    throw new Error("Não foi possível vincular a assinatura da Prosperity Pay a uma empresa.");
  }

  const { mapping, plan } = await planForBaseItem(payload);
  const periodStart = validDate(subscription?.current_period_start);
  const periodEnd = validDate(subscription?.current_period_end);
  const nextDueAt = validDate(subscription?.next_due_at) || periodEnd;
  const renewalReference = String(
    payload.order?.id || payload.event_id || subscriptionId
  );
  const renewalStartsInFuture =
    payload.event === "subscription.renewed" &&
    Boolean(periodStart) &&
    new Date(String(periodStart)).getTime() > Date.now() + 60_000;
  const additionalNumbers = addonWhatsappQuantity(payload);
  const baseWhatsappLimit = Math.max(
    1,
    Number((plan as any)?.limite_integracoes_whatsapp || 1),
  );
  const planTokenLimitRaw = (plan as any)?.limite_tokens_ia;
  const planTokenLimit =
    planTokenLimitRaw == null ? null : Number(planTokenLimitRaw);

  const currentCompany = await supabase.from("empresas")
    .select("assinatura_metadata_json,limite_numeros_adicionais_whatsapp")
    .eq("id", empresaId)
    .single();
  if (currentCompany.error) throw currentCompany.error;

  const additionalNumbersLimit = Math.max(
    0,
    Number(currentCompany.data?.limite_numeros_adicionais_whatsapp ?? 5),
  );
  const effectiveAdditionalNumbers = Math.min(
    additionalNumbers,
    additionalNumbersLimit,
  );
  const whatsappLimit =
    baseWhatsappLimit + effectiveAdditionalNumbers;

  const existingMetadata =
    currentCompany.data?.assinatura_metadata_json &&
    typeof currentCompany.data.assinatura_metadata_json === "object" &&
    !Array.isArray(currentCompany.data.assinatura_metadata_json)
      ? currentCompany.data.assinatura_metadata_json as Record<string, unknown>
      : {};

  const mirror = await supabase.from("prosperity_pay_assinaturas").upsert({
    empresa_id: empresaId,
    external_subscription_id: subscriptionId,
    customer_email: email(payload.customer?.email) || null,
    external_offer_reference: mapping.referencia,
    status: String(subscription?.status || "active"),
    billing_model: String(subscription?.billing_model || "prepaid"),
    base_amount_cents: Number(subscription?.base_amount_cents || 0) || null,
    current_amount_cents: Number(subscription?.current_amount_cents || 0) || null,
    currency: String(subscription?.currency || "BRL"),
    cycle_number: Number(subscription?.cycle_number || 0) || null,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    next_due_at: nextDueAt,
    items: subscription?.items || [],
    pending_change: payload.change || null,
    last_event_id: payload.event_id || null,
    last_event_type: payload.event || null,
    payload,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "external_subscription_id" });
  if (mirror.error) throw mirror.error;

  const companyUpdate = await supabase.from("empresas").update({
    plano_id: mapping.plano_id,
    limite_integracoes_whatsapp: whatsappLimit,
    assinatura_status: "ativa",
    assinatura_inicio_em: periodStart,
    assinatura_vencimento_em: periodEnd,
    assinatura_bloqueio_em: blockDate(periodEnd),
    assinatura_renovada_em:
      payload.event === "subscription.renewed" ? periodStart : undefined,
    assinatura_gateway: "prosperity_pay",
    assinatura_referencia: subscriptionId,
    assinatura_metadata_json: {
      ...existingMetadata,
      origem: "prosperity_pay_subscription",
      subscription_id: subscriptionId,
      offer_reference: mapping.referencia,
      base_amount_cents: Number(subscription?.base_amount_cents || 0) || null,
      current_amount_cents: Number(subscription?.current_amount_cents || 0) || null,
      cycle_number: Number(subscription?.cycle_number || 0) || null,
      whatsapp_addon_quantity: additionalNumbers,
      whatsapp_addon_quantity_effective: effectiveAdditionalNumbers,
      whatsapp_addon_limit: additionalNumbersLimit,
      last_subscription_event: payload.event,
      last_subscription_event_id: payload.event_id,
      ...(payload.event === "subscription.renewed"
        ? {
            prepaid_tokens_pending: renewalStartsInFuture
              ? {
                  reference: renewalReference,
                  starts_at: periodStart,
                  subscription_id: subscriptionId,
                  event_id: payload.event_id || null,
                }
              : null,
          }
        : {}),
    },
    assinatura_fluxos_pausados_em: null,
    updated_at: new Date().toISOString(),
  }).eq("id", empresaId);
  if (companyUpdate.error) throw companyUpdate.error;

  if (payload.event === "subscription.renewed") {
    await aplicarCancelamentosWhatsappAgendados(empresaId, payload);

    // Em pagamento antecipado o próximo ciclo ainda não começou. A franquia
    // mensal de IA é renovada de forma preguiçosa em lib/ia/tokens.ts somente
    // quando current_period_start chega, evitando liberar dois meses de tokens
    // dentro do mesmo período.
    if (!renewalStartsInFuture) {
      const renewal = await supabase.rpc("renovar_tokens_assinatura_plano", {
        p_empresa_id: empresaId,
        p_referencia: renewalReference,
        p_pago_em: periodStart || payload.occurred_at || new Date().toISOString(),
        p_metadata_json: {
          origem: "prosperity_pay_subscription_renewal",
          subscription_id: subscriptionId,
          event_id: payload.event_id || null,
        },
      });
      if (renewal.error) throw renewal.error;
    }
  } else if (payload.event === "subscription.changed") {
    await preserveTokenUsageOnPlanChange(empresaId, planTokenLimit);
  }

  return {
    empresaId,
    subscriptionId,
    planId: mapping.plano_id,
    whatsappLimit,
    additionalNumbers,
    effectiveAdditionalNumbers,
    additionalNumbersLimit,
  };
}
