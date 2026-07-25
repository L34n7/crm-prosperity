import { NextResponse } from "next/server";

import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import type {
  AssistenteMidia,
  AssistenteSetor,
  PlanoAssistenteFluxos,
} from "@/lib/automacoes/assistente-fluxos";
import {
  criarPerguntasAssistenteFluxo,
  type PerguntaAssistenteFluxo,
} from "@/lib/automacoes/assistente-fluxos-conversa";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const db = getSupabaseAdmin();
const VERSAO_REGRAS_QUALIDADE =
  "crm-prosperity-qualidade-fluxos-v1-2026-07-25";
const MARCADOR_REGRAS_QUALIDADE = `[REGRAS_QUALIDADE_${VERSAO_REGRAS_QUALIDADE}]`;

const REGRAS_QUALIDADE = `
${MARCADOR_REGRAS_QUALIDADE}

REGRAS OBRIGATORIAS DE QUALIDADE DO FLUXO

1. MIDIAS POR CONTEXTO
- Quando o pedido solicitar galeria, fotos, portfolio, casos reais ou antes e depois para produtos, servicos, procedimentos ou categorias diferentes, crie uma etapa de midia propria para cada contexto.
- Harmonizacao, Melasma e Botox, por exemplo, exigem tres etapas de midia distintas. Nunca use uma unica imagem generica para representar categorias diferentes.
- Cada opcao de categoria deve apontar para a midia correspondente e depois para um menu posterior do mesmo contexto.
- Se nao houver uma midia claramente correspondente, mantenha a etapa especifica e use midia_id, midia_nome e midia_url como null. O CRM pedira a confirmacao de cada midia.
- Nao escolha uma midia apenas porque o arquivo e do tipo correto.

2. OPCOES E ROTAS
- Conte as opcoes antes de escolher o tipo do bloco.
- De 1 a 3 opcoes, use pergunta_botoes.
- De 4 a 10 opcoes, use pergunta_opcoes.
- A quantidade de rotas normais deve ser exatamente igual a quantidade de opcoes visiveis.
- Cada ID de opcao deve possuir exatamente uma rota e nenhuma rota pode usar um valor que nao exista nas opcoes.
- Agendar, voltar e qualquer outra acao solicitada devem aparecer como opcoes visiveis, nunca apenas como conexoes ocultas.

3. FAQ
- Remova perguntas duplicadas ou semanticamente equivalentes dentro do mesmo FAQ.
- Considere o contexto no titulo. "Quanto tempo dura?" e "Quanto tempo dura o Botox?" sao a mesma intencao dentro do FAQ de Botox.
- Cada pergunta restante deve possuir resposta dedicada e navegacao posterior do mesmo contexto.

4. COPY E FATOS
- Preserve integralmente mensagens que o usuario forneceu de forma explicita. Nao resuma boas-vindas, enderecos, horarios, textos obrigatorios ou avisos literais.
- Aborde explicitamente cada topico solicitado. Nao esconda cuidados, duracao e recuperacao em uma frase vaga conjunta.
- Use somente fatos presentes no pedido ou nos recursos fornecidos.
- Nao invente informacoes clinicas, tecnicas, beneficios, prazos, duracao, recuperacao ou resultados.
- Quando um dado nao foi fornecido, diga apenas que varia ou que sera definido na avaliacao, sem acrescentar uma afirmacao tecnica nova.

5. EXCESSO E TIMEOUT
- Toda etapa que aguarda resposta deve permitir confirmacao propria do setor e da distribuicao para excesso de tentativas e falta de resposta.
- Deixe setor_excesso_tentativas, estrategia_excesso_tentativas e atendente_excesso_tentativas como null na resposta inicial. O CRM perguntara esses recursos etapa por etapa.
- Nao copie silenciosamente o setor de um bloco para os demais.

CHECKLIST FINAL
[ ] Cada categoria visual possui uma midia propria.
[ ] Nenhuma galeria de categorias diferentes converge para a mesma midia generica.
[ ] Pergunta com mais de tres opcoes usa pergunta_opcoes.
[ ] Nao existem rotas sem opcao visivel.
[ ] Nao existem opcoes sem rota.
[ ] FAQs nao possuem perguntas equivalentes.
[ ] Mensagens explicitas do usuario foram preservadas.
[ ] Nenhum fato tecnico ou clinico foi inventado.
[ ] Cada etapa de resposta possui recursos de excesso e timeout confirmaveis.

Revise o JSON antes de responder. Nao dependa do compilador para corrigir esses itens.
`.trim();

type Estrategia =
  | "fila_setor"
  | "atendente_especifico"
  | "rodizio_aleatorio"
  | "menos_conversas";

type Pergunta = Omit<PerguntaAssistenteFluxo, "campo"> & {
  campo: string;
};

type Estado = {
  versao: number;
  instrucao: string;
  perguntas: Pergunta[];
  perguntas_respondidas: string[];
  respostas: Array<{
    pergunta_id: string;
    pergunta: string;
    resposta: string;
    respondida_em: string;
  }>;
};

type Sessao = {
  id: string;
  empresa_id: string;
  usuario_id: string;
  contexto_json: unknown;
  resposta_ia_json: unknown;
  status: string;
};

type Setor = AssistenteSetor;
type Atendente = {
  id: string;
  nome: string;
  email: string | null;
  setor_ids: string[];
};

type RecursosAtendimento = {
  setores: Setor[];
  atendentes: Atendente[];
  midias: AssistenteMidia[];
};

const TIPOS_COM_RESPOSTA = new Set([
  "pergunta_opcoes",
  "pergunta_botoes",
  "pergunta_livre_ia",
  "capturar_resposta",
  "avaliacao",
  "agenda_escolher_horario",
  "agenda_buscar_agendamento",
  "interpretar_arquivo_ia",
]);

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function txt(v: unknown, n = 1000) {
  return String(v || "").trim().slice(0, n);
}

function estrategia(v: unknown): Estrategia {
  const e = txt(v, 80);
  return [
    "fila_setor",
    "atendente_especifico",
    "rodizio_aleatorio",
    "menos_conversas",
  ].includes(e)
    ? (e as Estrategia)
    : "fila_setor";
}

function estado(v: unknown): Estado {
  const x = obj(v);
  return {
    versao: Number(x.versao || 1),
    instrucao: txt(x.instrucao, 12000),
    perguntas: Array.isArray(x.perguntas) ? (x.perguntas as Pergunta[]) : [],
    perguntas_respondidas: Array.isArray(x.perguntas_respondidas)
      ? x.perguntas_respondidas.map((i) => txt(i, 240))
      : [],
    respostas: Array.isArray(x.respostas)
      ? (x.respostas as Estado["respostas"])
      : [],
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

function rotas(plano: unknown) {
  const x = obj(plano);
  return Array.isArray(x.rotas) ? x.rotas.map(obj) : [];
}

function etapa(plano: unknown, ref: string) {
  return etapas(plano).find((e) => txt(e.ref, 160) === ref) || null;
}

function atualizar(
  plano: unknown,
  etapaRef: string,
  mudancas: Record<string, unknown>
) {
  const raiz = obj(plano);
  return {
    ...raiz,
    etapas: etapas(plano).map((e) =>
      txt(e.ref, 160) === etapaRef ? { ...e, ...mudancas } : e
    ),
  };
}

function normalizarPlanoEstrutural(plano: unknown, inicial: boolean) {
  const raiz = obj(plano);
  const etapasNormalizadas = etapas(plano).map((item) => {
    const opcoes = Array.isArray(item.opcoes) ? item.opcoes : [];
    const tipoOriginal = txt(item.tipo, 80);
    const tipo =
      tipoOriginal === "pergunta_botoes" && opcoes.length > 3
        ? "pergunta_opcoes"
        : tipoOriginal;
    const midia = tipo.startsWith("midia_");
    const esperaResposta = TIPOS_COM_RESPOSTA.has(tipo);

    return {
      ...item,
      tipo,
      ...(inicial && midia
        ? {
            midia_id: null,
            midia_nome: null,
            midia_url: null,
          }
        : {}),
      ...(inicial && esperaResposta
        ? {
            setor_excesso_tentativas: null,
            estrategia_excesso_tentativas: null,
            atendente_excesso_tentativas: null,
          }
        : {}),
    };
  });

  return {
    ...raiz,
    etapas: etapasNormalizadas,
  };
}

function normalizarComparacao(v: unknown) {
  return txt(v, 300)
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function chaveFaq(pergunta: unknown, titulo: unknown) {
  const tokensContexto = new Set(
    normalizarComparacao(titulo)
      .split(" ")
      .filter((token) => token.length > 2)
  );
  return normalizarComparacao(pergunta)
    .split(" ")
    .filter((token) => !tokensContexto.has(token))
    .join(" ")
    .trim();
}

function problemasObjetivosPlano(plano: unknown) {
  const problemas: string[] = [];
  const listaEtapas = etapas(plano);
  const listaRotas = rotas(plano);
  const etapasPorRef = new Map(
    listaEtapas.map((item) => [txt(item.ref, 180), item])
  );

  for (const item of listaEtapas) {
    const ref = txt(item.ref, 180);
    const tipo = txt(item.tipo, 80);
    if (!["pergunta_botoes", "pergunta_opcoes"].includes(tipo)) continue;

    const opcoes = Array.isArray(item.opcoes) ? item.opcoes.map(obj) : [];
    if (tipo === "pergunta_botoes" && opcoes.length > 3) {
      problemas.push(
        `O bloco “${txt(item.titulo, 120) || ref}” possui mais de 3 botões.`
      );
    }
    if (tipo === "pergunta_opcoes" && opcoes.length > 10) {
      problemas.push(
        `O bloco “${txt(item.titulo, 120) || ref}” possui mais de 10 opções.`
      );
    }

    const ids = new Set(opcoes.map((opcao) => txt(opcao.id, 180)).filter(Boolean));
    const rotasNormais = listaRotas.filter(
      (rota) =>
        txt(rota.origem, 180) === ref &&
        txt(rota.condicao, 80) !== "timeout_sem_resposta"
    );

    for (const id of ids) {
      const quantidade = rotasNormais.filter(
        (rota) => txt(rota.valor, 180) === id
      ).length;
      if (quantidade !== 1) {
        problemas.push(
          `A opção “${id}” do bloco “${txt(item.titulo, 120) || ref}” precisa possuir exatamente uma rota.`
        );
      }
    }

    for (const rota of rotasNormais) {
      const valor = txt(rota.valor, 180);
      if (!valor || !ids.has(valor)) {
        problemas.push(
          `O bloco “${txt(item.titulo, 120) || ref}” possui uma rota sem opção visível correspondente.`
        );
      }
    }

    if (/faq|duvida/i.test(`${ref} ${txt(item.titulo, 160)}`)) {
      const vistas = new Set<string>();
      for (const opcao of opcoes) {
        const chave = chaveFaq(opcao.texto, item.titulo);
        if (chave && vistas.has(chave)) {
          problemas.push(
            `O FAQ “${txt(item.titulo, 120) || ref}” possui perguntas equivalentes.`
          );
        }
        if (chave) vistas.add(chave);
      }
    }
  }

  const destinosMidia = new Map<string, Set<string>>();
  for (const rota of listaRotas) {
    const origem = txt(rota.origem, 180);
    const destino = txt(rota.destino, 180);
    const origemEtapa = etapasPorRef.get(origem);
    const destinoEtapa = etapasPorRef.get(destino);
    if (!origemEtapa || !destinoEtapa) continue;
    if (!txt(destinoEtapa.tipo, 80).startsWith("midia_")) continue;

    const origemTexto = `${txt(origemEtapa.ref, 180)} ${txt(origemEtapa.titulo, 180)} ${txt(origemEtapa.mensagem, 400)}`;
    const valor = txt(rota.valor, 180);
    const rotulo = txt(rota.rotulo, 180);
    if (
      !/antes.?e.?depois|galeria|portfolio|foto|caso/i.test(
        `${origemTexto} ${valor} ${rotulo}`
      )
    ) {
      continue;
    }

    const contextoOpcao = normalizarComparacao(`${valor} ${rotulo}`)
      .replace(
        /\b(antes|depois|galeria|portfolio|foto|fotos|caso|casos|ver|abrir|resultado|resultados)\b/g,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();
    const contextoOrigem = normalizarComparacao(origemEtapa.titulo)
      .replace(
        /\b(antes|depois|galeria|portfolio|foto|fotos|caso|casos|menu)\b/g,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();
    const contexto = contextoOpcao || contextoOrigem || origem;

    destinosMidia.set(
      destino,
      new Set([...(destinosMidia.get(destino) || []), contexto])
    );
  }

  for (const [destino, contextos] of destinosMidia.entries()) {
    if (contextos.size > 1) {
      problemas.push(
        `A mídia “${txt(etapasPorRef.get(destino)?.titulo, 120) || destino}” foi reutilizada por categorias diferentes de galeria ou Antes e Depois.`
      );
    }
  }

  return Array.from(new Set(problemas));
}

function anexarRegrasQualidade(request: Request, body: Record<string, unknown>) {
  const modo = txt(body.modo || "criar_fluxo", 80);
  const acao = txt(body.acao, 40);
  const instrucao = txt(body.instrucao, 50000);

  if (
    request.method !== "POST" ||
    modo !== "criar_fluxo" ||
    acao !== "preparar" ||
    !instrucao ||
    instrucao.includes(MARCADOR_REGRAS_QUALIDADE)
  ) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");

  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify({
      ...body,
      regras_qualidade_versao: VERSAO_REGRAS_QUALIDADE,
      instrucao: `${instrucao}\n\n${REGRAS_QUALIDADE}`,
    }),
  });
}

async function autenticado() {
  const r = await getUsuarioContexto();
  return r.ok && r.usuario.empresa_id
    ? { empresaId: r.usuario.empresa_id, usuarioId: r.usuario.id }
    : null;
}

async function sessao(sessaoId: string, empresaId: string, usuarioId: string) {
  const { data } = await db
    .from("automacao_assistente_ia_execucoes")
    .select(
      "id, empresa_id, usuario_id, contexto_json, resposta_ia_json, status"
    )
    .eq("id", sessaoId)
    .eq("empresa_id", empresaId)
    .eq("usuario_id", usuarioId)
    .eq("modo", "criar_fluxo")
    .maybeSingle();
  return (data || null) as Sessao | null;
}

async function opcoesAtendimento(empresaId: string): Promise<RecursosAtendimento> {
  const [{ data: setores, error }, { data: midias, error: erroMidias }] =
    await Promise.all([
      db
        .from("setores")
        .select("id, nome")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("ordem_exibicao", { ascending: true })
        .order("nome", { ascending: true }),
      db
        .from("midias")
        .select("id, nome, tipo, url")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(120),
    ]);
  if (error) throw error;
  if (erroMidias) throw erroMidias;

  const listaSetores = (setores || []) as Setor[];
  const ids = listaSetores.map((s) => s.id);
  const { data: vinculos, error: erroVinculos } = ids.length
    ? await db
        .from("usuarios_setores")
        .select("usuario_id, setor_id")
        .in("setor_id", ids)
    : { data: [], error: null };
  if (erroVinculos) throw erroVinculos;

  const usuarioIds = Array.from(
    new Set(
      (vinculos || []).map(
        (v: { usuario_id: string }) => v.usuario_id
      )
    )
  );
  const { data: usuarios, error: erroUsuarios } = usuarioIds.length
    ? await db
        .from("usuarios")
        .select("id, nome, email")
        .eq("empresa_id", empresaId)
        .eq("status", "ativo")
        .in("id", usuarioIds)
        .order("nome", { ascending: true })
    : { data: [], error: null };
  if (erroUsuarios) throw erroUsuarios;

  const porUsuario = new Map<string, string[]>();
  for (const v of (vinculos || []) as Array<{
    usuario_id: string;
    setor_id: string;
  }>) {
    porUsuario.set(v.usuario_id, [
      ...(porUsuario.get(v.usuario_id) || []),
      v.setor_id,
    ]);
  }

  return {
    setores: listaSetores,
    atendentes: ((usuarios || []) as Array<{
      id: string;
      nome: string;
      email: string | null;
    }>).map((u) => ({
      ...u,
      setor_ids: Array.from(new Set(porUsuario.get(u.id) || [])),
    })),
    midias: ((midias || []) as AssistenteMidia[]).filter((midia) =>
      ["imagem", "video", "audio", "arquivo"].includes(midia.tipo)
    ),
  };
}

const OPCOES = [
  {
    id: "fila_setor",
    label: "Fila do setor",
    descricao: "A equipe do setor poderá assumir o contato.",
  },
  {
    id: "atendente_especifico",
    label: "Atendente específico",
    descricao: "Encaminha diretamente para um atendente escolhido.",
  },
  {
    id: "rodizio_aleatorio",
    label: "Rodízio aleatório",
    descricao: "Distribui entre atendentes ativos do setor.",
  },
  {
    id: "menos_conversas",
    label: "Atendente com menos conversas",
    descricao: "Prioriza quem estiver com menor carga.",
  },
];

function perguntaDistribuicao(
  ref: string,
  titulo: string,
  excesso: boolean,
  atual: unknown
): Pergunta {
  return {
    id: `${excesso ? "distribuicao_excesso" : "distribuicao"}:${ref}`,
    etapa_ref: ref,
    campo: excesso
      ? "estrategia_excesso_tentativas"
      : "estrategia_transferencia",
    tipo: "selecao",
    mensagem: `Distribuição do atendimento no bloco “${titulo}”`,
    ajuda: excesso
      ? "Escolha como distribuir o atendimento após excesso de tentativas ou timeout."
      : "Escolha como distribuir o contato após a transferência.",
    obrigatoria: true,
    bloqueada: false,
    valor_sugerido: estrategia(atual),
    opcoes: OPCOES,
  } as Pergunta;
}

function perguntaAtendente(
  ref: string,
  titulo: string,
  excesso: boolean,
  setorId: string,
  todos: Atendente[],
  atual: unknown
): Pergunta {
  const lista = todos.filter((a) => a.setor_ids.includes(setorId));
  const sugerido = lista.some((a) => a.id === txt(atual, 120))
    ? txt(atual, 120)
    : null;
  return {
    id: `${excesso ? "atendente_excesso" : "atendente"}:${ref}`,
    etapa_ref: ref,
    campo: excesso
      ? "atendente_excesso_tentativas"
      : "atendente_id",
    tipo: "selecao",
    mensagem: `Atendente destino no bloco “${titulo}”`,
    ajuda: lista.length
      ? "Selecione um atendente ativo vinculado ao setor."
      : "Este setor não possui atendentes ativos vinculados.",
    obrigatoria: true,
    bloqueada: !lista.length,
    valor_sugerido: sugerido,
    opcoes: lista.map((a) => ({
      id: a.id,
      label: a.nome,
      descricao: a.email,
    })),
  } as Pergunta;
}

function ampliar(
  perguntas: Pergunta[],
  plano: unknown,
  atendentes: Atendente[]
) {
  const base = perguntas.filter(
    (p) =>
      !/^(distribuicao|distribuicao_excesso|atendente|atendente_excesso):/.test(
        p.id
      )
  );
  const saida: Pergunta[] = [];

  for (const original of base) {
    const excesso = original.id.startsWith("setor_excesso:");
    const p = excesso
      ? { ...original, campo: "setor_excesso_tentativas" }
      : original;
    saida.push(p);
    if (!["setor_id", "setor_excesso_tentativas"].includes(p.campo)) {
      continue;
    }

    const e = etapa(plano, p.etapa_ref);
    if (!e) continue;
    const titulo = txt(e.titulo, 120) || p.etapa_ref;
    const atual = excesso
      ? e.estrategia_excesso_tentativas
      : e.estrategia_transferencia;
    saida.push(perguntaDistribuicao(p.etapa_ref, titulo, excesso, atual));
    if (estrategia(atual) !== "atendente_especifico") continue;

    const setorId = txt(
      excesso ? e.setor_excesso_tentativas : e.setor_id,
      120
    );
    if (setorId) {
      saida.push(
        perguntaAtendente(
          p.etapa_ref,
          titulo,
          excesso,
          setorId,
          atendentes,
          excesso ? e.atendente_excesso_tentativas : e.atendente_id
        )
      );
    }
  }

  return saida;
}

function perguntasAtualizadas(
  plano: unknown,
  recursos: RecursosAtendimento
): Pergunta[] {
  const base = criarPerguntasAssistenteFluxo({
    plano: plano as PlanoAssistenteFluxos,
    setores: recursos.setores,
    midias: recursos.midias,
  }) as Pergunta[];
  return ampliar(base, plano, recursos.atendentes);
}

function sincronizarEstado(e: Estado, perguntas: Pergunta[]): Estado {
  const ids = new Set(perguntas.map((p) => p.id));
  return {
    ...e,
    perguntas,
    perguntas_respondidas: e.perguntas_respondidas.filter((id) => ids.has(id)),
  };
}

async function salvar(
  s: Sessao,
  contexto: Record<string, unknown>,
  plano: unknown,
  e: Estado
) {
  const { error } = await db
    .from("automacao_assistente_ia_execucoes")
    .update({
      contexto_json: { ...contexto, conversa: e },
      resposta_ia_json: plano,
      updated_at: new Date().toISOString(),
    })
    .eq("id", s.id)
    .eq("empresa_id", s.empresa_id)
    .eq("usuario_id", s.usuario_id)
    .eq("status", "processando");
  if (error) {
    throw new Error(`Não foi possível salvar a distribuição: ${error.message}`);
  }
}

function resposta(
  sessaoId: string,
  plano: unknown,
  e: Estado,
  mensagem?: string
) {
  const p = proxima(e);
  return NextResponse.json({
    ok: true,
    proposta_id: sessaoId,
    sessao_id: sessaoId,
    modo: "criar_fluxo",
    fase: p ? "coletando" : "pronto",
    mensagem:
      mensagem ||
      (p
        ? "Agora preciso confirmar os recursos e a distribuição do atendimento."
        : "Todas as informações foram confirmadas."),
    pergunta: p,
    progresso: {
      respondidas: e.perguntas_respondidas.length,
      total: e.perguntas.length,
    },
    historico: e.respostas.map((r) => ({
      pergunta: r.pergunta,
      resposta: r.resposta,
    })),
    plano,
  });
}

async function responderCustom(body: Record<string, unknown>) {
  const auth = await autenticado();
  if (!auth) {
    return NextResponse.json(
      { ok: false, error: "Não autenticado." },
      { status: 401 }
    );
  }

  const sessaoId = txt(body.sessao_id || body.sessaoId, 120);
  const perguntaId = txt(body.pergunta_id, 240);
  const valor = txt(body.resposta, 1000);
  const [s, ops] = await Promise.all([
    sessao(sessaoId, auth.empresaId, auth.usuarioId),
    opcoesAtendimento(auth.empresaId),
  ]);
  if (!s || s.status !== "processando") {
    return NextResponse.json(
      { ok: false, error: "Sessão não encontrada." },
      { status: 404 }
    );
  }

  const contexto = obj(s.contexto_json);
  let plano: unknown = normalizarPlanoEstrutural(s.resposta_ia_json, false);
  let e = sincronizarEstado(
    estado(contexto.conversa),
    perguntasAtualizadas(plano, ops)
  );
  const p = proxima(e);

  if (!p || p.id !== perguntaId) {
    return NextResponse.json(
      { ok: false, error: "Responda a pergunta atual antes de continuar." },
      { status: 409 }
    );
  }
  if (p.bloqueada || !valor) {
    return NextResponse.json(
      { ok: false, error: p.ajuda || "Resposta obrigatória." },
      { status: 422 }
    );
  }

  const etapaAtual = etapa(plano, p.etapa_ref);
  if (!etapaAtual) {
    return NextResponse.json(
      { ok: false, error: "Etapa não encontrada." },
      { status: 422 }
    );
  }

  let resumo = valor;
  if (p.campo === "setor_excesso_tentativas") {
    const setor = ops.setores.find((x) => x.id === valor);
    if (!setor) {
      return NextResponse.json(
        { ok: false, error: "Selecione um setor válido." },
        { status: 422 }
      );
    }
    resumo = setor.nome;
    plano = atualizar(plano, p.etapa_ref, {
      setor_excesso_tentativas: setor.id,
    });
  } else if (
    ["estrategia_transferencia", "estrategia_excesso_tentativas"].includes(
      p.campo
    )
  ) {
    const est = estrategia(valor);
    if (est !== valor) {
      return NextResponse.json(
        { ok: false, error: "Selecione uma distribuição válida." },
        { status: 422 }
      );
    }
    resumo = OPCOES.find((x) => x.id === est)?.label || est;
    plano = atualizar(plano, p.etapa_ref, {
      [p.campo]: est,
      ...(p.campo === "estrategia_transferencia"
        ? {
            atendente_id:
              est === "atendente_especifico"
                ? etapaAtual.atendente_id || null
                : null,
          }
        : {
            atendente_excesso_tentativas:
              est === "atendente_especifico"
                ? etapaAtual.atendente_excesso_tentativas || null
                : null,
          }),
    });
  } else if (
    ["atendente_id", "atendente_excesso_tentativas"].includes(p.campo)
  ) {
    const setorId = txt(
      p.campo === "atendente_id"
        ? etapaAtual.setor_id
        : etapaAtual.setor_excesso_tentativas,
      120
    );
    const atendente = ops.atendentes.find(
      (x) => x.id === valor && x.setor_ids.includes(setorId)
    );
    if (!atendente) {
      return NextResponse.json(
        {
          ok: false,
          error: "Selecione um atendente ativo do setor.",
        },
        { status: 422 }
      );
    }
    resumo = atendente.nome;
    plano = atualizar(plano, p.etapa_ref, { [p.campo]: atendente.id });
  } else {
    return NextResponse.json(
      { ok: false, error: "Pergunta de distribuição inválida." },
      { status: 422 }
    );
  }

  e = {
    ...e,
    perguntas_respondidas: [...e.perguntas_respondidas, p.id],
    respostas: [
      ...e.respostas,
      {
        pergunta_id: p.id,
        pergunta: p.mensagem,
        resposta: resumo,
        respondida_em: new Date().toISOString(),
      },
    ],
  };
  e = sincronizarEstado(e, perguntasAtualizadas(plano, ops));
  await salvar(s, contexto, plano, e);
  return resposta(sessaoId, plano, e, `Entendido: ${resumo}.`);
}

async function prepararCriacao(body: Record<string, unknown>) {
  const auth = await autenticado();
  if (!auth) return null;
  const sessaoId = txt(body.sessao_id || body.sessaoId, 120);
  if (!sessaoId) return null;

  const [s, ops] = await Promise.all([
    sessao(sessaoId, auth.empresaId, auth.usuarioId),
    opcoesAtendimento(auth.empresaId),
  ]);
  if (!s || s.status !== "processando") return null;

  const contexto = obj(s.contexto_json);
  const plano = normalizarPlanoEstrutural(s.resposta_ia_json, false);
  const e = sincronizarEstado(
    estado(contexto.conversa),
    perguntasAtualizadas(plano, ops)
  );
  await salvar(s, contexto, plano, e);

  const pendente = proxima(e);
  if (pendente) {
    return resposta(
      sessaoId,
      plano,
      e,
      "Ainda existem recursos obrigatórios para confirmar antes de criar o fluxo."
    );
  }

  const problemas = problemasObjetivosPlano(plano);
  if (problemas.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `O fluxo não foi criado porque a estrutura gerada ainda possui falhas objetivas. ${problemas
          .slice(0, 6)
          .join(" ")}`,
        problemas,
      },
      { status: 422 }
    );
  }

  return null;
}

async function ampliarResposta(r: Response, acao: string) {
  if (!r.ok) return r;
  const dados = obj(await r.clone().json().catch(() => null));
  const sessaoId = txt(dados.sessao_id, 120);
  if (!sessaoId || dados.fase === "concluido") return r;

  const auth = await autenticado();
  if (!auth) return r;
  const [s, ops] = await Promise.all([
    sessao(sessaoId, auth.empresaId, auth.usuarioId),
    opcoesAtendimento(auth.empresaId),
  ]);
  if (!s || s.status !== "processando") return r;

  const contexto = obj(s.contexto_json);
  const eAnterior = estado(contexto.conversa);
  const inicial =
    ["preparar", "gerar"].includes(acao) &&
    eAnterior.perguntas_respondidas.length === 0 &&
    eAnterior.respostas.length === 0;
  const plano = normalizarPlanoEstrutural(s.resposta_ia_json, inicial);
  const e = sincronizarEstado(eAnterior, perguntasAtualizadas(plano, ops));
  await salvar(s, contexto, plano, e);

  const p = proxima(e);
  return NextResponse.json(
    {
      ...dados,
      fase: p ? "coletando" : "pronto",
      pergunta: p,
      progresso: {
        respondidas: e.perguntas_respondidas.length,
        total: e.perguntas.length,
      },
      historico: e.respostas.map((x) => ({
        pergunta: x.pergunta,
        resposta: x.resposta,
      })),
      plano,
    },
    { status: r.status }
  );
}

export async function executarAssistenteComDistribuicao(
  request: Request,
  executarOriginal: (request: Request) => Promise<Response>
) {
  const body = obj(await request.clone().json().catch(() => ({})));
  const acao = txt(body.acao, 40);
  const id = txt(body.pergunta_id, 240);

  if (
    acao === "responder" &&
    /^(setor_excesso|distribuicao|distribuicao_excesso|atendente|atendente_excesso):/.test(
      id
    )
  ) {
    return responderCustom(body);
  }

  if (acao === "criar") {
    const bloqueio = await prepararCriacao(body);
    if (bloqueio) return bloqueio;
  }

  const requestFinal = anexarRegrasQualidade(request, body);
  return ampliarResposta(await executarOriginal(requestFinal), acao);
}
