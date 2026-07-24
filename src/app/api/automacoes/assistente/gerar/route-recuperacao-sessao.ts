import { NextResponse } from "next/server";

import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const db = getSupabaseAdmin();
type Objeto = Record<string, unknown>;

function objeto(valor: unknown): Objeto {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? valor as Objeto
    : {};
}

function texto(valor: unknown, limite = 160) {
  return String(valor || "").trim().slice(0, limite);
}

function filtrarPerguntasExcesso(perguntas: unknown[]) {
  const lista = perguntas.map(objeto);
  const primeira = lista.find((item) => texto(item.id).startsWith("setor_excesso:"));
  const ref = primeira ? texto(primeira.id).split(":").slice(1).join(":") : "";

  if (!ref) return lista;

  return lista.filter((item) => {
    const id = texto(item.id, 260);
    if (!/^(setor_excesso|distribuicao_excesso|atendente_excesso):/.test(id)) {
      return true;
    }
    return id.endsWith(`:${ref}`);
  });
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
    .select("id, nome, descricao, status, canal, fluxo_padrao, created_at, updated_at, configuracao_json")
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

async function consolidarPerguntas(sessaoId: string, empresaId: string, usuarioId: string) {
  const { data: sessao } = await db
    .from("automacao_assistente_ia_execucoes")
    .select("contexto_json")
    .eq("id", sessaoId)
    .eq("empresa_id", empresaId)
    .eq("usuario_id", usuarioId)
    .eq("status", "processando")
    .maybeSingle();

  if (!sessao) return null;
  const contexto = objeto(sessao.contexto_json);
  const conversa = objeto(contexto.conversa);
  const perguntas = Array.isArray(conversa.perguntas) ? conversa.perguntas : [];
  const filtradas = filtrarPerguntasExcesso(perguntas);

  if (filtradas.length === perguntas.length) return null;

  const respondidas = Array.isArray(conversa.perguntas_respondidas)
    ? conversa.perguntas_respondidas.map((item) => texto(item, 260))
    : [];
  const ids = new Set(filtradas.map((item) => texto(item.id, 260)));

  const novoContexto = {
    ...contexto,
    conversa: {
      ...conversa,
      perguntas: filtradas,
      perguntas_respondidas: respondidas.filter((id) => ids.has(id)),
    },
  };

  await db
    .from("automacao_assistente_ia_execucoes")
    .update({ contexto_json: novoContexto, updated_at: new Date().toISOString() })
    .eq("id", sessaoId)
    .eq("empresa_id", empresaId)
    .eq("usuario_id", usuarioId)
    .eq("status", "processando");

  return novoContexto;
}

export async function executarComRecuperacaoSessao(
  request: Request,
  executar: (request: Request) => Promise<Response>
) {
  const body = objeto(await request.clone().json().catch(() => ({})));
  const sessaoId = texto(body.sessao_id || body.sessaoId, 120);
  const acao = texto(body.acao, 40);
  const contexto = await getUsuarioContexto();

  if (contexto.ok && contexto.usuario.empresa_id && sessaoId && ["retomar", "criar"].includes(acao)) {
    const concluida = await respostaSessaoConcluida({
      sessaoId,
      empresaId: contexto.usuario.empresa_id,
      usuarioId: contexto.usuario.id,
    });
    if (concluida) return concluida;
  }

  const response = await executar(request);

  if (!contexto.ok || !contexto.usuario.empresa_id || !sessaoId || !response.ok) {
    return response;
  }

  if (acao !== "criar") {
    await consolidarPerguntas(
      sessaoId,
      contexto.usuario.empresa_id,
      contexto.usuario.id
    );
  }

  return response;
}
