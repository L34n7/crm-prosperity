import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

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

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("conversas_listas")
    .select("id, nome, created_at, updated_at")
    .eq("empresa_id", usuario.empresa_id)
    .order("nome", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    listas: data ?? [],
  });
}

export async function POST(request: Request) {
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
  const nome = body?.nome?.trim();

  if (!nome) {
    return NextResponse.json(
      { ok: false, error: "Nome da lista é obrigatório" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("conversas_listas")
    .insert({
      empresa_id: usuario.empresa_id,
      nome,
    })
    .select("id, nome, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Lista criada com sucesso",
    lista: data,
  });
}

export async function PUT(request: Request) {
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
  const listaId = body?.lista_id;
  const nome = body?.nome?.trim();

  if (!listaId) {
    return NextResponse.json(
      { ok: false, error: "lista_id é obrigatório" },
      { status: 400 }
    );
  }

  if (!nome) {
    return NextResponse.json(
      { ok: false, error: "Nome da lista é obrigatório" },
      { status: 400 }
    );
  }

  const { data: lista, error: listaError } = await supabaseAdmin
    .from("conversas_listas")
    .select("id, empresa_id")
    .eq("id", listaId)
    .maybeSingle();

  if (listaError) {
    return NextResponse.json(
      { ok: false, error: listaError.message },
      { status: 500 }
    );
  }

  if (!lista || lista.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Lista não encontrada" },
      { status: 404 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("conversas_listas")
    .update({
      nome,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listaId)
    .eq("empresa_id", usuario.empresa_id)
    .select("id, nome, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Lista atualizada com sucesso",
    lista: data,
  });
}

export async function DELETE(request: Request) {
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
  const listaId = body?.lista_id;

  if (!listaId) {
    return NextResponse.json(
      { ok: false, error: "lista_id é obrigatório" },
      { status: 400 }
    );
  }

  const { data: lista, error: listaError } = await supabaseAdmin
    .from("conversas_listas")
    .select("id, empresa_id")
    .eq("id", listaId)
    .maybeSingle();

  if (listaError) {
    return NextResponse.json(
      { ok: false, error: listaError.message },
      { status: 500 }
    );
  }

  if (!lista || lista.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Lista não encontrada" },
      { status: 404 }
    );
  }

  const { error } = await supabaseAdmin
    .from("conversas_listas")
    .delete()
    .eq("id", listaId)
    .eq("empresa_id", usuario.empresa_id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Lista excluída com sucesso",
  });
}