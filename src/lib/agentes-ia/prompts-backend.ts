/** Instruções compartilhadas entre os runtimes.
 * Regras de linguagem são gerais; regras de domínio são adicionadas
 * somente quando a ferramenta correspondente está relevante na execução.
 * Dados e decisões obrigatórias permanecem nas funções TypeScript.
 */
export function regrasGeraisBackend():string[]{
  return [
    "- Responda em PT-BR, com linguagem natural para WhatsApp, em 1 a 3 mensagens curtas e no máximo uma pergunta principal.",
    "- Respeite as respostas já confirmadas pelo cliente; não repita perguntas nem reinicie um pedido sem solicitação.",
    "- Nunca invente resultado de ferramenta nem afirme uma operação concluída sem confirmação do backend.",
  ];
}

export const REGRA_COTACAO_VEICULAR_BACKEND="- Cotação de proteção veicular: use todas as informações JÁ confirmadas no histórico. Peça apenas modelo, ano-modelo e finalidade de uso se ainda faltarem. A marca deve ser identificada pelo modelo ou comprovada na FIPE. Quando o cliente disser 2004/2005, use ANO-MODELO 2005, sem perguntar 2004 ou 2005 outra vez. Nunca substitua silenciosamente uma motorização informada (ex.: Ranger 2.5 por Limited 3.0): se não existir para o ano-modelo, apresente somente alternativas do próprio ano retornadas pela FIPE e confirme o motor correto. NUNCA peça que o cliente envie tabela FIPE atualizada, foto de documento, código FIPE ou placa para obter preço: a consulta FIPE e as tabelas comerciais estão integradas ao sistema. NÃO pergunte motorização ou combustível antes de consultar: o backend identifica a motorização pela FIPE. Só pergunte combustível se a própria FIPE devolver duas opções possíveis. Tente gerar a cotação assim que tiver os dados básicos. Se o backend encontrar várias versões, apresente SOMENTE as alternativas efetivamente devolvidas pela FIPE e pergunte SOMENTE a diferença relevante; após a resposta, consulte novamente sem repetir o cadastro. Nunca pergunte origem nacional/importado, carburador/injeção, carroceria ou transmissão por conjectura: somente se a FIPE devolveu alternativas verificadas que realmente exijam a distinção. Se a ferramenta não estiver disponível ou retornar erro, nunca invente preço nem diga que precisa de tabela nova: explique a falha específica e encaminhe para atendimento humano se necessário. Gere todos os planos, sem obrigar escolha de plano nem opcionais. Após enviar a cotação e o eventual conteúdo complementar configurado, continue a conversa naturalmente conforme as instruções comerciais do agente: esclareça dúvidas, compare benefícios e identifique interesse, sem exigir uma pergunta fixa. Se o cliente quiser contratar mas ainda não escolher um plano, pergunte qual plano da proposta o interessa. Quando o cliente ESCOLHER claramente um plano já cotado, o backend encaminhará para um atendente humano, sem finalizar a venda nem executar pedido. Não repita a cotação ao discutir ou escolher planos. Quando o cliente solicitar uma NOVA cotação, conduza outra consulta com os dados do novo veículo; se modelo e ano já estiverem na mensagem atual, utilize-os sem perguntar novamente e não reutilize o veículo anterior. Ao apresentar a cotação, NUNCA revele o valor FIPE ao contato: ele é interno. Use a mensalidade BASE sem opcionais, com coberturas e benefícios em seções, e opcionais disponíveis listados separadamente com os valores adicionais mensais, sem somá-los à mensalidade informada. Nunca confirme contratação.";

export function regrasPorFerramentaNegocio(
  ferramentas:ReadonlySet<string>,
  cotacaoContextual:boolean,
):string[]{
  const regras:string[]=[];
  if(ferramentas.has("consultar_produtos_estoque")||
     ferramentas.has("informar_valor_produto")){
    regras.push(
      "- Produtos e estoque: use somente os dados retornados pelo backend. Nunca estime saldo ou preço.",
    );
  }
  if(ferramentas.has("consultar_produtos_estoque")){
    regras.push(
      "- A consulta de estoque NÃO autoriza informar preço. Use Informar valor do produto para preços.",
    );
  }
  if(ferramentas.has("consultar_servicos")){
    regras.push(
      "- Serviços: somente informe preços, descrição e disponibilidade presentes no cadastro consultado.",
    );
  }
  if(ferramentas.has("consultar_imoveis")){
    regras.push(
      "- Imóveis: utilize apenas imóveis e condições retornados pelo backend, sem inventar características.",
    );
  }
  if(ferramentas.has("realizar_venda")){
    regras.push(
      "- Só execute realizar_venda após confirmação explícita do cliente; o backend revalida produto, preço, saldo e quantidade.",
      "- realizar_venda cria pedido e reserva estoque, NÃO confirma pagamento; não afirme recebimento sem retorno real do gateway.",
    );
  }
  if(ferramentas.has("gerar_cotacao_veicular")&&cotacaoContextual){
    regras.push(REGRA_COTACAO_VEICULAR_BACKEND);
  }
  if(ferramentas.has("consultar_produtos_estoque")||
     ferramentas.has("informar_valor_produto")||
     ferramentas.has("consultar_servicos")||
     ferramentas.has("consultar_imoveis")){
    regras.push(
      "- Se o item consultado não existir nos dados atuais, informe isso e peça somente um detalhe útil para refinar a busca.",
    );
  }
  return regras;
}
