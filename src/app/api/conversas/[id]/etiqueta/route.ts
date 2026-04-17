import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

export async function PUT(
  request: Request,
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
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const params = await context.params;
  const conversaId = params.id;

  if (!conversaId) {
    return NextResponse.json(
      { ok: false, error: "ID da conversa é obrigatório" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const etiquetaId = body?.etiqueta_id || null;

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id")
    .eq("id", conversaId)
    .maybeSingle();

  if (conversaError) {
    return NextResponse.json(
      { ok: false, error: conversaError.message },
      { status: 500 }
    );
  }

  if (!conversa || conversa.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Conversa não encontrada" },
      { status: 404 }
    );
  }

  if (!etiquetaId) {
    const { error: removerError } = await supabaseAdmin
      .from("conversas")
      .update({
        etiqueta_id: null,
        etiqueta_cor: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversaId)
      .eq("empresa_id", usuario.empresa_id);

    if (removerError) {
      return NextResponse.json(
        { ok: false, error: removerError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Etiqueta removida com sucesso",
    });
  }

  const { data: etiqueta, error: etiquetaError } = await supabaseAdmin
    .from("etiquetas")
    .select("id, empresa_id, cor")
    .eq("id", etiquetaId)
    .eq("ativo", true)
    .maybeSingle();

  if (etiquetaError) {
    return NextResponse.json(
      { ok: false, error: etiquetaError.message },
      { status: 500 }
    );
  }

  if (!etiqueta || etiqueta.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Etiqueta não encontrada" },
      { status: 404 }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("conversas")
    .update({
      etiqueta_id: etiqueta.id,
      etiqueta_cor: etiqueta.cor,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversaId)
    .eq("empresa_id", usuario.empresa_id);

  if (updateError) {
    return NextResponse.json(
      { ok: false, error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Etiqueta atualizada com sucesso",
  });
}