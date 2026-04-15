import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

type MensagemBase = {
  id: string;
  conversa_id: string;
  conversas?: {
    empresa_id: string;
  } | null;
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

    const { data: mensagem, error: mensagemError } = await supabaseAdmin
      .from("mensagens")
      .select(`
        id,
        conversa_id,
        conversas (
          empresa_id
        )
      `)
      .eq("id", id)
      .maybeSingle<MensagemBase>();

    if (mensagemError) {
      return NextResponse.json(
        { ok: false, error: mensagemError.message },
        { status: 500 }
      );
    }

    if (!mensagem) {
      return NextResponse.json(
        { ok: false, error: "Mensagem não encontrada" },
        { status: 404 }
      );
    }

    const empresaIdMensagem = mensagem.conversas?.empresa_id;

    if (!empresaIdMensagem || empresaIdMensagem !== usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Você não pode favoritar esta mensagem" },
        { status: 403 }
      );
    }

    const { error: insertError } = await supabaseAdmin
      .from("mensagens_favoritas")
      .upsert(
        {
          empresa_id: usuario.empresa_id,
          mensagem_id: mensagem.id,
          criado_por: usuario.id,
        },
        { onConflict: "mensagem_id" }
      );

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Mensagem adicionada aos favoritos",
    });
  } catch (error) {
    console.error("Erro ao favoritar mensagem:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao favoritar mensagem" },
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

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("mensagens_favoritas")
      .delete()
      .eq("mensagem_id", id)
      .eq("empresa_id", usuario.empresa_id);

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Mensagem removida dos favoritos",
    });
  } catch (error) {
    console.error("Erro ao desfavoritar mensagem:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao desfavoritar mensagem" },
      { status: 500 }
    );
  }
}