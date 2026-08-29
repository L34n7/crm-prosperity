import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import {
  SaldoTokensIaEsgotadoError,
  extrairUsoTokensIa,
  registrarUsoTokensIa,
  verificarSaldoTokensIa,
} from "@/lib/ia/tokens";

const supabaseAdmin = getSupabaseAdmin();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODELO_GERACAO_CONTEXTO = "gpt-5.4-mini";

const TIPOS_ACAO_PERMITIDOS = new Set([
  "enviar_texto",
  "enviar_imagem",
  "enviar_video",
  "enviar_audio",
  "enviar_arquivo",
  "enviar_botoes",
  "botao_redirect",
  "transferir_setor",
  "parar_fluxo",
  "encerrar",
]);

type RouteParams = {
  params: Promise<{ id: string }>;
};

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function normalizarAcoes(valor: unknown) {
  if (!Array.isArray(valor)) return [];

  return valor
    .map((acao, index) => {
      const item = objeto(acao);
      const tipo = String(item.tipo || "").trim();
      if (!TIPOS_ACAO_PERMITIDOS.has(tipo)) return null;
      return {
        id: String(item.id || `acao_${index + 1}`).trim(),
        tipo,
        configuracao_json: objeto(item.configuracao_json),
      };
    })
    .filter(Boolean);
}

async function obterContextoUsuario(permissao: "fluxos.visualizar" | "fluxos.editar") {
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) {
    return {
      erro: NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      ),
      usuario: null,
    };
  }

  const bloqueio = bloquearSemPermissao(resultado.usuario, permissao);
  if (bloqueio) return { erro: bloqueio, usuario: null };

  if (!resultado.usuario?.empresa_id) {
    return {
      erro: NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      ),
      usuario: null,
    };
  }

  return { erro: null, usuario: resultado.usuario };
}

async function validarFluxo(empresaId: string, fluxoId: string) {
  const { data: fluxo, error } = await supabaseAdmin
    .from("automacao_fluxos")
    .select("id, nome, descricao, configuracao_json")
    .eq("id", fluxoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (error) throw new Error(`Erro ao buscar fluxo: ${error.message}`);
  return fluxo;
}

async function gerarContextoIa(params: {
  empresaId: string;
  usuarioId?: string | null;
  fluxo: Record<string, unknown>;
  titulo: string;
  resposta: string;
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }

  await verificarSaldoTokensIa(params.empresaId);

  const { data: nos } = await supabaseAdmin
    .from("automacao_nos")
    .select("tipo_no, titulo, descricao, configuracao_json")
    .eq("empresa_id", params.empresaId)
    .eq("fluxo_id", String(params.fluxo.id || ""))
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(30);

  const resumoNos = (nos || []).map((no) => ({
    tipo: no.tipo_no,
    titulo: no.titulo,
    descricao: no.descricao,
    mensagem:
      typeof no.configuracao_json?.mensagem === "string"
        ? no.configuracao_json.mensagem
        : null,
  }));

  const respostaIa = await openai.responses.create({
    model: MODELO_GERACAO_CONTEXTO,
    input: [
      {
        role: "system",
        content: `
Você cria contexto semântico de alta precisão para classificar uma intenção dentro de um fluxo de atendimento por WhatsApp.

Escreva um único texto curto e operacional em português do Brasil que oriente outra IA a decidir quando acionar a intenção.

Regras:
- Explique claramente o assunto específico da intenção.
- Inclua variações naturais de linguagem apenas como exemplos, sem depender de palavras-chave exatas.
- Inclua limites negativos para evitar falso positivo, principalmente assuntos, produtos ou procedimentos diferentes.
- Considere o fluxo somente para desambiguar o escopo.
- Não invente preço, convênio, endereço ou regra diferente da resposta configurada.
- Não escreva uma resposta ao cliente; escreva somente instrução de classificação.
- Prefira alta precisão a abrangência excessiva.
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify({
          intencao: params.titulo,
          resposta_configurada: params.resposta,
          fluxo: {
            nome: params.fluxo.nome,
            descricao: params.fluxo.descricao,
            blocos: resumoNos,
          },
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "contexto_intencao",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            contexto: { type: "string" },
          },
          required: ["contexto"],
        },
      },
    },
  });

  await registrarUsoTokensIa({
    empresaId: params.empresaId,
    usuarioId: params.usuarioId || null,
    origem: "gerar_contexto_intencao",
    modelo: MODELO_GERACAO_CONTEXTO,
    uso: extrairUsoTokensIa(respostaIa.usage),
    metadata: {
      fluxo_id: params.fluxo.id,
      intencao_titulo: params.titulo,
    },
  });

  const parsed = JSON.parse(respostaIa.output_text) as { contexto?: string };
  const contexto = String(parsed.contexto || "").trim();
  if (!contexto) throw new Error("A IA não retornou um contexto válido.");
  return contexto;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: fluxoId } = await params;
    const auth = await obterContextoUsuario("fluxos.visualizar");
    if (auth.erro || !auth.usuario) return auth.erro;

    const fluxo = await validarFluxo(auth.usuario.empresa_id, fluxoId);
    if (!fluxo) {
      return NextResponse.json(
        { ok: false, error: "Fluxo não encontrado." },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("automacao_intencoes")
      .select("*")
      .eq("empresa_id", auth.usuario.empresa_id)
      .eq("fluxo_id", fluxoId)
      .order("ordem", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Erro ao buscar intenções: ${error.message}`);
    return NextResponse.json({ ok: true, intencoes: data || [] });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao buscar intenções.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: fluxoId } = await params;
    const auth = await obterContextoUsuario("fluxos.editar");
    if (auth.erro || !auth.usuario) return auth.erro;

    const body = objeto(await req.json());
    const titulo = String(body.titulo || "").trim();
    const resposta = String(body.resposta || "").trim();

    if (!titulo || !resposta) {
      return NextResponse.json(
        { ok: false, error: "Intenção e resposta são obrigatórias." },
        { status: 400 }
      );
    }

    const fluxo = await validarFluxo(auth.usuario.empresa_id, fluxoId);
    if (!fluxo) {
      return NextResponse.json(
        { ok: false, error: "Fluxo não encontrado." },
        { status: 404 }
      );
    }

    const contextoIa = await gerarContextoIa({
      empresaId: auth.usuario.empresa_id,
      usuarioId: auth.usuario.id,
      fluxo: fluxo as Record<string, unknown>,
      titulo,
      resposta,
    });

    const { data: ultima } = await supabaseAdmin
      .from("automacao_intencoes")
      .select("ordem")
      .eq("empresa_id", auth.usuario.empresa_id)
      .eq("fluxo_id", fluxoId)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabaseAdmin
      .from("automacao_intencoes")
      .insert({
        empresa_id: auth.usuario.empresa_id,
        fluxo_id: fluxoId,
        titulo,
        resposta,
        contexto_ia: contextoIa,
        status: "ativa",
        ordem: Math.max(0, Number(ultima?.ordem ?? -1) + 1),
        acoes_json: [],
      })
      .select("*")
      .single();

    if (error) throw new Error(`Erro ao salvar intenção: ${error.message}`);
    return NextResponse.json({ ok: true, intencao: data });
  } catch (error) {
    if (error instanceof SaldoTokensIaEsgotadoError) {
      return NextResponse.json(
        { ok: false, error: "Saldo de tokens de IA esgotado." },
        { status: 402 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao criar intenção.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: fluxoId } = await params;
    const auth = await obterContextoUsuario("fluxos.editar");
    if (auth.erro || !auth.usuario) return auth.erro;

    const body = objeto(await req.json());
    const intencaoId = String(body.id || "").trim();
    if (!intencaoId) {
      return NextResponse.json(
        { ok: false, error: "Intenção não informada." },
        { status: 400 }
      );
    }

    const fluxo = await validarFluxo(auth.usuario.empresa_id, fluxoId);
    if (!fluxo) {
      return NextResponse.json(
        { ok: false, error: "Fluxo não encontrado." },
        { status: 404 }
      );
    }

    const atualizacao: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.titulo !== undefined) {
      const titulo = String(body.titulo || "").trim();
      if (!titulo) throw new Error("A intenção não pode ficar vazia.");
      atualizacao.titulo = titulo;
    }

    if (body.resposta !== undefined) {
      const resposta = String(body.resposta || "").trim();
      if (!resposta) throw new Error("A resposta não pode ficar vazia.");
      atualizacao.resposta = resposta;
    }

    if (body.contexto_ia !== undefined) {
      const contexto = String(body.contexto_ia || "").trim();
      if (!contexto) throw new Error("O contexto para IA não pode ficar vazio.");
      atualizacao.contexto_ia = contexto;
    }

    if (body.status !== undefined) {
      const status = String(body.status || "");
      if (status !== "ativa" && status !== "pausada") {
        throw new Error("Status de intenção inválido.");
      }
      atualizacao.status = status;
    }

    if (body.acoes_json !== undefined) {
      atualizacao.acoes_json = normalizarAcoes(body.acoes_json);
    }

    const { data, error } = await supabaseAdmin
      .from("automacao_intencoes")
      .update(atualizacao)
      .eq("id", intencaoId)
      .eq("empresa_id", auth.usuario.empresa_id)
      .eq("fluxo_id", fluxoId)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(`Erro ao atualizar intenção: ${error.message}`);
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Intenção não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, intencao: data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Erro ao atualizar intenção.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: fluxoId } = await params;
    const auth = await obterContextoUsuario("fluxos.editar");
    if (auth.erro || !auth.usuario) return auth.erro;

    const body = objeto(await req.json());
    const intencaoId = String(body.id || "").trim();
    if (!intencaoId) {
      return NextResponse.json(
        { ok: false, error: "Intenção não informada." },
        { status: 400 }
      );
    }

    const fluxo = await validarFluxo(auth.usuario.empresa_id, fluxoId);
    if (!fluxo) {
      return NextResponse.json(
        { ok: false, error: "Fluxo não encontrado." },
        { status: 404 }
      );
    }

    const { error } = await supabaseAdmin
      .from("automacao_intencoes")
      .delete()
      .eq("id", intencaoId)
      .eq("empresa_id", auth.usuario.empresa_id)
      .eq("fluxo_id", fluxoId);

    if (error) throw new Error(`Erro ao excluir intenção: ${error.message}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao excluir intenção.",
      },
      { status: 500 }
    );
  }
}
