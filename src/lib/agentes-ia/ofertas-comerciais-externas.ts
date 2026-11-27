/**
 * Detecta propostas comerciais INICIADAS PELO REMETENTE, sem relação com a
 * solicitação de proteção veicular. Decisões conservadoras: em caso de dúvida,
 * deixa o atendimento normal da IA decidir.
 *
 * Opt-in por agente via metadata_json.tratamento_ofertas_externas.
 */
export type TratamentoOfertaExterna = { ativo: true; mensagem: string };

export function configurarTratamentoOfertaExterna(valor: unknown): TratamentoOfertaExterna | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const config = valor as Record<string, unknown>;
  const mensagem = typeof config.mensagem === "string" ? config.mensagem.trim() : "";
  if (config.ativo !== true || mensagem.length < 35 || mensagem.length > 650) return null;
  return { ativo: true, mensagem };
}

function normalizar(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

/** Somente mensagens textuais que claramente fazem uma oferta comercial externa. */
export function ehOfertaComercialExterna(mensagem: string): boolean {
  const texto = normalizar(mensagem).slice(0, 4000);
  if (texto.length < 28) return false;

  // Caso o remetente esteja pedindo cotação, proteção ou assistência,
  // não confundir com uma oferta externa, mesmo se mencionar crédito.
  if (
    /\b(cotacao|cotar|orcamento|simulacao|prote[cç]ao veicular|seguro veicular|seguro do carro|seguro da moto|savecar|save car)\b/.test(texto) ||
    /\b(preciso|quero|gostaria|busco|me ajuda|como funciona|quanto custa)\b.{0,90}\b(veiculo|carro|moto|caminhao|guincho|reboque|sinistro|rastreador|protecao)\b/.test(texto) ||
    /\b(acidente|colisao|roubo|furto|bateu|batida|guincho|reboque|pane|sinistro|boleto|cancela(?:mento|r))\b/.test(texto)
  ) return false;

  const produtoExterno =
    /\b(credito|emprestimo|financiamento|consorcio|cartao de credito|limite pre.?aprovado|linha de credito|capital de giro|antecipacao de recebiveis|maquininha de cartao|plano de saude|internet fibra|energia solar|telefonia empresarial|marketing digital|trafego pago|publicidade|servico de contabilidade|seguro de vida)\b/.test(texto);
  const ofertaGeral =
    /\b(oferta(?:s)?|promocao|desconto|pacote|plano|produto|servico|solucao|condicoes especiais|proposta comercial)\b/.test(texto);

  const iniciativaComercial =
    /\b(temos|oferecemos|disponibilizamos|trabalhamos com|estamos oferecendo|estou oferecendo|venho oferecer|gostaria de oferecer|quero oferecer|possui credito|credito disponivel|voce tem|voce possui|sou (?:a |o )?(?:consultora?|representante|correspondente|vendedora?|assessora?|especialista)|somos (?:da |do |a |o )?)\b/.test(texto);

  const convite =
    /\b(responda|responder|digite|envie|mande|chame|clique|acesse|saiba mais|receber mais detalhes|receba mais detalhes|fale conosco|entre em contato|aproveite|interessad[oa]|liberad[oa] no mesmo dia|pode me dar um retorno|podemos conversar)\b/.test(texto);

  // A classe de produtos externos é específica o bastante para aceitar
  // oferta inequívoca + convite, mesmo sem apresentação do vendedor.
  return (produtoExterno && convite && iniciativaComercial) ||
    (produtoExterno && /\b(pre.?aprovad[oa]|disponivel para voce|liberad[oa] no mesmo dia)\b/.test(texto) && convite) ||
    (ofertaGeral && iniciativaComercial && convite &&
      /\b(empresa|consultora?|representante|correspondente|vendedora?|comercial|negocio|servico|produto)\b/.test(texto));
}
