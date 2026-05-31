import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { upsertConfiguracaoUsuario } from "@/lib/configuracoes/configuracoes-usuario";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { empresaManteraAdminGerenciador } from "@/lib/permissoes/garantir-admin-gerenciador";

const supabaseAdmin = getSupabaseAdmin();

type PermissaoUsuarioInput = {
  permissao_codigo: string;
  efeito: "permitir" | "bloquear";
};

type CatalogoPermissaoRow = {
  codigo: string;
};

function isPermissaoUsuarioInput(
  item: unknown
): item is PermissaoUsuarioInput {
  if (!item || typeof item !== "object") return false;

  const valor = item as Record<string, unknown>;

  return (
    typeof valor.permissao_codigo === "string" &&
    (valor.efeito === "permitir" || valor.efeito === "bloquear")
  );
}

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
        { ok: false, error: "Apenas administradores podem alterar exceções" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const { data: usuarioAlvo, error: usuarioAlvoError } = await supabaseAdmin
      .from("usuarios")
      .select("id, empresa_id, nome, email")
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

    if (usuarioAlvo.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Você não pode alterar usuários de outra empresa" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const auditMeta = getRequestAuditMetadata(request);

    const { data: configAntes } = await supabaseAdmin
      .from("configuracoes_usuario")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .eq("usuario_id", id)
      .maybeSingle();

    const { data: permissoesAntesRaw } = await supabaseAdmin
      .from("usuario_permissoes")
      .select("permissao_codigo, efeito")
      .eq("empresa_id", usuario.empresa_id)
      .eq("usuario_id", id);
    const permissoesUsuario: unknown[] = Array.isArray(body?.permissoes_usuario)
      ? body.permissoes_usuario
      : [];

    const overridesValidos = Array.from(
      new Map(
        permissoesUsuario
          .filter(isPermissaoUsuarioInput)
          .map(
            (item): [string, PermissaoUsuarioInput] => [
              item.permissao_codigo.trim(),
              {
                permissao_codigo: item.permissao_codigo.trim(),
                efeito: item.efeito,
              },
            ]
          )
          .filter(([codigo]) => Boolean(codigo))
      ).values()
    ) as PermissaoUsuarioInput[];

    if (overridesValidos.length > 0) {
      const { data: catalogoPermissoes, error: catalogoError } =
        await supabaseAdmin.from("permissoes").select("codigo");

      if (catalogoError) {
        return NextResponse.json(
          { ok: false, error: catalogoError.message },
          { status: 500 }
        );
      }

      const codigosValidos = new Set(
        ((catalogoPermissoes || []) as CatalogoPermissaoRow[]).map(
          (item) => item.codigo
        )
      );

      const contemCodigoInvalido = overridesValidos.some(
        (item) => !codigosValidos.has(item.permissao_codigo)
      );

      if (contemCodigoInvalido) {
        return NextResponse.json(
          { ok: false, error: "Uma ou mais permissoes individuais sao invalidas" },
          { status: 400 }
        );
      }
    }

    const manteraAdminGerenciador = await empresaManteraAdminGerenciador({
      empresaId: usuario.empresa_id,
      usuarioAlterado: {
        usuarioId: id,
        permissoes: overridesValidos,
      },
    });

    if (!manteraAdminGerenciador) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A empresa precisa manter ao menos um administrador ativo capaz de gerenciar permissoes.",
        },
        { status: 400 }
      );
    }

    const data = await upsertConfiguracaoUsuario({
      empresa_id: usuario.empresa_id,
      usuario_id: id,
      pode_transferir:
        typeof body.pode_transferir === "boolean" ? body.pode_transferir : null,
      pode_atribuir:
        typeof body.pode_atribuir === "boolean" ? body.pode_atribuir : null,
      pode_reatribuir:
        typeof body.pode_reatribuir === "boolean" ? body.pode_reatribuir : null,
      pode_assumir:
        typeof body.pode_assumir === "boolean" ? body.pode_assumir : null,
      permitir_transferir_sem_assumir:
        typeof body.permitir_transferir_sem_assumir === "boolean"
          ? body.permitir_transferir_sem_assumir
          : null,
      permitir_assumir_conversa_em_fila:
        typeof body.permitir_assumir_conversa_em_fila === "boolean"
          ? body.permitir_assumir_conversa_em_fila
          : null,
      permitir_assumir_conversa_sem_responsavel:
        typeof body.permitir_assumir_conversa_sem_responsavel === "boolean"
          ? body.permitir_assumir_conversa_sem_responsavel
          : null,
      permitir_assumir_conversa_ja_atribuida:
        typeof body.permitir_assumir_conversa_ja_atribuida === "boolean"
          ? body.permitir_assumir_conversa_ja_atribuida
          : null,
      exigir_mesmo_setor_para_reatribuicao:
        typeof body.exigir_mesmo_setor_para_reatribuicao === "boolean"
          ? body.exigir_mesmo_setor_para_reatribuicao
          : null,
    });

    const { error: deletePermissoesError } = await supabaseAdmin
      .from("usuario_permissoes")
      .delete()
      .eq("empresa_id", usuario.empresa_id)
      .eq("usuario_id", id);

    if (deletePermissoesError) {
      return NextResponse.json(
        { ok: false, error: deletePermissoesError.message },
        { status: 500 }
      );
    }

    if (overridesValidos.length > 0) {
      const payload = overridesValidos.map((item) => ({
        empresa_id: usuario.empresa_id,
        usuario_id: id,
        permissao_codigo: item.permissao_codigo,
        efeito: item.efeito,
      }));

      const { error: insertPermissoesError } = await supabaseAdmin
        .from("usuario_permissoes")
        .insert(payload);

      if (insertPermissoesError) {
        return NextResponse.json(
          { ok: false, error: insertPermissoesError.message },
          { status: 500 }
        );
      }
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "permissoes",
      entidade: "usuario",
      entidade_id: id,
      acao: "excecoes_usuario_atualizadas",
      descricao: `Exceções e permissões individuais de ${
        usuarioAlvo.nome || usuarioAlvo.email || id
      } atualizadas`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: {
        politica: configAntes,
        permissoes_usuario: permissoesAntesRaw || [],
      },
      depois: {
        politica: data,
        permissoes_usuario: overridesValidos,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Exceções do usuário salvas com sucesso",
      configuracao_usuario: data,
    });
  } catch (error) {
    console.error("Erro ao salvar exceções do usuário:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao salvar exceções do usuário" },
      { status: 500 }
    );
  }
}
