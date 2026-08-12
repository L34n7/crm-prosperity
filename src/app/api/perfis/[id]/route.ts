import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import {
  registrarLogAuditoria,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

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

    if (!can(usuario.permissoes, "perfis.editar")) {
      return NextResponse.json(
        { ok: false, error: "Sem permissao para editar perfis" },
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
      .select("id, empresa_id, ativo, archived_at")
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

    if (
      perfilAtual.ativo !== ativo &&
      !can(usuario.permissoes, "perfis.alterar_status")
    ) {
      return NextResponse.json(
        { ok: false, error: "Sem permissao para alterar status de perfis" },
        { status: 403 }
      );
    }

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
        archived_at:
          perfilAtual.ativo !== ativo
            ? ativo
              ? null
              : new Date().toISOString()
            : perfilAtual.archived_at,
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

const errosExclusaoPerfil: Record<
  string,
  { status: number; mensagem: string }
> = {
  PERFIL_NAO_ENCONTRADO: {
    status: 404,
    mensagem: "Perfil não encontrado.",
  },
  PERFIL_NAO_ARQUIVADO: {
    status: 409,
    mensagem: "Arquive o perfil antes de excluí-lo definitivamente.",
  },
  PERFIL_COM_USUARIOS: {
    status: 409,
    mensagem: "Este perfil possui usuários vinculados e não pode ser excluído.",
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

    if (!can(usuario.permissoes, "perfis.remover")) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para excluir perfis" },
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
      "excluir_perfil_empresa_definitivamente",
      {
        p_empresa_id: usuario.empresa_id,
        p_perfil_id: id,
      }
    );

    if (error) {
      const erroConhecido = Object.entries(errosExclusaoPerfil).find(
        ([codigo]) => error.message.includes(codigo)
      )?.[1];

      return NextResponse.json(
        {
          ok: false,
          error:
            erroConhecido?.mensagem ||
            "Não foi possível excluir o perfil definitivamente.",
        },
        { status: erroConhecido?.status || 500 }
      );
    }

    const perfilExcluido = data as {
      id: string;
      nome: string;
      descricao?: string | null;
      archived_at?: string | null;
    };

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      entidade: "perfil",
      entidade_id: id,
      acao: "excluido_definitivamente",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      detalhes: { perfil: perfilExcluido },
    });

    return NextResponse.json({
      ok: true,
      message: "Perfil excluído definitivamente.",
    });
  } catch (error) {
    console.error("Erro ao excluir perfil:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao excluir perfil" },
      { status: 500 }
    );
  }
}
