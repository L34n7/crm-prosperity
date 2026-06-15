export const ASSINATURA_WHATSAPP_MAX_LENGTH = 80;

export function normalizarAssinaturaWhatsapp(valor?: string | null) {
  const assinatura = String(valor || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return assinatura.slice(0, ASSINATURA_WHATSAPP_MAX_LENGTH);
}

function escaparNegritoWhatsapp(valor: string) {
  return valor.replace(/\*/g, "").trim();
}

export function aplicarAssinaturaWhatsapp(
  conteudo: string,
  assinatura?: string | null
) {
  const mensagem = String(conteudo || "").trim();
  if (!mensagem) return mensagem;

  const assinaturaNormalizada = escaparNegritoWhatsapp(
    normalizarAssinaturaWhatsapp(assinatura)
  );

  if (!assinaturaNormalizada) return mensagem;

  return `*${assinaturaNormalizada}*\n\n${mensagem}`;
}
