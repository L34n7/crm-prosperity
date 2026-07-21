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
} from "./assistente-fluxos-base";

export * from "./assistente-fluxos-base";

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

function deduplicarConexoesDeOpcoes(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
}) {
  const nosPorId = new Map(params.nos.map((no) => [no.id, no]));
  const vistos = new Set<string>();
  const removidas: AssistenteAutomacaoConexao[] = [];

  const conexoes = params.conexoes.filter((conexao) => {
    const origem = nosPorId.get(conexao.no_origem_id);

    if (!origem || !["pergunta_opcoes", "enviar_botoes"].includes(origem.tipo_no)) {
      return true;
    }

    const tipo = texto(conexao.condicao_json?.tipo, 80);

    if (tipo === "timeout_sem_resposta") {
      const chaveTimeout = `${origem.id}:timeout`;

      if (vistos.has(chaveTimeout)) {
        removidas.push(conexao);
        return false;
      }

      vistos.add(chaveTimeout);
      return true;
    }

    const valor = normalizar(conexao.condicao_json?.valor);

    if (!valor) {
      // Rotas sem valor em blocos de opções são inválidas e não devem chegar
      // ao validador como uma segunda saída concorrente.
      removidas.push(conexao);
      return false;
    }

    const chave = `${origem.id}:opcao:${valor}`;

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

  return conexoes.map((conexao, index) => ({
    ...conexao,
    ordem: index + 1,
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
  const compilacao = compilarPlanoAssistenteBase(params);
  const conexoes = deduplicarConexoesDeOpcoes({
    nos: compilacao.nos,
    conexoes: compilacao.conexoes,
  });
  const validacao = validarFluxoAssistente({
    nos: compilacao.nos,
    conexoes,
    setores: params.setores || [],
    variaveis: params.variaveis || [],
    midias: params.midias || [],
  });

  return {
    ...compilacao,
    conexoes,
    validacao,
    estatisticas: {
      ...compilacao.estatisticas,
      conexoes: conexoes.length,
    },
  };
}
