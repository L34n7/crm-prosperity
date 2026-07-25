import { NextResponse } from "next/server";

import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const db = getSupabaseAdmin();
type Objeto = Record<string, unknown>;

type RespostaConversa = {
  pergunta_id?: unknown;
  pergunta?: unknown;
  resposta?: unknown;
  respondida_em?: unknown;
};

function objeto(valor: unknown): Objeto {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Objeto)
    : {};
}

function texto(valor: unknown, limite = 160) {
  return String(valor || "").trim().slice(0, limite);
}

function listasIguais(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, indice) => item === b[indice]);
}

async function respostaSessaoConcluida(params: {
  sessaoId: string;
  empresaId: string;
  usuarioId: string;
}) {
  const { data: sessao } = await db
    .from("automacao_assistente_ia_execucoes")
    .select("id, automacao_id, status, resposta_ia_json, fluxo_gerado_json")
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("modo", "criar_fluxo")
    .maybeSingle();

  if (!sessao || sessao.status !== "concluido" || !sessao.automacao_id) {
    return null;
  }

  const { data: fluxo } = await db
    .from("automacao_fluxos")
    .select(
      "id, nome, descricao, status, canal, fluxo_padrao, created_at, updated_at, configuracao_json"
    )
    .eq("id", sessao.automacao_id)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (!fluxo) return null;

  return NextResponse.json({
    ok: true,
    proposta_id: sessao.id,
    sessao_id: sessao.id,
    fase: "concluido",
    modo: "criar_fluxo",
    plano: sessao.resposta_ia_json,
    fluxo_gerado: sessao.fluxo_gerado_json,
    fluxo_criado: fluxo,
    materializado: true,
    recuperado: true,
    mensagem: "O fluxo já havia sido criado e foi recuperado com segurança.",
    validacao: { valido: true, erros: [], avisos: [] },
    avisos: [],
  });
}

/**
 * Repara sessões afetadas pela consolidação antiga sem alterar a fila de
 * perguntas. As respostas já registradas no histórico voltam a fazer parte de
 * perguntas_respondidas, evitando que o backend retorne para uma pergunta já
 * concluída e rejeite a pergunta exibida no navegador com HTTP 409.
 */
async function repararProgressoSessao(params: {
  sessaoId: string;
  empresaId: string;
  usuarioId: string;
}) {
  const { data: sessao } = await db
    .from("automacao_assistente_ia_execucoes")
    .select("contexto_json")
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("status", "processando")
    .maybeSingle();

  if (!sessao) return;

  const contexto = objeto(sessao.contexto_json);
  const conversa = objeto(contexto.conversa);
  const respondidasAtuais = Array.isArray(conversa.perguntas_respondidas)
    ? conversa.perguntas_respondidas
        .map((item) => texto(item, 260))
        .filter(Boolean)
    : [];
  const respostasAtuais = Array.isArray(conversa.respostas)
    ? (conversa.respostas as RespostaConversa[])
    : [];

  const respostasPorId = new Map<string, RespostaConversa>();
  const respostasSemId: RespostaConversa[] = [];

  for (const resposta of respostasAtuais) {
    const id = texto(resposta?.pergunta_id, 260);
    if (!id) {
      respostasSemId.push(resposta);
      continue;
    }
    if (!respostasPorId.has(id)) respostasPorId.set(id, resposta);
  }

  const respostasNormalizadas = [
    ...respostasSemId,
    ...Array.from(respostasPorId.values()),
  ];
  const respondidasNormalizadas = Array.from(
    new Set([...respondidasAtuais, ...respostasPorId.keys()])
  );

  const respostasMudaram = respostasNormalizadas.length !== respostasAtuais.length;
  const respondidasMudaram = !listasIguais(
    respondidasAtuais,
    respondidasNormalizadas
  );

  if (!respostasMudaram && !respondidasMudaram) return;

  await db
    .from("automacao_assistente_ia_execucoes")
    .update({
      contexto_json: {
        ...contexto,
        conversa: {
          ...conversa,
          perguntas_respondidas: respondidasNormalizadas,
          respostas: respostasNormalizadas,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("status", "processando");
}

export async function executarComRecuperacaoSessao(
  request: Request,
  executar: (request: Request) => Promise<Response>
) {
  const body = objeto(await request.clone().json().catch(() => ({})));
  const sessaoId = texto(body.sessao_id || body.sessaoId, 120);
  const acao = texto(body.acao, 40);
  const contexto = await getUsuarioContexto();
  const empresaId = contexto.ok ? contexto.usuario.empresa_id : null;
  const usuarioId = contexto.ok ? contexto.usuario.id : null;

  if (empresaId && usuarioId && sessaoId) {
    const parametros = { sessaoId, empresaId, usuarioId };

    if (["retomar", "criar"].includes(acao)) {
      const concluida = await respostaSessaoConcluida(parametros);
      if (concluida) return concluida;
    }

    await repararProgressoSessao(parametros);
  }

  const response = await executar(request);

  if (empresaId && usuarioId && sessaoId && response.ok && acao !== "criar") {
    await repararProgressoSessao({ sessaoId, empresaId, usuarioId });
  }

  return response;
}
