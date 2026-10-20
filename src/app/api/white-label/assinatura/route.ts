import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarWhiteLabelAdminPorUsuario } from "@/lib/white-label/acesso";
import { sincronizarCobrancaWhiteLabel } from "@/lib/white-label/billing";
import {
  criarCheckoutAssinaturaProsperityPay,
  registrarPagamentoAssinaturaPendenteProsperityPay,
} from "@/lib/prosperity-pay/subscriptions";

const supabase = getSupabaseAdmin();

function registro(valor: unknown): Record<string, any> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, any>)
    : {};
}

async function obterAdmin() {
  const contexto = await getUsuarioContexto({ ignorarAcessoTemporario: true });

  if (!contexto.ok) return contexto;

  const admin =
    contexto.usuario.white_label_admin ||
    (await buscarWhiteLabelAdminPorUsuario(contexto.usuario));

  if (!admin) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "Acesso disponível apenas para administradores White Label.",
    };
  }

  return { ok: true as const, admin };
}

export async function GET() {
  try {
    const acesso = await obterAdmin();

    if (!acesso.ok) {
      return NextResponse.json(
        { ok: false, error: acesso.error },
        { status: acesso.status },
      );
    }

    const cobranca = await sincronizarCobrancaWhiteLabel(
      acesso.admin.white_label_id,
    );

    if (!cobranca.empresa_gestora_id) {
      throw new Error("White Label sem empresa gestora.");
    }

    const [{ data: gestora, error: gestoraError }, { data: espelho, error: espelhoError }] =
      await Promise.all([
        supabase
          .from("empresas")
          .select(
            "id,assinatura_status,assinatura_inicio_em,assinatura_vencimento_em,assinatura_bloqueio_em",
          )
          .eq("id", cobranca.empresa_gestora_id)
          .single(),
        supabase
          .from("prosperity_pay_assinaturas")
          .select("*")
          .eq("empresa_id", cobranca.empresa_gestora_id)
          .maybeSingle(),
      ]);

    if (gestoraError || !gestora) {
      throw gestoraError ?? new Error("Empresa gestora não encontrada.");
    }
    if (espelhoError) throw espelhoError;

    const pendingPayment = registro(espelho?.pending_payment);
    const total = cobranca.valor_total_centavos;
    const addons = [];

    if (cobranca.numeros_adicionais > 0) {
      addons.push({
        code: "white_label_whatsapp_number",
        description: "Números adicionais dos clientes",
        quantity: cobranca.numeros_adicionais,
        unit_amount_cents: cobranca.preco_numero_adicional_centavos,
        total_amount_cents: cobranca.valor_numeros_adicionais_centavos,
      });
    }

    if (cobranca.usuarios_adicionais > 0) {
      addons.push({
        code: "white_label_extra_user",
        description: "Usuários adicionais dos clientes",
        quantity: cobranca.usuarios_adicionais,
        unit_amount_cents: cobranca.preco_usuario_adicional_centavos,
        total_amount_cents: cobranca.valor_usuarios_adicionais_centavos,
      });
    }

    return NextResponse.json({
      ok: true,
      subscription: {
        id: espelho?.external_subscription_id || null,
        status: espelho?.status || gestora.assinatura_status || "active",
        billing_model: espelho?.billing_model || "prepaid",
        current_period_start:
          espelho?.current_period_start || gestora.assinatura_inicio_em || null,
        current_period_end:
          espelho?.current_period_end ||
          gestora.assinatura_vencimento_em ||
          null,
        next_due_at:
          espelho?.next_due_at || gestora.assinatura_vencimento_em || null,
        base_amount_cents: cobranca.valor_base_centavos,
        current_amount_cents:
          Number(espelho?.current_amount_cents || 0) || total,
        next_amount_cents: total,
        paid_ahead: false,
        paid_ahead_starts_at: null,
        paid_until: null,
        is_free: total === 0,
      },
      plan: {
        id: cobranca.white_label_id,
        name: "White Label",
        slug: "white-label",
        price_cents: cobranca.valor_base_centavos,
        catalog_price_cents: cobranca.valor_base_centavos,
        users_limit: null,
        tokens_limit: null,
        whatsapp_included: 0,
        is_free: total === 0,
      },
      addons: {
        whatsapp: [],
        others: addons,
      },
      pending: {
        whatsapp_cancellations: 0,
        plan_change: null,
        payment:
          Object.keys(pendingPayment).length > 0
            ? {
                type: String(pendingPayment.type || ""),
                change_id: pendingPayment.change_id || null,
                expires_at: pendingPayment.expires_at || null,
                undo_locked_until: pendingPayment.undo_locked_until || null,
                cancellation_ids: Array.isArray(pendingPayment.cancellation_ids)
                  ? pendingPayment.cancellation_ids
                  : [],
              }
            : null,
      },
      white_label: {
        id: cobranca.white_label_id,
        nome: cobranca.nome,
        valor_base_centavos: cobranca.valor_base_centavos,
        numeros_adicionais: cobranca.numeros_adicionais,
        preco_numero_adicional_centavos:
          cobranca.preco_numero_adicional_centavos,
        valor_numeros_adicionais_centavos:
          cobranca.valor_numeros_adicionais_centavos,
        usuarios_adicionais: cobranca.usuarios_adicionais,
        preco_usuario_adicional_centavos:
          cobranca.preco_usuario_adicional_centavos,
        valor_usuarios_adicionais_centavos:
          cobranca.valor_usuarios_adicionais_centavos,
        valor_total_centavos: total,
        clientes: cobranca.clientes,
      },
      warning: cobranca.warning,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar a assinatura White Label.",
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const acesso = await obterAdmin();

    if (!acesso.ok) {
      return NextResponse.json(
        { ok: false, error: acesso.error },
        { status: acesso.status },
      );
    }

    const cobranca = await sincronizarCobrancaWhiteLabel(
      acesso.admin.white_label_id,
    );

    if (!cobranca.empresa_gestora_id) {
      throw new Error("White Label sem empresa gestora.");
    }

    if (cobranca.valor_total_centavos <= 0) {
      return NextResponse.json(
        { ok: false, error: "Este White Label não possui mensalidade a pagar." },
        { status: 400 },
      );
    }

    const intent = await criarCheckoutAssinaturaProsperityPay(
      cobranca.empresa_gestora_id,
      { type: "renew" },
      { renewalSessionTtlHours: 24 },
    );

    if (intent.status === "scheduled") {
      return NextResponse.json({
        ok: true,
        scheduled: true,
        effective_at: intent.effectiveAt ?? null,
        target_amount_cents:
          intent.targetAmountCents ?? cobranca.valor_total_centavos,
      });
    }

    if (!intent.checkoutUrl) {
      throw new Error("A Prosperity Pay não retornou o checkout da mensalidade.");
    }

    await registrarPagamentoAssinaturaPendenteProsperityPay({
      empresaId: cobranca.empresa_gestora_id,
      tipo: "renewal",
      changeId: intent.changeId ?? null,
      sessionId: intent.sessionId ?? null,
      expiresAt: intent.expiresAt ?? null,
      targetAmountCents:
        intent.targetAmountCents ?? cobranca.valor_total_centavos,
    });

    return NextResponse.json({
      ok: true,
      checkout_url: intent.checkoutUrl,
      valor_cobrado_agora_centavos: intent.amountCents,
      valor_proximo_ciclo_centavos:
        intent.targetAmountCents ?? cobranca.valor_total_centavos,
      expires_at: intent.expiresAt ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível preparar a renovação White Label.",
      },
      { status: 500 },
    );
  }
}
