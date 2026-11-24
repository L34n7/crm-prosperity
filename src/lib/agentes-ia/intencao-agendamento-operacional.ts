/**
 * Valida a intenção de agenda independentemente de nicho ou assunto comercial.
 * Menções incidentais a datas ou contexto antigo não acionam a agenda.
 * Em casos ambíguos, o agente principal mantém a interpretação do turno.
 */
function normalizarTexto(valor: unknown): string {
  return String(valor || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[,;]+/g, " ").replace(/[?!.:]+$/g, "")
    .replace(/\s+/g, " ").trim();
}

export function mensagemPertenceFluxoAgenda(
  valor: unknown,
  contexto: { emCurso: boolean; confirmacaoPendente: boolean }
): boolean {
  const texto = normalizarTexto(valor);
  if (!texto) return false;

  // Como usar um recurso de agenda não equivale a pedir um compromisso.
  if (
    /^(?:como|onde|qual|quais|porque|por que|o que|me explica|me mostra)\b/.test(texto) &&
    /\b(?:funciona|sistema|crm|ferramenta|plataforma|agenda|agendamento|agendar|calendario)\b/.test(texto) &&
    !/\b(?:quais horarios|qual horario|tem horario|horario disponivel|horarios disponiveis)\b/.test(texto)
  ) return false;
  if (/\b(?:quero saber|me explica|me ensina)\b.{0,50}\bcomo\s+(?:agendar|marcar)\b/.test(texto)) return false;
  if (/^(?:nao|nem)\s+(?:quero|preciso|pretendo|vou)\s+(?:(?:mais|de|uma?|o)\s+)*(?:agendar|marcar|remarcar|reagendar|reuniao|consulta)\b/.test(texto)) return false;

  // Pedido positivo com objeto de agenda: reunião, consulta, visita etc.
  const pedidoExplicito =
    /\b(?:quero|gostaria|preciso|desejo|vamos|podemos|pode|poderia)\b.{0,45}\b(?:agendar|marcar|remarcar|reagendar)\b.{0,45}\b(?:reuniao|consulta|visita|demonstracao|apresentacao|call|compromisso|horario|atendimento|conversa|agendamento)\b/.test(texto) ||
    /\b(?:me\s+)?(?:agende|marque|remarque|reagende)\b.{0,50}\b(?:reuniao|consulta|visita|demonstracao|apresentacao|call|compromisso|horario|atendimento|conversa|agendamento)\b/.test(texto) ||
    /\b(?:quero|gostaria|preciso|prefiro)\b.{0,35}\b(?:novo|outro)\s+(?:agendamento|compromisso|reuniao|consulta|visita|horario)\b/.test(texto) ||
    /\b(?:pode|consegue|tem)\b.{0,26}\b(?:horario|horarios)\s+(?:livre|livres|disponivel|disponiveis)\b/.test(texto) ||
    /\b(?:agendar|marcar|remarcar|reagendar)\s+(?:uma?\s+)?(?:reuniao|consulta|visita|demonstracao|apresentacao|call|compromisso|conversa)\b/.test(texto) ||
    /\b(?:me\s+)?(?:agende|marque|remarque|reagende)\s+(?:para|pra|no|na|em|as)\s+(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|\d{1,2}(?::\d{2}|h\d{0,2})?)\b/.test(texto) ||
    /\b(?:quero|gostaria|pode|poderia|vamos|podemos|me)\s+(?:me\s+)?(?:agendar|marcar|remarcar|reagendar)\s+(?:para|pra|no|na|em|as)\s+(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|\d{1,2}(?::\d{2}|h\d{0,2})?)\b/.test(texto) ||
    /\b(?:remarca|reagenda|marca|agenda)\s+(?:(?:a|o|minha|meu)\s+)?(?:reuniao|consulta|visita|apresentacao|demonstracao)\b/.test(texto);
  if (pedidoExplicito) return true;
  if (!contexto.emCurso && !contexto.confirmacaoPendente) return false;

  // Uma resposta genérica "sim" só confirma compromisso já pendente.
  if (contexto.confirmacaoPendente &&
      /^(?:sim|nao|confirmo|pode confirmar|nao confirmo|pode sim|ok|certo|fechado|isso|isso mesmo|confirmado|confirmada|pode|cancelar|cancela|deixa pra la)$/.test(texto)) return true;

  // Respostas compatíveis com a escolha de um horário previamente oferecido.
  if (/^(?:o\s+)?(?:primeiro|segundo|terceiro|ultimo|ultima|opcao\s*[1-9])$/.test(texto)) return true;
  if (/^(?:(?:outro|outra)\s+(?:dia|horario|data|opcao)|nenhum desses|nenhuma dessas|qualquer horario|qualquer dia|mais tarde|de manha|a tarde|a noite|pela manha|pela tarde)$/.test(texto)) return true;
  if (/^(?:nao\s+)?(?:consigo|posso)\s+(?:(?:nesse|neste|esse|este)\s+)?(?:dia|horario)$/.test(texto)) return true;
  if (/^(?:nao\s+)?(?:consigo|posso)\s+(?:hoje|amanha|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo)$/.test(texto)) return true;
  if (/^(?:prefiro|pode ser|melhor)\s+(?:de manha|a tarde|a noite|mais tarde)$/.test(texto)) return true;
  if (/^(?:depois|a partir)\s+d[ao]s?\s+\d{1,2}(?::\d{2}|h)?$/.test(texto)) return true;
  if (/^(?:quero|prefiro|preciso|pode|podemos)\s+(?:mudar|trocar|alterar)\s+(?:o\s+)?(?:dia|horario|hora)(?:\s+(?:da|do)\s+(?:reuniao|consulta|visita|agendamento))?$/.test(texto)) return true;

  // Data/hora isolada ou proposta curta. Um "hoje" no meio de outra dúvida
  // não atende ao padrão e o agente continuará livre para interpretar.
  const periodo = "(?:hoje|amanha|depois de amanha|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo|dia\\s+\\d{1,2}(?:/\\d{1,2})?|(?:na\\s+)?proxima\\s+semana|(?:as\\s+)?\\d{1,2}(?::\\d{2}|h\\d{0,2})(?:\\s+horas?)?)";
  const complemento = "(?:\\s+(?:as\\s+)?\\d{1,2}(?::\\d{2}|h\\d{0,2})?(?:\\s+horas?)?)?(?:\\s+(?:de manha|a tarde|a noite|pela manha|pela tarde|pela noite))?";
  return new RegExp(
    "^(?:(?:eu\\s+)?(?:prefiro|pode ser|seria melhor|melhor|consigo|estou livre|fico livre|tenho disponibilidade|pra mim pode ser|para mim pode ser|e se for)\\s+)?(?:(?:no|na|em|para|pra|pela)\\s+)?" +
    periodo + complemento + "(?:\\s+(?:pode ser|fica bom|serve|funciona|pra mim|para mim|por favor))?$"
  ).test(texto);
}
