/**
 * A Cloud API e o WhatsApp Business App podem atribuir prefixos distintos ao
 * WAMID da mesma mensagem. Os 32 últimos caracteres observados no webhook
 * de exclusão identificam o mesmo ID lógico.
 *
 * Este sufixo NUNCA deve ser usado sozinho para selecionar uma mensagem:
 * o processador exige empresa, conversa e exatamente um candidato.
 */
export function obterSufixoIdentidadeWhatsapp(externalId: unknown): string | null {
  const id = String(externalId || "").trim();
  if (!id.startsWith("wamid.") || id.length < 45) return null;

  const suffix = id.slice(-32);
  return /^[A-Za-z0-9+/=]{32}$/.test(suffix) ? suffix : null;
}
