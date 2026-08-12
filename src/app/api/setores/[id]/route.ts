import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import {
  registrarLogAuditoria,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

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

    if (!can(usuario.permissoes, "setores.editar")) {
      return NextResponse.json(
        { ok: false, error: "Sem permissao para editar setores" },
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
      .select("id, empresa_id, ativo, archived_at")
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

    if (
      setorAtual.ativo !== ativo &&
      !can(usuario.permissoes, "setores.alterar_status")
    ) {
      return NextResponse.json(
        { ok: false, error: "Sem permissao para alterar status de setores" },
        { status: 403 }
      );
    }

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
        status: ativo ? "ativo" : "inativo",
        ativo,
        archived_at:
          setorAtual.ativo !== ativo
            ? ativo
              ? null
              : new Date().toISOString()
            : setorAtual.archived_at,
        updated_at: new Date().toISOString(),
        updated_by: usuario.id,
      })
      .eq("id", id)
      .select(
        `
        id,
        nome,
        descricao,
        ativo,
        archived_at,
        created_at,
        updated_at,
        created_by,
        updated_by
      `
      )
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

const errosExclusaoSetor: Record<string, { status: number; mensagem: string }> =
  {
    SETOR_NAO_ENCONTRADO: {
      status: 404,
      mensagem: "Setor não encontrado.",
    },
    SETOR_NAO_ARQUIVADO: {
      status: 409,
      mensagem: "Arquive o setor antes de excluí-lo definitivamente.",
    },
    SETOR_COM_USUARIOS: {
      status: 409,
      mensagem:
        "Este setor possui usuários vinculados e não pode ser excluído.",
    },
    SETOR_COM_HISTORICO_CONVERSAS: {
      status: 409,
      mensagem:
        "Este setor possui conversas ou protocolos no histórico e não pode ser excluído.",
    },
    SETOR_EM_USO_AUTOMACAO: {
      status: 409,
      mensagem:
        "Este setor está sendo usado em uma automação. Remova a referência antes de excluí-lo.",
    },
  };

export async function DELETE(
  _request: Request,
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

    if (!can(usuario.permissoes, "setores.remover")) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para excluir setores" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      "excluir_setor_definitivamente",
      {
        p_empresa_id: usuario.empresa_id,
        p_setor_id: id,
      }
    );

    if (error) {
      const erroConhecido = Object.entries(errosExclusaoSetor).find(
        ([codigo]) => error.message.includes(codigo)
      )?.[1];

      return NextResponse.json(
        {
          ok: false,
          error:
            erroConhecido?.mensagem ||
            "Não foi possível excluir o setor definitivamente.",
        },
        { status: erroConhecido?.status || 500 }
      );
    }

    const setorExcluido = data as {
      id: string;
      nome: string;
      descricao?: string | null;
      archived_at?: string | null;
    };

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      entidade: "setor",
      entidade_id: id,
      acao: "excluido_definitivamente",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      detalhes: { setor: setorExcluido },
    });

    return NextResponse.json({
      ok: true,
      message: "Setor excluído definitivamente.",
    });
  } catch (error) {
    console.error("Erro ao excluir setor:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao excluir setor" },
      { status: 500 }
    );
  }
}
