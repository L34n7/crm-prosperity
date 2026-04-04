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
    return { error: "Erro ao buscar usuário do sistema", status: 500 as const };
  }

  if (!usuario) {
    return { error: "Usuário não encontrado na tabela usuarios", status: 404 as const };
  }

  if (usuario.status !== "ativo") {
    return { error: "Usuário inativo ou bloqueado", status: 403 as const };
  }

  return { usuario };
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

  if (usuario.perfil !== "super_admin") {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para editar empresa" },
      { status: 403 }
    );
  }

  const body = await request.json();

  const nome_fantasia = body?.nome_fantasia?.trim();
  const razao_social = body?.razao_social?.trim() || null;
  const documento = body?.documento?.trim() || null;
  const email = body?.email?.trim()?.toLowerCase();
  const telefone = body?.telefone?.trim() || null;
  const nome_responsavel = body?.nome_responsavel?.trim() || null;
  const plano_id = body?.plano_id || null;
  const timezone = body?.timezone?.trim() || "America/Sao_Paulo";
  const logo_url = body?.logo_url?.trim() || null;
  const observacoes = body?.observacoes?.trim() || null;
  const status = body?.status;

  if (!nome_fantasia) {
    return NextResponse.json(
      { ok: false, error: "Nome fantasia é obrigatório" },
      { status: 400 }
    );
  }

  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Email é obrigatório" },
      { status: 400 }
    );
  }

  if (!plano_id) {
    return NextResponse.json(
      { ok: false, error: "Plano é obrigatório" },
      { status: 400 }
    );
  }

  if (!["ativa", "inativa", "suspensa", "cancelada"].includes(status)) {
    return NextResponse.json(
      { ok: false, error: "Status inválido" },
      { status: 400 }
    );
  }

  const { data: empresaAtual } = await supabaseAdmin
    .from("empresas")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!empresaAtual) {
    return NextResponse.json(
      { ok: false, error: "Empresa não encontrada" },
      { status: 404 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("empresas")
    .update({
      nome_fantasia,
      razao_social,
      documento,
      email,
      telefone,
      nome_responsavel,
      plano_id,
      timezone,
      logo_url,
      observacoes,
      status,
    })
    .eq("id", id)
    .select(`
      id,
      nome_fantasia,
      razao_social,
      documento,
      email,
      telefone,
      nome_responsavel,
      status,
      timezone,
      logo_url,
      observacoes,
      created_at,
      updated_at,
      plano_id
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
    message: "Empresa atualizada com sucesso",
    empresa: data,
  });
}