import {
  compilarPlanoAssistente as compilarPlanoAssistenteBase,
  validarFluxoAssistente,
  type AssistenteAutomacaoConexao,
  type AssistenteAutomacaoNo,
  type AssistenteMidia,
  type AssistenteSetor,
  type AssistenteVariavel,
  type ModoAssistenteFluxos,
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
  const preparado = prepararPlanoBaseComAgenda(params.plano);
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
  const avisosReparo = grafoOrganizado.avisos.map(
    (mensagem, indice): ValidacaoItemAssistente => ({
      codigo: `REPARO_GRAFO_${indice + 1}`,
      mensagem,
    })
  );
  const validacao = {
    valido: validacaoBase.erros.length + errosSempre.length === 0,
    erros: [...validacaoBase.erros, ...errosSempre],
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
