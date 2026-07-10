export const CONVERSA_HISTORICO_IMPORTADO_MENSAGEM =
  "Esta conversa é um histórico importado do WhatsApp Business e está disponível somente para leitura.";

export function isConversaHistoricoImportado(conversa: {
  historico_importado?: boolean | null;
  origem_atendimento?: string | null;
}) {
  return (
    conversa.historico_importado === true ||
    conversa.origem_atendimento === "historico_coexistence"
  );
}
