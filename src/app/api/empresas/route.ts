import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/can";

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

  const podeVisualizarEmpresas = await can(usuario.id, "empresas.visualizar");

  if (!podeVisualizarEmpresas) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para listar empresas" },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("empresas")
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
      plano_id,
      planos (
        id,
        nome,
        slug
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    empresas: data ?? [],
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

  const podeCriarEmpresa = await can(usuario.id, "empresas.criar");

  if (!podeCriarEmpresa) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para criar empresa" },
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

  const { data: plano } = await supabaseAdmin
    .from("planos")
    .select("id")
    .eq("id", plano_id)
    .maybeSingle();

  if (!plano) {
    return NextResponse.json(
      { ok: false, error: "Plano não encontrado" },
      { status: 404 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("empresas")
    .insert([
      {
        plano_id,
        nome_fantasia,
        razao_social,
        documento,
        email,
        telefone,
        nome_responsavel,
        status: "ativa",
        timezone,
        logo_url,
        observacoes,
      },
    ])
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
    message: "Empresa criada com sucesso",
    empresa: data,
  });
}