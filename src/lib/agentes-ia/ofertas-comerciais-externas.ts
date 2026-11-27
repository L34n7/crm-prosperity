/**
 * Tratamento global de publicidade / ofertas comerciais não solicitadas.
 * Executa ANTES do modelo de IA, em qualquer empresa/agente.
 * A classificação é conservadora para preservar contatos comerciais reais.
 */

export type TratamentoOfertaExterna = { ativo: true; mensagem: string };

export const RESPOSTA_PADRAO_OFERTA_EXTERNA =
  "Olá! Agradecemos o contato. Este canal é destinado ao atendimento de clientes e interessados em nossos produtos ou serviços. Não tratamos ofertas comerciais ou divulgações de terceiros por aqui. Obrigado pela compreensão!";

/**
 * Regra global. Uma configuração válida e ativa personaliza apenas o texto;
 * nenhum agente precisa de opt-in para receber a proteção padrão.
 */
export function configurarTratamentoOfertaExterna(valor: unknown): TratamentoOfertaExterna {
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    const config = valor as Record<string, unknown>;
    const mensagem = typeof config.mensagem === "string" ? config.mensagem.trim() : "";
    if (config.ativo === true && mensagem.length >= 35 && mensagem.length <= 650) {
      return { ativo: true, mensagem };
    }
  }
  return { ativo: true, mensagem: RESPOSTA_PADRAO_OFERTA_EXTERNA };
}

function normalizar(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** Identifica o REMETENTE oferecendo algo, não o cliente pedindo um serviço. */
export function ehOfertaComercialExterna(mensagem: string): boolean {
  const texto = normalizar(mensagem).slice(0, 6000);
  if (texto.length < 25) return false;

  // Sem conversa de venda se o contato está fazendo uma solicitação de cliente,
  // mesmo citando propaganda, empréstimo, serviços ou nome de outra empresa.
  const pedidoDeCliente =
    /\b(?:quero|preciso|gostaria|queremos|precisamos|buscamos|desejamos|temos interesse em|estamos interessados em|tenho interesse|estou buscando|estou procurando|me ajuda|pode me ajudar|pode nos ajudar|poderia me informar|poderiam nos informar|como faco|como funciona|qual e|quanto custa|quanto fica|voces fazem|voces oferecem|voces vendem|voces tem|tem como|gostaria de saber|me passe|me envia|me informe|solicito|solicitar)\b.{0,85}\b(?:comprar|contratar|adquirir|cotar|cotacao|orcamento|agendar|atendimento|assistencia|suporte|preco|valor|produto|servico|plano|veiculo|carro|moto|caminhao|seguro|protecao|boleto|pedido|agendamento|reserva|disponibilidade|credito|emprestimo|financiamento|software|sistema|crm|imovel|consulta|agendamento)\b/.test(texto) ||
    /\b(?:preciso de ajuda|preciso de suporte|quero falar com|preciso falar com|meu boleto|minha fatura|meu pedido|meu agendamento|fiz o pagamento|preciso de guincho|aconteceu um acidente|houve um acidente|meu carro bateu|minha moto|quero contratar|quero comprar|quero fazer cotacao|quanto custa|qual o preco|qual o valor|voces trabalham com)\b/.test(texto);

  // "Gostaria de apresentar nosso serviço" é oferta, não pedido de cliente.
  const propositoVenda =
    /\b(?:quero|gostaria|posso|podemos|venho|estou aqui para|estou entrando em contato para)\b.{0,50}\b(?:oferecer|apresentar|vender|divulgar|enviar (?:uma )?proposta|enviar (?:te |lhe )?(?:um |uma |o |a )?(?:nosso|meu) (?:catalogo|portfolio|cardapio|material)|enviar (?:te |lhe )?(?:uma |a )?apresentacao|apresentar (?:nossos|meus))\b/.test(texto);
  if (pedidoDeCliente && !propositoVenda) return false;

  // Pedidos operacionais e humanos não devem ser desviados pelo classificador.
  const demandaOperacional =
    /\b(?:guincho|reboque|sinistro|cancelar (?:meu|minha)|segunda via|fatura vencida|boleto vencido|rastreador com defeito|reclamacao|problema com meu|reembolso|estorno|indenizacao)\b/.test(texto);
  if (demandaOperacional && !propositoVenda) return false;

  const abordagemVendedor =
    /\b(?:sou (?:a |o |um |uma )?(?:representante|consultora?|correspondente|vendedora?|assessora?|executiv[oa] de contas|corretora?|especialista comercial)|sou (?:da |do )?(?:empresa|agencia|consultoria)|somos (?:da |do |a |o |uma |um )?(?:empresa|agencia|consultoria)|nossa empresa|nosso time comercial|trabalho na empresa|falo da empresa|represento a empresa|representamos a empresa)\b/.test(texto);

  const oferecendo =
    /\b(?:temos|oferecemos|disponibilizamos|trabalhamos com|comercializamos|estamos oferecendo|estou oferecendo|venho oferecer|gostaria de oferecer|quero oferecer|posso oferecer|queremos apresentar|gostaria de apresentar|quero apresentar|posso apresentar|podemos apresentar|queremos divulgar|tenho uma oferta|preparamos uma oferta|voce foi selecionad[oa]|pre.?aprovad[oa] para voce)\b/.test(texto);

  const conteudoComercial =
    /\b(?:oferta(?:s)?|promocao|promo(?:coes)?|desconto|condic(?:ao|oes) especia(?:l|is)|condic(?:ao|oes) exclusiv(?:a|as)|pacote|produto(?:s)?|servico(?:s)?|solu(?:cao|coes)|catalogo|cardapio|portfolio|tabela de precos|orcamento comercial|proposta comercial|proposta para voce|credito|emprestimo|financiamento|consorcio|cartao|pre.?aprovad[oa]|maquininha|marketing|publicidade|campanha|beneficio|plano(?:s)?|assinatura|consultoria|parceria comercial|fornecedor(?:es)?|distribuidor(?:es)?|preco especial|melhor preco|equipamento(?:s)?|curso(?:s)?|treinamento(?:s)?|sistema(?:s)?|software|aplicativo|imove(?:l|is)|roupas?|uniformes?|doces?|kit(?:s)?|cesta(?:s)?|frete|transporte|logistica|brindes?|materia(?:l|is)|aluguel|locacao|seguro(?:s)?|video(?:s)?|foto(?:s)?|design)\b/.test(texto);

  const chamadaParaAcao =
    /\b(?:responda|responder|digite|envie|mande|chame|clique|acesse|saiba mais|conheca|confira|receba mais detalhes|receber mais detalhes|fale conosco|entre em contato|aproveite|interessad[oa]|tem interesse|teria interesse|algum interesse|podemos conversar|vamos conversar|podemos agendar|posso agendar|podemos marcar|posso marcar|pode me dar um retorno|posso te enviar|posso enviar|pode receber|quer receber|quer saber mais|liberad[oa] no mesmo dia|me chama|me chame|conversar sobre|marcar uma reuniao|veja nosso|conheca nosso|conheca nossos|confira nosso)\b/.test(texto) ||
    /(?:https?:\/\/|wa\.me\/|bit\.ly\/)/.test(texto);

  const propagandaDireta =
    /\b(?:super oferta|oferta imperdivel|promocao imperdivel|aproveite nossa promocao|ultimas unidades|so hoje|oferta por tempo limitado|desconto de \d{1,3}%|com ate \d{1,3}% de desconto|black friday|semana de ofertas|condicoes imperdiveis)\b/.test(texto);

  // Apresentação comercial sem produto de categoria conhecida também conta.
  // Exige sinais em combinação para não rejeitar perguntas legítimas.
  if (propositoVenda && (abordagemVendedor || conteudoComercial || chamadaParaAcao)) return true;
  if (abordagemVendedor && oferecendo && (conteudoComercial || chamadaParaAcao)) return true;
  if (abordagemVendedor && conteudoComercial && chamadaParaAcao) return true;
  if (oferecendo && conteudoComercial && chamadaParaAcao) return true;
  if (propagandaDireta && chamadaParaAcao) return true;

  // Campanhas que dispensam apresentação do vendedor.
  if (
    /\b(?:credito|emprestimo|limite|financiamento|consorcio|cartao)\b/.test(texto) &&
    /\b(?:pre.?aprovad[oa]|liberad[oa] no mesmo dia|disponivel para voce|temos (?:credito|limite))\b/.test(texto) &&
    chamadaParaAcao
  ) return true;

  return false;
}
