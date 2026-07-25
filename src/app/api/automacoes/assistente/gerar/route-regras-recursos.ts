export const VERSAO_REGRAS_RECURSOS_FLUXOS =
  "crm-prosperity-recursos-confirmaveis-v1-2026-07-25";

const MARCADOR_REGRAS_RECURSOS = `[REGRAS_TECNICAS_${VERSAO_REGRAS_RECURSOS_FLUXOS}]`;

const REGRAS_RECURSOS_FLUXOS = `
${MARCADOR_REGRAS_RECURSOS}

REGRAS TECNICAS OBRIGATORIAS DE RECURSOS

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

CHECKLIST OBRIGATORIO
[ ] Cada transferencia possui uma etapa transferir real.
[ ] Cada bloco que aguarda resposta possui configuracao de excesso e timeout confirmavel.
[ ] Toda acao externa explicita possui uma etapa redirect alcançavel.
[ ] Redirect sem link fornecido usa url: null, nunca texto substituto.
[ ] Nenhum ID de setor ou URL foi inventado.

Se qualquer item falhar, corrija o JSON antes de responder.
`.trim();

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

/**
 * Acrescenta regras deterministicas ao pedido antes da criacao do briefing.
 * Assim o briefing estruturado preserva as decisoes e a geracao principal recebe
 * as mesmas exigencias sem adicionar uma segunda IA de revisao.
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
