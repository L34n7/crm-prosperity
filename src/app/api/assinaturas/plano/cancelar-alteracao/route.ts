import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cancelarMudancaPlanoAgendadaProsperityPay } from "@/lib/prosperity-pay/subscriptions";

const supabase = getSupabaseAdmin();

export async function POST(request: Request) {
  try {
    const contexto = await getUsuarioContexto();
    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status },
      );
    }

    const empresaId = contexto.usuario.empresa_id;
    if (!empresaId) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const changeId =
      typeof body?.change_id === "string" && body.change_id.trim()
        ? body.change_id.trim()
        : undefined;

    const resultado = await cancelarMudancaPlanoAgendadaProsperityPay(
      empresaId,
      changeId,
    );

    const { error: mirrorError } = await supabase
      .from("prosperity_pay_assinaturas")
      .update({
        pending_change: null,
        updated_at: new Date().toISOString(),
      })
      .eq("empresa_id", empresaId);

    if (mirrorError) throw mirrorError;

    return NextResponse.json({
      ok: true,
      status: resultado.status,
      target_amount_cents: resultado.targetAmountCents ?? null,
      message: "Alteração cancelada. O plano atual será mantido na próxima renovação.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível manter o plano atual.",
      },
      { status: 500 },
    );
  }
}
