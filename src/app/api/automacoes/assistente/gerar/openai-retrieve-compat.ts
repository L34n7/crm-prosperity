import OpenAI from "openai";

declare module "openai/resources/responses/responses" {
  interface Responses {
    retrieve(
      responseID: string,
      options: {
        timeout?: number;
        maxRetries?: number;
        signal?: AbortSignal;
      }
    ): Promise<unknown>;
  }
}

type ObjetoJson = Record<string, unknown>;
type OpcoesRequisicao = {
  timeout?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  headers?: unknown;
  fetchOptions?: unknown;
};

type CriarOriginal = (
  this: unknown,
  body: Record<string, unknown>,
  options?: unknown
) => Promise<unknown>;

type RecuperarOriginal = (
  this: unknown,
  responseID: string,
  query?: unknown,
  options?: OpcoesRequisicao
) => Promise<unknown>;

type CriarCompat = CriarOriginal & {
  __crmOutputLimit?: boolean;
};

type RecuperarCompat = RecuperarOriginal & {
  __crmRetrieveCompat?: boolean;
};

type GlobalComPatch = typeof globalThis & {
  __crmBriefingIaDesativado?: boolean;
};

const LIMITE_MINIMO_SAIDA_FLUXOS = (() => {
  const configurado = Number(
    process.env.OPENAI_ASSISTENTE_FLUXOS_MAX_OUTPUT_TOKENS || 32_000
  );
  if (!Number.isFinite(configurado)) return 32_000;
  return Math.max(32_000, Math.min(64_000, Math.floor(configurado)));
})();

process.env.OPENAI_ASSISTENTE_FLUXOS_MAX_OUTPUT_TOKENS = String(
  LIMITE_MINIMO_SAIDA_FLUXOS
);

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

function pareceOpcaoRequisicao(valor: unknown): valor is OpcoesRequisicao {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false;
  const item = valor as Record<string, unknown>;
  return (
    "timeout" in item ||
    "maxRetries" in item ||
    "signal" in item ||
    "headers" in item ||
    "fetchOptions" in item
  );
}

function urlRequisicao(input: RequestInfo | URL) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function requisicaoBriefingIa(input: RequestInfo | URL, init?: RequestInit) {
  if (
    !urlRequisicao(input).startsWith("https://api.openai.com/v1/responses") ||
    String(init?.method || "GET").toUpperCase() !== "POST" ||
    typeof init?.body !== "string"
  ) {
    return false;
  }

  try {
    const body = objeto(JSON.parse(init.body));
    const text = objeto(body.text);
    const format = objeto(text.format);
    return format.name === "briefing_estruturado_fluxo";
  } catch {
    return false;
  }
}

function instalarBypassBriefingIa() {
  const globalComPatch = globalThis as GlobalComPatch;
  if (globalComPatch.__crmBriefingIaDesativado) return;

  const fetchOriginal = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (requisicaoBriefingIa(input, init)) {
      return new Response(
        JSON.stringify({
          error: {
            code: "BRIEFING_IA_DESATIVADO",
            message:
              "BRIEFING_DESATIVADO_GERACAO_UNICA: o pedido sera enviado diretamente para a geracao principal.",
          },
        }),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return fetchOriginal(input, init);
  };

  globalComPatch.__crmBriefingIaDesativado = true;
}

function requisicaoGeracaoFluxo(body: Record<string, unknown>) {
  const text = objeto(body.text);
  const format = objeto(text.format);
  const nomeSchema = String(format.name || "");
  const modelo = String(body.model || "");

  return (
    body.background === true &&
    nomeSchema === "plano_assistente_fluxos" &&
    modelo.startsWith("gpt-5.5")
  );
}

function normalizarRespostaIncompleta(resultado: unknown) {
  const resposta = objeto(resultado);
  const incompleto = objeto(resposta.incomplete_details);

  if (
    String(resposta.status || "") !== "incomplete" ||
    String(incompleto.reason || "") !== "max_output_tokens"
  ) {
    return resultado;
  }

  const uso = objeto(resposta.usage);
  const tokensSaida = Number(uso.output_tokens || 0);
  const detalheTokens =
    Number.isFinite(tokensSaida) && tokensSaida > 0
      ? ` A resposta consumiu ${tokensSaida.toLocaleString("pt-BR")} tokens de saída antes de ser interrompida.`
      : "";

  resposta.error = {
    ...objeto(resposta.error),
    code: "MAX_OUTPUT_TOKENS",
    message:
      `A estrutura solicitada excedeu o limite seguro de ${LIMITE_MINIMO_SAIDA_FLUXOS.toLocaleString("pt-BR")} tokens de saída.${detalheTokens} Nenhum fluxo incompleto foi salvo.`,
  };

  return resultado;
}

instalarBypassBriefingIa();

const cliente = new OpenAI({ apiKey: "compatibilidade-local" });
const prototipo = Object.getPrototypeOf(cliente.responses) as {
  create: CriarCompat;
  retrieve: RecuperarCompat;
};

const criarOriginal = prototipo.create;
if (!criarOriginal.__crmOutputLimit) {
  const criarCompativel: CriarCompat = function (
    this: unknown,
    body: Record<string, unknown>,
    options?: unknown
  ) {
    const bodyFinal = requisicaoGeracaoFluxo(body)
      ? {
          ...body,
          max_output_tokens: Math.max(
            Number(body.max_output_tokens || 0),
            LIMITE_MINIMO_SAIDA_FLUXOS
          ),
        }
      : body;

    return criarOriginal.call(this, bodyFinal, options);
  };

  Object.defineProperty(criarCompativel, "__crmOutputLimit", {
    value: true,
  });
  prototipo.create = criarCompativel;
}

const recuperarOriginal = prototipo.retrieve;
if (!recuperarOriginal.__crmRetrieveCompat) {
  const recuperarCompativel: RecuperarCompat = async function (
    this: unknown,
    responseID: string,
    query?: unknown,
    options?: OpcoesRequisicao
  ) {
    const resultado =
      options === undefined && pareceOpcaoRequisicao(query)
        ? await recuperarOriginal.call(this, responseID, undefined, query)
        : await recuperarOriginal.call(this, responseID, query, options);

    return normalizarRespostaIncompleta(resultado);
  };

  Object.defineProperty(recuperarCompativel, "__crmRetrieveCompat", {
    value: true,
  });
  prototipo.retrieve = recuperarCompativel;
}
