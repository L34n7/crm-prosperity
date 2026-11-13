/**
 * Mensagem automática de anúncio pode chegar na Cloud API sem texto, como
 * unsupported/unknown com detalhe "This message is currently unavailable.".
 * Só converter quando é a primeira entrada do contato ou existe referral.
 */
export const MENSAGEM_INTERESSE_ANUNCIO =
  "Olá! Tenho interesse em conhecer os produtos ou serviços. Pode me passar mais informações?";

export function recuperarInteresseMensagemIndisponivel(p: {
  tipoMensagem: unknown;
  tipoUnsupported: unknown;
  detalheUnsupported: unknown;
  possuiReferral: boolean;
  primeiraMensagemContato: boolean;
}): string | null {
  if (p.tipoMensagem !== "unsupported") return null;
  if (String(p.tipoUnsupported || "").trim().toLowerCase() !== "unknown") return null;
  if (!/^this message is currently unavailable[.!]?$/i.test(String(p.detalheUnsupported || "").trim())) return null;
  if (!p.possuiReferral && !p.primeiraMensagemContato) return null;
  return MENSAGEM_INTERESSE_ANUNCIO;
}
