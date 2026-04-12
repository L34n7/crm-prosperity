import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { registrarLogAuditoria } from "@/lib/auditoria/logs";

const supabaseAdmin = getSupabaseAdmin();

type SetorPayload = {
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

    const { data: setores, error } = await supabaseAdmin
      .from("setores")
      .select(`
        id,
        nome,
        descricao,
        ativo,
        created_at,
        updated_at,
        created_by,
        updated_by,
        usuarios_setores (
          id
        ),
        criado_por:usuarios!setores_created_by_fkey (
          id,
          nome
        ),
        atualizado_por:usuarios!setores_updated_by_fkey (
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

    const setoresFormatados = (setores || []).map((setor: any) => ({
      id: setor.id,
      nome: setor.nome,
      descricao: setor.descricao,
      ativo: setor.ativo,
      created_at: setor.created_at,
      updated_at: setor.updated_at,
      created_by: setor.created_by,
      updated_by: setor.updated_by,
      criado_por: Array.isArray(setor.criado_por)
        ? setor.criado_por[0] || null
        : setor.criado_por || null,
      atualizado_por: Array.isArray(setor.atualizado_por)
        ? setor.atualizado_por[0] || null
        : setor.atualizado_por || null,
      total_usuarios: Array.isArray(setor.usuarios_setores)
        ? setor.usuarios_setores.length
        : 0,
    }));

    return NextResponse.json({
      ok: true,
      setores: setoresFormatados,
    });
  } catch (error) {
    console.error("Erro ao listar setores:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao listar setores" },
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
        { ok: false, error: "Apenas administradores podem criar setores" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as SetorPayload;

    const nome = body?.nome?.trim();
    const descricao = body?.descricao?.trim() || null;
    const ativo = body?.ativo ?? true;

    if (!nome) {
      return NextResponse.json(
        { ok: false, error: "Nome do setor é obrigatório" },
        { status: 400 }
      );
    }

    const { data: existente } = await supabaseAdmin
      .from("setores")
      .select("id")
      .eq("empresa_id", usuario.empresa_id)
      .ilike("nome", nome)
      .maybeSingle();

    if (existente) {
      return NextResponse.json(
        { ok: false, error: "Já existe um setor com esse nome" },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("setores")
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
      entidade: "setor",
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
      message: "Setor criado com sucesso",
      setor: {
        ...data,
        total_usuarios: 0,
      },
    });
  } catch (error) {
    console.error("Erro ao criar setor:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao criar setor" },
      { status: 500 }
    );
  }
}