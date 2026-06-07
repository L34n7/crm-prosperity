import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";

const supabaseAdmin = getSupabaseAdmin();

export async function GET() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (can(usuario.permissoes, PERMISSAO_INTERNA_EMPRESAS)) {
    const { data, error } = await supabaseAdmin
      .from("empresas")
      .select("id, nome_fantasia")
      .order("nome_fantasia", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      empresas: data ?? [],
    });
  }

  if (usuario.empresa_id) {
    const { data, error } = await supabaseAdmin
      .from("empresas")
      .select("id, nome_fantasia")
      .eq("id", usuario.empresa_id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      empresas: data ? [data] : [],
    });
  }

  return NextResponse.json({
    ok: true,
    empresas: [],
  });
}
