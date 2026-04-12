import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

function podeGerenciarEmpresas(usuario: UsuarioContexto) {
  const nomesPerfis = (usuario.perfis_dinamicos ?? []).map((perfil) => perfil.nome);
  return nomesPerfis.includes("Administrador");
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

  if (!podeGerenciarEmpresas(usuario)) {
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