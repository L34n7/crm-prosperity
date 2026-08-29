import OpenAI from "openai";
import {
  extrairUsoTokensIa,
  registrarUsoTokensIa,
  verificarSaldoTokensIa,
} from "@/lib/ia/tokens";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODELO_INTENCOES = "gpt-5.4-mini";

export type IntencaoInterpretacaoIa = {
  id: string;
  titulo: string;
  contexto_ia: string;
};

export type CorrespondenciaIntencaoIa = {
  intencao_id: string;
  confianca: number;
};

export type ResultadoInterpretacaoIntencoesIa = {
  correspondencias: CorrespondenciaIntencaoIa[];
  mensagem_fluxo: string | null;
  somente_intencao: boolean;
  motivo: string;
};

export async function interpretarIntencoesComIA({
  mensagemCliente,
  intencoesDisponiveis,
  empresaId,
  metadata,
}: {
  mensagemCliente: string;
  intencoesDisponiveis: IntencaoInterpretacaoIa[];
  empresaId: string;
  metadata?: Record<string, unknown>;
}): Promise<ResultadoInterpretacaoIntencoesIa> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[INTENCOES IA] OPENAI_API_KEY não configurada.");
    return {
      correspondencias: [],
      mensagem_fluxo: mensagemCliente,
      somente_intencao: false,
      motivo: "OPENAI_API_KEY não configurada.",
    };
  }

  const mensagem = String(mensagemCliente || "").trim();
  if (!mensagem || intencoesDisponiveis.length === 0) {
    return {
      correspondencias: [],
      mensagem_fluxo: mensagemCliente,
      somente_intencao: false,
      motivo: "Mensagem vazia ou nenhuma intenção disponível.",
    };
  }

  await verificarSaldoTokensIa(empresaId);

  const resposta = await openai.responses.create({
    model: MODELO_INTENCOES,
    input: [
      {
        role: "system",
        content: `
Você é uma camada classificadora paralela de intenções em um fluxo de WhatsApp.

Sua tarefa é identificar, com ALTA PRECISÃO, quais intenções cadastradas correspondem à mensagem recebida.

Regras obrigatórias:
- Não responda ao cliente.
- Nunca invente intenção, id, resposta, preço, endereço ou informação.
- Considere apenas os ids fornecidos.
- Uma mensagem pode corresponder a zero, uma ou várias intenções.
- Prefira falso negativo a falso positivo. Se houver dúvida relevante, não marque a intenção.
- O contexto de cada intenção define escopo positivo e negativo. Respeite o assunto específico.
- Perguntas parecidas sobre outro produto, procedimento ou assunto NÃO devem acionar a intenção.
- Erros de digitação e linguagem natural podem ser considerados, desde que o sentido continue inequívoco.
- confiança deve variar de 0 a 1.
- Se nenhuma intenção corresponder, correspondencias deve ser [].

Separação da mensagem para o fluxo principal:
- Se houver intenção e também uma resposta útil ao nó atual, preserve ESSA PARTE EXATAMENTE em mensagem_fluxo, sem reescrever, interpretar ou completar.
- Exemplo: "Sexta, e qual o valor?" pode produzir mensagem_fluxo "Sexta" se a pergunta de valor corresponder a uma intenção.
- Se a mensagem inteira for apenas intenção, mensagem_fluxo deve ser null e somente_intencao deve ser true.
- Se nenhuma intenção for identificada, mensagem_fluxo deve ser a mensagem original e somente_intencao deve ser false.
- Nunca remova conteúdo que possa ser uma resposta válida do fluxo principal.
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify({
          mensagem_cliente: mensagem,
          intencoes_disponiveis: intencoesDisponiveis,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "classificacao_intencoes_fluxo",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            correspondencias: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  intencao_id: { type: "string" },
                  confianca: { type: "number" },
                },
                required: ["intencao_id", "confianca"],
              },
            },
            mensagem_fluxo: { type: ["string", "null"] },
            somente_intencao: { type: "boolean" },
            motivo: { type: "string" },
          },
          required: [
            "correspondencias",
            "mensagem_fluxo",
            "somente_intencao",
            "motivo",
          ],
        },
      },
    },
  });

  await registrarUsoTokensIa({
    empresaId,
    origem: "interpretar_intencoes",
    modelo: MODELO_INTENCOES,
    uso: extrairUsoTokensIa(resposta.usage),
    metadata: {
      intencoes_avaliadas: intencoesDisponiveis.length,
      ...(metadata || {}),
    },
  });

  const resultado = JSON.parse(
    resposta.output_text
  ) as ResultadoInterpretacaoIntencoesIa;

  return {
    correspondencias: Array.isArray(resultado.correspondencias)
      ? resultado.correspondencias
      : [],
    mensagem_fluxo:
      typeof resultado.mensagem_fluxo === "string"
        ? resultado.mensagem_fluxo.trim() || null
        : null,
    somente_intencao: resultado.somente_intencao === true,
    motivo: String(resultado.motivo || ""),
  };
}
