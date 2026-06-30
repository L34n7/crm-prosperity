import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

export async function GET() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nichos")
    .select(
      "id, codigo, nome, grupo, rotulo_cadastro_singular, rotulo_cadastro_plural"
    )
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, nichos: data ?? [] });
}

