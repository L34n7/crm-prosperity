import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/permissoes/can";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";

const supabaseAdmin = getSupabaseAdmin();
const BUCKET_MIDIAS = "midias";

async function obterContextoExclusao() {
  const contexto = await getUsuarioContexto({
    sincronizarAssinatura: false,
    ignorarAcessoTemporario: true,
  });

  if (!contexto.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      ),
    };
  }

  const [podeAcessarEmpresas, podeEditarEmpresas] = await Promise.all([
    can(contexto.usuario.id, PERMISSAO_INTERNA_EMPRESAS),
    can(contexto.usuario.id, "empresas.editar"),
  ]);

  if (!podeAcessarEmpresas || !podeEditarEmpresas) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "Sem permissão para excluir empresas definitivamente.",
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    usuario: contexto.usuario,
  };
}

async function buscarEmpresa(id: string) {
  const { data, error } = await supabaseAdmin
    .from("empresas")
    .select(
      "id, nome_fantasia, email, status, assinatura_status, assinatura_vencimento_em"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar empresa: ${error.message}`);
  }

  return data;
}

async function contarRegistros(tabela: string, empresaId: string) {
  const { count, error } = await supabaseAdmin
    .from(tabela)
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId);

  if (error) {
    throw new Error(`Erro ao contar ${tabela}: ${error.message}`);
  }

  return count || 0;
}

async function montarImpacto(empresaId: string) {
  const [
    usuarios,
    contatos,
    conversas,
    mensagens,
    automacoes,
    integracoesWhatsapp,
    leads,
    pagamentos,
    midias,
  ] = await Promise.all([
    contarRegistros("usuarios", empresaId),
    contarRegistros("contatos", empresaId),
    contarRegistros("conversas", empresaId),
    contarRegistros("mensagens", empresaId),
    contarRegistros("automacao_fluxos", empresaId),
    contarRegistros("integracoes_whatsapp", empresaId),
    contarRegistros("leads_cadastro", empresaId),
    contarRegistros("pagamentos", empresaId),
    contarRegistros("midias", empresaId),
  ]);

  return {
    usuarios,
    contatos,
    conversas,
    mensagens,
    automacoes,
    integracoes_whatsapp: integracoesWhatsapp,
    leads,
    pagamentos,
    midias,
  };
}

function dividirEmLotes<T>(itens: T[], tamanho: number) {
  const lotes: T[][] = [];

  for (let indice = 0; indice < itens.length; indice += tamanho) {
    lotes.push(itens.slice(indice, indice + tamanho));
  }

  return lotes;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const acesso = await obterContextoExclusao();

    if (!acesso.ok) {
      return acesso.response;
    }

    const { id } = await context.params;
    const empresa = await buscarEmpresa(id);

    if (!empresa) {
      return NextResponse.json(
        { ok: false, error: "Empresa não encontrada." },
        { status: 404 }
      );
    }

    if (acesso.usuario.empresa_id === empresa.id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A empresa administrativa em que você está logado não pode ser excluída.",
        },
        { status: 409 }
      );
    }

    const impacto = await montarImpacto(empresa.id);

    return NextResponse.json({
      ok: true,
      empresa,
      impacto,
    });
  } catch (error) {
    console.error("[EMPRESAS EXCLUSAO PREVIEW]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao calcular o impacto da exclusão.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const acesso = await obterContextoExclusao();

    if (!acesso.ok) {
      return acesso.response;
    }

    const { id } = await context.params;
    const empresa = await buscarEmpresa(id);

    if (!empresa) {
      return NextResponse.json(
        { ok: false, error: "Empresa não encontrada." },
        { status: 404 }
      );
    }

    if (acesso.usuario.empresa_id === empresa.id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A empresa administrativa em que você está logado não pode ser excluída.",
        },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => null);
    const confirmacao = String(body?.confirmacao || "").trim();

    if (!confirmacao || confirmacao !== empresa.nome_fantasia.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Digite exatamente o nome da empresa para confirmar a exclusão definitiva.",
        },
        { status: 400 }
      );
    }

    const [{ data: usuarios }, { data: midias }] = await Promise.all([
      supabaseAdmin
        .from("usuarios")
        .select("id, auth_user_id, email")
        .eq("empresa_id", empresa.id),
      supabaseAdmin
        .from("midias")
        .select("id, storage_path")
        .eq("empresa_id", empresa.id),
    ]);

    const authUserIds = Array.from(
      new Set(
        (usuarios || [])
          .map((usuario) => String(usuario.auth_user_id || "").trim())
          .filter(Boolean)
      )
    );

    const storagePaths = Array.from(
      new Set(
        (midias || [])
          .map((midia) => String(midia.storage_path || "").trim())
          .filter(Boolean)
      )
    );

    const { data: resultadoExclusao, error: exclusaoError } =
      await supabaseAdmin.rpc("excluir_empresa_definitivamente_admin", {
        p_empresa_id: empresa.id,
      });

    if (exclusaoError) {
      console.error("[EMPRESAS EXCLUSAO DEFINITIVA] Banco:", exclusaoError);

      return NextResponse.json(
        {
          ok: false,
          error:
            "A exclusão foi interrompida pelo banco para evitar dados inconsistentes. " +
            exclusaoError.message,
        },
        { status: 409 }
      );
    }

    const avisos: string[] = [];
    let arquivosStorageRemovidos = 0;

    for (const lote of dividirEmLotes(storagePaths, 100)) {
      if (lote.length === 0) continue;

      const { error: storageError } = await supabaseAdmin.storage
        .from(BUCKET_MIDIAS)
        .remove(lote);

      if (storageError) {
        avisos.push(
          `Alguns arquivos de mídia não puderam ser removidos do Storage: ${storageError.message}`
        );
      } else {
        arquivosStorageRemovidos += lote.length;
      }
    }

    let authUsersRemovidos = 0;

    if (authUserIds.length > 0) {
      const { data: usuariosRestantes, error: usuariosRestantesError } =
        await supabaseAdmin
          .from("usuarios")
          .select("auth_user_id")
          .in("auth_user_id", authUserIds);

      if (usuariosRestantesError) {
        avisos.push(
          "Não foi possível verificar todos os usuários de autenticação remanescentes."
        );
      } else {
        const aindaVinculados = new Set(
          (usuariosRestantes || [])
            .map((usuario) => String(usuario.auth_user_id || "").trim())
            .filter(Boolean)
        );

        for (const authUserId of authUserIds) {
          if (aindaVinculados.has(authUserId)) continue;

          const { error: authError } =
            await supabaseAdmin.auth.admin.deleteUser(authUserId);

          if (authError) {
            avisos.push(
              `Usuário Auth ${authUserId} não pôde ser removido: ${authError.message}`
            );
          } else {
            authUsersRemovidos += 1;
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Empresa "${empresa.nome_fantasia}" excluída definitivamente.`,
      resultado: resultadoExclusao,
      limpeza: {
        usuarios_auth_removidos: authUsersRemovidos,
        arquivos_storage_removidos: arquivosStorageRemovidos,
      },
      avisos,
    });
  } catch (error) {
    console.error("[EMPRESAS EXCLUSAO DEFINITIVA]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao excluir a empresa.",
      },
      { status: 500 }
    );
  }
}
