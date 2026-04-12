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

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

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
        { ok: false, error: "Apenas administradores podem editar perfis" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const { data: perfilAtual, error: perfilAtualError } = await supabaseAdmin
      .from("perfis_empresa")
      .select("id, empresa_id")
      .eq("id", id)
      .maybeSingle();

    if (perfilAtualError) {
      return NextResponse.json(
        { ok: false, error: perfilAtualError.message },
        { status: 500 }
      );
    }

    if (!perfilAtual) {
      return NextResponse.json(
        { ok: false, error: "Perfil não encontrado" },
        { status: 404 }
      );
    }

    if (perfilAtual.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Você não pode editar este perfil" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as PerfilPayload;

    const nome = body?.nome?.trim();
    const descricao = body?.descricao?.trim() || null;
    const ativo = body?.ativo ?? true;

    const { data: perfilAntes, error: perfilAntesError } = await supabaseAdmin
      .from("perfis_empresa")
      .select("id, nome, descricao, ativo")
      .eq("id", id)
      .maybeSingle();

    if (perfilAntesError) {
      return NextResponse.json(
        { ok: false, error: perfilAntesError.message },
        { status: 500 }
      );
    }

    if (!nome) {
      return NextResponse.json(
        { ok: false, error: "Nome do perfil é obrigatório" },
        { status: 400 }
      );
    }

    const { data: duplicado } = await supabaseAdmin
      .from("perfis_empresa")
      .select("id")
      .eq("empresa_id", usuario.empresa_id)
      .ilike("nome", nome)
      .neq("id", id)
      .maybeSingle();

    if (duplicado) {
      return NextResponse.json(
        { ok: false, error: "Já existe outro perfil com esse nome" },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("perfis_empresa")
      .update({
        nome,
        descricao,
        ativo,
        updated_at: new Date().toISOString(),
        updated_by: usuario.id,
      })
      .eq("id", id)
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
      acao: "atualizado",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      detalhes: {
        antes: perfilAntes,
        depois: {
          nome: data.nome,
          descricao: data.descricao,
          ativo: data.ativo,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Perfil atualizado com sucesso",
      perfil: data,
    });
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao atualizar perfil" },
      { status: 500 }
    );
  }
}