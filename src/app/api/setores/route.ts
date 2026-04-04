import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getUsuarioLogado() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { supabase, error: "Não autenticado", status: 401 as const };
  }

  const { data: usuario, error: usuarioError } = await supabase
    .from("usuarios")
    .select("id, empresa_id, perfil, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (usuarioError) {
    return {
      supabase,
      error: "Erro ao buscar usuário do sistema",
      status: 500 as const,
    };
  }

  if (!usuario) {
    return {
      supabase,
      error: "Usuário não encontrado na tabela usuarios",
      status: 404 as const,
    };
  }

  if (usuario.status !== "ativo") {
    return {
      supabase,
      error: "Usuário inativo ou bloqueado",
      status: 403 as const,
    };
  }

  return { supabase, usuario };
}

export async function GET() {
  const resultado = await getUsuarioLogado();

  if ("error" in resultado) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { supabase, usuario } = resultado;

  let query = supabase
    .from("setores")
    .select("*")
    .order("ordem_exibicao", { ascending: true })
    .order("created_at", { ascending: true });

  if (usuario.perfil !== "super_admin") {
    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    query = query.eq("empresa_id", usuario.empresa_id);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    setores: data ?? [],
  });
}

export async function POST(request: Request) {
  const resultado = await getUsuarioLogado();

  if ("error" in resultado) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { supabase, usuario } = resultado;

  if (!["super_admin", "admin_empresa"].includes(usuario.perfil)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para criar setor" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const nome = body?.nome?.trim();
  const descricao = body?.descricao?.trim() || null;

  if (!nome) {
    return NextResponse.json(
      { ok: false, error: "Nome do setor é obrigatório" },
      { status: 400 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const { data: setorExistente } = await supabase
    .from("setores")
    .select("id")
    .eq("empresa_id", usuario.empresa_id)
    .ilike("nome", nome)
    .maybeSingle();

  if (setorExistente) {
    return NextResponse.json(
      { ok: false, error: "Já existe um setor com esse nome" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("setores")
    .insert([
      {
        empresa_id: usuario.empresa_id,
        nome,
        descricao,
        status: "ativo",
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Setor criado com sucesso",
    setor: data,
  });
}