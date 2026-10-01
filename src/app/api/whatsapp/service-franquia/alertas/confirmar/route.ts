import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto({ sincronizarAssinatura: false });

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id || !usuario.is_admin) {
    return NextResponse.json(
      { ok: false, error: "Apenas administradores podem confirmar este aviso." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const alertaId = String(body?.alerta_id || "").trim();

  if (!alertaId) {
    return NextResponse.json(
      { ok: false, error: "Alerta não informado." },
      { status: 400 }
    );
  }

  const { data: alerta, error: alertaError } = await supabaseAdmin
    .from("whatsapp_service_franquia_alertas")
    .select("id")
    .eq("id", alertaId)
    .eq("empresa_id", usuario.empresa_id)
    .maybeSingle();

  if (alertaError) {
    return NextResponse.json(
      { ok: false, error: alertaError.message },
      { status: 500 }
    );
  }

  if (!alerta) {
    return NextResponse.json(
      { ok: false, error: "Alerta não encontrado." },
      { status: 404 }
    );
  }

  const { error } = await supabaseAdmin
    .from("whatsapp_service_franquia_alertas_confirmacoes")
    .upsert(
      {
        alerta_id: alerta.id,
        usuario_id: usuario.id,
        confirmado_em: new Date().toISOString(),
      },
      { onConflict: "alerta_id,usuario_id" }
    );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
