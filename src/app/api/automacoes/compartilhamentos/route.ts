import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import {
  criarCopiaFluxoCompartilhado,
  formatarCodigoCompartilhamento,
  gerarCodigoCompartilhamentoFluxo,
  montarSnapshotCompartilhamentoFluxo,
  normalizarCodigoCompartilhamento,
  type SnapshotCompartilhamentoFluxo,
} from "@/lib/automacoes/compartilhamento-fluxos";

const supabaseAdmin = getSupabaseAdmin();

type SupabaseErrorLike = {
  code?: string;
  details?: string | null;
  message?: string | null;
};

type CompartilhamentoFluxoRow = {
  id: string;
  codigo: string;
  nome_fluxo: string;
  created_at: string;
  updated_at: string;
};

type ResultadoCompartilhamentoFluxoRpc = {
  compartilhamento?: CompartilhamentoFluxoRow;
  criado?: boolean;
};

type ErroImportacaoFluxoClassificado = {
  status: number;
  codigo: string;
  mensagem: string;
};

function obterMensagemErro(error: unknown, fallback = "Erro interno.") {
  return error instanceof Error ? error.message : fallback;
}

function normalizarTextoErro(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function classificarErroImportacaoFluxo(
  error: unknown
): ErroImportacaoFluxoClassificado {
  const mensagem = obterMensagemErro(error, "Erro ao importar fluxo.");
  const textoErro = normalizarTextoErro(mensagem);

  if (
    textoErro.includes("palavra-chave") &&
    textoErro.includes("ja esta cadastrada em um fluxo desta empresa")
  ) {
    return {
      status: 409,
      codigo: "PALAVRA_CHAVE_EM_USO",
      mensagem,
    };
  }

  if (
    textoErro.includes("palavra-chave") &&
    textoErro.includes("aparece mais de uma vez no fluxo importado")
  ) {
    return {
      status: 422,
      codigo: "PALAVRA_CHAVE_DUPLICADA_NO_FLUXO",
      mensagem,
    };
  }

  if (
    textoErro.includes("codigo de fluxo invalido") ||
    textoErro.includes("codigo de fluxo incompleto") ||
    textoErro.includes("fluxo compartilhado possui configuracoes incompletas")
  ) {
    return {
      status: 422,
      codigo: "FLUXO_COMPARTILHADO_INVALIDO",
      mensagem,
    };
  }

  if (
    textoErro.includes("erro ao importar gatilhos") &&
    (textoErro.includes("duplicate key") || textoErro.includes("23505"))
  ) {
    return {
      status: 409,
      codigo: "CONFLITO_DE_GATILHO",
      mensagem:
        "Uma das palavras-chave do fluxo já está cadastrada nesta empresa. Remova o conflito antes de importar.",
    };
  }

  return {
    status: 500,
    codigo: "ERRO_INTERNO_IMPORTACAO_FLUXO",
    mensagem,
  };
}

function erroDuplicidadeCodigoCompartilhamento(error: SupabaseErrorLike) {
  const textoErro = `${error.message || ""} ${error.details || ""}`.toLowerCase();

  return (
    error.code === "23505" &&
    (textoErro.includes("automacao_fluxo_compartilhamentos_codigo") ||
      textoErro.includes("key (codigo)") ||
      textoErro.includes("codigo"))
  );
}

function erroDuplicidadeFluxoAtivo(error: SupabaseErrorLike) {
  const textoErro = `${error.message || ""} ${error.details || ""}`.toLowerCase();

  return (
    error.code === "23505" &&
    (textoErro.includes("automacao_fluxo_compartilhamentos_fluxo_ativo_uidx") ||
      textoErro.includes("key (empresa_origem_id, fluxo_origem_id)"))
  );
}

function normalizarResultadoCompartilhamentoRpc(
  data: unknown
): ResultadoCompartilhamentoFluxoRpc | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const resultado = data as ResultadoCompartilhamentoFluxoRpc;

  if (!resultado.compartilhamento?.id || !resultado.compartilhamento.codigo) {
    return null;
  }

  return {
    compartilhamento: resultado.compartilhamento,
    criado: resultado.criado === true,
  };
}

async function obterOuCriarCompartilhamentoComCodigo(params: {
  empresaId: string;
  fluxoId: string;
  usuarioId: string;
  snapshot: SnapshotCompartilhamentoFluxo;
}) {
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const codigo = gerarCodigoCompartilhamentoFluxo();

    const { data, error } = await supabaseAdmin.rpc(
      "obter_ou_criar_automacao_fluxo_compartilhamento",
      {
        p_codigo: codigo,
        p_empresa_origem_id: params.empresaId,
        p_fluxo_origem_id: params.fluxoId,
        p_nome_fluxo: params.snapshot.fluxo.nome,
        p_snapshot_json: params.snapshot,
        p_criado_por: params.usuarioId,
      }
    );

    if (!error) {
      const resultado = normalizarResultadoCompartilhamentoRpc(data);

      if (!resultado?.compartilhamento) {
        throw new Error("Resposta invalida ao salvar compartilhamento.");
      }

      return {
        compartilhamento: resultado.compartilhamento,
        criado: resultado.criado,
      };
    }

    if (
      !erroDuplicidadeCodigoCompartilhamento(error) &&
      !erroDuplicidadeFluxoAtivo(error)
    ) {
      throw new Error(
        `Erro ao salvar compartilhamento: ${error.message}`
      );
    }
  }

  throw new Error("Nao foi possivel gerar um codigo unico para o fluxo.");
}

export async function POST(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();
    const auditMeta = getRequestAuditMetadata(req);

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
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const fluxoId = String(body?.fluxo_id || "").trim();

    if (!fluxoId) {
      return NextResponse.json(
        { ok: false, error: "ID do fluxo e obrigatorio." },
        { status: 400 }
      );
    }

    const snapshot = await montarSnapshotCompartilhamentoFluxo({
      supabase: supabaseAdmin,
      empresaId: usuario.empresa_id,
      fluxoId,
    });

    const { compartilhamento, criado } =
      await obterOuCriarCompartilhamentoComCodigo({
        empresaId: usuario.empresa_id,
        fluxoId,
        usuarioId: usuario.id,
        snapshot,
      });

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: fluxoId,
      acao: criado
        ? "fluxo_codigo_compartilhamento_gerado"
        : "fluxo_codigo_compartilhamento_atualizado",
      descricao: criado
        ? `Codigo de compartilhamento gerado para ${snapshot.fluxo.nome}`
        : `Codigo de compartilhamento atualizado para ${snapshot.fluxo.nome}`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      depois: {
        codigo: compartilhamento.codigo,
        nos: snapshot.nos.length,
        conexoes: snapshot.conexoes.length,
        gatilhos: snapshot.gatilhos.length,
        criado,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      codigo: formatarCodigoCompartilhamento(compartilhamento.codigo),
      compartilhamento: {
        id: compartilhamento.id,
        codigo: formatarCodigoCompartilhamento(compartilhamento.codigo),
        nome_fluxo: compartilhamento.nome_fluxo,
        created_at: compartilhamento.created_at,
        updated_at: compartilhamento.updated_at,
        criado,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: obterMensagemErro(error) },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();
    const auditMeta = getRequestAuditMetadata(req);

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
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const codigo = normalizarCodigoCompartilhamento(body?.codigo);

    if (!codigo) {
      return NextResponse.json(
        { ok: false, error: "Informe o codigo do fluxo." },
        { status: 400 }
      );
    }

    const { data: compartilhamento, error: compartilhamentoError } =
      await supabaseAdmin
        .from("automacao_fluxo_compartilhamentos")
        .select("*")
        .eq("codigo", codigo)
        .eq("ativo", true)
        .maybeSingle();

    if (compartilhamentoError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao buscar codigo: ${compartilhamentoError.message}`,
        },
        { status: 500 }
      );
    }

    if (!compartilhamento) {
      return NextResponse.json(
        { ok: false, error: "Codigo de fluxo nao encontrado ou inativo." },
        { status: 404 }
      );
    }

    const snapshot =
      compartilhamento.snapshot_json as SnapshotCompartilhamentoFluxo;

    const copia = await criarCopiaFluxoCompartilhado({
      supabase: supabaseAdmin,
      snapshot,
      empresaOrigemId: compartilhamento.empresa_origem_id,
      empresaDestinoId: usuario.empresa_id,
      usuarioId: usuario.id,
    });

    await supabaseAdmin
      .from("automacao_fluxo_compartilhamentos")
      .update({
        total_importacoes: Number(compartilhamento.total_importacoes || 0) + 1,
        ultimo_importado_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", compartilhamento.id);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: copia.fluxo.id,
      acao: "fluxo_importado_por_codigo",
      descricao: `Fluxo ${snapshot.fluxo.nome} importado por codigo`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: {
        codigo: formatarCodigoCompartilhamento(compartilhamento.codigo),
        empresa_origem_id: compartilhamento.empresa_origem_id,
        fluxo_origem_id: compartilhamento.fluxo_origem_id,
      },
      depois: {
        fluxo_id: copia.fluxo.id,
        nome: copia.fluxo.nome,
        ...copia.totais,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      avisos: copia.avisos,
      fluxo: copia.fluxo,
      totais: copia.totais,
    });
  } catch (error: unknown) {
    const erroClassificado = classificarErroImportacaoFluxo(error);

    if (erroClassificado.status >= 500) {
      console.error("Erro ao importar fluxo compartilhado:", error);
    }

    return NextResponse.json(
      {
        ok: false,
        error: erroClassificado.mensagem,
        code: erroClassificado.codigo,
      },
      { status: erroClassificado.status }
    );
  }
}
