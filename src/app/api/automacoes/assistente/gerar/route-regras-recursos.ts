export const VERSAO_REGRAS_RECURSOS_FLUXOS =
  "crm-prosperity-recursos-confirmaveis-v6-2026-07-27";

const MARCADOR_REGRAS_RECURSOS = `[REGRAS_TECNICAS_${VERSAO_REGRAS_RECURSOS_FLUXOS}]`;

const REGRAS_RECURSOS_FLUXOS = `
${MARCADOR_REGRAS_RECURSOS}

REGRAS TECNICAS OBRIGATORIAS DE RECURSOS, CAPTURA, COPY E OTIMIZACAO DE FLUXO

1. TRANSFERENCIA PARA SETOR
- Todo bloco de transferencia deve usar o tipo transferir.
- Use apenas IDs reais da lista de setores fornecida.
- O setor retornado pela IA e somente uma sugestao: o CRM sempre pedira confirmacao ao usuario antes de materializar o fluxo.
- Nao substitua uma transferencia solicitada por uma mensagem comum.

2. EXCESSO DE TENTATIVAS E TIMEOUT
- Todo bloco que espera resposta deve prever transferencia humana quando exceder tentativas invalidas ou quando o contato permanecer sem responder.
- Use setor_excesso_tentativas apenas com ID real disponivel.
- O CRM sempre pedira confirmacao do setor de excesso e timeout, ainda que exista uma sugestao valida no JSON.
- Nao reutilize silenciosamente o setor de outro bloco como decisao definitiva.

3. ACOES EXTERNAS E REDIRECT
Quando o pedido solicitar explicitamente um botao ou uma acao para:
- abrir localizacao;
- abrir mapa;
- acessar site;
- falar no WhatsApp;
- abrir catalogo;
- acessar formulario;
- entrar para grupo;
crie obrigatoriamente uma etapa do tipo redirect e conecte a opcao correspondente a ela.

Se o usuario forneceu a URL, preserve a URL exatamente.
Se o usuario nao forneceu a URL, crie o redirect com url: null.
O CRM perguntara a URL antes de concluir o fluxo.

E proibido, quando a acao externa foi solicitada:
- substituir o redirect por uma mensagem dizendo que nao existe link;
- remover o botao;
- direcionar para uma mensagem de orientacao textual;
- inventar uma URL;
- usar URL interna do editor do CRM;
- deixar a opcao apontando para um bloco que nao seja redirect.

4. AGENDAMENTO MANUAL E CAPTURAS
Considere agendamento manual quando o pedido disser que o cliente deve informar dados e que a equipe confirmara o horario posteriormente.

No agendamento manual:
- nao use blocos agenda_*;
- crie uma etapa capturar_resposta separada para cada dado solicitado;
- use uma variavel valida e especifica para cada captura;
- reutilize todas as variaveis em um resumo posterior;
- confirme que os dados foram recebidos;
- informe que a equipe confirmara o horario;
- siga para transferencia humana ou retorno ao menu conforme o pedido.

REGRA OBRIGATORIA PARA DATA EM AGENDAMENTO MANUAL
- Para melhor dia, data preferida, dia desejado, disponibilidade ou quando o contato gostaria de ser atendido, use sempre tipo_captura: "texto".
- O tipo texto e obrigatorio nesses casos porque o contato pode responder de forma natural, por exemplo: "amanha", "segunda-feira", "semana que vem", "depois do dia 10" ou "qualquer dia a tarde".
- Nunca use tipo_captura: "data" em agendamento manual, escolha de disponibilidade ou perguntas que aceitam datas relativas e linguagem natural.
- Use tipo_captura: "data" somente quando a resposta precisar obrigatoriamente ser digitada como data numerica e validada pelo CRM.
- O tipo data aceita somente formatos numericos como: 26/07/2026, 26/07/26, 2026-07-26, 01/26, 01/2026 ou 01/12.
- Exemplos adequados para tipo data: data de nascimento, data de vencimento, data de renovacao, data de emissao, data de validade ou outra data exata que obrigatoriamente deve ser numerica.
- Quando houver duvida entre texto e data, prefira texto para nao bloquear respostas naturais do contato.

Sequencia obrigatoria quando o pedido solicitar nome, telefone, melhor dia e melhor horario:
- mensagem curta de introducao;
- captura do nome;
- captura do telefone;
- captura do melhor dia com tipo_captura: "texto";
- captura do melhor horario;
- resumo com as quatro variaveis;
- confirmacao de recebimento;
- proximo passo solicitado.

E proibido:
- substituir as capturas por uma unica mensagem pedindo para o cliente enviar todos os dados livremente;
- criar apenas um botao de atendente depois da solicitacao de dados;
- capturar varios dados diferentes na mesma variavel;
- capturar um dado e nao reutilizar sua variavel;
- omitir capturas para reduzir o tamanho do fluxo;
- usar tipo_captura: "data" para melhor dia ou disponibilidade de agendamento manual.

No briefing, registre os mesmos dados em dados_a_capturar, agendamento.dados e na jornada de agendamento manual.

5. FIDELIDADE AO TOM, TEXTO E DETALHES DO PEDIDO
- Preserve o tom original solicitado pelo usuario: premium, consultivo, acolhedor, urgente, informal, tecnico, profissional, emocional ou comercial.
- Preserve nomes proprios, persona da assistente, nome da empresa, nome do produto/servico, valores, metragem, bairro, diferenciais, promessas permitidas e palavras de impacto fornecidas pelo usuario.
- Nao simplifique termos comerciais importantes. Exemplos: "joia avaliada em R$ 1.400.000,00", "lazer de resort", "exclusividade", "alto padrao", "corretor especialista".
- Preserve emojis em mensagens e botoes quando nao ultrapassarem limites tecnicos do WhatsApp e nao causarem ambiguidade.
- Se precisar encurtar botao por limite tecnico, preserve o sentido principal e registre aviso.
- Nao trocar copy persuasiva por texto generico quando o pedido forneceu uma frase boa e compativel com o fluxo.

6. CUMPRIR O PROMPT E OTIMIZAR A ARQUITETURA DO FLUXO
- Nao apenas copie blocos de forma mecanica. Preserve a intencao do usuario e otimize a arquitetura quando isso melhorar clareza, personalizacao, qualificacao ou handoff.
- Otimizar nao significa inventar novo objetivo. Otimizar significa criar caminhos, mensagens de transicao, retornos e encerramentos coerentes com a mesma intencao do pedido.
- Cada escolha relevante do contato deve gerar consequencia real no fluxo.
- Se duas ou mais opcoes diferentes de uma mesma pergunta apontariam para o mesmo destino, crie obrigatoriamente um bloco intermediario para cada opcao antes de voltar ao destino comum.
- Excecao: opcoes equivalentes, como "Sim", "Confirmo" e "Pode seguir", podem apontar para o mesmo destino quando tiverem exatamente a mesma intencao.
- Opcoes com intencoes diferentes nunca devem sair direto para o mesmo bloco. Exemplos: Morar/Investir, Comprar/Alugar, Recursos proprios/Financiamento, Pessoa fisica/Empresa, Urgente/Sem pressa.

7. MENSAGENS INTERMEDIARIAS POR NICHO E INTENCAO
- Quando criar caminho intermediario, escreva uma mensagem curta, contextual e coerente com o nicho. Nao use apenas "Perfeito, vamos continuar" se houver contexto suficiente.
- Imobiliario: para morar, destaque conforto, localizacao, lazer, seguranca e qualidade de vida; para investir, destaque valorizacao, liquidez, rentabilidade e potencial de retorno; para financiamento, destaque simulacao, entrada e aprovacao; para recursos proprios, destaque negociacao direta e condicoes estrategicas.
- Estetica/saude: para procedimento, destaque objetivo, naturalidade, seguranca, avaliacao individual e expectativa realista; para duvidas, responda com clareza e encaminhe para avaliacao quando necessario.
- Servicos: para urgencia, destaque prioridade e proximo passo; para orcamento, destaque levantamento de dados, escopo e retorno da equipe; para suporte, destaque resolucao e triagem.
- Ecommerce/varejo: para compra, destaque produto e proximo passo; para entrega, destaque prazo, endereco e acompanhamento; para troca, destaque politica e coleta de dados necessarios.
- Educacao/curso: para interesse, destaque objetivo do aluno, formato, suporte e proximo passo; para matricula, destaque orientacao e condicoes.
- A mensagem intermediaria deve ter no maximo 2 frases curtas e seguir automaticamente para o proximo bloco.

8. COPY PREMIUM, CRIATIVA E ATENDIMENTO COM FOCO EM CONVERSAO
- Escreva como um copywriter senior de marketing digital especializado em atendimento conversacional: humano, estrategico, elegante, persuasivo e orientado ao proximo passo.
- A copy deve parecer atendimento real, nao texto de robô. Use linguagem natural, calor humano e contexto da escolha feita pelo contato.
- Cada mensagem deve ter uma funcao clara: acolher, gerar confianca, explicar, reduzir objecao, qualificar, orientar, conduzir para agendamento ou preparar handoff.
- Transforme informacoes do pedido em mensagens melhores, mas nunca altere fatos, nomes, valores, enderecos, horarios, condicoes, limites ou promessas.
- Use criatividade dentro do contexto: microcopy, transicoes, CTAs, encerramentos e justificativas que conectem a escolha do contato com o proximo passo.
- Nao invente beneficios, precos, prazos, resultados, garantias, condicoes comerciais ou fatos tecnicos nao fornecidos.
- Nao use urgencia artificial, promessa exagerada ou gatilho agressivo. A persuasao deve ser consultiva, segura e util.
- Evite repeticao de frases como "a avaliação ajuda", "cada pessoa é diferente", "se quiser, podemos seguir" e "perfeito" em excesso.
- Varie a linguagem entre caminhos diferentes. Harmonizacao, melasma, botox, suporte, imovel, curso, ecommerce e servico nao devem soar como a mesma copy com palavras trocadas.
- Em fluxos comerciais, trabalhe desejo, beneficio, confianca, objecao e facilidade de decisao sem pressionar.
- Em fluxos de suporte, priorize acolhimento, clareza, diagnostico e resolucao.
- Em fluxos de agendamento, reduza atrito, confirme dados e deixe claro que o contato deu o proximo passo corretamente.
- Em handoff humano, prepare o contato com seguranca: diga o que ja foi entendido, o que o especialista fara e o que acontece em seguida.
- Mensagens informativas podem usar listas curtas quando isso melhora a leitura. Mensagens de menu nao devem listar as opcoes novamente.

9. MENUS SEM REDUNDANCIA COM AS OPCOES VISIVEIS
- Em perguntas com botoes ou lista de opcoes, a mensagem do bloco deve contextualizar a decisao e convidar o contato a escolher, mas nao repetir em bullets as mesmas opcoes que ja existem no campo opcoes/botoes.
- E proibido criar mensagem de menu como: "Escolha uma opção: • Agendar • Valores • Menu" quando essas mesmas opcoes ja aparecem como botoes ou lista.
- Mensagens de menu devem ser curtas, por exemplo: "Como deseja seguir agora?", "Escolha abaixo o melhor caminho para o seu atendimento." ou "Selecione uma opção para continuar.".
- Se o menu tiver muitas opcoes, a mensagem pode agrupar a intencao de forma geral, mas sem duplicar os titulos das opcoes.
- Use listas apenas em blocos informativos, respostas de FAQ, resumo de dados, beneficios, orientacoes ou detalhes do serviço. Nao use lista para repetir botoes.
- Quando o usuario pedir "sempre utilize listas", aplique isso aos blocos informativos; para menus, a lista ja sera representada pelas opcoes visiveis do CRM.

10. ANTES E DEPOIS POR CONTEXTO
- Quando a opcao "Antes e Depois" aparecer dentro de um procedimento, produto, servico ou categoria especifica, ela deve seguir o contexto atual e abrir o antes/depois daquele contexto.
- Quando a opcao "Antes e Depois" aparecer no menu principal, em um menu geral ou em um ponto que abrange varias categorias, crie primeiro um menu intermediario de escolha com todas as categorias relevantes antes de mostrar a midia.
- Nunca envie a opcao geral "Antes e Depois" diretamente para a primeira categoria disponivel quando existem varias categorias no fluxo.
- Se o pedido listar categorias para Antes e Depois, preserve esse menu: cada categoria deve apontar para seu bloco de midia ou prova social correspondente, com opcoes de agendar e voltar ao menu.
- O retorno depois de ver um antes/depois especifico deve respeitar o contexto: se veio de um procedimento, voltar para o menu daquele procedimento; se veio do menu geral, voltar para o menu geral de Antes e Depois ou menu principal.
- Se a mesma midia for escolhida manualmente pelo usuario para testes, preserve. Se nao houver midia especifica e o usuario nao escolheu uma midia, deixe a midia pendente para confirmacao posterior.

CHECKLIST OBRIGATORIO DA IA
[ ] Cada transferencia possui uma etapa transferir real.
[ ] Cada bloco que aguarda resposta possui configuracao de excesso e timeout confirmavel.
[ ] Toda acao externa explicita possui uma etapa redirect alcancavel.
[ ] Redirect sem link fornecido usa url: null, nunca texto substituto.
[ ] Cada dado solicitado no agendamento manual possui uma captura propria.
[ ] Melhor dia e disponibilidade de agendamento manual usam tipo_captura: "texto".
[ ] O tipo data foi usado somente quando a resposta deve ser numerica e exata.
[ ] Todas as variaveis capturadas aparecem em resumo ou confirmacao posterior.
[ ] Nenhuma escolha com intencao diferente sai direto para o mesmo bloco sem caminho intermediario.
[ ] Nenhum menu repete em sua mensagem a mesma lista de opcoes que ja aparece nos botoes/lista.
[ ] O menu geral de Antes e Depois abrange todas as categorias quando existirem varias categorias.
[ ] O Antes e Depois especifico respeita o contexto de origem.
[ ] O tom, emojis, persona, nomes, valores e diferenciais do prompt foram preservados quando tecnicamente possivel.
[ ] A copy melhora o atendimento de forma criativa, contextual, humana, persuasiva e coerente com o nicho.
[ ] Nenhum ID de setor ou URL foi inventado.

Revise e corrija o proprio JSON antes de responder. O backend tambem fara normalizacoes estruturais de seguranca e nao bloqueara o fluxo por avaliacao subjetiva.
`.trim();

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

/**
 * Acrescenta regras ao pedido antes do briefing e da geracao principal.
 * As regras orientam a IA, sem criar uma etapa posterior de revisao ou reparo.
 */
export async function anexarRegrasRecursosAoPedido(request: Request) {
  if (request.method !== "POST") return request;

  const body = objeto(await request.clone().json().catch(() => ({})));
  const modo = String(body.modo || "criar_fluxo").trim();
  const acao = String(body.acao || "").trim();
  const instrucao = String(body.instrucao || "").trim();

  if (
    modo !== "criar_fluxo" ||
    acao !== "preparar" ||
    !instrucao ||
    instrucao.includes(MARCADOR_REGRAS_RECURSOS)
  ) {
    return request;
  }

  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify({
      ...body,
      instrucao_original: body.instrucao_original || instrucao,
      regras_recursos_versao: VERSAO_REGRAS_RECURSOS_FLUXOS,
      instrucao: `${instrucao}\n\n${REGRAS_RECURSOS_FLUXOS}`,
    }),
  });
}
