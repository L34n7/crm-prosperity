/**
 * Reconhece o pedido de contratação após uma cotação veicular.
 * A existência da cotação na conversa é validada no servidor antes da transferência.
 * Não confundir uma dúvida ("como contratar?") com aceite.
 */
function normalizar(valor: string) {
  return String(valor || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ").trim();
}

export function desejaContratarCotacao(mensagem: string, ultimaRespostaAgente = ""): boolean {
  const texto = normalizar(mensagem).replace(/[.!?]+$/g, "").trim();
  if (!texto) return false;

  // A mesma conversa pode tratar de produtos do próprio CRM Prosperity.
  if (/\b(?:crm prosperity|assinar o crm|contratar o crm|contratar o sistema|comprar o sistema|assinar o software)\b/.test(texto))
    return false;
  if (/\b(?:nao quero|nao vou|nao pretendo|ainda nao|nao desejo|desisti|cancelar)\b/.test(texto))
    return false;
  if (/\b(?:quero saber|como faco|como funciona|qual o procedimento|preciso entender)\b.*\b(?:contrat|aderi|fech)\w*/.test(texto))
    return false;

  if (/\b(?:quero|gostaria de|pretendo|vou|desejo|posso|podemos|vamos|pode|poderia|quero sim|decidi)\s+(?:mesmo\s+)?(?:contratar|aderir|fechar|prosseguir com a contratacao|seguir com a contratacao)\b/.test(texto))
    return true;
  if (/\b(?:tenho interesse em contratar|contrata pra mim|pode finalizar a contratacao|quero fazer a contratacao)\b/.test(texto))
    return true;
  if (/\b(?:aceito|confirmo|aprovo)\s+(?:a\s+)?(?:proposta|cotacao|contratacao|plano|seguro|protecao)\b/.test(texto))
    return true;
  if (/\b(?:pode|poderia)\s+(?:me\s+)?(?:encaminhar|transferir)\s+(?:para|pro|pra)\s+(?:contratar|concluir a contratacao|um atendente)\b/.test(texto))
    return true;
  if (/\b(?:vamos fechar|pode fechar|pode contratar|pode efetivar|fechar contrato|fechar o plano|vou ficar com o plano)\b/.test(texto))
    return true;

  // "Sim" só é aceite quando a última pergunta do agente convidou à contratação.
  const curta=/^(?:sim|sim quero|quero|quero sim|pode sim|pode|vamos|bora|isso|pode encaminhar|me encaminha|ok|claro|com certeza|confirmo|pode ser)$/.test(texto);
  const resposta=normalizar(ultimaRespostaAgente);
  return curta && /\b(?:contratar|contratacao|concluir a contratacao|encaminhar para um atendente|encaminhar para a equipe comercial)\b/.test(resposta)
    && /\b(?:quer|deseja|gostaria|posso|podemos|vamos|responda|basta responder)\b/.test(resposta);
}

/** Não repetir a cotação quando o cliente apenas escolhe um dos planos. */
export function escolheuPlanoDaCotacao(mensagem: string): boolean {
  const texto=normalizar(mensagem).replace(/[.!?]+$/g,"").trim();
  return /^(?:a |o )?(?:primeir[oa]|segund[oa]|terceir[oa]|premium|completo|plano premium|plano completo)$/.test(texto)
    || /^(?:quero|prefiro|gostei d[oa]|fico com|escolho)\s+(?:a |o )?(?:primeir[oa]|segund[oa]|premium|completo|plano premium|plano completo)$/.test(texto);
}

/** Solicitação de outra proposta sem dados de um novo veículo. */
export function pediuNovaCotacaoSemDados(mensagem:string):boolean{
  const texto=normalizar(mensagem).replace(/[.!?]+$/g,"").trim();
  return /^(?:quero (?:fazer )?(?:outra|uma nova)(?: cotacao)?|quero (?:cotar|simular) outro veiculo|pode fazer outra cotacao|fazer outra cotacao|nova cotacao|outra cotacao|quero fazer outra)$/.test(texto);
}
