import {
  compilarPlanoAssistente as compilarPlanoAssistenteBase,
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
import {
  validarEstruturaCompiladaEstrutural,
  validarPlanoAssistenteEstrutural,
} from "./assistente-fluxos-validacao-estrutural";

export * from "./assistente-fluxos-base";
export { normalizarPlanoAssistenteComAgenda as normalizarPlanoAssistente };

const ESPACAMENTO_HORIZONTAL = 340;
const ESPACAMENTO_VERTICAL = 160;
const POSICAO_INICIAL_X = 80;
const POSICAO_INICIAL_Y = 80;

/**
 * O layout e uma transformacao visual, nao uma correcao do fluxo. Ele somente
 * posiciona os blocos que a IA entregou e nunca cria, remove, clona ou redireciona
 * etapas e conexoes.
 */
function organizarLayout(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
}) {
  if (params.nos.length <= 1) return params.nos;

  const porId = new Map(params.nos.map((no) => [no.id, no]));
  const inicio =
    params.nos.find((no) => no.tipo_no === "inicio") || params.nos[0];
  const saidas = new Map<string, AssistenteAutomacaoConexao[]>();

  for (const conexao of params.conexoes) {
    if (!porId.has(conexao.no_origem_id) || !porId.has(conexao.no_destino_id)) {
      continue;
    }
    saidas.set(conexao.no_origem_id, [
      ...(saidas.get(conexao.no_origem_id) || []),
      conexao,
    ]);
  }

  const nivel = new Map<string, number>();
  const ordem = new Map<string, number>();
  const fila: string[] = [];
  let contador = 0;

  if (inicio) {
    nivel.set(inicio.id, 0);
    ordem.set(inicio.id, contador++);
    fila.push(inicio.id);
  }

  while (fila.length > 0) {
    const atual = fila.shift();
    if (!atual) continue;
    const nivelAtual = nivel.get(atual) || 0;

    for (const conexao of saidas.get(atual) || []) {
      if (nivel.has(conexao.no_destino_id)) continue;
      nivel.set(conexao.no_destino_id, nivelAtual + 1);
      ordem.set(conexao.no_destino_id, contador++);
      fila.push(conexao.no_destino_id);
    }
  }

  const maiorNivel = Math.max(0, ...nivel.values());
  for (const no of params.nos) {
    if (nivel.has(no.id)) continue;
    nivel.set(no.id, maiorNivel + 1);
    ordem.set(no.id, contador++);
  }

  const grupos = new Map<number, AssistenteAutomacaoNo[]>();
  for (const no of params.nos) {
    const coluna = nivel.get(no.id) || 0;
    grupos.set(coluna, [...(grupos.get(coluna) || []), no]);
  }

  for (const lista of grupos.values()) {
    lista.sort(
      (a, b) => (ordem.get(a.id) || 0) - (ordem.get(b.id) || 0)
    );
  }

  return params.nos.map((no) => {
    const coluna = nivel.get(no.id) || 0;
    const lista = grupos.get(coluna) || [no];
    const indice = Math.max(0, lista.findIndex((item) => item.id === no.id));
    const deslocamento = ((lista.length - 1) * ESPACAMENTO_VERTICAL) / 2;

    return {
      ...no,
      posicao_x: POSICAO_INICIAL_X + coluna * ESPACAMENTO_HORIZONTAL,
      posicao_y:
        POSICAO_INICIAL_Y + indice * ESPACAMENTO_VERTICAL - deslocamento,
    };
  });
}

function converterProblemasPlano(
  plano: PlanoAssistenteFluxos
): ValidacaoItemAssistente[] {
  return validarPlanoAssistenteEstrutural(plano).map((problema) => ({
    codigo: problema.codigo,
    mensagem: problema.mensagem,
  }));
}

/**
 * Compilador deterministico: converte o JSON da IA para os tipos internos do
 * CRM sem tentar melhorar copy, FAQ, navegacao, destinos, menus ou experiencia.
 * Em criar_fluxo, usa o modo de adicao sobre uma estrutura vazia para impedir
 * os antigos reparos automaticos de rotas e clonagem de subarvores.
 */
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
  const criarFluxo = params.modo === "criar_fluxo";
  const compilacao = compilarPlanoAssistenteBase({
    ...params,
    modo: criarFluxo ? "adicionar_etapa" : params.modo,
    fluxoAtual: criarFluxo ? { nos: [], conexoes: [] } : params.fluxoAtual,
    plano: preparado.plano,
  });

  const nosComAgenda = aplicarTiposAgenda(
    compilacao.nos,
    preparado.agendasPorMarcador
  );
  const nos = criarFluxo
    ? organizarLayout({ nos: nosComAgenda, conexoes: compilacao.conexoes })
    : nosComAgenda;

  if (!criarFluxo) {
    return {
      ...compilacao,
      nos,
    };
  }

  const erros = [
    ...converterProblemasPlano(params.plano),
    ...validarEstruturaCompiladaEstrutural({
      nos,
      conexoes: compilacao.conexoes,
    }),
  ].filter(
    (erro, indice, todos) =>
      todos.findIndex(
        (item) =>
          item.codigo === erro.codigo && item.mensagem === erro.mensagem
      ) === indice
  );

  return {
    ...compilacao,
    nos,
    validacao: {
      valido: erros.length === 0,
      erros,
      avisos: [],
    },
    estatisticas: {
      ...compilacao.estatisticas,
      blocos: nos.length,
      conexoes: compilacao.conexoes.length,
      blocos_criados: nos.length,
    },
  };
}
