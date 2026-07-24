export function gerarSugestaoDescricaoIA(rotulo?: string) {
  const texto = (rotulo || "").toLowerCase().trim();

  if (!texto) {
    return "";
  }

  if (["sim", "yes", "positivo", "aceito"].includes(texto)) {
    return "Use esta conexão quando o cliente responder positivamente, confirmar interesse, aceitar ou concordar.";
  }

  if (["não", "nao", "negativo", "recusar"].includes(texto)) {
    return "Use esta conexão quando o cliente responder negativamente, recusar ou não demonstrar interesse.";
  }

  if (texto.includes("suporte")) {
    return "Use esta conexão quando o cliente precisar de ajuda, suporte técnico, resolução de problemas ou reclamação.";
  }

  if (texto.includes("comprar")) {
    return "Use esta conexão quando o cliente demonstrar intenção de compra ou contratação.";
  }

  if (texto.includes("financeiro")) {
    return "Use esta conexão quando o cliente quiser informações financeiras, boletos, pagamentos ou segunda via.";
  }

  return `Use esta conexão quando a intenção do cliente estiver relacionada a "${rotulo}".`;
}

export type ContextoSugestaoDescricaoIA = {
  pergunta?: string | null;
  nomeConexao?: string | null;
  idResposta?: string | null;
  textoOpcao?: string | null;
  destinoTitulo?: string | null;
  destinoMensagem?: string | null;
  destinoTipo?: string | null;
  outrasConexoes?: string[];
};

function limparTexto(valor: unknown, limite: number) {
  return String(valor || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limite);
}

function primeiroTextoUtil(...valores: Array<string | null | undefined>) {
  const genericos = new Set([
    "nova condicao",
    "nova condição",
    "condicao",
    "condição",
    "nova intencao",
    "nova intenção",
    "intencao ia",
    "intenção ia",
    "nova mensagem",
    "mensagem",
    "novo bloco",
    "como posso te ajudar?",
    "digite a mensagem aqui.",
  ]);

  return (
    valores
      .map((valor) => limparTexto(valor, 220))
      .find((valor) => valor && !genericos.has(valor.toLowerCase())) || ""
  );
}

function listarAlternativas(valores?: string[]) {
  const unicas = Array.from(
    new Set(
      (valores || [])
        .map((valor) => limparTexto(valor, 80))
        .filter(Boolean)
    )
  ).slice(0, 5);

  if (unicas.length === 0) return "";
  return unicas.map((valor) => `“${valor}”`).join(", ");
}

export function gerarSugestaoDescricaoIAComContexto(
  contexto: ContextoSugestaoDescricaoIA
) {
  const respostaEsperada = primeiroTextoUtil(
    contexto.textoOpcao,
    contexto.nomeConexao,
    contexto.idResposta,
    contexto.destinoTitulo,
    contexto.destinoMensagem,
    contexto.destinoTipo
  );

  if (!respostaEsperada) {
    return "";
  }

  const pergunta = limparTexto(contexto.pergunta, 180);
  const destinoTitulo = primeiroTextoUtil(
    contexto.destinoTitulo,
    contexto.destinoTipo
  );
  const destinoMensagem = limparTexto(contexto.destinoMensagem, 150);
  const alternativas = listarAlternativas(contexto.outrasConexoes);

  const partes = [
    pergunta
      ? `Interprete a resposta do cliente à pergunta “${pergunta}”.`
      : "Interprete a resposta do cliente neste bloco de pergunta.",
    `Use esta conexão somente quando a resposta indicar a escolha ou intenção equivalente a “${respostaEsperada}”.`,
    "Aceite senônimos, variações de escrita, erros de digitação, respostas curtas e frases naturais que mantenham essa mesma intenção.",
    destinoTitulo || destinoMensagem
      ? `O destino desta escolha é “${destinoTitulo || respostaEsperada}”${
          destinoMensagem ? `, com a resposta “${destinoMensagem}”` : ""
        }.`
      : "",
    alternativas
      ? `Não use esta rota quando a intenção corresponder a outra opção: ${alternativas}.`
      : "Não use esta rota para negação, dúvida genérica ou assunto diferente.",
    "Se a resposta for ambígua ou misturar intenções, não force esta conexão.",
  ].filter(Boolean);

  return partes.join(" ").slice(0, 500);
}
