import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

type ConversaBase = {
  id: string;
  empresa_id: string;
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

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

    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select("id, empresa_id")
      .eq("id", id)
      .maybeSingle<ConversaBase>();

    if (conversaError) {
      return NextResponse.json(
        { ok: false, error: conversaError.message },
        { status: 500 }
      );
    }

    if (!conversa) {
      return NextResponse.json(
        { ok: false, error: "Conversa não encontrada" },
        { status: 404 }
      );
    }

    if (conversa.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Você não pode favoritar esta conversa" },
        { status: 403 }
      );
    }

    const { error: insertError } = await supabaseAdmin
      .from("conversas_favoritas")
      .upsert(
        {
          empresa_id: usuario.empresa_id,
          usuario_id: usuario.id,
          conversa_id: conversa.id,
        },
        { onConflict: "usuario_id,conversa_id" }
      );

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Conversa adicionada aos favoritos",
    });
  } catch (error) {
    console.error("Erro ao favoritar conversa:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao favoritar conversa" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    const { error: deleteError } = await supabaseAdmin
      .from("conversas_favoritas")
      .delete()
      .eq("usuario_id", usuario.id)
      .eq("conversa_id", id);

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Conversa removida dos favoritos",
    });
  } catch (error) {
    console.error("Erro ao desfavoritar conversa:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao desfavoritar conversa" },
      { status: 500 }
    );
  }
}