import OpenAI from "openai";
import {
  extrairUsoTokensIa,
  registrarUsoTokensIa,
  verificarSaldoTokensIa,
} from "@/lib/ia/tokens";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ConexaoIA = {
  id: string;
  nome: string | null;
  descricao_ia: string | null;
};

type ResultadoIA = {
  conexao_id: string | null;
  confianca: number;
  motivo: string;
};

type CacheInterpretacao = {
  resultado: ResultadoIA;
  expiraEm: number;
};

// A arbitragem híbrida consulta a IA interpretativa antes do agente geral.
// Se o fluxo for preservado, o motor tradicional consulta a mesma decisão logo
// em seguida. Este cache curtíssimo evita cobrar duas chamadas idênticas no
// mesmo processamento sem transformar a decisão em memória permanente.
const CACHE_INTERPRETACAO_TTL_MS = 15_000;
const CACHE_INTERPRETACAO_MAX_ITENS = 200;
const cacheInterpretacao = new Map<string, CacheInterpretacao>();

function chaveCacheInterpretacao(params: {
  mensagemCliente: string;
  conexoesDisponiveis: ConexaoIA[];
  empresaId?: string | null;
  metadata?: Record<string, any>;
}) {
  const { mensagemCliente, conexoesDisponiveis, empresaId, metadata } = params;

  return JSON.stringify({
    empresa_id: empresaId || null,
    execucao_id: metadata?.execucao_id || null,
    fluxo_id: metadata?.fluxo_id || null,
    no_id: metadata?.no_id || null,
    mensagem: String(mensagemCliente || "").trim(),
    conexoes: conexoesDisponiveis.map((conexao) => ({
      id: conexao.id,
      nome: conexao.nome || null,
      descricao_ia: conexao.descricao_ia || null,
    })),
  });
}

function buscarCacheInterpretacao(chave: string) {
  const item = cacheInterpretacao.get(chave);
  if (!item) return null;

  if (item.expiraEm <= Date.now()) {
    cacheInterpretacao.delete(chave);
    return null;
  }

  return item.resultado;
}

function salvarCacheInterpretacao(chave: string, resultado: ResultadoIA) {
  if (cacheInterpretacao.size >= CACHE_INTERPRETACAO_MAX_ITENS) {
    const primeiraChave = cacheInterpretacao.keys().next().value;
    if (primeiraChave) cacheInterpretacao.delete(primeiraChave);
  }

  cacheInterpretacao.set(chave, {
    resultado,
    expiraEm: Date.now() + CACHE_INTERPRETACAO_TTL_MS,
  });
}

export async function interpretarConexaoComIA({
  mensagemCliente,
  conexoesDisponiveis,
  empresaId,
  usuarioId,
  metadata,
}: {
  mensagemCliente: string;
  conexoesDisponiveis: ConexaoIA[];
  empresaId?: string | null;
  usuarioId?: string | null;
  metadata?: Record<string, any>;
}): Promise<ResultadoIA> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[IA] OPENAI_API_KEY não configurada.");

    return {
      conexao_id: null,
      confianca: 0,
      motivo: "OPENAI_API_KEY não configurada.",
    };
  }

  if (!mensagemCliente || conexoesDisponiveis.length === 0) {
    return {
      conexao_id: null,
      confianca: 0,
      motivo: "Mensagem vazia ou nenhuma conexão disponível.",
    };
  }

  const chaveCache = chaveCacheInterpretacao({
    mensagemCliente,
    conexoesDisponiveis,
    empresaId,
    metadata,
  });
  const resultadoCache = buscarCacheInterpretacao(chaveCache);

  if (resultadoCache) {
    console.info("[IA CONEXÃO] Reutilizando decisão interpretativa da mesma execução", {
      empresaId: empresaId || null,
      execucaoId: metadata?.execucao_id || null,
      noId: metadata?.no_id || null,
      conexaoId: resultadoCache.conexao_id,
      confianca: resultadoCache.confianca,
    });
    return resultadoCache;
  }

  if (empresaId) {
    await verificarSaldoTokensIa(empresaId);
  }

  const modelo = "gpt-5.4-mini";
  const resposta = await openai.responses.create({
    model: modelo,
    input: [
      {
        role: "system",
        content: `
Você é uma IA classificadora de intenção para um fluxo de WhatsApp.

Sua única função é escolher UMA conexão entre as conexões disponíveis.

Regras:
- Não responda ao cliente.
- Não invente conexão.
- Escolha apenas um id existente.
- Se não tiver certeza, retorne conexao_id como null.
- Analise a intenção da mensagem, mesmo com erros de digitação.
        `,
      },
      {
        role: "user",
        content: JSON.stringify({
          mensagem_cliente: mensagemCliente,
          conexoes_disponiveis: conexoesDisponiveis,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "decisao_conexao",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            conexao_id: {
              type: ["string", "null"],
            },
            confianca: {
              type: "number",
            },
            motivo: {
              type: "string",
            },
          },
          required: ["conexao_id", "confianca", "motivo"],
        },
      },
    },
  });

  if (empresaId) {
    await registrarUsoTokensIa({
      empresaId,
      usuarioId,
      origem: "interpretar_conexao",
      modelo,
      uso: extrairUsoTokensIa(resposta.usage),
      metadata: {
        conexoes_avaliadas: conexoesDisponiveis.length,
        ...(metadata || {}),
      },
    });
  }

  const resultado = JSON.parse(resposta.output_text) as ResultadoIA;
  salvarCacheInterpretacao(chaveCache, resultado);

  return resultado;
}
