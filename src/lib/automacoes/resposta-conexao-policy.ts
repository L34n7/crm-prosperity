type NoAutomacaoComOpcoes = {
  tipo_no?: string | null;
  configuracao_json?: unknown;
} | null | undefined;

type OpcaoResposta = {
  identificador: string;
  titulo: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function adicionarCandidato(
  candidatos: string[],
  valoresNormalizados: Set<string>,
  valor: unknown
) {
  const texto = String(valor || "").trim();
  const normalizado = normalizarTexto(texto);

  if (!texto || !normalizado || valoresNormalizados.has(normalizado)) {
    return;
  }

  valoresNormalizados.add(normalizado);
  candidatos.push(texto);
}

function listarOpcoesResposta(no: NoAutomacaoComOpcoes): OpcaoResposta[] {
  const configuracao = isRecord(no?.configuracao_json)
    ? no.configuracao_json
    : {};

  if (no?.tipo_no === "enviar_botoes") {
    const botoes = Array.isArray(configuracao.botoes)
      ? configuracao.botoes
      : [];

    return botoes
      .filter(isRecord)
      .map((botao) => ({
        identificador: String(botao.id || "").trim(),
        titulo: String(botao.titulo || "").trim(),
      }))
      .filter((botao) => Boolean(botao.identificador || botao.titulo));
  }

  if (no?.tipo_no === "pergunta_opcoes") {
    const opcoes = Array.isArray(configuracao.opcoes)
      ? configuracao.opcoes
      : [];

    return opcoes
      .filter(isRecord)
      .map((opcao) => ({
        identificador: String(opcao.valor || "").trim(),
        titulo: String(opcao.titulo || "").trim(),
      }))
      .filter((opcao) => Boolean(opcao.identificador || opcao.titulo));
  }

  return [];
}

export function normalizarTexto(texto: unknown) {
  return String(texto || "").trim().toLowerCase();
}

export function condicaoPrecisaDeResposta(
  condicao: Record<string, unknown> | null | undefined
) {
  if (!condicao?.tipo) return false;

  return [
    "resposta_igual",
    "resposta_contem",
    "resposta_inicia_com",
    "resposta_regex",
  ].includes(String(condicao.tipo));
}

export function condicaoCombinaComMensagem(
  condicao: Record<string, unknown> | null | undefined,
  mensagemTexto?: string
) {
  if (!condicao?.tipo) return false;

  if (condicao.tipo === "sempre") {
    return true;
  }

  const mensagemOriginal = String(mensagemTexto || "").trim();
  const valorOriginal = String(condicao.valor || "").trim();

  const mensagem = normalizarTexto(mensagemOriginal);
  const valor = normalizarTexto(valorOriginal);

  if (!mensagem || !valor) return false;

  if (condicao.tipo === "resposta_igual") {
    return mensagem === valor;
  }

  if (condicao.tipo === "resposta_contem") {
    return mensagem.includes(valor);
  }

  if (condicao.tipo === "resposta_inicia_com") {
    return mensagem.startsWith(valor);
  }

  if (condicao.tipo === "resposta_regex") {
    try {
      const regex = new RegExp(valorOriginal, "i");
      return regex.test(mensagemOriginal);
    } catch {
      return false;
    }
  }

  return false;
}

export function resolverRespostaInterativa(
  no: NoAutomacaoComOpcoes,
  mensagemTexto?: string
) {
  const original = String(mensagemTexto || "").trim();
  const originalNormalizado = normalizarTexto(original);
  const opcoes = listarOpcoesResposta(no);
  const opcao = opcoes.find(
    (item) =>
      normalizarTexto(item.identificador) === originalNormalizado ||
      normalizarTexto(item.titulo) === originalNormalizado
  );
  const candidatos: string[] = [];
  const valoresNormalizados = new Set<string>();

  adicionarCandidato(candidatos, valoresNormalizados, original);

  if (opcao) {
    adicionarCandidato(
      candidatos,
      valoresNormalizados,
      opcao.identificador
    );
    adicionarCandidato(candidatos, valoresNormalizados, opcao.titulo);
  }

  return {
    original,
    candidatos,
    identificador: opcao?.identificador || null,
    titulo: opcao?.titulo || null,
    textoSemantico: opcao?.titulo || original,
  };
}

export function condicaoCombinaComCandidatos(
  condicao: Record<string, unknown> | null | undefined,
  candidatos: string[]
) {
  return candidatos.some((candidato) =>
    condicaoCombinaComMensagem(condicao, candidato)
  );
}
