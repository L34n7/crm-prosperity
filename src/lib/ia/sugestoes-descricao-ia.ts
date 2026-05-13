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