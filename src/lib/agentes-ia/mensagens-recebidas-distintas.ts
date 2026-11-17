/** Seleciona eventos únicos enviados pelo contato desta conversa, sem contar reentregas da Meta. */
export type MensagemRecebidaAutomacao = {
  id: string;
  conversa_id: string;
  remetente_tipo: string;
  mensagem_externa_id: string | null;
  conteudo: string | null;
  tipo_mensagem: string | null;
  created_at: string;
};

export function selecionarMensagensRecebidasDistintas(
  entradas: readonly MensagemRecebidaAutomacao[],
  conversaId: string,
  limite: number
): MensagemRecebidaAutomacao[] {
  const unicas = new Map<string, MensagemRecebidaAutomacao>();
  for (const mensagem of entradas) {
    // A conversa pertence a um único contato. Ignorar outros remetentes e conversas.
    if (mensagem.conversa_id !== conversaId || mensagem.remetente_tipo !== "contato") continue;
    const wamid = String(mensagem.mensagem_externa_id || "").trim();
    const chave = wamid ? `externa:${wamid}` : `interna:${mensagem.id}`;
    const anterior = unicas.get(chave);
    // Preferir texto legível ao evento "unsupported" e, em empate, a versão mais recente.
    const qualidade = (item: MensagemRecebidaAutomacao) =>
      (item.tipo_mensagem === "unsupported" ? 0 : 2) +
      (String(item.conteudo || "").trim() ? 1 : 0);
    if (
      !anterior ||
      qualidade(mensagem) > qualidade(anterior) ||
      (qualidade(mensagem) === qualidade(anterior) &&
        Date.parse(mensagem.created_at) > Date.parse(anterior.created_at))
    ) {
      unicas.set(chave, mensagem);
    }
  }
  return Array.from(unicas.values())
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, Math.max(0, limite));
}
