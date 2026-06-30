export const HEADER_CONVERSAS_NAO_LIDAS_REFRESH_EVENT =
  "crm:header:conversas-nao-lidas-refresh";

export const HEADER_DISPAROS_PENDENTES_REFRESH_EVENT =
  "crm:header:disparos-pendentes-refresh";

export const HEADER_AGENDAS_FEEDBACK_REFRESH_EVENT =
  "crm:header:agendas-feedback-refresh";

export function solicitarAtualizacaoConversasNaoLidasHeader() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(HEADER_CONVERSAS_NAO_LIDAS_REFRESH_EVENT));
}

export function solicitarAtualizacaoDisparosPendentesHeader() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(HEADER_DISPAROS_PENDENTES_REFRESH_EVENT));
}

export function solicitarAtualizacaoFeedbackAgendasHeader() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(HEADER_AGENDAS_FEEDBACK_REFRESH_EVENT));
}
