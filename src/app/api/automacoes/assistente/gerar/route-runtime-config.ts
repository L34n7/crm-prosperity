type ObjetoJson = Record<string, unknown>;

const MODELO_FLUXOS = "gpt-5.4-mini";
const MODELO_BRIEFING = "gpt-5.4-mini";
const LIMITE_SAIDA_FLUXO = 28_000;
const LIMITE_SAIDA_BRIEFING = 6_000;
const VERSAO_BRIEFING =
  "crm-prosperity-briefing-estruturado-v3-2026-07-25";

// Capturado antes de openai-retrieve-compat instalar o bypass do briefing.
const fetchNativo = globalThis.fetch.bind(globalThis);
let briefingHabilitado = false;

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

function urlRequisicao(input: RequestInfo | URL) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function corpoJson(init?: RequestInit): ObjetoJson | null {
  if (typeof init?.body !== "string") return null;
  try {
    return objeto(JSON.parse(init.body));
  } catch {
    return null;
  }
}

function nomeSchema(body: ObjetoJson) {
  const text = objeto(body.text);
  const format = objeto(text.format);
  return String(format.name || "");
}

function requisicaoResponsesOpenAI(input: RequestInfo | URL) {
  return urlRequisicao(input).startsWith("https://api.openai.com/v1/responses");
}

function substituirRegraLimite(texto: string) {
  return texto.replace(
    /- O JSON completo deve ter preferencialmente menos de 6\.000 caracteres\.\s*/g,
    "- Seja conciso, mas nunca corte, resuma ou omita requisitos para atingir um tamanho artificial.\n"
  );
}

function reforcarPromptBriefing(input: unknown) {
  if (!Array.isArray(input)) return input;

  const entradaAjustada = input.map((item) => {
    const mensagem = objeto(item);
    if (mensagem.role !== "system" || !Array.isArray(mensagem.content)) {
      return item;
    }

    return {
      ...mensagem,
      content: mensagem.content.map((parte) => {
        const conteudo = objeto(parte);
        if (conteudo.type !== "input_text") return parte;
        return {
          ...conteudo,
          text: substituirRegraLimite(String(conteudo.text || "")),
        };
      }),
    };
  });

  const reforco = {
    role: "system",
    content: [
      {
        type: "input_text",
        text: `REGRAS DE FIDELIDADE DO BRIEFING
- Preserve todos os requisitos funcionais do pedido, mesmo quando o fluxo for grande.
- Nao existe limite rigido de caracteres para o briefing. Seja objetivo sem apagar informacoes.
- Registre cada dado solicitado ao cliente em dados_a_capturar.
- Quando o pedido disser que o cliente deve informar nome, telefone, dia, horario ou outro dado e que a equipe confirmara depois, classifique como agendamento manual.
- No agendamento manual, repita cada dado em agendamento.dados e descreva em jornadas a sequencia: introducao, uma captura por dado, resumo com todas as variaveis, confirmacao de recebimento e proximo passo.
- Nunca transforme uma coleta de dados em uma unica mensagem pedindo para o cliente enviar tudo livremente.
- Nunca substitua blocos de captura por um botao de atendente.
- Preserve menus, perguntas de FAQ, respostas especificas, transferencias, midias, URLs e textos literais.
- Nao invente recursos nem remova requisitos para simplificar o fluxo.`,
      },
    ],
  };

  const indiceUsuario = entradaAjustada.findIndex(
    (item) => objeto(item).role === "user"
  );
  if (indiceUsuario < 0) return [...entradaAjustada, reforco];

  return [
    ...entradaAjustada.slice(0, indiceUsuario),
    reforco,
    ...entradaAjustada.slice(indiceUsuario),
  ];
}

function prepararBodyOpenAI(body: ObjetoJson) {
  const schema = nomeSchema(body);

  if (schema === "briefing_estruturado_fluxo") {
    return {
      ...body,
      model: MODELO_BRIEFING,
      reasoning: { ...objeto(body.reasoning), effort: "low" },
      max_output_tokens: LIMITE_SAIDA_BRIEFING,
      prompt_cache_key: VERSAO_BRIEFING,
      input: reforcarPromptBriefing(body.input),
    };
  }

  if (schema === "plano_assistente_fluxos") {
    return {
      ...body,
      model: MODELO_FLUXOS,
      reasoning: { ...objeto(body.reasoning), effort: "low" },
      max_output_tokens: Math.max(
        Number(body.max_output_tokens || 0),
        LIMITE_SAIDA_FLUXO
      ),
    };
  }

  return body;
}

/** Configura os dois passos do assistente para o modelo de melhor custo-beneficio. */
export function configurarModelosFluxosIa() {
  process.env.OPENAI_ASSISTENTE_FLUXOS_MODEL = MODELO_FLUXOS;
  process.env.OPENAI_ASSISTENTE_FLUXOS_BRIEFING_MODEL = MODELO_BRIEFING;
  process.env.OPENAI_ASSISTENTE_FLUXOS_REASONING_EFFORT = "low";
  process.env.OPENAI_ASSISTENTE_FLUXOS_MAX_OUTPUT_TOKENS = String(
    LIMITE_SAIDA_FLUXO
  );
}

/**
 * Reativa o briefing sem remover as protecoes de consumo instaladas pelo modulo
 * de compatibilidade. Nao adiciona revisao, reparo ou validacao semantica.
 */
export function habilitarBriefingFluxosIa() {
  if (briefingHabilitado) return;

  const fetchCompatibilidade = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!requisicaoResponsesOpenAI(input)) {
      return fetchCompatibilidade(input, init);
    }

    const body = corpoJson(init);
    if (!body) return fetchCompatibilidade(input, init);

    const schema = nomeSchema(body);
    const bodyFinal = prepararBodyOpenAI(body);
    const initFinal: RequestInit = {
      ...init,
      body: JSON.stringify(bodyFinal),
    };

    // O modulo anterior bloqueava somente esta chamada. Para o briefing usamos
    // o fetch nativo capturado antes do bypass; nas demais chamadas preservamos
    // toda a instrumentacao e reconciliacao de consumo existente.
    if (schema === "briefing_estruturado_fluxo") {
      return fetchNativo(input, initFinal);
    }

    return fetchCompatibilidade(input, initFinal);
  };

  briefingHabilitado = true;
}
