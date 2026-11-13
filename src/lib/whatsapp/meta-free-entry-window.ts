/**
 * A Meta fornece o vencimento do Free Entry Point nos callbacks de status.
 * Essa janela prolonga o acompanhamento operacional da conversa, NUNCA
 * a autorização de texto/áudio/mídia livre (janela separada de 24 horas).
 */
export function resolverVencimentoPontoEntradaMeta(params: {
  status: string;
  pricingType?: string | null;
  originType?: string | null;
  expirationTimestamp?: string | null;
  eventTimestamp?: string | null;
  agora?: Date;
}): { expiraEm: string; eventoEm: string } | null {
  const { status, pricingType, originType, expirationTimestamp, eventTimestamp } = params;
  if (!["enviada", "entregue", "lida"].includes(status)) return null;
  if (pricingType !== "free_entry_point" || originType !== "referral_conversion") return null;
  const raw = String(expirationTimestamp ?? "").trim();
  if (!/^\d{10}(\d{3})?$/.test(raw)) return null;
  const valor = Number(raw);
  const expiraMs = raw.length === 13 ? valor : valor * 1000;
  const agoraMs = (params.agora ?? new Date()).getTime();
  if (!Number.isFinite(expiraMs) || expiraMs <= agoraMs) return null;
  if (expiraMs > agoraMs + 8 * 24 * 60 * 60 * 1000) return null;

  const eventoRaw = String(eventTimestamp ?? "").trim();
  const eventoValor = /^\d{10}(\d{3})?$/.test(eventoRaw) ? Number(eventoRaw) : null;
  const eventoMs = eventoValor === null
    ? agoraMs
    : eventoRaw.length === 13 ? eventoValor : eventoValor * 1000;
  if (!Number.isFinite(eventoMs) || eventoMs > agoraMs + 5 * 60 * 1000) return null;
  return {
    expiraEm: new Date(expiraMs).toISOString(),
    eventoEm: new Date(eventoMs).toISOString(),
  };
}
