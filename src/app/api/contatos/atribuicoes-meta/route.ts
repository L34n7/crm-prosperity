import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
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
      { ok: false, error: "Usuario sem empresa vinculada." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const contatoId = searchParams.get("contato_id")?.trim() || "";
  const conversaId = searchParams.get("conversa_id")?.trim() || "";
  const limite = Math.max(
    1,
    Math.min(200, Number(searchParams.get("limite") || "50"))
  );

  let query = getSupabaseAdmin()
    .from("contato_atribuicoes_meta")
    .select(
      `
        *,
        contatos (
          id,
          nome,
          telefone
        ),
        conversas (
          id
        ),
        integracoes_whatsapp (
          id,
          nome_conexao,
          numero
        ),
        rastreamento_origens (
          id,
          nome
        ),
        rastreamento_campanhas (
          id,
          nome
        )
      `
    )
    .eq("empresa_id", usuario.empresa_id)
    .order("created_at", { ascending: false })
    .limit(limite);

  if (contatoId) {
    query = query.eq("contato_id", contatoId);
  }

  if (conversaId) {
    query = query.eq("conversa_id", conversaId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    atribuicoes: data || [],
  });
}
