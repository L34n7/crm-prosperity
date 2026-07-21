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
  const validacaoBase = validarFluxoAssistente({
    nos: grafo.nos,
    conexoes: grafo.conexoes,
    setores: params.setores || [],
    variaveis: params.variaveis || [],
    midias: params.midias || [],
  });
  const errosSempre = validarRotasSempre(grafo);
  const avisosReparo = grafo.avisos.map(
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
      ...avisosAgenda(grafo.nos),
      ...avisosReparo,
    ],
  };

  return {
    ...compilacao,
    nos: grafo.nos,
    conexoes: grafo.conexoes,
    validacao,
    estatisticas: {
      ...compilacao.estatisticas,
      blocos: grafo.nos.length,
      conexoes: grafo.conexoes.length,
    },
  };
}
