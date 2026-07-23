import { NextResponse } from "next/server";
import { getUsuarioBasico } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export async function GET() {
  const resultado = await getUsuarioBasico();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const empresaId = resultado.usuario.empresa_id;

  if (!empresaId) {
    return NextResponse.json(
      { ok: true, empresa_id: null, pendentes: [] },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const { data: pendentes, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select(
      "id,nome_conexao,numero,setup_completed_at,mensagem_integracao_validada"
    )
    .eq("empresa_id", empresaId)
    .eq("provider", "meta_official")
    .eq("status", "ativa")
    .eq("onboarding_status", "concluido")
    .not("phone_number_id", "is", null)
    .is("mensagem_integracao_validada", null)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, empresa_id: empresaId, pendentes: pendentes || [] },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
