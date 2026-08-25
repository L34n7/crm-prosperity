import OpenAI from "openai";
import {
  SaldoTokensIaEsgotadoError,
  extrairUsoTokensIa,
  registrarUsoTokensIa,
  verificarSaldoTokensIa,
} from "@/lib/ia/tokens";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type TipoIntencaoBuscaEstoqueIa =
  | "produto_exato"
  | "categoria"
  | "necessidade";

export type InterpretacaoBuscaEstoqueIa = {
  termo_principal: string;
  termos_relacionados: string[];
  tipo_intencao: TipoIntencaoBuscaEstoqueIa;
  confianca: number;
  usou_ia: boolean;
  fallback_motivo: string;
};

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function fallback(termo: string, motivo: string): InterpretacaoBuscaEstoqueIa {
  return {
    termo_principal: termo,
    termos_relacionados: [],
    tipo_intencao: "produto_exato",
    confianca: 0,
    usou_ia: false,
    fallback_motivo: motivo,
  };
}

function normalizarTermosRelacionados(valor: unknown, termoPrincipal: string) {
  const itens = Array.isArray(valor) ? valor : [];
  const vistos = new Set([termoPrincipal.toLowerCase()]);
  const resultado: string[] = [];

  for (const item of itens) {
    const termo = texto(item).slice(0, 180);
    const chave = termo.toLowerCase();

    if (!termo || vistos.has(chave)) continue;

    vistos.add(chave);
    resultado.push(termo);

    if (resultado.length >= 3) break;
  }

  return resultado;
}

export async function interpretarBuscaEstoqueComIA(params: {
  termoCliente: string;
  empresaId: string;
  metadata?: Record<string, unknown>;
}): Promise<InterpretacaoBuscaEstoqueIa> {
  const termoCliente = texto(params.termoCliente).slice(0, 1200);

  if (!termoCliente) {
    return fallback("", "termo_vazio");
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn("[IA_ESTOQUE] OPENAI_API_KEY não configurada. Usando busca direta.");
    return fallback(termoCliente, "openai_nao_configurada");
  }

  try {
    await verificarSaldoTokensIa(params.empresaId);
  } catch (error) {
    if (error instanceof SaldoTokensIaEsgotadoError) {
      return fallback(termoCliente, "tokens_esgotados");
    }

    console.error("[IA_ESTOQUE] Erro ao verificar saldo. Usando busca direta:", error);
    return fallback(termoCliente, "erro_verificar_saldo");
  }

  const modelo = process.env.OPENAI_ESTOQUE_MODEL || "gpt-5.4-mini";
  let resposta;

  try {
    resposta = await openai.responses.create({
      model: modelo,
      input: [
        {
          role: "system",
          content: `
Você interpreta o que um cliente deseja comprar para melhorar uma busca em um catálogo de estoque.

Sua função NÃO é escolher ou inventar produtos do catálogo. Você não conhece o catálogo.
Retorne apenas termos de busca que serão usados posteriormente no banco de dados, que é a fonte da verdade.

Regras:
- Preserve marca, linha, modelo, espécie, fase de vida, porte, tamanho, peso, volume, sabor, cor e outras características citadas.
- Entenda linguagem informal, abreviações, erros de digitação e sinônimos comuns.
- Remova frases conversacionais que não ajudam a localizar o produto.
- termo_principal deve ser curto, objetivo e adequado para pesquisar nomes de produtos reais.
- termos_relacionados deve conter no máximo 3 alternativas úteis e não pode inventar marcas ou especificações que o cliente não informou.
- Se o cliente descreveu uma necessidade em vez de um nome exato, represente essa necessidade de forma pesquisável sem afirmar que um produto específico existe.
- Não responda ao cliente.
        `.trim(),
        },
        {
          role: "user",
          content: JSON.stringify({ mensagem_cliente: termoCliente }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "interpretacao_busca_estoque",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              termo_principal: { type: "string" },
              termos_relacionados: {
                type: "array",
                items: { type: "string" },
                maxItems: 3,
              },
              tipo_intencao: {
                type: "string",
                enum: ["produto_exato", "categoria", "necessidade"],
              },
              confianca: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
            },
            required: [
              "termo_principal",
              "termos_relacionados",
              "tipo_intencao",
              "confianca",
            ],
          },
        },
      },
    });
  } catch (error) {
    console.error("[IA_ESTOQUE] Erro na interpretação. Usando busca direta:", error);
    return fallback(termoCliente, "erro_chamada_ia");
  }

  await registrarUsoTokensIa({
    empresaId: params.empresaId,
    origem: "consultar_estoque_ia",
    modelo,
    uso: extrairUsoTokensIa(resposta.usage),
    metadata: {
      ...(params.metadata || {}),
      tipo: "interpretacao_busca_estoque",
    },
  });

  try {
    const parsed = JSON.parse(resposta.output_text) as {
      termo_principal?: unknown;
      termos_relacionados?: unknown;
      tipo_intencao?: unknown;
      confianca?: unknown;
    };
    const termoPrincipal = texto(parsed.termo_principal).slice(0, 180);
    const tipo = texto(parsed.tipo_intencao) as TipoIntencaoBuscaEstoqueIa;
    const confianca = Number(parsed.confianca);

    if (!termoPrincipal) {
      return fallback(termoCliente, "resposta_ia_sem_termo");
    }

    return {
      termo_principal: termoPrincipal,
      termos_relacionados: normalizarTermosRelacionados(
        parsed.termos_relacionados,
        termoPrincipal
      ),
      tipo_intencao:
        tipo === "categoria" || tipo === "necessidade" ? tipo : "produto_exato",
      confianca: Number.isFinite(confianca)
        ? Math.max(0, Math.min(1, confianca))
        : 0,
      usou_ia: true,
      fallback_motivo: "",
    };
  } catch (error) {
    console.error("[IA_ESTOQUE] Resposta estruturada inválida. Usando busca direta:", error);
    return fallback(termoCliente, "resposta_ia_invalida");
  }
}
