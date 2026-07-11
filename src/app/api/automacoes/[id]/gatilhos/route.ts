import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabaseAdmin = getSupabaseAdmin();

type RouteParams = {
  params: Promise<{
    id: string;
  }>;
};

const CONSTRAINT_PALAVRA_CHAVE_UNICA =
  "automacao_gatilhos_empresa_palavra_chave_unique";

type AtualizacaoGatilho = {
  updated_at: string;
  valor?: string;
  condicao?: string;
  ativo?: boolean;
};

function obterMensagemErro(error: unknown, fallback = "Erro interno.") {
  return error instanceof Error ? error.message : fallback;
}

function erroDePalavraChaveDuplicada(error: unknown) {
  const erro =
    error && typeof error === "object"
      ? (error as {
          code?: string;
          constraint?: string;
          message?: string;
        })
      : null;

  return (
    erro?.code === "23505" &&
    (erro.constraint === CONSTRAINT_PALAVRA_CHAVE_UNICA ||
      String(erro.message || "").includes("palavra-chave"))
  );
}

async function buscarPalavraChaveExistente(params: {
  empresaId: string;
  valor: string;
  excluirGatilhoId?: string;
}) {
  let consulta = supabaseAdmin
    .from("automacao_gatilhos")
    .select("id, fluxo_id")
    .eq("empresa_id", params.empresaId)
    .eq("tipo_gatilho", "palavra_chave")
    .eq("valor", params.valor);

  if (params.excluirGatilhoId) {
    consulta = consulta.neq("id", params.excluirGatilhoId);
  }

  const { data: gatilho, error } = await consulta.limit(1).maybeSingle();

  if (error) {
    throw new Error(`Erro ao validar palavra-chave: ${error.message}`);
  }

  if (!gatilho) return null;

  const { data: fluxo } = await supabaseAdmin
    .from("automacao_fluxos")
    .select("id, nome, status")
    .eq("id", gatilho.fluxo_id)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  return {
    gatilhoId: gatilho.id,
    fluxoId: gatilho.fluxo_id,
    fluxoNome: fluxo?.nome || null,
    fluxoStatus: fluxo?.status || null,
  };
}

function respostaPalavraChaveDuplicada(params: {
  valor: string;
  fluxoIdAtual: string;
  conflito?: Awaited<ReturnType<typeof buscarPalavraChaveExistente>>;
}) {
  const mesmoFluxo = params.conflito?.fluxoId === params.fluxoIdAtual;
  const identificacaoFluxo = params.conflito?.fluxoNome
    ? ` no fluxo "${params.conflito.fluxoNome}"`
    : " em outro fluxo";
  const statusFluxo = params.conflito?.fluxoStatus
    ? ` (${params.conflito.fluxoStatus})`
    : "";

  return NextResponse.json(
    {
      ok: false,
      code: "PALAVRA_CHAVE_DUPLICADA",
      error: mesmoFluxo
        ? `A palavra-chave "${params.valor}" já existe neste fluxo.`
        : `A palavra-chave "${params.valor}" já está cadastrada${identificacaoFluxo}${statusFluxo}. Cada palavra-chave pode pertencer a apenas um fluxo por empresa.`,
      conflito: params.conflito || null,
    },
    { status: 409 }
  );
}

function respostaUltimoGatilhoAtivo() {
  return NextResponse.json(
    {
      ok: false,
      code: "ULTIMO_GATILHO_ATIVO",
      error:
        "Fluxos ativos que nao sao padrao precisam manter pelo menos um gatilho ativo.",
    },
    { status: 400 }
  );
}

async function removerGatilhoDeixariaFluxoAtivoSemGatilho(params: {
  empresaId: string;
  fluxoId: string;
  gatilhoId: string;
}) {
  const { data: fluxo, error: fluxoError } = await supabaseAdmin
    .from("automacao_fluxos")
    .select("id, status, fluxo_padrao")
    .eq("id", params.fluxoId)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (fluxoError) {
    throw new Error(`Erro ao validar fluxo: ${fluxoError.message}`);
  }

  if (
    !fluxo ||
    String(fluxo.status || "") !== "ativo" ||
    fluxo.fluxo_padrao === true
  ) {
    return false;
  }

  const { data: outrosGatilhosAtivos, error: gatilhosError } =
    await supabaseAdmin
      .from("automacao_gatilhos")
      .select("id")
      .eq("empresa_id", params.empresaId)
      .eq("fluxo_id", params.fluxoId)
      .eq("ativo", true)
      .neq("id", params.gatilhoId)
      .limit(1);

  if (gatilhosError) {
    throw new Error(`Erro ao validar gatilhos: ${gatilhosError.message}`);
  }

  return (outrosGatilhosAtivos || []).length === 0;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: fluxoId } = await params;

    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const { data: fluxo, error: fluxoError } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("id")
      .eq("id", fluxoId)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (fluxoError || !fluxo) {
      return NextResponse.json(
        { ok: false, error: "Fluxo não encontrado." },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("automacao_gatilhos")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .eq("fluxo_id", fluxoId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao buscar gatilhos: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      gatilhos: data || [],
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: obterMensagemErro(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: fluxoId } = await params;
    const auditMeta = getRequestAuditMetadata(req);

    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const valor = String(body?.valor || "").trim().toLowerCase();
    const condicao = String(body?.condicao || "contem").trim();
    const tipoGatilho = String(body?.tipo_gatilho || "palavra_chave").trim();

    if (!valor) {
      return NextResponse.json(
        { ok: false, error: "Informe a palavra-chave do gatilho." },
        { status: 400 }
      );
    }

    const condicoesPermitidas = ["contem", "exata", "inicia_com", "regex"];

    if (!condicoesPermitidas.includes(condicao)) {
      return NextResponse.json(
        { ok: false, error: "Condição inválida." },
        { status: 400 }
      );
    }

    const tiposPermitidos = [
      "palavra_chave",
      "primeira_mensagem",
      "evento",
      "webhook",
      "manual",
    ];

    if (!tiposPermitidos.includes(tipoGatilho)) {
      return NextResponse.json(
        { ok: false, error: "Tipo de gatilho inválido." },
        { status: 400 }
      );
    }

    const { data: fluxo, error: fluxoError } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("id")
      .eq("id", fluxoId)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (fluxoError || !fluxo) {
      return NextResponse.json(
        { ok: false, error: "Fluxo não encontrado." },
        { status: 404 }
      );
    }

    if (tipoGatilho === "palavra_chave") {
      const conflito = await buscarPalavraChaveExistente({
        empresaId: usuario.empresa_id,
        valor,
      });

      if (conflito) {
        return respostaPalavraChaveDuplicada({
          valor,
          fluxoIdAtual: fluxoId,
          conflito,
        });
      }
    }

    const { data, error } = await supabaseAdmin
      .from("automacao_gatilhos")
      .insert({
        empresa_id: usuario.empresa_id,
        fluxo_id: fluxoId,
        tipo_gatilho: tipoGatilho,
        valor,
        condicao,
        ativo: true,
      })
      .select("*")
      .single();

    if (erroDePalavraChaveDuplicada(error)) {
      return respostaPalavraChaveDuplicada({
        valor,
        fluxoIdAtual: fluxoId,
      });
    }

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao criar gatilho: ${error.message}` },
        { status: 500 }
      );
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: fluxoId,
      acao: "fluxo_gatilho_criado",
      descricao: `Gatilho ${valor} criado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      depois: data,
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      gatilho: data,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: obterMensagemErro(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: fluxoId } = await params;
    const auditMeta = getRequestAuditMetadata(req);

    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const gatilhoId = String(body?.id || "").trim();

    if (!gatilhoId) {
      return NextResponse.json(
        { ok: false, error: "ID do gatilho é obrigatório." },
        { status: 400 }
      );
    }

    const { data: gatilhoAntes, error: gatilhoAntesError } = await supabaseAdmin
      .from("automacao_gatilhos")
      .select("*")
      .eq("id", gatilhoId)
      .eq("fluxo_id", fluxoId)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (gatilhoAntesError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao buscar gatilho: ${gatilhoAntesError.message}`,
        },
        { status: 500 }
      );
    }

    if (!gatilhoAntes) {
      return NextResponse.json(
        { ok: false, error: "Gatilho não encontrado." },
        { status: 404 }
      );
    }

    const atualizacao: AtualizacaoGatilho = {
      updated_at: new Date().toISOString(),
    };

    if (body?.valor !== undefined) {
      const valor = String(body.valor || "").trim().toLowerCase();

      if (!valor) {
        return NextResponse.json(
          { ok: false, error: "Informe a palavra-chave do gatilho." },
          { status: 400 }
        );
      }

      atualizacao.valor = valor;
    }

    if (body?.condicao !== undefined) {
      const condicao = String(body.condicao || "contem").trim();
      const condicoesPermitidas = ["contem", "exata", "inicia_com", "regex"];

      if (!condicoesPermitidas.includes(condicao)) {
        return NextResponse.json(
          { ok: false, error: "Condição inválida." },
          { status: 400 }
        );
      }

      atualizacao.condicao = condicao;
    }

    if (body?.ativo !== undefined) {
      atualizacao.ativo = Boolean(body.ativo);
    }

    if (
      atualizacao.valor !== undefined &&
      gatilhoAntes.tipo_gatilho === "palavra_chave"
    ) {
      const conflito = await buscarPalavraChaveExistente({
        empresaId: usuario.empresa_id,
        valor: atualizacao.valor,
        excluirGatilhoId: gatilhoId,
      });

      if (conflito) {
        return respostaPalavraChaveDuplicada({
          valor: atualizacao.valor,
          fluxoIdAtual: fluxoId,
          conflito,
        });
      }
    }

    if (
      atualizacao.ativo === false &&
      gatilhoAntes.ativo === true &&
      (await removerGatilhoDeixariaFluxoAtivoSemGatilho({
        empresaId: usuario.empresa_id,
        fluxoId,
        gatilhoId,
      }))
    ) {
      return respostaUltimoGatilhoAtivo();
    }

    const { data, error } = await supabaseAdmin
      .from("automacao_gatilhos")
      .update(atualizacao)
      .eq("id", gatilhoId)
      .eq("fluxo_id", fluxoId)
      .eq("empresa_id", usuario.empresa_id)
      .select("*")
      .single();

    if (erroDePalavraChaveDuplicada(error)) {
      return respostaPalavraChaveDuplicada({
        valor: String(atualizacao.valor || gatilhoAntes.valor || ""),
        fluxoIdAtual: fluxoId,
      });
    }

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao atualizar gatilho: ${error.message}` },
        { status: 500 }
      );
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: fluxoId,
      acao:
        body?.ativo !== undefined
          ? data.ativo
            ? "fluxo_gatilho_ativado"
            : "fluxo_gatilho_desativado"
          : "fluxo_gatilho_atualizado",
      descricao: `Gatilho ${data.valor || gatilhoId} atualizado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: gatilhoAntes,
      depois: data,
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      gatilho: data,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: obterMensagemErro(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: fluxoId } = await params;
    const auditMeta = getRequestAuditMetadata(req);

    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const gatilhoId = String(body?.id || "").trim();

    if (!gatilhoId) {
      return NextResponse.json(
        { ok: false, error: "ID do gatilho é obrigatório." },
        { status: 400 }
      );
    }

    const { data: gatilhoAntes } = await supabaseAdmin
      .from("automacao_gatilhos")
      .select("*")
      .eq("id", gatilhoId)
      .eq("fluxo_id", fluxoId)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (
      gatilhoAntes?.ativo === true &&
      (await removerGatilhoDeixariaFluxoAtivoSemGatilho({
        empresaId: usuario.empresa_id,
        fluxoId,
        gatilhoId,
      }))
    ) {
      return respostaUltimoGatilhoAtivo();
    }

    const { error } = await supabaseAdmin
      .from("automacao_gatilhos")
      .delete()
      .eq("id", gatilhoId)
      .eq("fluxo_id", fluxoId)
      .eq("empresa_id", usuario.empresa_id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao remover gatilho: ${error.message}` },
        { status: 500 }
      );
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: fluxoId,
      acao: "fluxo_gatilho_removido",
      descricao: `Gatilho ${gatilhoAntes?.valor || gatilhoId} removido`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: gatilhoAntes,
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: obterMensagemErro(error) },
      { status: 500 }
    );
  }
}
