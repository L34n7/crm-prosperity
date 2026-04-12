import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { registrarLogAuditoria } from "@/lib/auditoria/logs";

const supabaseAdmin = getSupabaseAdmin();

type PerfilPayload = {
  nome?: string;
  descricao?: string | null;
  ativo?: boolean;
};

export async function GET() {
  try {
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

    const { data: perfis, error } = await supabaseAdmin
      .from("perfis_empresa")
      .select(`
        id,
        nome,
        descricao,
        ativo,
        created_at,
        updated_at,
        created_by,
        updated_by,
        usuarios_perfis (
          id
        ),
        criado_por:usuarios!perfis_empresa_created_by_fkey (
          id,
          nome
        ),
        atualizado_por:usuarios!perfis_empresa_updated_by_fkey (
          id,
          nome
        )
      `)
      .eq("empresa_id", usuario.empresa_id)
      .order("nome", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const perfisFormatados = (perfis || []).map((perfil: any) => ({
      id: perfil.id,
      nome: perfil.nome,
      descricao: perfil.descricao,
      ativo: perfil.ativo,
      created_at: perfil.created_at,
      updated_at: perfil.updated_at,
      created_by: perfil.created_by,
      updated_by: perfil.updated_by,
      criado_por: Array.isArray(perfil.criado_por)
        ? perfil.criado_por[0] || null
        : perfil.criado_por || null,
      atualizado_por: Array.isArray(perfil.atualizado_por)
        ? perfil.atualizado_por[0] || null
        : perfil.atualizado_por || null,
      total_usuarios: Array.isArray(perfil.usuarios_perfis)
        ? perfil.usuarios_perfis.length
        : 0,
    }));

    return NextResponse.json({
      ok: true,
      perfis: perfisFormatados,
    });
  } catch (error) {
    console.error("Erro ao listar perfis:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao listar perfis" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!isAdministrador(usuario)) {
      return NextResponse.json(
        { ok: false, error: "Apenas administradores podem criar perfis" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as PerfilPayload;

    const nome = body?.nome?.trim();
    const descricao = body?.descricao?.trim() || null;
    const ativo = body?.ativo ?? true;

    if (!nome) {
      return NextResponse.json(
        { ok: false, error: "Nome do perfil é obrigatório" },
        { status: 400 }
      );
    }

    const { data: existente } = await supabaseAdmin
      .from("perfis_empresa")
      .select("id")
      .eq("empresa_id", usuario.empresa_id)
      .ilike("nome", nome)
      .maybeSingle();

    if (existente) {
      return NextResponse.json(
        { ok: false, error: "Já existe um perfil com esse nome" },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("perfis_empresa")
      .insert([
        {
          empresa_id: usuario.empresa_id,
          nome,
          descricao,
          ativo,
          created_by: usuario.id,
          updated_by: usuario.id,
        },
      ])
      .select(`
        id,
        nome,
        descricao,
        ativo,
        created_at,
        updated_at,
        created_by,
        updated_by
      `)
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    
    await registrarLogAuditoria({
      empresa_id: usuario.empresa_id,
      entidade: "perfil",
      entidade_id: data.id,
      acao: "criado",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      detalhes: {
        nome: data.nome,
        descricao: data.descricao,
        ativo: data.ativo,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Perfil criado com sucesso",
      perfil: {
        ...data,
        total_usuarios: 0,
      },
    });
  } catch (error) {
    console.error("Erro ao criar perfil:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao criar perfil" },
      { status: 500 }
    );
  }
}