import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const db = getSupabaseAdmin();
type Estrategia = "fila_setor" | "atendente_especifico" | "rodizio_aleatorio" | "menos_conversas";
type Pergunta = {
  id: string; etapa_ref: string; campo: string; tipo: "selecao" | "texto";
  mensagem: string; ajuda: string | null; obrigatoria: boolean; bloqueada: boolean;
  valor_sugerido: string | null; opcoes: Array<{ id: string; label: string; descricao: string | null }>;
};
type Estado = {
  versao: number; instrucao: string; perguntas: Pergunta[]; perguntas_respondidas: string[];
  respostas: Array<{ pergunta_id: string; pergunta: string; resposta: string; respondida_em: string }>;
};
type Sessao = { id: string; empresa_id: string; usuario_id: string; contexto_json: unknown; resposta_ia_json: unknown; status: string };
type Setor = { id: string; nome: string };
type Atendente = { id: string; nome: string; email: string | null; setor_ids: string[] };

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function txt(v: unknown, n = 1000) { return String(v || "").trim().slice(0, n); }
function estrategia(v: unknown): Estrategia {
  const e = txt(v, 80);
  return ["fila_setor", "atendente_especifico", "rodizio_aleatorio", "menos_conversas"].includes(e)
    ? (e as Estrategia) : "fila_setor";
}
function estado(v: unknown): Estado {
  const x = obj(v);
  return {
    versao: Number(x.versao || 1), instrucao: txt(x.instrucao, 4000),
    perguntas: Array.isArray(x.perguntas) ? (x.perguntas as Pergunta[]) : [],
    perguntas_respondidas: Array.isArray(x.perguntas_respondidas) ? x.perguntas_respondidas.map((i) => txt(i, 240)) : [],
    respostas: Array.isArray(x.respostas) ? (x.respostas as Estado["respostas"]) : [],
  };
}
function proxima(e: Estado) {
  const feitas = new Set(e.perguntas_respondidas);
  return e.perguntas.find((p) => !feitas.has(p.id)) || null;
}
function etapas(plano: unknown) {
  const x = obj(plano);
  return Array.isArray(x.etapas) ? x.etapas.map(obj) : [];
}
function etapa(plano: unknown, ref: string) {
  return etapas(plano).find((e) => txt(e.ref, 160) === ref) || null;
}
function atualizar(plano: unknown, etapaRef: string, mudancas: Record<string, unknown>) {
  const raiz = obj(plano);
  return { ...raiz, etapas: etapas(plano).map((e) => txt(e.ref, 160) === etapaRef ? { ...e, ...mudancas } : e) };
}

async function autenticado() {
  const r = await getUsuarioContexto();
  return r.ok && r.usuario.empresa_id ? { empresaId: r.usuario.empresa_id, usuarioId: r.usuario.id } : null;
}
async function sessao(sessaoId: string, empresaId: string, usuarioId: string) {
  const { data } = await db.from("automacao_assistente_ia_execucoes")
    .select("id, empresa_id, usuario_id, contexto_json, resposta_ia_json, status")
    .eq("id", sessaoId).eq("empresa_id", empresaId).eq("usuario_id", usuarioId)
    .eq("modo", "criar_fluxo").maybeSingle();
  return (data || null) as Sessao | null;
}
async function opcoesAtendimento(empresaId: string) {
  const { data: setores, error } = await db.from("setores").select("id, nome")
    .eq("empresa_id", empresaId).eq("ativo", true)
    .order("ordem_exibicao", { ascending: true }).order("nome", { ascending: true });
  if (error) throw error;
  const listaSetores = (setores || []) as Setor[];
  const ids = listaSetores.map((s) => s.id);
  const { data: vinculos, error: erroVinculos } = ids.length
    ? await db.from("usuarios_setores").select("usuario_id, setor_id").in("setor_id", ids)
    : { data: [], error: null };
  if (erroVinculos) throw erroVinculos;
  const usuarioIds = Array.from(new Set((vinculos || []).map((v: { usuario_id: string }) => v.usuario_id)));
  const { data: usuarios, error: erroUsuarios } = usuarioIds.length
    ? await db.from("usuarios").select("id, nome, email").eq("empresa_id", empresaId)
        .eq("status", "ativo").in("id", usuarioIds).order("nome", { ascending: true })
    : { data: [], error: null };
  if (erroUsuarios) throw erroUsuarios;
  const porUsuario = new Map<string, string[]>();
  for (const v of (vinculos || []) as Array<{ usuario_id: string; setor_id: string }>) {
    porUsuario.set(v.usuario_id, [...(porUsuario.get(v.usuario_id) || []), v.setor_id]);
  }
  return {
    setores: listaSetores,
    atendentes: ((usuarios || []) as Array<{ id: string; nome: string; email: string | null }>).map((u) => ({
      ...u, setor_ids: Array.from(new Set(porUsuario.get(u.id) || [])),
    })) as Atendente[],
  };
}

const OPCOES = [
  { id: "fila_setor", label: "Fila do setor", descricao: "A equipe do setor poderá assumir o contato." },
  { id: "atendente_especifico", label: "Atendente específico", descricao: "Encaminha diretamente para um atendente escolhido." },
  { id: "rodizio_aleatorio", label: "Rodízio aleatório", descricao: "Distribui entre atendentes ativos do setor." },
  { id: "menos_conversas", label: "Atendente com menos conversas", descricao: "Prioriza quem estiver com menor carga." },
];
function perguntaDistribuicao(ref: string, titulo: string, excesso: boolean, atual: unknown): Pergunta {
  return {
    id: `${excesso ? "distribuicao_excesso" : "distribuicao"}:${ref}`, etapa_ref: ref,
    campo: excesso ? "estrategia_excesso_tentativas" : "estrategia_transferencia", tipo: "selecao",
    mensagem: `Distribuição do atendimento no bloco “${titulo}”`,
    ajuda: excesso ? "Escolha como distribuir o atendimento após excesso de tentativas ou timeout." : "Escolha como distribuir o contato após a transferência.",
    obrigatoria: true, bloqueada: false, valor_sugerido: estrategia(atual), opcoes: OPCOES,
  };
}
function perguntaAtendente(ref: string, titulo: string, excesso: boolean, setorId: string, todos: Atendente[], atual: unknown): Pergunta {
  const lista = todos.filter((a) => a.setor_ids.includes(setorId));
  const sugerido = lista.some((a) => a.id === txt(atual, 120)) ? txt(atual, 120) : null;
  return {
    id: `${excesso ? "atendente_excesso" : "atendente"}:${ref}`, etapa_ref: ref,
    campo: excesso ? "atendente_excesso_tentativas" : "atendente_id", tipo: "selecao",
    mensagem: `Atendente destino no bloco “${titulo}”`,
    ajuda: lista.length ? "Selecione um atendente ativo vinculado ao setor." : "Este setor não possui atendentes ativos vinculados.",
    obrigatoria: true, bloqueada: !lista.length, valor_sugerido: sugerido,
    opcoes: lista.map((a) => ({ id: a.id, label: a.nome, descricao: a.email })),
  };
}
function ampliar(perguntas: Pergunta[], plano: unknown, atendentes: Atendente[]) {
  const base = perguntas.filter((p) => !/^(distribuicao|distribuicao_excesso|atendente|atendente_excesso):/.test(p.id));
  const saida: Pergunta[] = [];
  for (const original of base) {
    const excesso = original.id.startsWith("setor_excesso:");
    const p = excesso ? { ...original, campo: "setor_excesso_tentativas" } : original;
    saida.push(p);
    if (!["setor_id", "setor_excesso_tentativas"].includes(p.campo)) continue;
    const e = etapa(plano, p.etapa_ref);
    if (!e) continue;
    const titulo = txt(e.titulo, 120) || p.etapa_ref;
    const atual = excesso ? e.estrategia_excesso_tentativas : e.estrategia_transferencia;
    saida.push(perguntaDistribuicao(p.etapa_ref, titulo, excesso, atual));
    if (estrategia(atual) !== "atendente_especifico") continue;
    const setorId = txt(excesso ? e.setor_excesso_tentativas : e.setor_id, 120);
    if (setorId) saida.push(perguntaAtendente(
      p.etapa_ref, titulo, excesso, setorId, atendentes,
      excesso ? e.atendente_excesso_tentativas : e.atendente_id
    ));
  }
  return saida;
}

async function salvar(s: Sessao, contexto: Record<string, unknown>, plano: unknown, e: Estado) {
  const { error } = await db.from("automacao_assistente_ia_execucoes").update({
    contexto_json: { ...contexto, conversa: e }, resposta_ia_json: plano, updated_at: new Date().toISOString(),
  }).eq("id", s.id).eq("empresa_id", s.empresa_id).eq("usuario_id", s.usuario_id).eq("status", "processando");
  if (error) throw new Error(`Não foi possível salvar a distribuição: ${error.message}`);
}
function resposta(sessaoId: string, plano: unknown, e: Estado, mensagem?: string) {
  const p = proxima(e);
  return NextResponse.json({
    ok: true, proposta_id: sessaoId, sessao_id: sessaoId, modo: "criar_fluxo",
    fase: p ? "coletando" : "pronto",
    mensagem: mensagem || (p ? "Agora preciso confirmar a distribuição do atendimento." : "Todas as informações foram confirmadas."),
    pergunta: p, progresso: { respondidas: e.perguntas_respondidas.length, total: e.perguntas.length },
    historico: e.respostas.map((r) => ({ pergunta: r.pergunta, resposta: r.resposta })), plano,
  });
}

async function responderCustom(body: Record<string, unknown>) {
  const auth = await autenticado();
  if (!auth) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const sessaoId = txt(body.sessao_id || body.sessaoId, 120);
  const perguntaId = txt(body.pergunta_id, 240);
  const valor = txt(body.resposta, 1000);
  const [s, ops] = await Promise.all([sessao(sessaoId, auth.empresaId, auth.usuarioId), opcoesAtendimento(auth.empresaId)]);
  if (!s || s.status !== "processando") return NextResponse.json({ ok: false, error: "Sessão não encontrada." }, { status: 404 });
  const contexto = obj(s.contexto_json);
  let e = estado(contexto.conversa);
  e = { ...e, perguntas: ampliar(e.perguntas, s.resposta_ia_json, ops.atendentes) };
  const p = proxima(e);
  if (!p || p.id !== perguntaId) return NextResponse.json({ ok: false, error: "Responda a pergunta atual antes de continuar." }, { status: 409 });
  if (p.bloqueada || !valor) return NextResponse.json({ ok: false, error: p.ajuda || "Resposta obrigatória." }, { status: 422 });
  const etapaAtual = etapa(s.resposta_ia_json, p.etapa_ref);
  if (!etapaAtual) return NextResponse.json({ ok: false, error: "Etapa não encontrada." }, { status: 422 });
  let plano = s.resposta_ia_json;
  let resumo = valor;
  if (p.campo === "setor_excesso_tentativas") {
    const setor = ops.setores.find((x) => x.id === valor);
    if (!setor) return NextResponse.json({ ok: false, error: "Selecione um setor válido." }, { status: 422 });
    resumo = setor.nome; plano = atualizar(plano, p.etapa_ref, { setor_excesso_tentativas: setor.id });
  } else if (["estrategia_transferencia", "estrategia_excesso_tentativas"].includes(p.campo)) {
    const est = estrategia(valor);
    if (est !== valor) return NextResponse.json({ ok: false, error: "Selecione uma distribuição válida." }, { status: 422 });
    resumo = OPCOES.find((x) => x.id === est)?.label || est;
    plano = atualizar(plano, p.etapa_ref, {
      [p.campo]: est,
      ...(p.campo === "estrategia_transferencia"
        ? { atendente_id: est === "atendente_especifico" ? etapaAtual.atendente_id || null : null }
        : { atendente_excesso_tentativas: est === "atendente_especifico" ? etapaAtual.atendente_excesso_tentativas || null : null }),
    });
  } else if (["atendente_id", "atendente_excesso_tentativas"].includes(p.campo)) {
    const setorId = txt(p.campo === "atendente_id" ? etapaAtual.setor_id : etapaAtual.setor_excesso_tentativas, 120);
    const atendente = ops.atendentes.find((x) => x.id === valor && x.setor_ids.includes(setorId));
    if (!atendente) return NextResponse.json({ ok: false, error: "Selecione um atendente ativo do setor." }, { status: 422 });
    resumo = atendente.nome; plano = atualizar(plano, p.etapa_ref, { [p.campo]: atendente.id });
  } else return NextResponse.json({ ok: false, error: "Pergunta de distribuição inválida." }, { status: 422 });
  e = {
    ...e,
    perguntas_respondidas: [...e.perguntas_respondidas, p.id],
    respostas: [...e.respostas, { pergunta_id: p.id, pergunta: p.mensagem, resposta: resumo, respondida_em: new Date().toISOString() }],
  };
  e = { ...e, perguntas: ampliar(e.perguntas, plano, ops.atendentes) };
  await salvar(s, contexto, plano, e);
  return resposta(sessaoId, plano, e, `Entendido: ${resumo}.`);
}

async function ampliarResposta(r: Response) {
  if (!r.ok) return r;
  const dados = obj(await r.clone().json().catch(() => null));
  const sessaoId = txt(dados.sessao_id, 120);
  if (!sessaoId || dados.fase === "concluido") return r;
  const auth = await autenticado();
  if (!auth) return r;
  const [s, ops] = await Promise.all([sessao(sessaoId, auth.empresaId, auth.usuarioId), opcoesAtendimento(auth.empresaId)]);
  if (!s || s.status !== "processando") return r;
  const contexto = obj(s.contexto_json);
  let e = estado(contexto.conversa);
  e = { ...e, perguntas: ampliar(e.perguntas, s.resposta_ia_json, ops.atendentes) };
  await salvar(s, contexto, s.resposta_ia_json, e);
  const p = proxima(e);
  return NextResponse.json({
    ...dados, fase: p ? "coletando" : "pronto", pergunta: p,
    progresso: { respondidas: e.perguntas_respondidas.length, total: e.perguntas.length },
    historico: e.respostas.map((x) => ({ pergunta: x.pergunta, resposta: x.resposta })), plano: s.resposta_ia_json,
  }, { status: r.status });
}

export async function executarAssistenteComDistribuicao(
  request: Request,
  executarOriginal: (request: Request) => Promise<Response>
) {
  const body = obj(await request.clone().json().catch(() => ({})));
  const id = txt(body.pergunta_id, 240);
  if (txt(body.acao, 40) === "responder" && /^(setor_excesso|distribuicao|distribuicao_excesso|atendente|atendente_excesso):/.test(id)) {
    return responderCustom(body);
  }
  return ampliarResposta(await executarOriginal(request));
}
