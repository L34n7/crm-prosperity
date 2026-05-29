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

  return JSON.parse(resposta.output_text) as ResultadoIA;
}
