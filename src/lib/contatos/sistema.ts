const WHATSAPP_COMERCIAL_NUMERO_PADRAO = "5531975233266";

export const WHATSAPP_COMERCIAL_NUMERO =
  process.env.NEXT_PUBLIC_WHATSAPP_COMERCIAL?.trim() ||
  WHATSAPP_COMERCIAL_NUMERO_PADRAO;

export function montarWhatsappUrl(mensagem?: string) {
  const params = new URLSearchParams({
    phone: WHATSAPP_COMERCIAL_NUMERO,
  });

  if (mensagem) {
    params.set("text", mensagem);
  }

  return `https://api.whatsapp.com/send?${params.toString()}`;
}

export function montarWaMeUrl(mensagem?: string) {
  const query = mensagem
    ? `?text=${encodeURIComponent(mensagem)}`
    : "";

  return `https://wa.me/${WHATSAPP_COMERCIAL_NUMERO}${query}`;
}
