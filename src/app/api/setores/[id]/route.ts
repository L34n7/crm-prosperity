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

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

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
      { ok: false, error: "Sem permissão para editar setor" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const nome = body?.nome?.trim();
  const descricao = body?.descricao?.trim() || null;
  const status = body?.status;

  if (!nome) {
    return NextResponse.json(
      { ok: false, error: "Nome do setor é obrigatório" },
      { status: 400 }
    );
  }

  if (!["ativo", "inativo"].includes(status)) {
    return NextResponse.json(
      { ok: false, error: "Status inválido" },
      { status: 400 }
    );
  }

  const { data: setorAtual, error: setorError } = await supabase
    .from("setores")
    .select("id, empresa_id")
    .eq("id", id)
    .maybeSingle();

  if (setorError) {
    return NextResponse.json(
      { ok: false, error: setorError.message },
      { status: 500 }
    );
  }

  if (!setorAtual) {
    return NextResponse.json(
      { ok: false, error: "Setor não encontrado" },
      { status: 404 }
    );
  }

  if (
    usuario.perfil !== "super_admin" &&
    setorAtual.empresa_id !== usuario.empresa_id
  ) {
    return NextResponse.json(
      { ok: false, error: "Você não pode editar este setor" },
      { status: 403 }
    );
  }

  const { data: setorComMesmoNome } = await supabase
    .from("setores")
    .select("id")
    .eq("empresa_id", setorAtual.empresa_id)
    .ilike("nome", nome)
    .neq("id", id)
    .maybeSingle();

  if (setorComMesmoNome) {
    return NextResponse.json(
      { ok: false, error: "Já existe outro setor com esse nome" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("setores")
    .update({
      nome,
      descricao,
      status,
    })
    .eq("id", id)
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
    message: "Setor atualizado com sucesso",
    setor: data,
  });
}