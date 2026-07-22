type EtapaAgendaPlano = {
  tipo: string;
  agenda_id?: string | null;
  agenda_nome?: string | null;
};

type ClarificacaoPlano = {
  id: string;
  pergunta?: string | null;
  motivo?: string | null;
};

type PlanoComAgenda = {
  etapas: EtapaAgendaPlano[];
  clarificacoes: ClarificacaoPlano[];
  avisos: string[];
};

type PerguntaAgenda = {
  [campo: string]: unknown;
  campo: string;
  etapa_ref: string;
  opcoes: Array<{ id: string; label: string; descricao?: string | null }>;
};

function texto(valor: unknown, limite = 1800) {
  return String(valor || "").trim().slice(0, limite);
}

function normalizar(valor: unknown) {
  return texto(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Evita reconstruir o fluxo inteiro quando a IA pede apenas a confirmacao de
 * uma agenda que ja esta aplicada, de forma consistente, em todos os blocos
 * de agenda do plano. Qualquer ambiguidade continua sendo resolvida pela IA.
 */
export function aplicarClarificacaoAgendaJaResolvida<
  TPlano extends PlanoComAgenda,
>(params: {
  plano: TPlano;
  pergunta: PerguntaAgenda;
  resposta: unknown;
}) {
  if (
    params.pergunta.campo !== "clarificacao" ||
    params.plano.clarificacoes.length !== 1
  ) {
    return null;
  }

  const clarificacao = params.plano.clarificacoes.find(
    (item) => item.id === params.pergunta.etapa_ref
  );
  if (
    !clarificacao ||
    !/\bagenda\b/.test(
      normalizar(`${clarificacao.pergunta || ""} ${clarificacao.motivo || ""}`)
    )
  ) {
    return null;
  }

  const resposta = texto(params.resposta, 1000);
  const opcao = params.pergunta.opcoes.find((item) => item.id === resposta);
  if (!opcao) return null;

  const etapasAgenda = params.plano.etapas.filter((etapa) =>
    etapa.tipo.startsWith("agenda_")
  );
  const idsAgenda = new Set(
    etapasAgenda.map((etapa) => texto(etapa.agenda_id, 120)).filter(Boolean)
  );
  const nomesAgenda = new Set(
    etapasAgenda.map((etapa) => normalizar(etapa.agenda_nome)).filter(Boolean)
  );

  if (
    etapasAgenda.length === 0 ||
    idsAgenda.size !== 1 ||
    nomesAgenda.size !== 1 ||
    !nomesAgenda.has(normalizar(opcao.label))
  ) {
    return null;
  }

  return {
    plano: {
      ...params.plano,
      clarificacoes: [],
      avisos: [
        ...params.plano.avisos,
        `A agenda “${opcao.label}” foi confirmada sem reconstruir os demais caminhos do fluxo.`,
      ],
    } as TPlano,
    resumoResposta: opcao.label,
  };
}
