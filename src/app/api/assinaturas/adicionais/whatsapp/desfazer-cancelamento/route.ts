import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cancelarMudancaAddonAgendadaProsperityPay } from "@/lib/prosperity-pay/subscriptions";

const supabase = getSupabaseAdmin();

function metadataObj(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
        },
        updated_at: agora,
      })
      .eq("id", agendado.id)
      .eq("empresa_id", empresaId)
      .eq("status", "scheduled");

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      cancellation_reversed: true,
      cancellation_id: agendado.id,
      integration_id: agendado.recurso_id || null,
      effective_at: agendado.effective_at || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível desfazer o cancelamento agendado.",
      },
      { status: 500 }
    );
  }
}
