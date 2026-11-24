/**
 * Desambiguação determinística: cobrança/assinatura não deve acionar a agenda
 * apenas porque o contato usou "hoje" ou o estado anterior aguardava horário.
 */
function normalizarMensagem(valor: unknown): string {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function mensagemEhPerguntaFinanceiraNaoAgendamento(valor: unknown): boolean {
  const texto = normalizarMensagem(valor);
  if (!texto) return false;

  // Solicitações explícitas de reunião/agendamento podem citar pagamentos
  // como assunto, mas devem continuar elegíveis para a agenda.
  const querMarcarReuniao =
    /\b(?:agendar|agende|marcar|marque|remarcar|remarque|reagendar|reagende)\b.{0,65}\b(?:reuniao|demonstracao|apresentacao|call|horario|consulta|compromisso)\b/.test(texto) ||
    /\b(?:reuniao|demonstracao|apresentacao|call)\b.{0,60}\b(?:agendar|agende|marcar|marque|remarcar|reagendar)\b/.test(texto);
  if (querMarcarReuniao) return false;

  // Assunto financeiro explícito: pergunta sobre cobrança, não disponibilidade.
  return /\b(?:pagamento\w*|paguei|pagar|pago|pagos|mensalidade\w*|assinatura\w*|recorrente\w*|recorrencia|tarifa\w*|cobranca\w*|cobrar|faturamento\w*|fatura\w*|cartao|pix|boleto|preco\w*|custos?|quanto custa|quanto fica)\b/.test(texto);
}
