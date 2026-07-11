import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  extrairUsoTokensIa,
  registrarUsoTokensIa,
  SaldoTokensIaEsgotadoError,
  verificarSaldoTokensIa,
} from "@/lib/ia/tokens";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseAdmin = getSupabaseAdmin();

type BlocoContexto = {
  id?: string;
  tipo?: string;
  titulo?: string;
  mensagem?: string;
};

type ConexaoContexto = {
  id?: string;
  nome?: string;
  idResposta?: string;
  textoOpcao?: string;
  descricaoAtual?: string;
};

type OutraConexaoContexto = {
  nome?: string;
  destino?: string;
  descricao?: string;
};

function texto(valor: unknown, limite = 700) {
  return String(valor || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limite);
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function bloco(valor: unknown): BlocoContexto {
  const item = objeto(valor);

  return {
    id: texto(item.id, 120),
    tipo: texto(item.tipo, 80),
    titulo: texto(item.titulo, 180),
    mensagem: texto(item.mensagem, 700),
  };
}

function conexao(valor: unknown): ConexaoContexto {
  const item = objeto(valor);

  return {
    id: texto(item.id, 120),
    nome: texto(item.nome, 180),
    idResposta: texto(item.idResposta, 180),
    textoOpcao: texto(item.textoOpcao, 180),
    descricaoAtual: texto(item.descricaoAtual, 700),
  };
}

function outrasConexoes(valor: unknown): OutraConexaoContexto[] {
  if (!Array.isArray(valor)) return [];

  return valor.slice(0, 12).map((item) => {
    const conexaoItem = objeto(item);

    return {
      nome: texto(conexaoItem.nome, 180),
      destino: texto(conexaoItem.destino, 180),
      descricao: texto(conexaoItem.descricao, 300),
    };
  });
}

function extrairDescricao(outputText: string) {
  const json = JSON.parse(outputText || "{}") as { descricao?: unknown };

  return texto(json.descricao, 500);
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY nao configurada." },
        { status: 500 }
      );
    }

    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const fluxoId = texto(body?.fluxoId || body?.fluxo_id, 120);
    const conexaoId = texto(body?.conexaoId || body?.conexao_id, 120);
    const contextoRaw = objeto(body?.contexto);

    if (fluxoId) {
      const { data: fluxo, error: fluxoError } = await supabaseAdmin
        .from("automacao_fluxos")
        .select("id")
        .eq("id", fluxoId)
        .eq("empresa_id", usuario.empresa_id)
        .maybeSingle();

      if (fluxoError) {
        throw new Error(`Erro ao validar fluxo: ${fluxoError.message}`);
      }

      if (!fluxo) {
        return NextResponse.json(
          { ok: false, error: "Fluxo nao encontrado." },
          { status: 404 }
        );
      }
    }

    await verificarSaldoTokensIa(usuario.empresa_id);

    const contexto = {
      bloco_origem: bloco(contextoRaw.blocoOrigem),
      conexao: conexao(contextoRaw.conexao),
      bloco_destino: bloco(contextoRaw.blocoDestino),
      outras_conexoes_da_mesma_origem: outrasConexoes(
        contextoRaw.outrasConexoes
      ),
    };

    const modelo = "gpt-5.4-mini";
    const resposta = await openai.responses.create({
      model: modelo,
      input: [
        {
          role: "system",
          content: `
Voce gera descricoes de intencao para conexoes de um fluxo de WhatsApp.

Sua unica tarefa e escrever UMA descricao curta que ajude outra IA a decidir quando seguir por esta conexao.

Regras:
- Nao escreva resposta para o cliente.
- Nao use markdown.
- Comece com "Use esta conexão quando".
- Use o contexto do bloco de origem, da opcao/ID de resposta, do destino e das outras conexoes.
- Diferencie esta conexao das outras opcoes quando houver conexoes irmas.
- Seja especifico, mas mantenha a descricao em uma frase.
          `,
        },
        {
          role: "user",
          content: JSON.stringify(contexto),
        },
      ],
      max_output_tokens: 180,
      text: {
        format: {
          type: "json_schema",
          name: "descricao_conexao_ia",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              descricao: {
                type: "string",
              },
            },
            required: ["descricao"],
          },
        },
      },
    });

    const descricao = extrairDescricao(resposta.output_text);

    if (!descricao) {
      throw new Error("A IA nao retornou uma descricao valida.");
    }

    await registrarUsoTokensIa({
      empresaId: usuario.empresa_id,
      usuarioId: usuario.id,
      origem: "gerar_descricao_conexao",
      modelo,
      uso: extrairUsoTokensIa(resposta.usage),
      metadata: {
        fluxo_id: fluxoId || null,
        conexao_id: conexaoId || null,
      },
    });

    return NextResponse.json({
      ok: true,
      descricao,
    });
  } catch (error: unknown) {
    if (error instanceof SaldoTokensIaEsgotadoError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Saldo de tokens de IA esgotado. Adicione saldo ou aumente o limite para gerar a intenção.",
        },
        { status: 402 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao gerar descrição da conexão.",
      },
      { status: 500 }
    );
  }
}
