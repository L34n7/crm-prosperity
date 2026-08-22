import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { executarNo as executarNoBase } from "./process-automation-engine-agenda";
import { executarConsultaEstoqueAutomacao } from "./process-automation-engine-estoque";

const supabaseAdmin = getSupabaseAdmin();

const TIPO_NO_CONSULTAR_ESTOQUE = "consultar_estoque";
const RESULTADOS_ESTOQUE = new Set([
  "disponivel",
  "sem_estoque",
  "nao_encontrado",
  "multiplos_resultados",
]);
const LIMITE_CONTINUACOES_ESTOQUE = 20;

type ContinuarConsultaEstoqueParams = {
  empresaId: string;
  conversaId: string;
  numeroDestino: string;
  mensagemTexto?: string;
  execucaoId?: string | null;
};

function objeto(valor: unknown): Record<string, any> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, any>)
    : {};
}

async function registrarLogEstoque(params: {
  empresaId: string;
  execucaoId: string;
  fluxoId: string;
  noId: string;
  conexaoId?: string | null;
  tipoEvento: string;
  descricao: string;
  entrada?: Record<string, any>;
  saida?: Record<string, any>;
}) {
  const { error } = await supabaseAdmin.from("automacao_execucao_logs").insert({
    empresa_id: params.empresaId,
    execucao_id: params.execucaoId,
    fluxo_id: params.fluxoId,
    no_id: params.noId,
    conexao_id: params.conexaoId || null,
    tipo_evento: params.tipoEvento,
    descricao: params.descricao,
    entrada_json: params.entrada || {},
    saida_json: params.saida || {},
  });

  if (error) {
    console.error("[AUTOMATION_ESTOQUE] Erro ao registrar log:", error);
  }
}

async function buscarExecucaoAtiva(params: {
  empresaId: string;
  conversaId: string;
  execucaoId?: string | null;
}) {
  let query = supabaseAdmin
    .from("automacao_execucoes")
    .select("id, fluxo_id, conversa_id, no_atual_id, status, metadata_json")
    .eq("empresa_id", params.empresaId)
    .eq("conversa_id", params.conversaId)
    .in("status", ["rodando", "aguardando"]);

  if (params.execucaoId) {
    query = query.eq("id", params.execucaoId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao localizar execução para consulta de estoque: ${error.message}`);
  }

  return data || null;
}

async function marcarExecucaoErro(params: {
  empresaId: string;
  execucaoId: string;
  metadataJson?: Record<string, any> | null;
  motivo: string;
  noId: string;
}) {
  const agora = new Date().toISOString();
  const metadata = objeto(params.metadataJson);

  await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      status: "erro",
      finished_at: agora,
      metadata_json: {
        ...metadata,
        estoque_erro: {
          no_id: params.noId,
          motivo: params.motivo,
          ocorrido_em: agora,
        },
      },
      updated_at: agora,
    })
    .eq("id", params.execucaoId)
    .eq("empresa_id", params.empresaId);
}

async function buscarNoAtual(params: {
  empresaId: string;
  fluxoId: string;
  noId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("automacao_nos")
    .select("*")
    .eq("id", params.noId)
    .eq("empresa_id", params.empresaId)
    .eq("fluxo_id", params.fluxoId)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao localizar bloco da consulta de estoque: ${error.message}`);
  }

  return data || null;
}

async function buscarConexaoResultado(params: {
  empresaId: string;
  fluxoId: string;
  noId: string;
  resultado: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("automacao_conexoes")
    .select("*")
    .eq("empresa_id", params.empresaId)
    .eq("fluxo_id", params.fluxoId)
    .eq("no_origem_id", params.noId)
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error) {
    throw new Error(`Erro ao localizar saída da consulta de estoque: ${error.message}`);
  }

  return (
    (data || []).find((conexao) => {
      const condicao = objeto(conexao.condicao_json);
      return (
        String(condicao.tipo || "").trim() === "resposta_igual" &&
        String(condicao.valor || "").trim() === params.resultado
      );
    }) || null
  );
}

async function transicionarParaDestino(params: {
  empresaId: string;
  execucaoId: string;
  noAtualId: string;
  noDestinoId: string;
}) {
  const { data: execucaoAtual, error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("metadata_json")
    .eq("id", params.execucaoId)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (execucaoError || !execucaoAtual) {
    throw new Error(
      `Erro ao preparar transição da consulta de estoque: ${
        execucaoError?.message || "execução não encontrada"
      }`
    );
  }

  const metadata = objeto(execucaoAtual.metadata_json);
  const visitasAtuais = objeto(metadata.visitas_nos);
  const tentativasAtuais = { ...objeto(metadata.tentativas_blocos) };
  delete tentativasAtuais[params.noAtualId];

  const visitasAtualizadas = {
    ...visitasAtuais,
    [params.noDestinoId]: Number(visitasAtuais[params.noDestinoId] || 0) + 1,
  };

  const { data, error } = await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      no_atual_id: params.noDestinoId,
      status: "rodando",
      metadata_json: {
        ...metadata,
        tentativas_blocos: tentativasAtuais,
        visitas_nos: visitasAtualizadas,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.execucaoId)
    .eq("empresa_id", params.empresaId)
    .eq("status", "rodando")
    .eq("no_atual_id", params.noAtualId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao avançar consulta de estoque: ${error.message}`);
  }

  return Boolean(data);
}

export async function continuarConsultasEstoqueAutomacao(
  params: ContinuarConsultaEstoqueParams
) {
  const numeroDestino = String(params.numeroDestino || "").trim();

  for (let passo = 0; passo < LIMITE_CONTINUACOES_ESTOQUE; passo += 1) {
    const execucao = await buscarExecucaoAtiva({
      empresaId: params.empresaId,
      conversaId: params.conversaId,
      execucaoId: params.execucaoId,
    });

    if (!execucao || execucao.status !== "rodando" || !execucao.no_atual_id) {
      return { processado: passo > 0, passos: passo };
    }

    const noAtual = await buscarNoAtual({
      empresaId: params.empresaId,
      fluxoId: execucao.fluxo_id,
      noId: execucao.no_atual_id,
    });

    if (!noAtual || noAtual.tipo_no !== TIPO_NO_CONSULTAR_ESTOQUE) {
      return { processado: passo > 0, passos: passo };
    }

    try {
      const resultado = await executarConsultaEstoqueAutomacao({
        empresaId: params.empresaId,
        execucaoId: execucao.id,
        fluxoId: execucao.fluxo_id,
        no: noAtual,
        mensagemTexto: params.mensagemTexto,
      });

      if (!RESULTADOS_ESTOQUE.has(resultado.resultado)) {
        throw new Error(`Resultado de estoque inválido: ${resultado.resultado}`);
      }

      await registrarLogEstoque({
        empresaId: params.empresaId,
        execucaoId: execucao.id,
        fluxoId: execucao.fluxo_id,
        noId: noAtual.id,
        tipoEvento: "consulta_estoque_realizada",
        descricao: "Consulta de estoque executada com sucesso.",
        entrada: {
          termo: resultado.termo,
          modo_pesquisa: resultado.modo,
          deposito_ids: resultado.depositoIds,
          selecao_por_indice: resultado.selecaoPorIndice,
        },
        saida: {
          resultado: resultado.resultado,
          produto_id: resultado.consulta.produto?.id || null,
          produto_nome: resultado.consulta.produto?.nome || null,
          quantidade_disponivel: resultado.consulta.quantidade_disponivel,
          quantidade_reservada: resultado.consulta.quantidade_reservada,
          quantidade_fisica: resultado.consulta.quantidade_fisica,
          candidatos: resultado.candidatos,
        },
      });

      const conexao = await buscarConexaoResultado({
        empresaId: params.empresaId,
        fluxoId: execucao.fluxo_id,
        noId: noAtual.id,
        resultado: resultado.resultado,
      });

      if (!conexao) {
        const motivo = `Saída ${resultado.resultado} não está conectada no bloco Consultar estoque.`;

        await registrarLogEstoque({
          empresaId: params.empresaId,
          execucaoId: execucao.id,
          fluxoId: execucao.fluxo_id,
          noId: noAtual.id,
          tipoEvento: "consulta_estoque_sem_saida",
          descricao: motivo,
          entrada: { resultado: resultado.resultado },
          saida: {},
        });

        await marcarExecucaoErro({
          empresaId: params.empresaId,
          execucaoId: execucao.id,
          metadataJson: execucao.metadata_json,
          motivo,
          noId: noAtual.id,
        });

        return { processado: true, passos: passo + 1, erro: motivo };
      }

      const proximoNo = await buscarNoAtual({
        empresaId: params.empresaId,
        fluxoId: execucao.fluxo_id,
        noId: conexao.no_destino_id,
      });

      if (!proximoNo) {
        const motivo = "Bloco de destino da consulta de estoque não foi encontrado.";

        await registrarLogEstoque({
          empresaId: params.empresaId,
          execucaoId: execucao.id,
          fluxoId: execucao.fluxo_id,
          noId: noAtual.id,
          conexaoId: conexao.id,
          tipoEvento: "consulta_estoque_destino_invalido",
          descricao: motivo,
          entrada: { resultado: resultado.resultado },
          saida: { no_destino_id: conexao.no_destino_id },
        });

        await marcarExecucaoErro({
          empresaId: params.empresaId,
          execucaoId: execucao.id,
          metadataJson: execucao.metadata_json,
          motivo,
          noId: noAtual.id,
        });

        return { processado: true, passos: passo + 1, erro: motivo };
      }

      const transicionou = await transicionarParaDestino({
        empresaId: params.empresaId,
        execucaoId: execucao.id,
        noAtualId: noAtual.id,
        noDestinoId: proximoNo.id,
      });

      if (!transicionou) {
        return {
          processado: passo > 0,
          passos: passo,
          concorrencia: true,
        };
      }

      await registrarLogEstoque({
        empresaId: params.empresaId,
        execucaoId: execucao.id,
        fluxoId: execucao.fluxo_id,
        noId: noAtual.id,
        conexaoId: conexao.id,
        tipoEvento: "conexao_seguida",
        descricao: "Motor seguiu a saída correspondente ao resultado da consulta de estoque.",
        entrada: {
          resultado: resultado.resultado,
          condicao_json: conexao.condicao_json,
        },
        saida: {
          proximo_no_id: proximoNo.id,
          proximo_tipo_no: proximoNo.tipo_no,
        },
      });

      await executarNoBase({
        empresaId: params.empresaId,
        conversaId: params.conversaId,
        execucaoId: execucao.id,
        fluxoId: execucao.fluxo_id,
        no: proximoNo,
        mensagemTexto: resultado.resultado,
        numeroDestino,
      });
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : String(error);

      console.error("[AUTOMATION_ESTOQUE] Erro técnico na consulta:", {
        empresaId: params.empresaId,
        conversaId: params.conversaId,
        execucaoId: execucao.id,
        noId: noAtual.id,
        error,
      });

      await registrarLogEstoque({
        empresaId: params.empresaId,
        execucaoId: execucao.id,
        fluxoId: execucao.fluxo_id,
        noId: noAtual.id,
        tipoEvento: "consulta_estoque_erro_tecnico",
        descricao: "Erro técnico ao consultar o estoque. O fluxo não foi roteado como produto ausente.",
        entrada: noAtual.configuracao_json || {},
        saida: { erro: mensagem },
      });

      await marcarExecucaoErro({
        empresaId: params.empresaId,
        execucaoId: execucao.id,
        metadataJson: execucao.metadata_json,
        motivo: mensagem,
        noId: noAtual.id,
      });

      return { processado: true, passos: passo + 1, erro: mensagem };
    }
  }

  throw new Error(
    `Limite de ${LIMITE_CONTINUACOES_ESTOQUE} consultas de estoque consecutivas excedido.`
  );
}
