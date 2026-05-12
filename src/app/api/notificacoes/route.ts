import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

export async function GET() {
  try {
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

    const { data, error } = await supabaseAdmin
      .from("notificacoes")
      .select("id,titulo,mensagem,lida,conversa_id,created_at,metadata_json")
      .eq("empresa_id", usuario.empresa_id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const naoLidas = (data || []).filter((n) => !n.lida).length;

    return NextResponse.json({
      ok: true,
      notificacoes: data || [],
      nao_lidas: naoLidas,
    });
  } catch (error) {
    console.error("Erro ao buscar notificações:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao buscar notificações." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
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

    const body = await request.json();
    const id = String(body.id || "");

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID obrigatório." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("notificacoes")
      .update({
        lida: true,
        read_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao atualizar notificação:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao atualizar notificação." },
      { status: 500 }
    );
  }
}