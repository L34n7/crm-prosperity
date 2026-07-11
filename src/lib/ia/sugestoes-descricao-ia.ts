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
      .map((valor) => String(valor || "").replace(/\s+/g, " ").trim())
      .find((valor) => valor && !genericos.has(valor.toLowerCase())) || ""
  );
}

function contextoPergunta(pergunta?: string | null) {
  const texto = String(pergunta || "").replace(/\s+/g, " ").trim();

  return texto ? ` em resposta a pergunta "${texto}"` : "";
}

export function gerarSugestaoDescricaoIAComContexto(
  contexto: ContextoSugestaoDescricaoIA
) {
  const alvo = primeiroTextoUtil(
    contexto.nomeConexao,
    contexto.textoOpcao,
    contexto.idResposta,
    contexto.destinoTitulo,
    contexto.destinoMensagem,
    contexto.destinoTipo
  );

  if (!alvo) {
    return "";
  }

  const base = gerarSugestaoDescricaoIA(alvo);
  const pergunta = contextoPergunta(contexto.pergunta);
  const destino = primeiroTextoUtil(
    contexto.destinoTitulo,
    contexto.destinoMensagem,
    contexto.destinoTipo
  );

  if (base && !base.includes(`"${alvo}"`)) {
    return pergunta
      ? base.replace("quando o cliente", `quando${pergunta} o cliente`)
      : base;
  }

  const detalheDestino =
    destino && destino !== alvo ? `, especialmente sobre ${destino}` : "";

  return `Use esta conexao quando${pergunta} a intencao do cliente estiver relacionada a "${alvo}"${detalheDestino}.`;
}
