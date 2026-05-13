import OpenAI from "openai";

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

export async function interpretarConexaoComIA({
  mensagemCliente,
  conexoesDisponiveis,
}: {
  mensagemCliente: string;
  conexoesDisponiveis: ConexaoIA[];
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

  const resposta = await openai.responses.create({
    model: "gpt-5.4-mini",
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

  return JSON.parse(resposta.output_text) as ResultadoIA;
}