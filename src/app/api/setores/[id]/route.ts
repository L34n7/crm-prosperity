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
        { ok: false, error: "Apenas administradores podem editar setores" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const { data: setorAtual, error: setorAtualError } = await supabaseAdmin
      .from("setores")
      .select("id, empresa_id")
      .eq("id", id)
      .maybeSingle();

    if (setorAtualError) {
      return NextResponse.json(
        { ok: false, error: setorAtualError.message },
        { status: 500 }
      );
    }

    if (!setorAtual) {
      return NextResponse.json(
        { ok: false, error: "Setor não encontrado" },
        { status: 404 }
      );
    }

    if (setorAtual.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Você não pode editar este setor" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as SetorPayload;

    const nome = body?.nome?.trim();
    const descricao = body?.descricao?.trim() || null;
    const ativo = body?.ativo ?? true;

    const { data: setorAntes, error: setorAntesError } = await supabaseAdmin
      .from("setores")
      .select("id, nome, descricao, ativo")
      .eq("id", id)
      .maybeSingle();

    if (setorAntesError) {
      return NextResponse.json(
        { ok: false, error: setorAntesError.message },
        { status: 500 }
      );
    }

    if (!nome) {
      return NextResponse.json(
        { ok: false, error: "Nome do setor é obrigatório" },
        { status: 400 }
      );
    }

    const { data: duplicado } = await supabaseAdmin
      .from("setores")
      .select("id")
      .eq("empresa_id", usuario.empresa_id)
      .ilike("nome", nome)
      .neq("id", id)
      .maybeSingle();

    if (duplicado) {
      return NextResponse.json(
        { ok: false, error: "Já existe outro setor com esse nome" },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("setores")
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
      entidade: "setor",
      entidade_id: data.id,
      acao: "atualizado",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      detalhes: {
        antes: setorAntes,
        depois: {
          nome: data.nome,
          descricao: data.descricao,
          ativo: data.ativo,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Setor atualizado com sucesso",
      setor: data,
    });
  } catch (error) {
    console.error("Erro ao atualizar setor:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao atualizar setor" },
      { status: 500 }
    );
  }
}