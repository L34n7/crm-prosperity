import {
  compilarPlanoAssistente as compilarPlanoAssistenteBase,
  validarFluxoAssistente,
  type AssistenteAutomacaoConexao,
  type AssistenteAutomacaoNo,
  type AssistenteMidia,
  type AssistenteSetor,
  type AssistenteVariavel,
  type ModoAssistenteFluxos,
  type PlanoAssistenteEtapa,
  type PlanoAssistenteFluxos,
  type ResultadoCompilacaoAssistente,
  type ValidacaoItemAssistente,
} from "./assistente-fluxos-base";
import {
  aplicarTiposAgenda,
  normalizarPlanoAssistenteComAgenda,
  prepararPlanoBaseComAgenda,
} from "./assistente-fluxos-agenda";
import { repararGrafoAssistente } from "./assistente-fluxos-reparador-grafo";
import {
  conteudoNo,
  ehAgendamento,
  ehAntesDepois,
  ehEspecialista,
  ehFaq,
  ehLocalizacao,
  ehMenuFaq,
  ehValores,
  normalizar,
  normalizarId,
  opcoesNo,
  respostaCorrespondeFaq,
} from "./assistente-fluxos-reparador-semantica";

export * from "./assistente-fluxos-base";
export { normalizarPlanoAssistenteComAgenda as normalizarPlanoAssistente };

const ESPACAMENTO_HORIZONTAL = 300;
const ESPACAMENTO_VERTICAL = 128;
const POSICAO_INICIAL_X = 80;
const POSICAO_INICIAL_Y = 80;

function texto(valor: unknown, limite = 160) {
  return String(valor || "").trim().slice(0, limite);
}

function validarRotasSempre(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
}) {
  const erros: ValidacaoItemAssistente[] = [];

  for (const no of params.nos) {
    const sempre = params.conexoes.filter(
      (conexao) =>
        conexao.no_origem_id === no.id &&
        conexao.condicao_json?.tipo === "sempre"
    );

    if (sempre.length <= 1) continue;

    erros.push({
      codigo: "MULTIPLAS_ROTAS_SEMPRE",
      mensagem: `O bloco "${no.titulo}" possui mais de uma conexão "Sempre seguir". Apenas uma rota incondicional é permitida por bloco.`,
      no_id: no.id,
      conexao_id: sempre[1]?.id,
    });
  }

  return erros;
}

function separarInicioComConteudo(plano: PlanoAssistenteFluxos) {
  const copia = structuredClone(plano);
  const inicio = copia.etapas.find((etapa) => etapa.tipo === "inicio");
  if (!inicio) return copia;

  const temMensagem = Boolean(texto(inicio.mensagem, 1800));
  const temOpcoes = inicio.opcoes.length > 0;
  inicio.titulo = "Início";
  if (!temMensagem && !temOpcoes) return copia;

  const refs = new Set(copia.etapas.map((etapa) => etapa.ref));
  let ref = "abertura";
  let indice = 2;
  while (refs.has(ref)) ref = `abertura_${indice++}`;

  const abertura: PlanoAssistenteEtapa = {
    ...inicio,
    ref,
    tipo: temOpcoes
      ? inicio.opcoes.length > 3
        ? "pergunta_opcoes"
        : "pergunta_botoes"
      : "mensagem",
    titulo: temOpcoes ? "Menu Principal" : "Boas-vindas",
  };
  inicio.mensagem = null;
  inicio.opcoes = [];

  copia.etapas.splice(copia.etapas.indexOf(inicio) + 1, 0, abertura);
  copia.rotas = copia.rotas
    .filter(
      (rota) =>
        rota.origem !== inicio.ref ||
        normalizar(rota.condicao) !== "sempre" ||
        !temOpcoes
    )
    .map((rota) =>
      rota.origem === inicio.ref ? { ...rota, origem: abertura.ref } : rota
    );
  copia.rotas.unshift({
    origem: inicio.ref,
    destino: abertura.ref,
    condicao: "sempre",
    valor: null,
    rotulo: "Sempre seguir",
    descricao_ia: null,
    timeout_segundos: null,
  });
  copia.avisos = [
    ...copia.avisos,
    "O conteúdo retornado dentro do início foi separado em um bloco real de abertura.",
  ];
  return copia;
}

function validarCiclosAutomaticos(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
}) {
  const adjacencias = new Map<string, string[]>();
  for (const no of params.nos) adjacencias.set(no.id, []);
  for (const conexao of params.conexoes) {
    if (conexao.condicao_json?.tipo !== "sempre") continue;
    adjacencias.get(conexao.no_origem_id)?.push(conexao.no_destino_id);
  }

  const estado = new Map<string, 0 | 1 | 2>();
  const pilha: string[] = [];
  let ciclo: string[] | null = null;

  const visitar = (id: string): boolean => {
    estado.set(id, 1);
    pilha.push(id);
    for (const destino of adjacencias.get(id) || []) {
      if (estado.get(destino) === 1) {
        ciclo = pilha.slice(Math.max(0, pilha.indexOf(destino)));
        return true;
      }
      if (!estado.get(destino) && visitar(destino)) return true;
    }
    pilha.pop();
    estado.set(id, 2);
    return false;
  };

  for (const no of params.nos) {
    if (!estado.get(no.id) && visitar(no.id)) break;
  }
  if (!ciclo) return [];

  const porId = new Map(params.nos.map((no) => [no.id, no]));
  const titulos = (ciclo as string[])
    .map((id) => porId.get(id)?.titulo || id)
    .join(" → ");
  return [
    {
      codigo: "CICLO_AUTOMATICO",
      mensagem: `O fluxo possui um ciclo composto apenas por conexões “Sempre seguir”: ${titulos}.`,
      no_id: (ciclo as string[])[0],
    } satisfies ValidacaoItemAssistente,
  ];
}

function validarCoerenciaSemantica(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
}) {
  const erros: ValidacaoItemAssistente[] = [];
  const porId = new Map(params.nos.map((no) => [no.id, no]));

  for (const conexao of params.conexoes) {
    if (conexao.condicao_json?.tipo !== "sempre") continue;
    const origem = porId.get(conexao.no_origem_id);
    const destino = porId.get(conexao.no_destino_id);
    if (!origem || !destino) continue;

    const origemRespostaFaq =
      origem.tipo_no === "enviar_texto" &&
      /\b(duvida|faq|resposta)\b/.test(normalizar(origem.titulo));
    const destinoRespostaFaq =
      destino.tipo_no === "enviar_texto" &&
      /\b(duvida|faq|resposta)\b/.test(normalizar(destino.titulo));
    if (origemRespostaFaq && destinoRespostaFaq) {
      erros.push({
        codigo: "FAQ_RESPOSTAS_ENCADEADAS",
        mensagem: `A resposta de FAQ “${origem.titulo}” não pode enviar automaticamente outra resposta de FAQ.`,
        no_id: origem.id,
        conexao_id: conexao.id,
      });
    }

    if (
      origem.tipo_no === "agenda_criar_agendamento" &&
      destino.tipo_no === "enviar_texto" &&
      /\b(nome completo|telefone|melhor dia|melhor horario|envie.*dia|informe.*horario)\b/.test(
        normalizar(conteudoNo(destino))
      )
    ) {
      erros.push({
        codigo: "AGENDA_COLETA_DUPLICADA",
        mensagem: `O bloco “${destino.titulo}” solicita novamente dados depois que o agendamento já foi criado.`,
        no_id: destino.id,
        conexao_id: conexao.id,
      });
    }
  }

  for (const menu of params.nos.filter((no) => ehMenuFaq(no, null))) {
    const saidas = params.conexoes.filter(
      (conexao) =>
        conexao.no_origem_id === menu.id &&
        conexao.condicao_json?.tipo !== "timeout_sem_resposta"
    );
    for (const saida of saidas) {
      const destino = porId.get(saida.no_destino_id);
      if (!destino || /\b(voltar|menu)\b/.test(normalizar(saida.rotulo))) continue;
      const opcao = opcoesNo(menu).find(
        (item) =>
          item.id === normalizarId(saida.condicao_json?.valor || saida.rotulo)
      );
      if (
        opcao &&
        (ehAntesDepois(opcao.titulo) ||
          ehValores(opcao.titulo) ||
          ehAgendamento(opcao.titulo) ||
          ehLocalizacao(opcao.titulo) ||
          ehEspecialista(opcao.titulo))
      ) {
        continue;
      }
      if (
        !opcao ||
        destino.tipo_no !== "enviar_texto" ||
        !ehFaq(conteudoNo(destino)) ||
        !respostaCorrespondeFaq(opcao, destino)
      ) {
        erros.push({
          codigo: "FAQ_DESTINO_INCOMPATIVEL",
          mensagem: `A opção “${saida.rotulo || "FAQ"}” de “${menu.titulo}” não aponta para uma resposta de FAQ compatível.`,
          no_id: menu.id,
          conexao_id: saida.id,
        });
      }
    }
  }
  return erros;
}

function avisosAgenda(nos: AssistenteAutomacaoNo[]) {
  return nos
    .filter(
      (no) =>
        no.tipo_no.startsWith("agenda_") &&
        !texto(no.configuracao_json?.agenda_id, 120)
    )
    .map(
      (no): ValidacaoItemAssistente => ({
        codigo: "AGENDA_AUSENTE",
        mensagem: `O bloco "${no.titulo}" precisa ter uma agenda selecionada antes da ativação.`,
        no_id: no.id,
      })
    );
}

function ordenarConexoes(conexoes: AssistenteAutomacaoConexao[]) {
  return [...conexoes].sort((a, b) => {
    const ordem = Number(a.ordem || 0) - Number(b.ordem || 0);
    if (ordem !== 0) return ordem;
    return String(a.rotulo || "").localeCompare(String(b.rotulo || ""), "pt-BR");
  });
}

/**
 * Monta uma árvore visual usando somente a primeira chegada a cada bloco.
 * Conexões de retorno ao menu permanecem no grafo, mas não alteram a árvore
 * de posicionamento e, portanto, não empilham os nós sobre caminhos anteriores.
 */
function organizarFluxoEmArvore(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
}) {
  if (params.nos.length <= 1) return params.nos;

  const nosPorId = new Map(params.nos.map((no) => [no.id, no]));
  const inicio =
    params.nos.find((no) => no.tipo_no === "inicio") || params.nos[0];
  const saidasPorOrigem = new Map<string, AssistenteAutomacaoConexao[]>();

  for (const conexao of ordenarConexoes(params.conexoes)) {
    if (!nosPorId.has(conexao.no_origem_id) || !nosPorId.has(conexao.no_destino_id)) {
      continue;
    }

    const lista = saidasPorOrigem.get(conexao.no_origem_id) || [];
    lista.push(conexao);
    saidasPorOrigem.set(conexao.no_origem_id, lista);
  }

  const profundidade = new Map<string, number>([[inicio.id, 0]]);
  const pai = new Map<string, string>();
  const ordemDescoberta = new Map<string, number>([[inicio.id, 0]]);
  const fila = [inicio.id];
  let contadorDescoberta = 1;

  while (fila.length > 0) {
    const origemId = fila.shift();
    if (!origemId) continue;

    const nivelOrigem = profundidade.get(origemId) || 0;

    for (const conexao of saidasPorOrigem.get(origemId) || []) {
      const destinoId = conexao.no_destino_id;

      // A primeira chegada define a árvore. As próximas são retornos ou atalhos.
      if (profundidade.has(destinoId)) continue;

      profundidade.set(destinoId, nivelOrigem + 1);
      pai.set(destinoId, origemId);
      ordemDescoberta.set(destinoId, contadorDescoberta);
      contadorDescoberta += 1;
      fila.push(destinoId);
    }
  }

  // Em uma estrutura reparada normalmente todos estarão alcançáveis. Este
  // fallback mantém qualquer nó residual visível, em uma coluna posterior.
  const maiorProfundidade = Math.max(0, ...profundidade.values());
  for (const no of params.nos) {
    if (profundidade.has(no.id)) continue;
    profundidade.set(no.id, maiorProfundidade + 1);
    ordemDescoberta.set(no.id, contadorDescoberta);
    contadorDescoberta += 1;
  }

  const filhos = new Map<string, string[]>();
  for (const [filhoId, paiId] of pai.entries()) {
    const lista = filhos.get(paiId) || [];
    lista.push(filhoId);
    filhos.set(paiId, lista);
  }

  for (const lista of filhos.values()) {
    lista.sort(
      (a, b) =>
        (ordemDescoberta.get(a) || 0) - (ordemDescoberta.get(b) || 0)
    );
  }

  const posicaoY = new Map<string, number>();
  let proximaLinha = 0;

  function posicionarSubarvore(noId: string, visitados: Set<string>): number {
    if (posicaoY.has(noId)) return posicaoY.get(noId) || 0;

    if (visitados.has(noId)) {
      const linha = proximaLinha;
      proximaLinha += 1;
      posicaoY.set(noId, linha);
      return linha;
    }

    const proximosVisitados = new Set(visitados);
    proximosVisitados.add(noId);
    const filhosDoNo = filhos.get(noId) || [];

    if (filhosDoNo.length === 0) {
      const linha = proximaLinha;
      proximaLinha += 1;
      posicaoY.set(noId, linha);
      return linha;
    }

    const linhasFilhos = filhosDoNo.map((filhoId) =>
      posicionarSubarvore(filhoId, proximosVisitados)
    );
    const linha =
      linhasFilhos.reduce((total, atual) => total + atual, 0) /
      linhasFilhos.length;
    posicaoY.set(noId, linha);
    return linha;
  }

  posicionarSubarvore(inicio.id, new Set());

  // Posiciona os eventuais nós residuais que não entraram na árvore principal.
  for (const no of [...params.nos].sort(
    (a, b) =>
      (ordemDescoberta.get(a.id) || 0) -
      (ordemDescoberta.get(b.id) || 0)
  )) {
    if (posicaoY.has(no.id)) continue;
    posicaoY.set(no.id, proximaLinha);
    proximaLinha += 1;
  }

  const menorLinha = Math.min(0, ...posicaoY.values());

  return params.nos.map((no) => ({
    ...no,
    posicao_x:
      POSICAO_INICIAL_X +
      (profundidade.get(no.id) || 0) * ESPACAMENTO_HORIZONTAL,
    posicao_y:
      POSICAO_INICIAL_Y +
      ((posicaoY.get(no.id) || 0) - menorLinha) * ESPACAMENTO_VERTICAL,
  }));
}

export function compilarPlanoAssistente(params: {
  modo: ModoAssistenteFluxos;
  plano: PlanoAssistenteFluxos;
  fluxoAtual?: {
    nos?: AssistenteAutomacaoNo[];
    conexoes?: AssistenteAutomacaoConexao[];
  } | null;
  setores?: AssistenteSetor[];
  variaveis?: AssistenteVariavel[];
  midias?: AssistenteMidia[];
}): ResultadoCompilacaoAssistente {
  const planoComInicioSeparado = separarInicioComConteudo(params.plano);
  const preparado = prepararPlanoBaseComAgenda(planoComInicioSeparado);
  const compilacao = compilarPlanoAssistenteBase({
    ...params,
    plano: preparado.plano,
  });
  const nosComAgenda = aplicarTiposAgenda(
    compilacao.nos,
    preparado.agendasPorMarcador
  );
  const grafo = repararGrafoAssistente({
    nos: nosComAgenda,
    conexoes: compilacao.conexoes,
    estrito: params.modo === "criar_fluxo",
  });
  const nosOrganizados =
    params.modo === "criar_fluxo"
      ? organizarFluxoEmArvore(grafo)
      : grafo.nos;
  const grafoOrganizado = {
    ...grafo,
    nos: nosOrganizados,
  };
  const validacaoBase = validarFluxoAssistente({
    nos: grafoOrganizado.nos,
    conexoes: grafoOrganizado.conexoes,
    setores: params.setores || [],
    variaveis: params.variaveis || [],
    midias: params.midias || [],
  });
  const errosSempre = validarRotasSempre(grafoOrganizado);
  const errosOriginaisBloqueantes = compilacao.validacao.erros.filter((erro) =>
    [
      "OPCAO_COM_ROTAS_DUPLICADAS",
      "PERGUNTA_COM_ROTA_INCONDICIONAL",
    ].includes(erro.codigo)
  );
  const errosCicloAutomatico = validarCiclosAutomaticos(grafoOrganizado);
  const errosSemanticos = validarCoerenciaSemantica(grafoOrganizado);
  const avisosReparo = grafoOrganizado.avisos.map(
    (mensagem, indice): ValidacaoItemAssistente => ({
      codigo: `REPARO_GRAFO_${indice + 1}`,
      mensagem,
    })
  );
  const validacao = {
    valido:
      validacaoBase.erros.length +
        errosOriginaisBloqueantes.length +
        errosSempre.length +
        errosCicloAutomatico.length +
        errosSemanticos.length ===
      0,
    erros: [
      ...validacaoBase.erros,
      ...errosOriginaisBloqueantes,
      ...errosSempre,
      ...errosCicloAutomatico,
      ...errosSemanticos,
    ],
    avisos: [
      ...validacaoBase.avisos,
      ...avisosAgenda(grafoOrganizado.nos),
      ...avisosReparo,
    ],
  };

  return {
    ...compilacao,
    nos: grafoOrganizado.nos,
    conexoes: grafoOrganizado.conexoes,
    validacao,
    estatisticas: {
      ...compilacao.estatisticas,
      blocos: grafoOrganizado.nos.length,
      conexoes: grafoOrganizado.conexoes.length,
    },
  };
}
