/**
 * Perguntas sobre as funcionalidades de agenda do CRM não são um pedido para
 * marcar reunião com o próprio consultor. Mantemos a distinção no backend,
 * independentemente do nicho e do prompt configurado por empresa.
 */
export function mensagemEhDuvidaSobreAgendaDoProduto(mensagem: string): boolean {
  const texto = String(mensagem || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
  if (!texto) return false;

  // Pedido próprio explícito de demonstração/reunião deve continuar disponível.
  const pedidoProprio =
    /\b(?:me\s+(?:agende|agenda|marque|marca)|agend[ae]\s+(?:pra|para)\s+mim|marqu[ea]\s+(?:pra|para)\s+mim)\b/.test(texto) ||
    /\b(?:quero|gostaria|preciso|vamos)\s+(?:agendar|marcar|reservar)\b.{0,70}\b(?:com voces|com voce|com seu time|comercial|consultor|demonstracao|apresentacao)\b/.test(texto);
  if (pedidoProprio) return false;

  const termosAgenda = /\b(?:agend\w*|marcar|marca|marque|reunioes|reuniao|calls?|horarios?|calendario)\b/;
  if (!termosAgenda.test(texto)) return false;

  // Cliente pergunta se a sua PRÓPRIA IA pode agendar leads.
  const iaOuProduto = /\b(?:a ia|uma ia|agente(?: de ia)?|rob[oô]|sistema|crm|plataforma|automacao|meu bot)\b/;
  const perguntaCapacidade = /\b(?:consegue|pode|faz|funciona|tem|possui|permite|serve|automaticamente|sozinha|sozinho)\b/;
  if (iaOuProduto.test(texto) && perguntaCapacidade.test(texto)) return true;
  if (/^(?:como|onde|qual|quais|de que forma|me explica|me mostra)\b/.test(texto) &&
      /\b(?:funciona|ver|visualiz|acompanhar|vejo|agend\w*|calendario|agenda)\b/.test(texto) &&
      !/\b(?:com voces|com voce|com seu time|para mim|pra mim)\b/.test(texto)) return true;

  const terceiro = /\b(?:meu cliente|minha cliente|meus clientes|meus leads|com o lead|do lead|para o lead|meu publico|meu negocio|minha empresa)\b/;
  if (terceiro.test(texto) && /\b(?:agend\w*|marcar|reuniao|calls?)\b/.test(texto)) return true;

  return false;
}
