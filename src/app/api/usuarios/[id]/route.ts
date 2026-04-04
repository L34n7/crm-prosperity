import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

type UsuarioSistema = {
  id: string;
  empresa_id: string | null;
  perfil: "super_admin" | "admin_empresa" | "supervisor" | "atendente";
  status: "ativo" | "inativo" | "bloqueado";
};

async function getUsuarioLogado() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Não autenticado", status: 401 as const };
  }

  const { data: usuario, error: usuarioError } = await supabase
    .from("usuarios")
    .select("id, empresa_id, perfil, status")
    .eq("auth_user_id", user.id)
    .maybeSingle<UsuarioSistema>();

  if (usuarioError) {
    return {
      error: "Erro ao buscar usuário do sistema",
      status: 500 as const,
    };
  }

  if (!usuario) {
    return {
      error: "Usuário não encontrado na tabela usuarios",
      status: 404 as const,
    };
  }

  if (usuario.status !== "ativo") {
    return {
      error: "Usuário inativo ou bloqueado",
      status: 403 as const,
    };
  }

  return { usuario };
}

function podeGerenciarUsuarios(perfil: UsuarioSistema["perfil"]) {
  return perfil === "super_admin" || perfil === "admin_empresa";
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

  const { usuario } = resultado;

  if (!podeGerenciarUsuarios(usuario.perfil)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para editar usuários" },
      { status: 403 }
    );
  }

  const { data: usuarioAlvo, error: usuarioAlvoError } = await supabaseAdmin
    .from("usuarios")
    .select("id, empresa_id, perfil, auth_user_id")
    .eq("id", id)
    .maybeSingle();

  if (usuarioAlvoError) {
    return NextResponse.json(
      { ok: false, error: usuarioAlvoError.message },
      { status: 500 }
    );
  }

  if (!usuarioAlvo) {
    return NextResponse.json(
      { ok: false, error: "Usuário não encontrado" },
      { status: 404 }
    );
  }

  const body = await request.json();

  const nome = body?.nome?.trim();
  const perfil = body?.perfil;
  const nivel = body?.nivel || null;
  const setor_id = body?.setor_id || null;
  const telefone = body?.telefone?.trim() || null;
  const status = body?.status;

  const empresa_id =
    usuario.perfil === "super_admin"
      ? body?.empresa_id || null
      : usuarioAlvo.empresa_id;

  if (!nome) {
    return NextResponse.json(
      { ok: false, error: "Nome é obrigatório" },
      { status: 400 }
    );
  }

  if (
    !["admin_empresa", "supervisor", "atendente", "super_admin"].includes(perfil)
  ) {
    return NextResponse.json(
      { ok: false, error: "Perfil inválido" },
      { status: 400 }
    );
  }

  if (nivel && !["basico", "avancado"].includes(nivel)) {
    return NextResponse.json(
      { ok: false, error: "Nível inválido" },
      { status: 400 }
    );
  }

  if (!["ativo", "inativo", "bloqueado"].includes(status)) {
    return NextResponse.json(
      { ok: false, error: "Status inválido" },
      { status: 400 }
    );
  }

  if (
    usuario.perfil !== "super_admin" &&
    usuarioAlvo.empresa_id !== usuario.empresa_id
  ) {
    return NextResponse.json(
      { ok: false, error: "Você não pode editar este usuário" },
      { status: 403 }
    );
  }

  if (usuario.perfil === "admin_empresa" && perfil === "admin_empresa") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Admin da empresa não pode promover usuário para admin da empresa nesta versão",
      },
      { status: 403 }
    );
  }

  if (!empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Empresa é obrigatória" },
      { status: 400 }
    );
  }

  const { data: empresa } = await supabaseAdmin
    .from("empresas")
    .select("id")
    .eq("id", empresa_id)
    .maybeSingle();

  if (!empresa) {
    return NextResponse.json(
      { ok: false, error: "Empresa não encontrada" },
      { status: 404 }
    );
  }

  if (setor_id) {
    const { data: setor } = await supabaseAdmin
      .from("setores")
      .select("id, empresa_id")
      .eq("id", setor_id)
      .maybeSingle();

    if (!setor) {
      return NextResponse.json(
        { ok: false, error: "Setor não encontrado" },
        { status: 404 }
      );
    }

    if (setor.empresa_id !== empresa_id) {
      return NextResponse.json(
        { ok: false, error: "O setor não pertence à empresa selecionada" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from("usuarios")
    .update({
      nome,
      perfil,
      nivel,
      setor_id,
      telefone,
      status,
      empresa_id,
    })
    .eq("id", id)
    .select(`
      id,
      auth_user_id,
      nome,
      email,
      perfil,
      nivel,
      status,
      telefone,
      empresa_id,
      setor_id
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
    message: "Usuário atualizado com sucesso",
    usuario: data,
  });
}