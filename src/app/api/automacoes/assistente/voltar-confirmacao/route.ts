import { NextResponse } from "next/server";

import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const db = getSupabaseAdmin();
const CHAVE_ESTADO_ESTAVEL = "conversa_estavel_v3";

type Objeto = Record<string, unknown>;

type RespostaEstado = {
  pergunta_id: string;
  pergunta: string;
  resposta: string;
  respondida_em: string;
};

function obj(valor: unknown): Objeto {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Objeto)
    : {};
}

function txt(valor: unknown, limite = 1200) {
  return String(valor || "").trim().slice(0, limite);
}

function listaStrings(valor: unknown) {
  return Array.isArray(valor)
    ? valor.map((item) => txt(item, 240)).filter(Boolean)
    : [];
}

function normalizarRespostas(valor: unknown): RespostaEstado[] {
  if (!Array.isArray(valor)) return [];

  return valor
    .map((itemBase) => {
      const item = obj(itemBase);
      const perguntaId = txt(item.pergunta_id, 240);
      if (!perguntaId) return null;

      return {
        pergunta_id: perguntaId,
        pergunta: txt(item.pergunta),
        resposta: txt(item.resposta),
        respondida_em: txt(item.respondida_em, 80),
      } satisfies RespostaEstado;
    })
    .filter((item): item is RespostaEstado => Boolean(item));
}

export async function POST(request: Request) {
  const contextoUsuario = await getUsuarioContexto();
  if (!contextoUsuario.ok) {
    return NextResponse.json(
      { ok: false, error: contextoUsuario.error },
      { status: contextoUsuario.status }
    );
  }

  const empresaId = contextoUsuario.usuario.empresa_id;
  const usuarioId = contextoUsuario.usuario.id;
  if (!empresaId || !usuarioId) {
    return NextResponse.json(
      { ok: false, error: "Empresa ou usuário não identificado." },
      { status: 403 }
    );
  }

  const body = obj(await request.json().catch(() => ({})));
  const sessaoId = txt(body.sessao_id || body.sessaoId, 120);
  if (!sessaoId) {
    return NextResponse.json(
      { ok: false, error: "Sessão do assistente não informada." },
      { status: 400 }
    );
  }

  const { data: sessao, error } = await db
    .from("automacao_assistente_ia_execucoes")
    .select("id, contexto_json, resposta_ia_json, status")
    .eq("id", sessaoId)
    .eq("empresa_id", empresaId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  if (!sessao || sessao.status !== "processando") {
    return NextResponse.json(
      { ok: false, error: "A sessão não está mais disponível para edição." },
      { status: 404 }
    );
  }

  const contexto = obj(sessao.contexto_json);
  const estadoBase = obj(contexto[CHAVE_ESTADO_ESTAVEL] || contexto.conversa);
  const perguntas = Array.isArray(estadoBase.perguntas)
    ? estadoBase.perguntas.map(obj)
    : [];
  const respostas = normalizarRespostas(estadoBase.respostas);

  if (respostas.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Não existe uma confirmação anterior para revisar." },
      { status: 422 }
    );
  }

  const ultimaResposta = respostas[respostas.length - 1];
  const indicePergunta = perguntas.findIndex(
    (pergunta) => txt(pergunta.id, 240) === ultimaResposta.pergunta_id
  );
  const indiceVoltar = indicePergunta >= 0 ? indicePergunta : 0;
  const idsAnteriores = new Set(
    perguntas
      .slice(0, indiceVoltar)
      .map((pergunta) => txt(pergunta.id, 240))
      .filter(Boolean)
  );

  const respostasRestantes = respostas.filter((resposta) => {
    const indice = perguntas.findIndex(
      (pergunta) => txt(pergunta.id, 240) === resposta.pergunta_id
    );
    return indice >= 0 && indice < indiceVoltar;
  });
  const perguntasRespondidas = listaStrings(
    estadoBase.perguntas_respondidas
  ).filter((id) => idsAnteriores.has(id));
  const perguntasPuladas = listaStrings(estadoBase.perguntas_puladas).filter(
    (id) => idsAnteriores.has(id)
  );

  const estadoAtualizado = {
    ...estadoBase,
    perguntas_respondidas: perguntasRespondidas,
    perguntas_puladas: perguntasPuladas,
    respostas: respostasRestantes,
  };
  const contextoAtualizado = {
    ...contexto,
    conversa: estadoAtualizado,
    [CHAVE_ESTADO_ESTAVEL]: estadoAtualizado,
  };

  const { error: erroAtualizacao } = await db
    .from("automacao_assistente_ia_execucoes")
    .update({
      contexto_json: contextoAtualizado,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessaoId)
    .eq("empresa_id", empresaId)
    .eq("usuario_id", usuarioId)
    .eq("status", "processando");

  if (erroAtualizacao) {
    return NextResponse.json(
      { ok: false, error: erroAtualizacao.message },
      { status: 500 }
    );
  }

  const respondidas = new Set(perguntasRespondidas);
  const perguntaAtual =
    perguntas.find((pergunta) => !respondidas.has(txt(pergunta.id, 240))) ||
    null;
  const idsPerguntas = new Set(
    perguntas.map((pergunta) => txt(pergunta.id, 240)).filter(Boolean)
  );
  const totalRespondidas = perguntasRespondidas.filter((id) =>
    idsPerguntas.has(id)
  ).length;

  return NextResponse.json({
    ok: true,
    proposta_id: sessaoId,
    sessao_id: sessaoId,
    modo: "criar_fluxo",
    fase: perguntaAtual ? "coletando" : "pronto",
    mensagem:
      "Voltei para a confirmação anterior. Altere a resposta e confirme novamente.",
    pergunta: perguntaAtual,
    progresso: {
      respondidas: totalRespondidas,
      total: perguntas.length,
    },
    historico: respostasRestantes.map((resposta) => ({
      pergunta: resposta.pergunta,
      resposta: resposta.resposta,
    })),
    plano: sessao.resposta_ia_json,
  });
}
