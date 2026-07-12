type UnidadeEncerramentoInatividade = "minutos" | "horas";
type ModoEscopoIntegracoesWhatsapp = "todas" | "selecionadas";

export type EscopoIntegracoesWhatsappFluxo = {
  modo: ModoEscopoIntegracoesWhatsapp;
  ids: string[];
};

export const MENSAGEM_ENCERRAMENTO_INATIVIDADE_PADRAO =
  "Como não tivemos retorno, este atendimento será encerrado. Caso precise de ajuda, envie uma nova mensagem.";

export const ENCERRAMENTO_INATIVIDADE_PADRAO = {
  ativo: true,
  tempo_quantidade: 23,
  tempo_unidade: "horas" as const,
  mensagem: MENSAGEM_ENCERRAMENTO_INATIVIDADE_PADRAO,
};

function ehObjetoSimples(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
}

function normalizarId(valor: unknown) {
  return String(valor || "").trim();
}

function normalizarIdsIntegracoes(valor: unknown) {
  const ids = Array.isArray(valor)
    ? valor.map(normalizarId)
    : normalizarId(valor)
      ? [normalizarId(valor)]
      : [];

  return Array.from(new Set(ids.filter(Boolean)));
}

export function normalizarEscopoIntegracoesWhatsappFluxo(
  configuracao: unknown
): EscopoIntegracoesWhatsappFluxo {
  const config = ehObjetoSimples(configuracao) ? configuracao : {};
  const escopo = ehObjetoSimples(config.integracoes_whatsapp)
    ? config.integracoes_whatsapp
    : {};
  const idsLegados = normalizarIdsIntegracoes(
    config.integracoes_whatsapp_ids || config.integracao_whatsapp_id
  );
  const ids = normalizarIdsIntegracoes(escopo.ids).concat(idsLegados);
  const idsUnicos = Array.from(new Set(ids.filter(Boolean)));
  const modoInformado = String(escopo.modo || config.integracoes_whatsapp_modo || "")
    .trim()
    .toLowerCase();
  const modo =
    modoInformado === "selecionadas" && idsUnicos.length > 0
      ? "selecionadas"
      : "todas";

  return {
    modo,
    ids: modo === "selecionadas" ? idsUnicos : [],
  };
}

export function fluxoPermiteIntegracaoWhatsapp(
  configuracao: unknown,
  integracaoWhatsappId?: string | null
) {
  const escopo = normalizarEscopoIntegracoesWhatsappFluxo(configuracao);

  if (escopo.modo !== "selecionadas") return true;

  const integracaoId = normalizarId(integracaoWhatsappId);
  return Boolean(integracaoId && escopo.ids.includes(integracaoId));
}

function normalizarUnidadeEncerramento(
  unidade: unknown
): UnidadeEncerramentoInatividade {
  return unidade === "minutos" ? "minutos" : "horas";
}

function normalizarQuantidadeEncerramento(
  quantidade: unknown,
  unidade: UnidadeEncerramentoInatividade
) {
  const quantidadePadrao = unidade === "minutos" ? 1380 : 23;
  const quantidadeMinima = unidade === "minutos" ? 5 : 1;
  const quantidadeMaxima = unidade === "minutos" ? 1380 : 23;
  const numero = Number(quantidade ?? quantidadePadrao);

  if (!Number.isFinite(numero)) {
    return quantidadePadrao;
  }

  return Math.min(quantidadeMaxima, Math.max(quantidadeMinima, numero));
}

export function normalizarConfiguracaoFluxo(configuracao: unknown) {
  const configuracaoBase = ehObjetoSimples(configuracao)
    ? { ...configuracao }
    : {};
  const encerramentoBase = ehObjetoSimples(
    configuracaoBase.encerramento_inatividade
  )
    ? configuracaoBase.encerramento_inatividade
    : {};
  const unidade = normalizarUnidadeEncerramento(
    encerramentoBase.tempo_unidade
  );
  const quantidade = normalizarQuantidadeEncerramento(
    encerramentoBase.tempo_quantidade,
    unidade
  );
  const mensagem =
    String(
      encerramentoBase.mensagem ||
        MENSAGEM_ENCERRAMENTO_INATIVIDADE_PADRAO
    ).trim() || MENSAGEM_ENCERRAMENTO_INATIVIDADE_PADRAO;

  return {
    ...configuracaoBase,
    integracoes_whatsapp: normalizarEscopoIntegracoesWhatsappFluxo(
      configuracaoBase
    ),
    encerramento_inatividade: {
      ...encerramentoBase,
      ativo: true,
      tempo_quantidade: quantidade,
      tempo_unidade: unidade,
      mensagem,
    },
  };
}

export function obterConfiguracaoEncerramentoInatividade(
  configuracao: unknown
) {
  const configuracaoNormalizada = normalizarConfiguracaoFluxo(configuracao);
  const encerramento =
    configuracaoNormalizada.encerramento_inatividade;
  const unidade = normalizarUnidadeEncerramento(
    encerramento.tempo_unidade
  );
  const quantidade = normalizarQuantidadeEncerramento(
    encerramento.tempo_quantidade,
    unidade
  );
  const segundos =
    unidade === "horas" ? quantidade * 60 * 60 : quantidade * 60;

  return {
    segundos,
    quantidade,
    unidade,
    mensagem:
      String(encerramento.mensagem || "").trim() ||
      MENSAGEM_ENCERRAMENTO_INATIVIDADE_PADRAO,
  };
}
