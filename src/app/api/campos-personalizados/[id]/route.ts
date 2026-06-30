import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";

const supabase = getSupabaseAdmin();

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  if (!can(usuario.permissoes, "pessoas.campos_personalizados")) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para personalizar campos." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const { data, error } = await supabase
    .from("campos_personalizados")
    .update({ ativo: false })
    .eq("id", id)
    .eq("empresa_id", usuario.empresa_id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Campo não encontrado." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Campo desativado com sucesso.",
  });
}

