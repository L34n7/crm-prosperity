export const VERSAO_REGRAS_RECURSOS_FLUXOS =
  "crm-prosperity-recursos-confirmaveis-v3-2026-07-26";

const MARCADOR_REGRAS_RECURSOS = `[REGRAS_TECNICAS_${VERSAO_REGRAS_RECURSOS_FLUXOS}]`;

const REGRAS_RECURSOS_FLUXOS = `
${MARCADOR_REGRAS_RECURSOS}

REGRAS TECNICAS OBRIGATORIAS DE RECURSOS E CAPTURA

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

CHECKLIST OBRIGATORIO DA IA
[ ] Cada transferencia possui uma etapa transferir real.
[ ] Cada bloco que aguarda resposta possui configuracao de excesso e timeout confirmavel.
[ ] Toda acao externa explicita possui uma etapa redirect alcancavel.
[ ] Redirect sem link fornecido usa url: null, nunca texto substituto.
[ ] Cada dado solicitado no agendamento manual possui uma captura propria.
[ ] Melhor dia e disponibilidade de agendamento manual usam tipo_captura: "texto".
[ ] O tipo data foi usado somente quando a resposta deve ser numerica e exata.
[ ] Todas as variaveis capturadas aparecem em resumo ou confirmacao posterior.
[ ] Nenhum ID de setor ou URL foi inventado.

Revise e corrija o proprio JSON antes de responder. O backend nao fara reparo semantico e nao bloqueara o fluxo por avaliacao subjetiva.
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
