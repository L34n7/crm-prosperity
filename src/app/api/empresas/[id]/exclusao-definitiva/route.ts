import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/permissoes/can";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";

import { excluirEmpresaAposRetencao } from "@/lib/empresas/exclusao-definitiva";

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
  request: Request, context: { params: Promise<{ id: string }> }
) {
  try {
    const acesso = await obterContextoExclusao();
    if (!acesso.ok) return acesso.response;
    const { id } = await context.params;
    if (acesso.usuario.empresa_id === id)
      return NextResponse.json({ok:false,error:"Você não pode excluir o próprio ambiente administrativo."},{status:409});
    const empresa = await buscarEmpresa(id);
    if (!empresa)
      return NextResponse.json({ok:false,error:"Empresa não encontrada."},{status:404});
    const body = await request.json().catch(() => ({}));
    if (String(body?.confirmacao || "").trim() !== empresa.nome_fantasia.trim())
      return NextResponse.json({ok:false,error:"Digite o nome exato da empresa para confirmar."},{status:400});
    const antecipada = empresa.status === "cancelada" &&
      (await supabaseAdmin.from("empresas").select("exclusao_prevista_em")
        .eq("id",id).single()).data?.exclusao_prevista_em;
    const prazoFuturo = antecipada &&
      new Date(String(antecipada)).getTime()>Date.now();
    if(prazoFuturo && body?.confirmacao_backup_baixado !== true) {
      return NextResponse.json({
        ok:false,
        error:"Confirme que baixou e conferiu todas as partes do backup antes da exclusão antecipada."
      },{status:400});
    }
    const resultado = await excluirEmpresaAposRetencao(id,{antecipada:Boolean(prazoFuturo)});
    return NextResponse.json({
      ok:true,
      message:`Empresa "${empresa.nome_fantasia}" excluída definitivamente.`,
      resultado:resultado.resultado,
      limpeza:resultado.limpeza,
      avisos: resultado.limpeza.ok ? [] : [resultado.limpeza.erro],
    });
  } catch(error) {
    return NextResponse.json({
      ok:false,
      error:error instanceof Error?error.message:"Falha na exclusão segura.",
    },{status:409});
  }
}
