import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  cancelarCheckoutAssinaturaPendenteProsperityPay,
  cancelarMudancaAddonAgendadaProsperityPay,
} from "@/lib/prosperity-pay/subscriptions";

const supabase = getSupabaseAdmin();
const JANELA_SEGURANCA_DESFAZER_MS = 30 * 60_000;

function metadataObj(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dateValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function undoUnlockAt(pendingPayment: Record<string, unknown>) {
  const explicit = dateValue(pendingPayment.undo_locked_until);
  if (explicit) return explicit;

  const sessionId = String(pendingPayment.session_id || "").trim();
  const createdAt = dateValue(pendingPayment.created_at);
  if (sessionId && createdAt) {
    return new Date(createdAt.getTime() + JANELA_SEGURANCA_DESFAZER_MS);
  }

  // Compatibilidade segura com checkouts criados antes desta regra:
  // sem session_id não é possível invalidar a sessão exata, então só libera
  // depois da validade antiga do checkout.
  return dateValue(pendingPayment.expires_at);
}

export async function POST(request: Request) {
  try {
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      );
    }

    const empresaId = contexto.usuario.empresa_id;
    if (!empresaId) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      cancellation_id?: string | null;
    };
    const cancellationId = String(body.cancellation_id || "").trim();

    if (!cancellationId) {
      return NextResponse.json(
        { ok: false, error: "Cancelamento agendado não informado." },
        { status: 400 }
      );
    }

    const { data: agendado, error: agendadoError } = await supabase
      .from("prosperity_pay_recursos_agendados")
      .select(
        "id,recurso_id,recurso_tipo,addon_code,acao,status,effective_at,metadata_json"
      )
      .eq("id", cancellationId)
      .eq("empresa_id", empresaId)
      .eq("addon_code", "whatsapp_number")
      .eq("acao", "remove")
      .eq("status", "scheduled")
      .maybeSingle();

    if (agendadoError) throw agendadoError;

    if (!agendado) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Este cancelamento não está mais agendado ou já foi processado.",
        },
        { status: 409 }
      );
    }

    const metadata = metadataObj(agendado.metadata_json);

    if (metadata.payment_locked === true) {
      return NextResponse.json(
        {
          ok: false,
          payment_confirmed: true,
          effective_at: agendado.effective_at || null,
          error:
            "O pagamento relacionado a esta composição já foi confirmado. O número continuará agendado para desconexão na data programada.",
        },
        { status: 409 }
      );
    }

    const { data: assinatura, error: assinaturaError } = await supabase
      .from("prosperity_pay_assinaturas")
      .select("pending_payment,current_period_start")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (assinaturaError) throw assinaturaError;

    const pendingPayment = metadataObj(assinatura?.pending_payment);
    const pendingCancellationIds = stringArray(
      pendingPayment.cancellation_ids
    );
    const checkoutRelacionado = pendingCancellationIds.includes(agendado.id);
    const expiresAt = dateValue(pendingPayment.expires_at);
    const pendingActive =
      checkoutRelacionado &&
      Boolean(expiresAt) &&
      (expiresAt as Date).getTime() > Date.now();
    const sessionId = String(pendingPayment.session_id || "").trim();
    const unlockAt = checkoutRelacionado
      ? undoUnlockAt(pendingPayment)
      : null;
    const undoLocked =
      pendingActive &&
      Boolean(unlockAt) &&
      (unlockAt as Date).getTime() > Date.now();

    if (undoLocked && unlockAt) {
      const minutos = Math.max(
        1,
        Math.ceil((unlockAt.getTime() - Date.now()) / 60_000)
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            `Por segurança, aguarde cerca de ${minutos} min antes de desfazer. O checkout continua válido por até 24 horas; depois deste prazo de segurança, o CRM verificará o pagamento antes de cancelar o checkout e restaurar o número.`,
          pending_payment: true,
          unlock_at: unlockAt.toISOString(),
          expires_at: expiresAt?.toISOString() || null,
        },
        { status: 409 }
      );
    }

    if (checkoutRelacionado && sessionId) {
      const resultadoCheckout =
        await cancelarCheckoutAssinaturaPendenteProsperityPay(
          empresaId,
          sessionId
        );

      if (resultadoCheckout.status === "payment_confirmed") {
        const agora = new Date().toISOString();

        const { error: lockError } = await supabase
          .from("prosperity_pay_recursos_agendados")
          .update({
            metadata_json: {
              ...metadata,
              payment_locked: true,
              payment_locked_at: agora,
              payment_source: "undo_payment_check",
            },
            updated_at: agora,
          })
          .eq("id", agendado.id)
          .eq("empresa_id", empresaId)
          .eq("status", "scheduled");

        if (lockError) throw lockError;

        const { error: pendingClearError } = await supabase
          .from("prosperity_pay_assinaturas")
          .update({
            pending_payment: null,
            updated_at: agora,
          })
          .eq("empresa_id", empresaId);

        if (pendingClearError) throw pendingClearError;

        return NextResponse.json(
          {
            ok: false,
            payment_confirmed: true,
            effective_at: agendado.effective_at || null,
            error:
              "O pagamento já foi confirmado. O cancelamento não pode ser desfeito e o número continuará agendado para desconexão na data programada.",
          },
          { status: 409 }
        );
      }

      if (resultadoCheckout.status !== "cancelled") {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Não foi possível confirmar o cancelamento do checkout pendente. O número foi mantido como agendado por segurança.",
          },
          { status: 409 }
        );
      }
    } else if (pendingActive) {
      // Registro legado sem session_id: não libera enquanto o checkout ainda
      // puder ser pago, pois não há como invalidar com segurança a sessão exata.
      return NextResponse.json(
        {
          ok: false,
          error:
            "Há um checkout antigo ainda válido para esta assinatura. Aguarde a expiração para desfazer com segurança.",
          pending_payment: true,
          expires_at: expiresAt?.toISOString() || null,
        },
        { status: 409 }
      );
    }

    const currentPeriodStart = assinatura?.current_period_start
      ? new Date(assinatura.current_period_start)
      : null;
    if (
      currentPeriodStart &&
      Number.isFinite(currentPeriodStart.getTime()) &&
      currentPeriodStart.getTime() > Date.now() + 60_000
    ) {
      return NextResponse.json(
        {
          ok: false,
          payment_confirmed: true,
          effective_at: agendado.effective_at || null,
          error:
            "A próxima mensalidade já foi paga com esta composição. O cancelamento não pode ser desfeito e o número continuará agendado para desconexão na data programada.",
        },
        { status: 409 }
      );
    }

    const payChangeId = String(metadata.pay_change_id || "").trim();

    if (!payChangeId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Não foi possível localizar a alteração correspondente na Prosperity Pay.",
        },
        { status: 409 }
      );
    }

    const intent = await cancelarMudancaAddonAgendadaProsperityPay(
      empresaId,
      payChangeId
    );

    if (intent.status !== "cancelled") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A Prosperity Pay não confirmou o cancelamento da alteração agendada.",
        },
        { status: 409 }
      );
    }

    const agora = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("prosperity_pay_recursos_agendados")
      .update({
        status: "cancelled",
        metadata_json: {
          ...metadata,
          cancellation_reversed_at: agora,
          cancellation_reversed_by: contexto.usuario.id,
          pay_change_cancelled: true,
          checkout_cancelled_before_reverse:
            checkoutRelacionado && Boolean(sessionId),
        },
        updated_at: agora,
      })
      .eq("id", agendado.id)
      .eq("empresa_id", empresaId)
      .eq("status", "scheduled");

    if (updateError) throw updateError;

    if (assinatura?.pending_payment && checkoutRelacionado) {
      const { error: pendingClearError } = await supabase
        .from("prosperity_pay_assinaturas")
        .update({
          pending_payment: null,
          updated_at: agora,
        })
        .eq("empresa_id", empresaId);

      if (pendingClearError) throw pendingClearError;
    }

    return NextResponse.json({
      ok: true,
      cancellation_reversed: true,
      cancellation_id: agendado.id,
      integration_id: agendado.recurso_id || null,
      effective_at: agendado.effective_at || null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível desfazer o cancelamento agendado.";
    const conflitoPagamento =
      message.toLowerCase().includes("pagamento") ||
      message.toLowerCase().includes("assinatura") ||
      message.toLowerCase().includes("checkout");

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: conflitoPagamento ? 409 : 500 }
    );
  }
}
