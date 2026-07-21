import { randomUUID } from "crypto";

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

export * from "./assistente-fluxos-base";
export { normalizarPlanoAssistenteComAgenda as normalizarPlanoAssistente };

function texto(valor: unknown, limite = 160) {
  return String(valor || "").trim().slice(0, limite);
}

function normalizar(valor: unknown) {
  return texto(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function ehNoDeOpcoes(no: AssistenteAutomacaoNo | undefined) {
  return Boolean(
    no && ["pergunta_opcoes", "enviar_botoes"].includes(no.tipo_no)
  );
}

function ehTerminal(no: AssistenteAutomacaoNo | undefined) {
  return Boolean(no && ["encerrar", "transferir_setor"].includes(no.tipo_no));
}

function deduplicarConexoesDeOpcoes(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
}) {
  const nosPorId = new Map(params.nos.map((no) => [no.id, no]));
  const vistos = new Set<string>();
  const removidas: AssistenteAutomacaoConexao[] = [];

  const conexoes = params.conexoes.filter((conexao) => {
    const origem = nosPorId.get(conexao.no_origem_id);

    if (!ehNoDeOpcoes(origem)) return true;

    const tipo = texto(conexao.condicao_json?.tipo, 80);

    if (tipo === "timeout_sem_resposta") {
      const chaveTimeout = `${origem!.id}:timeout`;

      if (vistos.has(chaveTimeout)) {
        removidas.push(conexao);
        return false;
      }

      vistos.add(chaveTimeout);
      return true;
    }

    const valor = normalizar(conexao.condicao_json?.valor);

    if (!valor) {
      removidas.push(conexao);
      return false;
    }

    const chave = `${origem!.id}:opcao:${valor}`;

    if (vistos.has(chave)) {
      removidas.push(conexao);
      return false;
    }

    vistos.add(chave);
    return true;
  });

  if (removidas.length > 0) {
    console.warn(
      "[assistente-fluxos] removendo conexoes duplicadas no grafo compilado",
      {
        total: removidas.length,
        conexoes: removidas.slice(0, 20).map((conexao) => ({
          origem: conexao.no_origem_id,
          destino: conexao.no_destino_id,
          tipo: conexao.condicao_json?.tipo || null,
          valor: conexao.condicao_json?.valor || null,
        })),
      }
    );
  }

  return conexoes;
}

function deduplicarConexoesSempre(
  conexoes: AssistenteAutomacaoConexao[]
) {
  const origensComSempre = new Set<string>();
  const removidas: AssistenteAutomacaoConexao[] = [];

  const resultado = [...conexoes]
    .sort((a, b) => a.ordem - b.ordem)
    .filter((conexao) => {
      if (conexao.condicao_json?.tipo !== "sempre") return true;

      if (origensComSempre.has(conexao.no_origem_id)) {
        removidas.push(conexao);
        return false;
      }

      origensComSempre.add(conexao.no_origem_id);
      return true;
    });

  if (removidas.length > 0) {
    console.warn(
      "[assistente-fluxos] removendo rotas incondicionais excedentes",
      {
        total: removidas.length,
        conexoes: removidas.slice(0, 20).map((conexao) => ({
          origem: conexao.no_origem_id,
          destino: conexao.no_destino_id,
          rotulo: conexao.rotulo,
        })),
      }
    );
  }

  return resultado;
}

function idsAlcancaveis(
  nos: AssistenteAutomacaoNo[],
  conexoes: AssistenteAutomacaoConexao[]
) {
  const inicio = nos.find((no) => no.tipo_no === "inicio");
  const alcancaveis = new Set<string>();

  if (!inicio) return alcancaveis;

  const fila = [inicio.id];

  while (fila.length > 0) {
    const atual = fila.shift();
    if (!atual || alcancaveis.has(atual)) continue;

    alcancaveis.add(atual);

    for (const conexao of conexoes) {
      if (
        conexao.no_origem_id === atual &&
        !alcancaveis.has(conexao.no_destino_id)
      ) {
        fila.push(conexao.no_destino_id);
      }
    }
  }

  return alcancaveis;
}

function criarNoEncerrar(): AssistenteAutomacaoNo {
  return {
    id: randomUUID(),
    tipo_no: "encerrar",
    titulo: "Encerrar atendimento",
    descricao: null,
    posicao_x: 0,
    posicao_y: 0,
    configuracao_json: {
      mensagem: "Obrigado pelo contato. Permanecemos à disposição.",
      resultado_fluxo: "positivo",
      valor_conversao_tipo: "sem_valor",
    },
    delay_segundos: 3,
  };
}

function criarConexaoTerminal(
  origem: AssistenteAutomacaoNo,
  destino: AssistenteAutomacaoNo,
  ordem: number
): AssistenteAutomacaoConexao {
  return {
    id: randomUUID(),
    no_origem_id: origem.id,
    no_destino_id: destino.id,
    rotulo: "Encerrar atendimento",
    ordem,
    condicao_json: { tipo: "sempre" },
    usar_ia: false,
    descricao_ia: null,
  };
}

function garantirTerminalEPrunarGrafo(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
}) {
  let nos = [...params.nos];
  let conexoes = [...params.conexoes];
  let alcancaveis = idsAlcancaveis(nos, conexoes);

  const terminalAlcancavel = nos.find(
    (no) => alcancaveis.has(no.id) && ehTerminal(no)
  );

  if (!terminalAlcancavel) {
    const origensComSaida = new Set(
      conexoes.map((conexao) => conexao.no_origem_id)
    );
    const folhas = nos.filter(
      (no) =>
        alcancaveis.has(no.id) &&
        no.tipo_no !== "inicio" &&
        !ehTerminal(no) &&
        !origensComSaida.has(no.id) &&
        !ehNoDeOpcoes(no)
    );
    const origem = folhas.at(-1);

    // Nunca conecte um encerramento automaticamente a um bloco que ja possui
    // saida. Isso criaria duas rotas "sempre" e uma delas seria inalcançavel.
    if (origem) {
      let terminal = nos.find((no) => ehTerminal(no));

      if (!terminal) {
        terminal = criarNoEncerrar();
        nos.push(terminal);
      }

      conexoes.push(criarConexaoTerminal(origem, terminal, conexoes.length + 1));
      alcancaveis = idsAlcancaveis(nos, conexoes);
    }
  }

  const removidos = nos.filter((no) => !alcancaveis.has(no.id));
  nos = nos.filter((no) => alcancaveis.has(no.id));
  const idsMantidos = new Set(nos.map((no) => no.id));
  conexoes = conexoes.filter(
    (conexao) =>
      idsMantidos.has(conexao.no_origem_id) &&
      idsMantidos.has(conexao.no_destino_id)
  );

  if (removidos.length > 0) {
    console.warn(
      "[assistente-fluxos] removendo blocos inalcancaveis do grafo compilado",
      {
        total: removidos.length,
        blocos: removidos.slice(0, 20).map((no) => ({
          id: no.id,
          titulo: no.titulo,
          tipo: no.tipo_no,
        })),
      }
    );
  }

  return {
    nos,
    conexoes: conexoes.map((conexao, index) => ({
      ...conexao,
      ordem: index + 1,
    })),
  };
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
  const conexoesSemDuplicidade = deduplicarConexoesSempre(
    deduplicarConexoesDeOpcoes({
      nos: nosComAgenda,
      conexoes: compilacao.conexoes,
    })
  );
  const grafo = garantirTerminalEPrunarGrafo({
    nos: nosComAgenda,
    conexoes: conexoesSemDuplicidade,
  });
  const validacaoBase = validarFluxoAssistente({
    nos: grafo.nos,
    conexoes: grafo.conexoes,
    setores: params.setores || [],
    variaveis: params.variaveis || [],
    midias: params.midias || [],
  });
  const errosSempre = validarRotasSempre(grafo);
  const validacao = {
    valido: validacaoBase.erros.length + errosSempre.length === 0,
    erros: [...validacaoBase.erros, ...errosSempre],
    avisos: [...validacaoBase.avisos, ...avisosAgenda(grafo.nos)],
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
