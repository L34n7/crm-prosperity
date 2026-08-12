import { NextResponse } from "next/server";

import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
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
import { executarComRecuperacaoSessao } from "./route-recuperacao-sessao";
import { anexarRegrasRecursosAoPedido } from "./route-regras-recursos";
import {
  configurarModelosFluxosIa,
  habilitarBriefingFluxosIa,
} from "./route-runtime-config";

export const runtime = "nodejs";

const db = getSupabaseAdmin();
const CHAVE_ESTADO_ESTAVEL = "conversa_estavel_v3";
const VERSAO_ESTADO_ESTAVEL = 3;
const REF_PADRAO_EXCESSO = "padrao_fluxo_excesso_timeout";
const MARCADOR_REGRAS_ESTAVEIS =
  "[REGRAS_QUALIDADE_SESSAO_ESTAVEL_V3_2026_07_25]";

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

const ESTRATEGIAS = [
  "fila_setor",
  "atendente_especifico",
  "rodizio_aleatorio",
  "menos_conversas",
] as const;

type Estrategia = (typeof ESTRATEGIAS)[number];
type Objeto = Record<string, unknown>;
type RespostaEstado = {
  pergunta_id: string;
  pergunta: string;
  resposta: string;
  respondida_em: string;
};

type PerguntaEstavel = Omit<PerguntaAssistenteFluxo, "campo"> & {
  campo: string;
  aplica_refs?: string[];
  grupo_id?: string;
  escopo_atendimento?: "padrao_fluxo" | "etapa";
  condicional_estrategia?: "atendente_especifico";
};

type EstadoEstavel = {
  versao: number;
  assinatura_plano: string;
  instrucao: string;
  perguntas: PerguntaEstavel[];
  perguntas_respondidas: string[];
  perguntas_puladas: string[];
  respostas: RespostaEstado[];
};

type Sessao = {
  id: string;
  empresa_id: string;
  usuario_id: string;
  instrucao: string;
  contexto_json: unknown;
  resposta_ia_json: unknown;
  status: string;
  updated_at: string;
};

type Atendente = {
  id: string;
  nome: string;
  email: string | null;
  setor_ids: string[];
};

type RecursosAtendimento = {
  setores: AssistenteSetor[];
  atendentes: Atendente[];
  midias: AssistenteMidia[];
};

type SessaoEstavel = {
  sessao: Sessao;
  contexto: Objeto;
  plano: Objeto;
  estado: EstadoEstavel;
  recursos: RecursosAtendimento;
};

const OPCOES_DISTRIBUICAO = [
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

const REGRAS_QUALIDADE_ESTAVEIS = `
${MARCADOR_REGRAS_ESTAVEIS}

ESTAS REGRAS SUBSTITUEM QUALQUER INSTRUCAO ANTERIOR QUE EXIJA UMA CONFIRMACAO DE EXCESSO OU TIMEOUT PARA CADA BLOCO.

REGRAS OBRIGATORIAS DE QUALIDADE DO FLUXO

1. MIDIAS POR CONTEXTO
- Quando o pedido solicitar galeria, fotos, portfolio, casos reais ou antes e depois para categorias diferentes, crie uma etapa de midia propria para cada contexto.
- Nunca reutilize uma unica midia generica para representar categorias diferentes.
- Se nao houver midia correspondente, mantenha a etapa com midia_id, midia_nome e midia_url como null para confirmacao posterior.

2. OPCOES E ROTAS
- De 1 a 3 opcoes, use pergunta_botoes. De 4 a 10 opcoes, use pergunta_opcoes.
- Cada opcao visivel deve possuir exatamente uma rota normal e cada rota deve corresponder a uma opcao visivel.
- Duas opcoes da mesma pergunta nao podem apontar para o mesmo bloco de destino.

3. FAQ E COPY
- Remova perguntas duplicadas ou semanticamente equivalentes dentro do mesmo FAQ.
- Preserve integralmente mensagens, enderecos, horarios e avisos fornecidos pelo usuario.
- Nao invente fatos tecnicos, clinicos, prazos, beneficios ou resultados.

4. TRANSFERENCIA HUMANA
- Cada bloco real de transferencia humana continua com setor e distribuicao proprios para confirmacao do usuario.
- Use apenas IDs reais dos setores fornecidos no contexto.

5. EXCESSO DE TENTATIVAS E TIMEOUT
- O fluxo deve possuir uma configuracao padrao unica de setor e distribuicao para excesso de tentativas e timeout sem resposta.
- Para os blocos comuns que usam o comportamento padrao, deixe setor_excesso_tentativas, estrategia_excesso_tentativas e atendente_excesso_tentativas como null.
- Preencha esses campos em uma etapa somente quando o pedido do usuario exigir explicitamente que aquele bloco tenha destino ou distribuicao diferente do padrao do fluxo.
- Cada configuracao individual realmente diferente sera confirmada separadamente pelo usuario.
- Nao replique a mesma configuracao individual em todos os menus, FAQs e capturas.

Revise o JSON antes de responder e retorne somente o schema solicitado.
`.trim();

function obj(valor: unknown): Objeto {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Objeto)
    : {};
}

function txt(valor: unknown, limite = 1000) {
  return String(valor || "").trim().slice(0, limite);
}

function listaUnica(valores: string[]) {
  return Array.from(new Set(valores.filter(Boolean)));
}

function estrategia(valor: unknown): Estrategia {
  const informada = txt(valor, 80) as Estrategia;
  return ESTRATEGIAS.includes(informada) ? informada : "fila_setor";
}

function etapas(plano: unknown) {
  const raiz = obj(plano);
  return Array.isArray(raiz.etapas) ? raiz.etapas.map(obj) : [];
}

function etapaPorRef(plano: unknown, ref: string) {
  return etapas(plano).find((item) => txt(item.ref, 180) === ref) || null;
}

function refsPergunta(pergunta: PerguntaEstavel) {
  const refs = Array.isArray(pergunta.aplica_refs)
    ? pergunta.aplica_refs.map((ref) => txt(ref, 180)).filter(Boolean)
    : [];
  if (refs.length > 0) return listaUnica(refs);
  const ref = txt(pergunta.etapa_ref, 180);
  return ref && ref !== REF_PADRAO_EXCESSO ? [ref] : [];
}

function assinaturaPlano(plano: unknown) {
  const raiz = obj(plano);
  const clarificacoes = Array.isArray(raiz.clarificacoes)
    ? raiz.clarificacoes.map((item) => {
        const pergunta = obj(item);
        return {
          id: txt(pergunta.id, 180),
          pergunta: txt(pergunta.pergunta, 300),
        };
      })
    : [];

  const estrutura = etapas(plano).map((item) => ({
    ref: txt(item.ref, 180),
    tipo: txt(item.tipo, 80),
    titulo: txt(item.titulo, 180),
    opcoes: Array.isArray(item.opcoes)
      ? item.opcoes.map((opcao) => txt(obj(opcao).id, 180))
      : [],
  }));

  return JSON.stringify({ clarificacoes, estrutura });
}

function normalizarRespostas(valor: unknown): RespostaEstado[] {
  if (!Array.isArray(valor)) return [];
  const porId = new Map<string, RespostaEstado>();

  for (const itemBase of valor) {
    const item = obj(itemBase);
    const id = txt(item.pergunta_id, 240);
    if (!id || porId.has(id)) continue;
    porId.set(id, {
      pergunta_id: id,
      pergunta: txt(item.pergunta, 1200),
      resposta: txt(item.resposta, 1200),
      respondida_em: txt(item.respondida_em, 80) || new Date().toISOString(),
    });
  }

  return Array.from(porId.values());
}

function normalizarEstado(valor: unknown): EstadoEstavel {
  const item = obj(valor);
  const respostas = normalizarRespostas(item.respostas);
  return {
    versao: Number(item.versao || 1),
    assinatura_plano: txt(item.assinatura_plano, 20000),
    instrucao: txt(item.instrucao, 12000),
    perguntas: Array.isArray(item.perguntas)
      ? (item.perguntas as PerguntaEstavel[])
      : [],
    perguntas_respondidas: listaUnica(
      [
        ...(Array.isArray(item.perguntas_respondidas)
          ? item.perguntas_respondidas.map((id) => txt(id, 240))
          : []),
        ...respostas.map((resposta) => resposta.pergunta_id),
      ].filter(Boolean)
    ),
    perguntas_puladas: listaUnica(
      Array.isArray(item.perguntas_puladas)
        ? item.perguntas_puladas.map((id) => txt(id, 240))
        : []
    ),
    respostas,
  };
}

function mesclarRespostas(...listas: RespostaEstado[][]) {
  const porId = new Map<string, RespostaEstado>();
  for (const lista of listas) {
    for (const resposta of lista) {
      if (!porId.has(resposta.pergunta_id)) {
        porId.set(resposta.pergunta_id, resposta);
      }
    }
  }
  return Array.from(porId.values());
}

function proximaPergunta(estado: EstadoEstavel) {
  const respondidas = new Set(estado.perguntas_respondidas);
  return estado.perguntas.find((pergunta) => !respondidas.has(pergunta.id)) || null;
}

function progresso(estado: EstadoEstavel) {
  const ids = new Set(estado.perguntas.map((pergunta) => pergunta.id));
  const respondidas = new Set(
    estado.perguntas_respondidas.filter((id) => ids.has(id))
  );
  return { respondidas: respondidas.size, total: estado.perguntas.length };
}

function respostaEstado(params: {
  sessaoId: string;
  plano: unknown;
  estado: EstadoEstavel;
  mensagem?: string;
  base?: Objeto;
  status?: number;
}) {
  const pergunta = proximaPergunta(params.estado);
  return NextResponse.json(
    {
      ...(params.base || {}),
      ok: true,
      proposta_id: params.sessaoId,
      sessao_id: params.sessaoId,
      modo: "criar_fluxo",
      fase: pergunta ? "coletando" : "pronto",
      mensagem:
        params.mensagem ||
        (pergunta
          ? "Agora preciso confirmar os recursos e destinos do fluxo."
          : "Todas as informações foram confirmadas."),
      pergunta,
      progresso: progresso(params.estado),
      historico: params.estado.respostas.map((resposta) => ({
        pergunta: resposta.pergunta,
        resposta: resposta.resposta,
      })),
      plano: params.plano,
    },
    { status: params.status || 200 }
  );
}

function anexarRegrasQualidadeEstaveis(request: Request) {
  return request.clone().json().catch(() => ({})).then((bodyBase) => {
    const body = obj(bodyBase);
    const modo = txt(body.modo || "criar_fluxo", 80);
    const acao = txt(body.acao, 40);
    const instrucao = String(body.instrucao || "").trim();

    if (
      request.method !== "POST" ||
      modo !== "criar_fluxo" ||
      acao !== "preparar" ||
      !instrucao ||
      instrucao.includes(MARCADOR_REGRAS_ESTAVEIS)
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
        regras_sessao_estavel_versao: VERSAO_ESTADO_ESTAVEL,
        instrucao: `${instrucao}\n\n${REGRAS_QUALIDADE_ESTAVEIS}`,
      }),
    });
  });
}

async function carregarRecursos(empresaId: string): Promise<RecursosAtendimento> {
  const [{ data: setores, error: erroSetores }, { data: midias, error: erroMidias }] =
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

  if (erroSetores) throw erroSetores;
  if (erroMidias) throw erroMidias;

  const listaSetores = (setores || []) as AssistenteSetor[];
  const setorIds = listaSetores.map((setor) => setor.id);
  const { data: vinculos, error: erroVinculos } = setorIds.length
    ? await db
        .from("usuarios_setores")
        .select("usuario_id, setor_id")
        .in("setor_id", setorIds)
    : { data: [], error: null };

  if (erroVinculos) throw erroVinculos;

  const usuarioIds = listaUnica(
    (vinculos || []).map((item: { usuario_id: string }) => item.usuario_id)
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

  const setoresPorUsuario = new Map<string, string[]>();
  for (const vinculo of (vinculos || []) as Array<{
    usuario_id: string;
    setor_id: string;
  }>) {
    setoresPorUsuario.set(
      vinculo.usuario_id,
      listaUnica([
        ...(setoresPorUsuario.get(vinculo.usuario_id) || []),
        vinculo.setor_id,
      ])
    );
  }

  return {
    setores: listaSetores,
    atendentes: ((usuarios || []) as Array<{
      id: string;
      nome: string;
      email: string | null;
    }>).map((usuario) => ({
      ...usuario,
      setor_ids: setoresPorUsuario.get(usuario.id) || [],
    })),
    midias: ((midias || []) as AssistenteMidia[]).filter((midia) =>
      ["imagem", "video", "audio", "arquivo"].includes(midia.tipo)
    ),
  };
}

async function carregarSessao(params: {
  sessaoId: string;
  empresaId: string;
  usuarioId: string;
}) {
  const { data, error } = await db
    .from("automacao_assistente_ia_execucoes")
    .select(
      "id, empresa_id, usuario_id, instrucao, contexto_json, resposta_ia_json, status, updated_at"
    )
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("modo", "criar_fluxo")
    .maybeSingle();

  if (error) throw error;
  return (data || null) as Sessao | null;
}

function perguntaDistribuicao(params: {
  grupoId: string;
  ref: string;
  refs: string[];
  titulo: string;
  excesso: boolean;
  escopo: "padrao_fluxo" | "etapa";
  atual: unknown;
}): PerguntaEstavel {
  const prefixo = params.excesso ? "distribuicao_excesso" : "distribuicao";
  const padrao = params.escopo === "padrao_fluxo";
  return {
    id: `${prefixo}:${params.ref}`,
    etapa_ref: params.ref,
    campo: params.excesso
      ? "estrategia_excesso_tentativas"
      : "estrategia_transferencia",
    tipo: "selecao",
    mensagem: padrao
      ? "Como o atendimento padrão de excesso e timeout deve ser distribuído?"
      : `Distribuição do atendimento no bloco “${params.titulo}”`,
    ajuda: params.excesso
      ? padrao
        ? "Esta distribuição será usada nos blocos que seguem o padrão do fluxo."
        : "Confirme a distribuição diferente usada somente nesta situação."
      : "Escolha como distribuir o contato após a transferência.",
    obrigatoria: true,
    bloqueada: false,
    valor_sugerido: estrategia(params.atual),
    opcoes: OPCOES_DISTRIBUICAO,
    aplica_refs: params.refs,
    grupo_id: params.grupoId,
    escopo_atendimento: params.escopo,
  } as PerguntaEstavel;
}

function perguntaAtendente(params: {
  grupoId: string;
  ref: string;
  refs: string[];
  titulo: string;
  excesso: boolean;
  escopo: "padrao_fluxo" | "etapa";
  setorId: string;
  atual: unknown;
  atendentes: Atendente[];
}): PerguntaEstavel {
  const lista = params.atendentes.filter((atendente) =>
    atendente.setor_ids.includes(params.setorId)
  );
  const sugerido = lista.some((atendente) => atendente.id === txt(params.atual, 120))
    ? txt(params.atual, 120)
    : null;
  const prefixo = params.excesso ? "atendente_excesso" : "atendente";
  const padrao = params.escopo === "padrao_fluxo";

  return {
    id: `${prefixo}:${params.ref}`,
    etapa_ref: params.ref,
    campo: params.excesso
      ? "atendente_excesso_tentativas"
      : "atendente_id",
    tipo: "selecao",
    mensagem: padrao
      ? "Qual atendente receberá o excesso e timeout padrão do fluxo?"
      : `Atendente destino no bloco “${params.titulo}”`,
    ajuda: params.setorId
      ? lista.length
        ? "Selecione um atendente ativo vinculado ao setor."
        : "Este setor não possui atendentes ativos vinculados."
      : "Confirme primeiro o setor desta transferência.",
    obrigatoria: true,
    bloqueada: !params.setorId || lista.length === 0,
    valor_sugerido: sugerido,
    opcoes: lista.map((atendente) => ({
      id: atendente.id,
      label: atendente.nome,
      descricao: atendente.email,
    })),
    aplica_refs: params.refs,
    grupo_id: params.grupoId,
    escopo_atendimento: params.escopo,
    condicional_estrategia: "atendente_especifico",
  } as PerguntaEstavel;
}

function grupoTransferencia(params: {
  perguntaSetor: PerguntaEstavel;
  plano: unknown;
  recursos: RecursosAtendimento;
  excesso: boolean;
}) {
  const refs = refsPergunta(params.perguntaSetor);
  const etapa = refs.length ? etapaPorRef(params.plano, refs[0]) : null;
  const titulo =
    params.perguntaSetor.escopo_atendimento === "padrao_fluxo"
      ? "Padrão do fluxo"
      : txt(etapa?.titulo, 120) || txt(params.perguntaSetor.etapa_ref, 120);
  const refId = txt(params.perguntaSetor.etapa_ref, 180);
  const grupoId = `${params.excesso ? "excesso" : "transferencia"}:${refId}`;
  const estrategiaAtual = params.excesso
    ? etapa?.estrategia_excesso_tentativas
    : etapa?.estrategia_transferencia;
  const setorId = txt(
    params.excesso ? etapa?.setor_excesso_tentativas : etapa?.setor_id,
    120
  );
  const atendenteAtual = params.excesso
    ? etapa?.atendente_excesso_tentativas
    : etapa?.atendente_id;
  const setor = {
    ...params.perguntaSetor,
    aplica_refs: refs,
    grupo_id: grupoId,
  };

  return [
    setor,
    perguntaDistribuicao({
      grupoId,
      ref: refId,
      refs,
      titulo,
      excesso: params.excesso,
      escopo: setor.escopo_atendimento || "etapa",
      atual: estrategiaAtual,
    }),
    perguntaAtendente({
      grupoId,
      ref: refId,
      refs,
      titulo,
      excesso: params.excesso,
      escopo: setor.escopo_atendimento || "etapa",
      setorId,
      atual: atendenteAtual,
      atendentes: params.recursos.atendentes,
    }),
  ];
}

function configuracoesExcesso(plano: unknown, recursos: RecursosAtendimento) {
  const setoresValidos = new Set(recursos.setores.map((setor) => setor.id));
  const aguardam = etapas(plano).filter((item) =>
    TIPOS_COM_RESPOSTA.has(txt(item.tipo, 80))
  );
  const explicitas = aguardam
    .map((item) => {
      const ref = txt(item.ref, 180);
      const setorId = txt(item.setor_excesso_tentativas, 120);
      if (!ref || !setorId || !setoresValidos.has(setorId)) return null;
      const config = {
        ref,
        setorId,
        estrategia: estrategia(item.estrategia_excesso_tentativas),
        atendenteId: txt(item.atendente_excesso_tentativas, 120),
      };
      return {
        ...config,
        chave: `${config.setorId}|${config.estrategia}|${config.atendenteId}`,
      };
    })
    .filter(Boolean) as Array<{
    ref: string;
    setorId: string;
    estrategia: Estrategia;
    atendenteId: string;
    chave: string;
  }>;

  const contagem = new Map<string, number>();
  for (const config of explicitas) {
    contagem.set(config.chave, (contagem.get(config.chave) || 0) + 1);
  }
  const principal = Array.from(contagem.entries()).sort((a, b) => b[1] - a[1])[0];
  const usarPrincipalComoPadrao = Boolean(
    principal &&
      (principal[1] >= 2 ||
        (explicitas.length === aguardam.length && contagem.size === 1))
  );
  const chavePadrao = usarPrincipalComoPadrao ? principal?.[0] || null : null;
  const configPadrao = chavePadrao
    ? explicitas.find((config) => config.chave === chavePadrao) || null
    : null;
  const overrides = explicitas.filter(
    (config) => !chavePadrao || config.chave !== chavePadrao
  );
  const refsOverride = new Set(overrides.map((config) => config.ref));
  const refsPadrao = aguardam
    .map((item) => txt(item.ref, 180))
    .filter((ref) => ref && !refsOverride.has(ref))
    .sort((a, b) => {
      if (a === configPadrao?.ref) return -1;
      if (b === configPadrao?.ref) return 1;
      return 0;
    });

  return { aguardam, refsPadrao, configPadrao, overrides };
}

function perguntasExcessoPadrao(params: {
  plano: unknown;
  recursos: RecursosAtendimento;
}): PerguntaEstavel[] {
  const { refsPadrao, configPadrao, overrides } = configuracoesExcesso(
    params.plano,
    params.recursos
  );
  const opcoesSetores = params.recursos.setores.map((setor) => ({
    id: setor.id,
    label: setor.nome,
    descricao: null,
  }));
  const perguntas: PerguntaEstavel[] = [];

  if (refsPadrao.length > 0) {
    const setorPadrao: PerguntaEstavel = {
      id: `setor_excesso:${REF_PADRAO_EXCESSO}`,
      etapa_ref: REF_PADRAO_EXCESSO,
      campo: "setor_excesso_tentativas",
      tipo: "selecao",
      mensagem:
        "Para qual setor o fluxo deve transferir contatos por excesso de tentativas ou timeout?",
      ajuda: opcoesSetores.length
        ? "Este será o padrão dos blocos que não possuem uma configuração individual diferente."
        : "Cadastre e ative um setor antes de concluir este fluxo.",
      obrigatoria: true,
      bloqueada: opcoesSetores.length === 0,
      valor_sugerido: configPadrao?.setorId || null,
      opcoes: opcoesSetores,
      aplica_refs: refsPadrao,
      escopo_atendimento: "padrao_fluxo",
    } as PerguntaEstavel;
    perguntas.push(
      ...grupoTransferencia({
        perguntaSetor: setorPadrao,
        plano: params.plano,
        recursos: params.recursos,
        excesso: true,
      })
    );
  }

  for (const override of overrides) {
    const item = etapaPorRef(params.plano, override.ref);
    const titulo = txt(item?.titulo, 120) || override.ref;
    const pergunta: PerguntaEstavel = {
      id: `setor_excesso:${override.ref}`,
      etapa_ref: override.ref,
      campo: "setor_excesso_tentativas",
      tipo: "selecao",
      mensagem: `O bloco “${titulo}” usa um destino diferente. Confirme o setor para excesso ou timeout.`,
      ajuda:
        "Esta confirmação individual será aplicada somente a esta situação diferente do padrão do fluxo.",
      obrigatoria: true,
      bloqueada: opcoesSetores.length === 0,
      valor_sugerido: override.setorId,
      opcoes: opcoesSetores,
      aplica_refs: [override.ref],
      escopo_atendimento: "etapa",
    } as PerguntaEstavel;
    perguntas.push(
      ...grupoTransferencia({
        perguntaSetor: pergunta,
        plano: params.plano,
        recursos: params.recursos,
        excesso: true,
      })
    );
  }

  return perguntas;
}

function criarPerguntasEstaveis(params: {
  plano: unknown;
  recursos: RecursosAtendimento;
}) {
  const originais = criarPerguntasAssistenteFluxo({
    plano: params.plano as PlanoAssistenteFluxos,
    setores: params.recursos.setores,
    midias: params.recursos.midias,
  }) as PerguntaEstavel[];
  const perguntas: PerguntaEstavel[] = [];

  for (const original of originais) {
    if (original.id.startsWith("setor_excesso:")) continue;
    const pergunta: PerguntaEstavel = {
      ...original,
      aplica_refs: txt(original.etapa_ref, 180)
        ? [txt(original.etapa_ref, 180)]
        : [],
      escopo_atendimento: "etapa",
    };

    if (pergunta.campo === "setor_id") {
      perguntas.push(
        ...grupoTransferencia({
          perguntaSetor: pergunta,
          plano: params.plano,
          recursos: params.recursos,
          excesso: false,
        })
      );
    } else {
      perguntas.push(pergunta);
    }
  }

  perguntas.push(...perguntasExcessoPadrao(params));

  const ids = new Set<string>();
  return perguntas.filter((pergunta) => {
    if (!pergunta.id || ids.has(pergunta.id)) return false;
    ids.add(pergunta.id);
    return true;
  });
}

function atualizarMetadadosPerguntas(
  persistidas: PerguntaEstavel[],
  geradas: PerguntaEstavel[]
) {
  const porId = new Map(geradas.map((pergunta) => [pergunta.id, pergunta]));
  return persistidas.map((pergunta) => {
    const atual = porId.get(pergunta.id);
    return atual ? { ...pergunta, ...atual, id: pergunta.id } : pergunta;
  });
}

function normalizarCondicionais(estado: EstadoEstavel, plano: unknown) {
  const respondidas = new Set(estado.perguntas_respondidas);
  const puladas = new Set(estado.perguntas_puladas);
  const respostas = new Set(estado.respostas.map((resposta) => resposta.pergunta_id));

  for (const pergunta of estado.perguntas) {
    if (
      ![
        "estrategia_transferencia",
        "estrategia_excesso_tentativas",
      ].includes(pergunta.campo) ||
      !respondidas.has(pergunta.id)
    ) {
      continue;
    }

    const atendente = estado.perguntas.find(
      (item) =>
        item.grupo_id === pergunta.grupo_id &&
        ["atendente_id", "atendente_excesso_tentativas"].includes(item.campo)
    );
    if (!atendente) continue;

    const ref = refsPergunta(pergunta)[0];
    const item = ref ? etapaPorRef(plano, ref) : null;
    const atual = estrategia(
      pergunta.campo === "estrategia_transferencia"
        ? item?.estrategia_transferencia
        : item?.estrategia_excesso_tentativas
    );

    if (atual !== "atendente_especifico") {
      respondidas.add(atendente.id);
      puladas.add(atendente.id);
    } else if (puladas.has(atendente.id) && !respostas.has(atendente.id)) {
      puladas.delete(atendente.id);
      respondidas.delete(atendente.id);
    }
  }

  return {
    ...estado,
    perguntas_respondidas: Array.from(respondidas),
    perguntas_puladas: Array.from(puladas),
  };
}

function reconciliarEstado(params: {
  anterior: EstadoEstavel;
  conversaAtual: EstadoEstavel;
  plano: unknown;
  recursos: RecursosAtendimento;
  instrucao: string;
}) {
  const assinatura = assinaturaPlano(params.plano);
  const geradas = criarPerguntasEstaveis({
    plano: params.plano,
    recursos: params.recursos,
  });
  const respostas = mesclarRespostas(
    params.anterior.respostas,
    params.conversaAtual.respostas
  );
  const manterFila =
    params.anterior.versao === VERSAO_ESTADO_ESTAVEL &&
    params.anterior.assinatura_plano === assinatura &&
    params.anterior.perguntas.length > 0;
  const perguntas = manterFila
    ? atualizarMetadadosPerguntas(params.anterior.perguntas, geradas)
    : geradas;
  const estado: EstadoEstavel = {
    versao: VERSAO_ESTADO_ESTAVEL,
    assinatura_plano: assinatura,
    instrucao:
      params.anterior.instrucao ||
      params.conversaAtual.instrucao ||
      params.instrucao,
    perguntas,
    perguntas_respondidas: listaUnica([
      ...params.anterior.perguntas_respondidas,
      ...params.conversaAtual.perguntas_respondidas,
      ...respostas.map((resposta) => resposta.pergunta_id),
    ]),
    perguntas_puladas: listaUnica([
      ...params.anterior.perguntas_puladas,
      ...params.conversaAtual.perguntas_puladas,
    ]),
    respostas,
  };

  return normalizarCondicionais(estado, params.plano);
}

async function salvarSessaoEstavel(params: {
  sessao: Sessao;
  contexto: Objeto;
  plano: unknown;
  estado: EstadoEstavel;
}) {
  const contexto = {
    ...params.contexto,
    conversa: params.estado,
    [CHAVE_ESTADO_ESTAVEL]: params.estado,
  };
  const { error } = await db
    .from("automacao_assistente_ia_execucoes")
    .update({
      contexto_json: contexto,
      resposta_ia_json: params.plano,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.sessao.id)
    .eq("empresa_id", params.sessao.empresa_id)
    .eq("usuario_id", params.sessao.usuario_id)
    .eq("status", "processando");

  if (error) {
    throw new Error(`Não foi possível salvar a sessão do assistente: ${error.message}`);
  }

  return contexto;
}

async function garantirSessaoEstavel(params: {
  sessaoId: string;
  empresaId: string;
  usuarioId: string;
}): Promise<SessaoEstavel | null> {
  const [sessao, recursos] = await Promise.all([
    carregarSessao(params),
    carregarRecursos(params.empresaId),
  ]);
  if (!sessao || sessao.status !== "processando") return null;

  const contexto = obj(sessao.contexto_json);
  const conversaAtual = normalizarEstado(contexto.conversa);
  const anterior = normalizarEstado(contexto[CHAVE_ESTADO_ESTAVEL]);
  const plano = obj(sessao.resposta_ia_json);
  const estado = reconciliarEstado({
    anterior,
    conversaAtual,
    plano,
    recursos,
    instrucao: sessao.instrucao,
  });
  const contextoSalvo = await salvarSessaoEstavel({
    sessao,
    contexto,
    plano,
    estado,
  });

  return {
    sessao,
    contexto: contextoSalvo,
    plano,
    estado,
    recursos,
  };
}

function atualizarRefs(
  plano: unknown,
  refs: string[],
  mudancas: Objeto
): Objeto {
  const raiz = obj(plano);
  const selecionadas = new Set(refs);
  return {
    ...raiz,
    etapas: etapas(plano).map((item) =>
      selecionadas.has(txt(item.ref, 180)) ? { ...item, ...mudancas } : item
    ),
  };
}

function perguntaCustomizada(pergunta: PerguntaEstavel) {
  return [
    "setor_excesso_tentativas",
    "estrategia_transferencia",
    "estrategia_excesso_tentativas",
    "atendente_id",
    "atendente_excesso_tentativas",
  ].includes(pergunta.campo);
}

async function responderPerguntaCustomizada(params: {
  atual: SessaoEstavel;
  pergunta: PerguntaEstavel;
  resposta: unknown;
}) {
  const valor = txt(params.resposta, 1000);
  if (params.pergunta.bloqueada || !valor) {
    return NextResponse.json(
      {
        ok: false,
        error: params.pergunta.ajuda || "Resposta obrigatória.",
      },
      { status: 422 }
    );
  }

  const refs = refsPergunta(params.pergunta);
  if (refs.length === 0) {
    return NextResponse.json(
      { ok: false, error: "A pergunta não possui etapas de destino válidas." },
      { status: 422 }
    );
  }

  let plano: Objeto = params.atual.plano;
  let resumo = valor;

  if (params.pergunta.campo === "setor_excesso_tentativas") {
    const setor = params.atual.recursos.setores.find((item) => item.id === valor);
    if (!setor) {
      return NextResponse.json(
        { ok: false, error: "Selecione um setor válido." },
        { status: 422 }
      );
    }
    resumo = setor.nome;
    plano = atualizarRefs(plano, refs, {
      setor_excesso_tentativas: setor.id,
    });
  } else if (
    ["estrategia_transferencia", "estrategia_excesso_tentativas"].includes(
      params.pergunta.campo
    )
  ) {
    if (!ESTRATEGIAS.includes(valor as Estrategia)) {
      return NextResponse.json(
        { ok: false, error: "Selecione uma distribuição válida." },
        { status: 422 }
      );
    }
    const escolhida = valor as Estrategia;
    resumo =
      OPCOES_DISTRIBUICAO.find((item) => item.id === escolhida)?.label ||
      escolhida;
    const campoAtendente =
      params.pergunta.campo === "estrategia_transferencia"
        ? "atendente_id"
        : "atendente_excesso_tentativas";
    plano = atualizarRefs(plano, refs, {
      [params.pergunta.campo]: escolhida,
      ...(escolhida === "atendente_especifico"
        ? {}
        : { [campoAtendente]: null }),
    });
  } else if (
    ["atendente_id", "atendente_excesso_tentativas"].includes(
      params.pergunta.campo
    )
  ) {
    const campoSetor =
      params.pergunta.campo === "atendente_id"
        ? "setor_id"
        : "setor_excesso_tentativas";
    const setores = listaUnica(
      refs.map((ref) => txt(etapaPorRef(plano, ref)?.[campoSetor], 120))
    );
    const atendente = params.atual.recursos.atendentes.find(
      (item) =>
        item.id === valor &&
        setores.length > 0 &&
        setores.every((setorId) => item.setor_ids.includes(setorId))
    );
    if (!atendente) {
      return NextResponse.json(
        { ok: false, error: "Selecione um atendente ativo do setor." },
        { status: 422 }
      );
    }
    resumo = atendente.nome;
    plano = atualizarRefs(plano, refs, {
      [params.pergunta.campo]: atendente.id,
    });
  }

  const respondidas = listaUnica([
    ...params.atual.estado.perguntas_respondidas,
    params.pergunta.id,
  ]);
  const respostas = mesclarRespostas(params.atual.estado.respostas, [
    {
      pergunta_id: params.pergunta.id,
      pergunta: params.pergunta.mensagem,
      resposta: resumo,
      respondida_em: new Date().toISOString(),
    },
  ]);
  const geradas = criarPerguntasEstaveis({
    plano,
    recursos: params.atual.recursos,
  });
  let estado: EstadoEstavel = {
    ...params.atual.estado,
    perguntas: atualizarMetadadosPerguntas(
      params.atual.estado.perguntas,
      geradas
    ),
    perguntas_respondidas: respondidas,
    respostas,
  };
  estado = normalizarCondicionais(estado, plano);
  const contexto = await salvarSessaoEstavel({
    sessao: params.atual.sessao,
    contexto: params.atual.contexto,
    plano,
    estado,
  });
  void contexto;

  return respostaEstado({
    sessaoId: params.atual.sessao.id,
    plano,
    estado,
    mensagem: `Entendido: ${resumo}.`,
  });
}

async function reconciliarRespostaHttp(params: {
  response: Response;
  sessaoId?: string;
  empresaId: string;
  usuarioId: string;
}) {
  if (!params.response.ok) return params.response;
  const dados = obj(await params.response.clone().json().catch(() => ({})));
  if (dados.fase === "concluido") return params.response;
  const sessaoId = txt(dados.sessao_id || params.sessaoId, 120);
  if (!sessaoId) return params.response;

  const atual = await garantirSessaoEstavel({
    sessaoId,
    empresaId: params.empresaId,
    usuarioId: params.usuarioId,
  });
  if (!atual) return params.response;

  return respostaEstado({
    sessaoId,
    plano: atual.plano,
    estado: atual.estado,
    mensagem: txt(dados.mensagem, 1200) || undefined,
    base: dados,
    status: params.response.status,
  });
}

/**
 * Pipeline:
 * pedido original + regras tecnicas -> briefing estruturado -> geracao final ->
 * fila fixa de confirmacoes -> validacao estrutural -> persistencia.
 *
 * A fila e criada uma unica vez por versao do plano. Respostas repetidas sao
 * idempotentes e IDs respondidos nunca sao removidos durante a sessao.
 */
export async function POST(request: Request) {
  configurarModelosFluxosIa();

  const { reconciliarConsumosIaPendentes } = await import(
    "./openai-retrieve-compat"
  );
  habilitarBriefingFluxosIa();
  const { executarAssistente } = await import("./route-resiliente");

  await reconciliarConsumosIaPendentes();
  const requestComRecursos = await anexarRegrasRecursosAoPedido(request);
  const requestFinal = await anexarRegrasQualidadeEstaveis(requestComRecursos);
  const body = obj(await requestFinal.clone().json().catch(() => ({})));
  const acao = txt(body.acao, 40);
  const sessaoId = txt(body.sessao_id || body.sessaoId, 120);
  const perguntaId = txt(body.pergunta_id, 240);
  const contextoUsuario = await getUsuarioContexto();
  if (!contextoUsuario.ok) {
    return NextResponse.json(
      { ok: false, error: contextoUsuario.error },
      { status: contextoUsuario.status },
    );
  }

  const bloqueioPermissao = bloquearSemPermissao(
    contextoUsuario.usuario,
    "fluxos.criar",
    "Você não tem permissão para criar fluxos com IA.",
  );
  if (bloqueioPermissao) return bloqueioPermissao;

  const empresaId = contextoUsuario.ok
    ? contextoUsuario.usuario.empresa_id
    : null;
  const usuarioId = contextoUsuario.ok ? contextoUsuario.usuario.id : null;

  if (sessaoId && empresaId && usuarioId) {
    const atual = await garantirSessaoEstavel({
      sessaoId,
      empresaId,
      usuarioId,
    });

    if (atual) {
      if (["retomar", "atualizar"].includes(acao)) {
        return respostaEstado({
          sessaoId,
          plano: atual.plano,
          estado: atual.estado,
          mensagem:
            acao === "atualizar"
              ? "Atualizei as opções sem alterar a sequência das confirmações."
              : "Sessão retomada com a sequência de confirmações preservada.",
        });
      }

      if (acao === "responder") {
        const respondidas = new Set(atual.estado.perguntas_respondidas);
        if (respondidas.has(perguntaId)) {
          return respostaEstado({
            sessaoId,
            plano: atual.plano,
            estado: atual.estado,
            mensagem: "Essa resposta já havia sido registrada.",
          });
        }

        const perguntaAtual = proximaPergunta(atual.estado);
        const perguntaPersistida = atual.estado.perguntas.find(
          (pergunta) => pergunta.id === perguntaId
        );

        if (!perguntaPersistida) {
          return respostaEstado({
            sessaoId,
            plano: atual.plano,
            estado: atual.estado,
            mensagem:
              "As confirmações desta sessão foram reorganizadas com segurança. Continue pela pergunta atual.",
          });
        }

        if (!perguntaAtual || perguntaAtual.id !== perguntaId) {
          return NextResponse.json(
            {
              ok: false,
              error: "Responda a pergunta atual antes de continuar.",
              pergunta: perguntaAtual,
              progresso: progresso(atual.estado),
            },
            { status: 409 }
          );
        }

        if (perguntaCustomizada(perguntaAtual)) {
          return responderPerguntaCustomizada({
            atual,
            pergunta: perguntaAtual,
            resposta: body.resposta,
          });
        }

        const response = await executarComRecuperacaoSessao(
          requestFinal,
          executarAssistente
        );
        return reconciliarRespostaHttp({
          response,
          sessaoId,
          empresaId,
          usuarioId,
        });
      }

      if (acao === "criar") {
        const pendente = proximaPergunta(atual.estado);
        if (pendente) {
          return respostaEstado({
            sessaoId,
            plano: atual.plano,
            estado: atual.estado,
            mensagem:
              "Ainda existem recursos obrigatórios para confirmar antes de criar o fluxo.",
          });
        }

        return executarComRecuperacaoSessao(requestFinal, executarAssistente);
      }
    }
  }

  const response = await executarComRecuperacaoSessao(
    requestFinal,
    executarAssistente
  );

  if (!empresaId || !usuarioId) return response;
  return reconciliarRespostaHttp({
    response,
    sessaoId: sessaoId || undefined,
    empresaId,
    usuarioId,
  });
}
