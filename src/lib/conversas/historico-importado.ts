export const CONVERSA_HISTORICO_IMPORTADO_MENSAGEM =
  "Esta conversa é um histórico importado do WhatsApp Business e está disponível somente para leitura.";

export function isConversaHistoricoImportado(conversa: {
  historico_importado?: boolean | null;
  origem_atendimento?: string | null;
}) {
  // O marcador historico_importado permanece verdadeiro depois que uma
  // conversa histórica é reativada. O bloqueio de edição deve valer somente
  // enquanto ela ainda estiver no estado exclusivo de histórico.
  return conversa.origem_atendimento === "historico_coexistence";
}
