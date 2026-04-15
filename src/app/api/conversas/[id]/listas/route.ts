import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

type ConversaBase = {
  id: string;
  empresa_id: string;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  if (!conversa || conversa.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Conversa não encontrada" },
      { status: 404 }
    );
  }

  const { data: listas, error: listasError } = await supabaseAdmin
    .from("conversas_listas")
    .select("id, nome")
    .eq("empresa_id", usuario.empresa_id)
    .order("nome", { ascending: true });

  if (listasError) {
    return NextResponse.json(
      { ok: false, error: listasError.message },
      { status: 500 }
    );
  }

  const { data: itens, error: itensError } = await supabaseAdmin
    .from("conversas_listas_itens")
    .select("lista_id")
    .eq("empresa_id", usuario.empresa_id)
    .eq("conversa_id", id);

  if (itensError) {
    return NextResponse.json(
      { ok: false, error: itensError.message },
      { status: 500 }
    );
  }

  const listasMarcadas = new Set((itens ?? []).map((item) => item.lista_id));

  const resultadoListas = (listas ?? []).map((lista) => ({
    ...lista,
    marcada: listasMarcadas.has(lista.id),
  }));

  return NextResponse.json({
    ok: true,
    listas: resultadoListas,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const body = await request.json();
  const lista_id = body?.lista_id;

  if (!lista_id) {
    return NextResponse.json(
      { ok: false, error: "lista_id é obrigatório" },
      { status: 400 }
    );
  }

  const { data: conversa } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id")
    .eq("id", id)
    .maybeSingle<ConversaBase>();

  if (!conversa || conversa.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Conversa não encontrada" },
      { status: 404 }
    );
  }

  const { data: lista } = await supabaseAdmin
    .from("conversas_listas")
    .select("id, empresa_id")
    .eq("id", lista_id)
    .maybeSingle();

  if (!lista || lista.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Lista não encontrada" },
      { status: 404 }
    );
  }

  const { error } = await supabaseAdmin
    .from("conversas_listas_itens")
    .upsert(
      {
        empresa_id: usuario.empresa_id,
        lista_id,
        conversa_id: id,
        criado_por: usuario.id,
      },
      { onConflict: "lista_id,conversa_id" }
    );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Conversa adicionada à lista com sucesso",
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;
  const body = await request.json();
  const lista_id = body?.lista_id;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  if (!lista_id) {
    return NextResponse.json(
      { ok: false, error: "lista_id é obrigatório" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("conversas_listas_itens")
    .delete()
    .eq("empresa_id", usuario.empresa_id)
    .eq("conversa_id", id)
    .eq("lista_id", lista_id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Conversa removida da lista com sucesso",
  });
}