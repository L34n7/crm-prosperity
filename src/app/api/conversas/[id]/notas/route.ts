import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

type ConversaBase = {
  id: string;
  empresa_id: string;
};

type NotaBase = {
  id: string;
  empresa_id: string;
  conversa_id: string;
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

  const { data, error } = await supabaseAdmin
    .from("conversas_notas")
    .select(`
      id,
      empresa_id,
      conversa_id,
      autor_id,
      conteudo,
      created_at,
      updated_at,
      autor:usuarios (
        id,
        nome,
        email
      )
    `)
    .eq("empresa_id", usuario.empresa_id)
    .eq("conversa_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    notas: data ?? [],
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
  const conteudo = body?.conteudo?.trim();

  if (!conteudo) {
    return NextResponse.json(
      { ok: false, error: "Conteúdo da nota é obrigatório" },
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

  const { data, error } = await supabaseAdmin
    .from("conversas_notas")
    .insert({
      empresa_id: usuario.empresa_id,
      conversa_id: id,
      autor_id: usuario.id,
      conteudo,
    })
    .select(`
      id,
      empresa_id,
      conversa_id,
      autor_id,
      conteudo,
      created_at,
      updated_at,
      autor:usuarios (
        id,
        nome,
        email
      )
    `)
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Nota criada com sucesso",
    nota: data,
  });
}

export async function PUT(
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
  const notaId = body?.nota_id;
  const conteudo = body?.conteudo?.trim();

  if (!notaId) {
    return NextResponse.json(
      { ok: false, error: "nota_id é obrigatório" },
      { status: 400 }
    );
  }

  if (!conteudo) {
    return NextResponse.json(
      { ok: false, error: "Conteúdo da nota é obrigatório" },
      { status: 400 }
    );
  }

  const { data: nota, error: notaError } = await supabaseAdmin
    .from("conversas_notas")
    .select("id, empresa_id, conversa_id")
    .eq("id", notaId)
    .eq("conversa_id", id)
    .maybeSingle<NotaBase>();

  if (notaError) {
    return NextResponse.json(
      { ok: false, error: notaError.message },
      { status: 500 }
    );
  }

  if (!nota || nota.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Nota não encontrada" },
      { status: 404 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("conversas_notas")
    .update({
      conteudo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", notaId)
    .eq("empresa_id", usuario.empresa_id)
    .select(`
      id,
      empresa_id,
      conversa_id,
      autor_id,
      conteudo,
      created_at,
      updated_at,
      autor:usuarios (
        id,
        nome,
        email
      )
    `)
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Nota atualizada com sucesso",
    nota: data,
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

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const notaId = body?.nota_id;

  if (!notaId) {
    return NextResponse.json(
      { ok: false, error: "nota_id é obrigatório" },
      { status: 400 }
    );
  }

  const { data: nota, error: notaError } = await supabaseAdmin
    .from("conversas_notas")
    .select("id, empresa_id, conversa_id")
    .eq("id", notaId)
    .eq("conversa_id", id)
    .maybeSingle<NotaBase>();

  if (notaError) {
    return NextResponse.json(
      { ok: false, error: notaError.message },
      { status: 500 }
    );
  }

  if (!nota || nota.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Nota não encontrada" },
      { status: 404 }
    );
  }

  const { error } = await supabaseAdmin
    .from("conversas_notas")
    .delete()
    .eq("id", notaId)
    .eq("empresa_id", usuario.empresa_id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Nota excluída com sucesso",
  });
}