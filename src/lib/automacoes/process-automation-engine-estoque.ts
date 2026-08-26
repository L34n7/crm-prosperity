import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ResultadoConsultaEstoque } from "@/lib/estoque/consultar-estoque-produto";
import {
  executarConsultaEstoqueAutomacao as executarConsultaEstoqueAutomacaoBase,
  type ExecucaoConsultaEstoqueAutomacao,
} from "./process-automation-engine-estoque-base";

export type { ExecucaoConsultaEstoqueAutomacao } from "./process-automation-engine-estoque-base";

const supabaseAdmin = getSupabaseAdmin();

type ExecutarConsultaEstoqueParams = Parameters<
  typeof executarConsultaEstoqueAutomacaoBase
>[0];

type ExecucaoContexto = {
  id: string;
  contato_id: string | null;
  metadata_json: Record<string, unknown> | null;
};

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function booleano(valor: unknown) {
  return valor === true || valor === "true" || valor === 1 || valor === "1";
}

function normalizarChaveVariavel(valor: unknown) {
  return texto(valor)
    .replace(/^\{\{\s*/, "")
    .replace(/\s*\}\}$/, "")
    .replace(/^variaveis\./i, "")
    .trim()
    .toLowerCase();
}

function quantidadePositiva(valor: unknown) {
  const bruto = texto(valor).replace(/\s+/g, "");
  if (!bruto) return null;

  const normalizado = bruto.includes(",")
    ? bruto.replace(/\./g, "").replace(",", ".")
    : bruto;
  const numero = Number(normalizado);

  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

async function carregarExecucaoContexto(params: {
  empresaId: string;
  execucaoId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id, contato_id, metadata_json")
    .eq("id", params.execucaoId)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `Erro ao carregar contexto da consulta de estoque: ${
        error?.message || "execução não encontrada"
      }`
    );
  }

  return data as ExecucaoContexto;
}

async function resolverVariavelExecucao(params: {
  empresaId: string;
  execucao: ExecucaoContexto;
  chave: string;
}) {
  const metadata = objeto(params.execucao.metadata_json);
  const variaveis = objeto(metadata.variaveis);
  const valorMetadata = texto(variaveis[params.chave]);

  if (valorMetadata) return valorMetadata;

  const { data, error } = await supabaseAdmin
    .from("automacao_variaveis")
    .select("valor")
    .eq("empresa_id", params.empresaId)
    .eq("execucao_id", params.execucao.id)
    .eq("chave", params.chave)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao ler variável da execução: ${error.message}`);
  }

  return texto(data?.valor);
}

async function persistirResultadoFinal(params: {
  empresaId: string;
  execucaoId: string;
  noId: string;
  resultado: ResultadoConsultaEstoque;
  motivoIndisponibilidade: string;
}) {
  const execucao = await carregarExecucaoContexto({
    empresaId: params.empresaId,
    execucaoId: params.execucaoId,
  });
  const agora = new Date().toISOString();
  const registros = [
    {
      empresa_id: params.empresaId,
      execucao_id: params.execucaoId,
      contato_id: execucao.contato_id,
      chave: "estoque_resultado",
      valor: params.resultado,
      metadata_json: {
        origem: "consultar_estoque",
        no_id: params.noId,
        resultado: params.resultado,
      },
      updated_at: agora,
    },
    {
      empresa_id: params.empresaId,
      execucao_id: params.execucaoId,
      contato_id: execucao.contato_id,
      chave: "estoque_motivo_indisponibilidade",
      valor: params.motivoIndisponibilidade,
      metadata_json: {
        origem: "consultar_estoque",
        no_id: params.noId,
        resultado: params.resultado,
      },
      updated_at: agora,
    },
  ];

  const { error: variaveisError } = await supabaseAdmin
    .from("automacao_variaveis")
    .upsert(registros, { onConflict: "execucao_id,chave" });

  if (variaveisError) {
    throw new Error(
      `Erro ao salvar validação da quantidade no estoque: ${variaveisError.message}`
    );
  }

  const metadata = objeto(execucao.metadata_json);
  const variaveis = objeto(metadata.variaveis);
  const ultimaConsulta = objeto(metadata.estoque_ultima_consulta);
  const consultas = objeto(metadata.estoque_consultas);
  const consultaDoNo = objeto(consultas[params.noId]);
  const ultimaConsultaAtualizada =
    texto(ultimaConsulta.no_id) === params.noId
      ? {
          ...ultimaConsulta,
          resultado: params.resultado,
          motivo_indisponibilidade: params.motivoIndisponibilidade,
        }
      : ultimaConsulta;

  const { error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      metadata_json: {
        ...metadata,
        variaveis: {
          ...variaveis,
          estoque_resultado: params.resultado,
          estoque_motivo_indisponibilidade: params.motivoIndisponibilidade,
        },
        estoque_ultima_consulta: ultimaConsultaAtualizada,
        estoque_consultas: {
          ...consultas,
          [params.noId]: {
            ...consultaDoNo,
            resultado: params.resultado,
            motivo_indisponibilidade: params.motivoIndisponibilidade,
          },
        },
      },
      updated_at: agora,
    })
    .eq("id", params.execucaoId)
    .eq("empresa_id", params.empresaId);

  if (execucaoError) {
    throw new Error(
      `Erro ao atualizar contexto da validação de estoque: ${execucaoError.message}`
    );
  }
}

export async function executarConsultaEstoqueAutomacao(
  params: ExecutarConsultaEstoqueParams
): Promise<ExecucaoConsultaEstoqueAutomacao> {
  const configOriginal = objeto(params.no.configuracao_json);
  const execucao = await carregarExecucaoContexto({
    empresaId: params.empresaId,
    execucaoId: params.execucaoId,
  });
  const origemProduto = texto(configOriginal.origem_produto).toLowerCase();

  let noParaConsulta = params.no;

  if (origemProduto === "produto_selecionado_anteriormente") {
    const produtoId = await resolverVariavelExecucao({
      empresaId: params.empresaId,
      execucao,
      chave: "estoque_produto_id",
    });

    if (!produtoId) {
      throw new Error(
        "O bloco Consultar estoque foi configurado para usar o produto selecionado anteriormente, mas não há estoque_produto_id disponível nesta execução."
      );
    }

    noParaConsulta = {
      ...params.no,
      configuracao_json: {
        ...configOriginal,
        origem_produto: "produto_especifico",
        produto_id: produtoId,
      },
    };
  }

  const resultadoBase = await executarConsultaEstoqueAutomacaoBase({
    ...params,
    no: noParaConsulta,
  });

  let resultadoFinal = resultadoBase.resultado as ResultadoConsultaEstoque;
  let motivoIndisponibilidade = "";

  if (
    resultadoBase.resultado === "sem_estoque" &&
    resultadoBase.consulta.produto
  ) {
    motivoIndisponibilidade = "sem_saldo";
  }

  if (
    booleano(configOriginal.validar_quantidade_solicitada) &&
    resultadoBase.consulta.produto &&
    (resultadoBase.resultado === "disponivel" ||
      resultadoBase.resultado === "sem_estoque")
  ) {
    const chaveQuantidade = normalizarChaveVariavel(
      configOriginal.variavel_quantidade
    );
    const valorQuantidade = chaveQuantidade
      ? await resolverVariavelExecucao({
          empresaId: params.empresaId,
          execucao,
          chave: chaveQuantidade,
        })
      : "";
    const quantidadeSolicitada = quantidadePositiva(valorQuantidade);
    const quantidadeDisponivel = Number(
      resultadoBase.consulta.quantidade_disponivel || 0
    );

    if (quantidadeSolicitada === null) {
      resultadoFinal = "sem_estoque";
      motivoIndisponibilidade = "quantidade_invalida";
    } else if (quantidadeDisponivel <= 0) {
      resultadoFinal = "sem_estoque";
      motivoIndisponibilidade = "sem_saldo";
    } else if (quantidadeSolicitada > quantidadeDisponivel) {
      resultadoFinal = "sem_estoque";
      motivoIndisponibilidade = "quantidade_insuficiente";
    } else {
      resultadoFinal = "disponivel";
      motivoIndisponibilidade = "";
    }
  }

  if (
    resultadoBase.resultado === "nao_encontrado" ||
    resultadoBase.resultado === "multiplos_resultados"
  ) {
    motivoIndisponibilidade = "";
  }

  const consultaFinal = {
    ...resultadoBase.consulta,
    resultado: resultadoFinal,
  };
  const variaveis = {
    ...resultadoBase.variaveis,
    estoque_resultado: resultadoFinal,
    estoque_motivo_indisponibilidade: motivoIndisponibilidade,
  };

  await persistirResultadoFinal({
    empresaId: params.empresaId,
    execucaoId: params.execucaoId,
    noId: params.no.id,
    resultado: resultadoFinal,
    motivoIndisponibilidade,
  });

  return {
    ...resultadoBase,
    resultado: resultadoFinal,
    consulta: consultaFinal,
    variaveis,
  };
}
