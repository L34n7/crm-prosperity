import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { garantirAssinaturaProsperityPay } from "@/lib/prosperity-pay/subscriptions";

const supabase = getSupabaseAdmin();

function recordValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function arrayValue(value: unknown): Record<string, any>[] {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object") as Record<string, any>[]
    : [];
}

function moneyItem(items: Record<string, any>[], code: string) {
  return items.find((item) => String(item.code || "") === code);
}

export async function GET() {
  try {
    const contexto = await getUsuarioContexto();
    if (!contexto.ok) {
      return NextResponse.json({ ok: false, error: contexto.error }, { status: contexto.status });
    }

    const empresaId = contexto.usuario.empresa_id;
    if (!empresaId) {
      return NextResponse.json({ ok: false, error: "Usuário sem empresa vinculada." }, { status: 400 });
    }

    const { data: empresa, error: empresaError } = await supabase
      .from("empresas")
      .select(
        "id,plano_id,limite_integracoes_whatsapp,assinatura_status,assinatura_gateway,assinatura_metadata_json,assinatura_vencimento_em,assinatura_bloqueio_em,planos:plano_id(id,nome,slug,preco_mensal_centavos,limite_integracoes_whatsapp,limite_tokens_ia,limite_usuarios)"
      )
      .eq("id", empresaId)
      .single();

    if (empresaError || !empresa) {
      throw empresaError ?? new Error("Empresa não encontrada.");
    }

    const plano = Array.isArray(empresa.planos) ? empresa.planos[0] : empresa.planos;
    const metadataAssinatura = recordValue(empresa.assinatura_metadata_json);
    const assinaturaGratuita =
      String(empresa.assinatura_gateway || "") === "CRM_FREE_CHECKOUT_KEY" ||
      metadataAssinatura.free_vitalicio === true ||
      String(metadataAssinatura.tipo_oferta || "") === "free";

    if (assinaturaGratuita) {
      return NextResponse.json({
        ok: true,
        subscription: {
          id: null,
          status: "active",
          billing_model: "free",
          current_period_start: null,
          current_period_end: null,
          next_due_at: null,
          base_amount_cents: 0,
          current_amount_cents: 0,
          next_amount_cents: 0,
          paid_ahead: false,
          paid_ahead_starts_at: null,
          paid_until: null,
          is_free: true,
        },
        plan: {
          id: plano?.id || empresa.plano_id,
          name: plano?.nome || "Plano atual",
          slug: plano?.slug || null,
          price_cents: 0,
          catalog_price_cents: Number(plano?.preco_mensal_centavos || 0),
          users_limit: plano?.limite_usuarios ?? null,
          tokens_limit: plano?.limite_tokens_ia ?? null,
          whatsapp_included: Math.max(
            1,
            Number(plano?.limite_integracoes_whatsapp || 1)
          ),
          is_free: true,
        },
        addons: {
          whatsapp: [],
          others: [],
        },
        pending: {
          whatsapp_cancellations: 0,
          plan_change: null,
        },
      });
    }

    await garantirAssinaturaProsperityPay(empresaId);

    const { data: assinatura, error: assinaturaError } = await supabase
      .from("prosperity_pay_assinaturas")
      .select("*")
      .eq("empresa_id", empresaId)
      .single();

    if (assinaturaError || !assinatura) {
      throw assinaturaError ?? new Error("Assinatura da Prosperity Pay não encontrada.");
    }
    const baseLimit = Math.max(1, Number(plano?.limite_integracoes_whatsapp || 1));
    const items = arrayValue(assinatura.items);
    const whatsappItem = moneyItem(items, "whatsapp_number");

    const [{ data: integracoes, error: integracoesError }, { data: agendados, error: agendadosError }] =
      await Promise.all([
        supabase
          .from("integracoes_whatsapp")
          .select("id,nome_conexao,numero,status,posicao,phone_number_display_name,verified_name")
          .eq("empresa_id", empresaId)
          .eq("provider", "meta_official")
          .order("posicao", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true }),
        supabase
          .from("prosperity_pay_recursos_agendados")
          .select("id,recurso_id,addon_code,acao,status,effective_at")
          .eq("empresa_id", empresaId)
          .eq("status", "scheduled"),
      ]);

    if (integracoesError) throw integracoesError;
    if (agendadosError) throw agendadosError;

    const integracoesExtras = (integracoes || []).filter((item: any, index: number) => {
      const posicao = Number(item.posicao || index + 1);
      return posicao > baseLimit;
    });

    const addonQuantityFromPay = Math.max(0, Number(whatsappItem?.quantity || 0));
    const addonQuantityFromLimit = Math.max(
      0,
      Number(empresa.limite_integracoes_whatsapp || baseLimit) - baseLimit
    );
    const addonQuantity = Math.max(
      addonQuantityFromPay,
      addonQuantityFromLimit
    );

    const addonUnitCents = Math.max(
      0,
      Number(whatsappItem?.unit_amount_cents || 6000)
    );

    const agendadosWhatsapp = (agendados || []).filter(
      (item: any) => item.addon_code === "whatsapp_number" && item.acao === "remove"
    );

    const whatsappAddons = Array.from({ length: addonQuantity }, (_, index) => {
      const integracao = integracoesExtras[index] || null;
      const pending = integracao
        ? agendadosWhatsapp.find((item: any) => item.recurso_id === integracao.id) || null
        : null;

      return {
        code: "whatsapp_number",
        index: index + 1,
        unit_amount_cents: addonUnitCents,
        integration: integracao
          ? {
              id: integracao.id,
              nome:
                integracao.nome_conexao ||
                integracao.phone_number_display_name ||
                integracao.verified_name ||
                `WhatsApp adicional ${index + 1}`,
              numero: integracao.numero || null,
              status: integracao.status || null,
              posicao: integracao.posicao || null,
              configured: Boolean(String(integracao.numero || "").trim()),
            }
          : null,
        cancellation: pending
          ? {
              id: pending.id,
              effective_at: pending.effective_at,
            }
          : null,
      };
    });

    const genericAddons = items
      .filter((item) => item.type === "addon" && item.code !== "whatsapp_number")
      .map((item) => ({
        code: String(item.code || ""),
        description: String(item.description || item.code || "Adicional"),
        quantity: Math.max(1, Number(item.quantity || 1)),
        unit_amount_cents: Math.max(0, Number(item.unit_amount_cents || 0)),
        total_amount_cents: Math.max(0, Number(item.total_amount_cents || 0)),
      }));

    const baseAmountCents = Math.max(
      0,
      Number(assinatura.base_amount_cents || plano?.preco_mensal_centavos || 0)
    );

    const pendingChange = recordValue(assinatura.pending_change);
    const pendingPlanSlug =
      pendingChange.type === "change_plan"
        ? String(pendingChange.plano_slug || "").trim()
        : "";

    let pendingPlan: {
      id: string;
      nome: string;
      slug: string;
      preco_mensal_centavos: number;
    } | null = null;

    if (pendingPlanSlug) {
      const { data: targetPlan, error: targetPlanError } = await supabase
        .from("planos")
        .select("id,nome,slug,preco_mensal_centavos")
        .eq("slug", pendingPlanSlug)
        .eq("status", "ativo")
        .maybeSingle();

      if (targetPlanError) throw targetPlanError;
      pendingPlan = targetPlan;
    }
    const pendingWhatsappCount = agendadosWhatsapp.length;
    const nextWhatsappQuantity = Math.max(0, addonQuantity - pendingWhatsappCount);
    const genericAddonsTotal = genericAddons.reduce(
      (sum, item) =>
        sum +
        (item.total_amount_cents ||
          item.unit_amount_cents * item.quantity),
      0
    );
    const nextBaseAmountCents = pendingPlan
      ? Math.max(0, Number(pendingPlan.preco_mensal_centavos || 0))
      : baseAmountCents;
    const nextAmountCents =
      nextBaseAmountCents +
      nextWhatsappQuantity * addonUnitCents +
      genericAddonsTotal;

    const currentPeriodStartMs = assinatura.current_period_start
      ? new Date(assinatura.current_period_start).getTime()
      : Number.NaN;
    const paidAhead =
      Number.isFinite(currentPeriodStartMs) &&
      currentPeriodStartMs > Date.now() + 60_000;

    return NextResponse.json({
      ok: true,
      subscription: {
        id: assinatura.external_subscription_id,
        status: assinatura.status,
        billing_model: assinatura.billing_model,
        current_period_start: assinatura.current_period_start,
        current_period_end: assinatura.current_period_end,
        next_due_at: assinatura.next_due_at,
        base_amount_cents: baseAmountCents,
        current_amount_cents: Number(assinatura.current_amount_cents || nextAmountCents),
        next_amount_cents: nextAmountCents,
        paid_ahead: paidAhead,
        paid_ahead_starts_at: paidAhead ? assinatura.current_period_start : null,
        paid_until: paidAhead ? assinatura.current_period_end : null,
        is_free: false,
      },
      plan: {
        id: plano?.id || empresa.plano_id,
        name: plano?.nome || "Plano atual",
        slug: plano?.slug || null,
        price_cents: baseAmountCents,
        users_limit: plano?.limite_usuarios ?? null,
        tokens_limit: plano?.limite_tokens_ia ?? null,
        whatsapp_included: baseLimit,
        catalog_price_cents: Number(plano?.preco_mensal_centavos || baseAmountCents),
        is_free: false,
      },
      addons: {
        whatsapp: whatsappAddons,
        others: genericAddons,
      },
      pending: {
        whatsapp_cancellations: pendingWhatsappCount,
        plan_change: pendingPlan
          ? {
              change_id:
                typeof pendingChange.change_id === "string"
                  ? pendingChange.change_id
                  : typeof pendingChange.id === "string"
                    ? pendingChange.id
                    : null,
              plan_id: pendingPlan.id,
              plan_name: pendingPlan.nome,
              plan_slug: pendingPlan.slug,
              plan_price_cents: Number(pendingPlan.preco_mensal_centavos),
              effective_at: pendingChange.effective_at || null,
              target_amount_cents: nextAmountCents,
            }
          : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar a assinatura.",
      },
      { status: 500 }
    );
  }
}
