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

type OpcoesRequisicao = {
  timeout?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  headers?: unknown;
  fetchOptions?: unknown;
};

type RecuperarOriginal = (
  this: unknown,
  responseID: string,
  query?: unknown,
  options?: OpcoesRequisicao
) => Promise<unknown>;

type RecuperarCompat = RecuperarOriginal & {
  __crmRetrieveCompat?: boolean;
};

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

const cliente = new OpenAI({ apiKey: "compatibilidade-local" });
const prototipo = Object.getPrototypeOf(cliente.responses) as {
  retrieve: RecuperarCompat;
};
const recuperarOriginal = prototipo.retrieve;

if (!recuperarOriginal.__crmRetrieveCompat) {
  const recuperarCompativel: RecuperarCompat = function (
    this: unknown,
    responseID: string,
    query?: unknown,
    options?: OpcoesRequisicao
  ) {
    if (options === undefined && pareceOpcaoRequisicao(query)) {
      return recuperarOriginal.call(this, responseID, undefined, query);
    }

    return recuperarOriginal.call(this, responseID, query, options);
  };

  Object.defineProperty(recuperarCompativel, "__crmRetrieveCompat", {
    value: true,
  });
  prototipo.retrieve = recuperarCompativel;
}
