import { AsyncLocalStorage } from "node:async_hooks";

import OpenAI from "openai";

import { validarPlanoAssistenteEstrutural } from "@/lib/automacoes/assistente-fluxos-validacao-estrutural";
import {
  extrairUsoTokensIa,
  registrarUsoTokensIa,
  verificarSaldoTokensIa,
} from "@/lib/ia/tokens";
import {
  prepararPayloadAssistente,
  type ContextoAssistenteFluxos,
} from "./route-contexto-ia";
import { VERSAO_PROMPT_MESTRE_FLUXOS } from "./route-arquitetura-fluxos-ia";
import { registrarDiagnosticoIa } from "./route-diagnostico-ia";
import {
  extrairTextoSaida,
  substituirTextoSaida,
  type RespostaOpenAI,
} from "./route-validacao-ia";
import {
  carregarContextoAssistente,
  persistirInstrucaoCompleta,
} from "./route-sessao-contexto";

export const runtime = "nodejs";

type CriarResposta = (
  body: Record<string, unknown>,
  options?: unknown
) => Promise<RespostaOpenAI>;
type RecuperarResposta = (
  responseId: string,
  options?: unknown
) => Promise<RespostaOpenAI>;
type PrototipoResponses = {
  create: CriarResposta;
  retrieve: RecuperarResposta;
};
type ObjetoJson = Record<string, unknown>;

const contextoAssistenteFluxos =
  new AsyncLocalStorage<ContextoAssistenteFluxos>();
const briefingPorContexto = new WeakMap<
  ContextoAssistenteFluxos,
  Promise<ObjetoJson | null>
>();
let sdkInstalado = false;
let moduloOriginalPromise: Promise<typeof import("./route-original")> | null =
  null;

const MODELO_ASSISTENTE_FLUXOS =
  process.env.OPENAI_ASSISTENTE_FLUXOS_MODEL || "gpt-5.5";
const MODELO_BRIEFING_FLUXOS =
  process.env.OPENAI_ASSISTENTE_FLUXOS_BRIEFING_MODEL || "gpt-5.4-mini";
const VERSAO_BRIEFING_FLUXOS =
  "crm-prosperity-briefing-estruturado-v1-2026-07-24";

const ESFORCO_RACIOCINIO = (() => {
  const informado = String(
    process.env.OPENAI_ASSISTENTE_FLUXOS_REASONING_EFFORT || "medium"
  ).toLowerCase();
  return ["none", "low", "medium", "high", "xhigh"].includes(informado)
    ? informado
    : "medium";
})();

const LIMITE_SAIDA_ASSISTENTE = (() => {
  const configurado = Number(
    process.env.OPENAI_ASSISTENTE_FLUXOS_MAX_OUTPUT_TOKENS || 24000
  );
  if (!Number.isFinite(configurado)) return 24000;
  return Math.max(10000, Math.min(36000, Math.floor(configurado)));
})();

// O briefing usa uma chamada curta antes da geração principal. O limite da
// geração principal reserva margem para autenticação, banco e materialização
// dentro da função de cinco minutos da Vercel.
const LIMITE_TOTAL_GERACAO_MS = 220_000;
const LIMITE_REQUISICAO_OPENAI_MS = 55_000;
const LIMITE_BRIEFING_MS = 30_000;
const LIMITE_SAIDA_BRIEFING = 3_200;
const INTERVALO_CONSULTA_INICIAL_MS = 1_500;
const INTERVALO_CONSULTA_MAXIMO_MS = 6_000;

const SCHEMA_BRIEFING_FLUXOS = {
  type: "object",
  additionalProperties: false,
  properties: {
    titulo: { type: "string" },
    objetivo: { type: "string" },
    publico: { type: "string" },
    tom_de_voz: {
      type: "array",
      items: { type: "string" },
    },
    entidades: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tipo: { type: "string" },
          nome: { type: "string" },
          detalhes: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["tipo", "nome", "detalhes"],
      },
    },
    itens_principais: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nome: { type: "string" },
          categoria: { type: "string" },
          conteudos_obrigatorios: {
            type: "array",
            items: { type: "string" },
          },
          acoes: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["nome", "categoria", "conteudos_obrigatorios", "acoes"],
      },
    },
    menu_principal: {
      type: "array",
      items: { type: "string" },
    },
    jornadas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nome: { type: "string" },
          objetivo: { type: "string" },
          etapas: {
            type: "array",
            items: { type: "string" },
          },
          saidas: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["nome", "objetivo", "etapas", "saidas"],
      },
    },
    faq: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          contexto: { type: "string" },
          perguntas: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["contexto", "perguntas"],
      },
    },
    dados_a_capturar: {
      type: "array",
      items: { type: "string" },
    },
    agendamento: {
      type: "object",
      additionalProperties: false,
      properties: {
        modo: {
          type: "string",
          enum: ["nao_solicitado", "manual", "automatico"],
        },
        dados: {
          type: "array",
          items: { type: "string" },
        },
        regra_confirmacao: { type: "string" },
      },
      required: ["modo", "dados", "regra_confirmacao"],
    },
    recursos_necessarios: {
      type: "object",
      additionalProperties: false,
      properties: {
        midias: {
          type: "array",
          items: { type: "string" },
        },
        transferencia_humana: { type: "boolean" },
        agenda_crm: { type: "boolean" },
        urls: {
          type: "array",
          items: { type: "string" },
        },
        setores: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "midias",
        "transferencia_humana",
        "agenda_crm",
        "urls",
        "setores",
      ],
    },
    textos_literais: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          rotulo: { type: "string" },
          texto: { type: "string" },
        },
        required: ["rotulo", "texto"],
      },
    },
    regras_obrigatorias: {
      type: "array",
      items: { type: "string" },
    },
    proibicoes: {
      type: "array",
      items: { type: "string" },
    },
    requisitos_pendentes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "titulo",
    "objetivo",
    "publico",
    "tom_de_voz",
    "entidades",
    "itens_principais",
    "menu_principal",
    "jornadas",
    "faq",
    "dados_a_capturar",
    "agendamento",
    "recursos_necessarios",
    "textos_literais",
    "regras_obrigatorias",
    "proibicoes",
    "requisitos_pendentes",
  ],
} as const;

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

function mensagemErro(error: unknown) {
  return error instanceof Error
    ? error.message
    : String(error || "Erro desconhecido.");
}

function erroFoiAbortado(error: unknown) {
  const nome = error instanceof Error ? error.name : "";
  const mensagem = mensagemErro(error).toLowerCase();
  return (
    nome === "AbortError" ||
    mensagem.includes("aborted") ||
    mensagem.includes("aborterror") ||
    mensagem.includes("request timed out") ||
    mensagem.includes("request timeout")
  );
}

function statusEmProcessamento(status: unknown) {
  return ["queued", "in_progress"].includes(String(status || ""));
}

function statusConcluido(status: unknown) {
  return String(status || "") === "completed";
}

function detalheFalhaResposta(resposta: RespostaOpenAI) {
  const erro = objeto(resposta.error);
  const incompleto = objeto(resposta.incomplete_details);
  return String(
    erro.message ||
      incompleto.reason ||
      `status ${String(resposta.status || "desconhecido")}`
  );
}

function aguardar(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function extrairTextoRespostaHttp(resposta: ObjetoJson) {
  if (typeof resposta.output_text === "string" && resposta.output_text.trim()) {
    return resposta.output_text.trim();
  }

  if (!Array.isArray(resposta.output)) return "";

  return resposta.output
    .flatMap((item) => {
      const saida = objeto(item);
      return Array.isArray(saida.content) ? saida.content : [];
    })
    .map((item) => objeto(item))
    .filter((item) => item.type === "output_text")
    .map((item) => String(item.text || ""))
    .join("")
    .trim();
}

function briefingValido(valor: unknown): valor is ObjetoJson {
  const briefing = objeto(valor);
  return (
    Boolean(String(briefing.objetivo || "").trim()) &&
    Array.isArray(briefing.regras_obrigatorias) &&
    Array.isArray(briefing.jornadas) &&
    Array.isArray(briefing.menu_principal)
  );
}

function montarInstrucaoTratada(briefing: ObjetoJson) {
  return JSON.stringify({
    tipo_entrada: "briefing_estruturado_aprovado_automaticamente",
    versao: VERSAO_BRIEFING_FLUXOS,
    contrato:
      "Este briefing foi extraido fielmente do pedido original. Use todos os campos como requisitos da geracao. Nao resuma novamente, nao omita itens e nao invente informacoes ausentes. Textos literais devem ser preservados. Requisitos pendentes representam somente recursos ou decisoes realmente nao informados.",
    briefing,
  });
}

async function gerarBriefingEstruturado(
  contexto: ContextoAssistenteFluxos
): Promise<ObjetoJson | null> {
  if (
    contexto.modo !== "criar_fluxo" ||
    contexto.instrucaoCompleta.trim().length < 80 ||
    !process.env.OPENAI_API_KEY
  ) {
    return null;
  }

  await registrarDiagnosticoIa({
    contexto,
    fase: "briefing_estruturado_request",
    payload: {
      modelo: MODELO_BRIEFING_FLUXOS,
      reasoning_effort: "low",
      max_output_tokens: LIMITE_SAIDA_BRIEFING,
      instrucao_caracteres: contexto.instrucaoCompleta.length,
      versao: VERSAO_BRIEFING_FLUXOS,
    },
    metadados: {
      objetivo: "tratar_e_estruturar_solicitacao_antes_da_geracao",
    },
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO_BRIEFING_FLUXOS,
      reasoning: { effort: "low" },
      max_output_tokens: LIMITE_SAIDA_BRIEFING,
      prompt_cache_key: VERSAO_BRIEFING_FLUXOS,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: `Voce e um analista de requisitos para fluxos de automacao do CRM Prosperity.

Sua unica tarefa e transformar a solicitacao original em um briefing estruturado, completo e fiel.

REGRAS OBRIGATORIAS
- Nao crie o fluxo e nao crie blocos ou conexoes.
- Nao reduza detalhes importantes para deixar o briefing menor.
- Preserve literalmente nomes, enderecos, horarios, URLs, textos fornecidos e listas de opcoes.
- Separe servicos, produtos, procedimentos ou assuntos sem misturar seus requisitos.
- Distinga agenda automatica do CRM de coleta manual para confirmacao humana.
- Registre toda regra, proibicao, CTA, retorno, transferencia, midia e dado a capturar.
- Nao invente precos, servicos, setores, agendas, midias, URLs ou informacoes ausentes.
- Requisitos pendentes devem conter somente ambiguidades reais que impedem uma decisao.
- O briefing sera a unica solicitacao enviada ao modelo que criara o fluxo; portanto, nao omita nada.
- Seja conciso: use frases curtas e nao repita a mesma regra em campos diferentes.
- Responda exclusivamente no JSON definido pelo schema.`,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: contexto.instrucaoCompleta,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "briefing_estruturado_fluxo",
          strict: true,
          schema: SCHEMA_BRIEFING_FLUXOS,
        },
      },
    }),
    signal: AbortSignal.timeout(LIMITE_BRIEFING_MS),
  });

  const respostaJson = objeto(await response.json().catch(() => ({})));

  if (!response.ok) {
    const erro = objeto(respostaJson.error);
    throw new Error(
      `BRIEFING_IA_FALHOU: ${String(
        erro.message || `HTTP ${response.status}`
      )}`
    );
  }

  const texto = extrairTextoRespostaHttp(respostaJson);
  let briefing: ObjetoJson;

  try {
    briefing = objeto(JSON.parse(texto));
  } catch (error) {
    throw new Error(
      `BRIEFING_IA_FALHOU: JSON invalido: ${mensagemErro(error)}`
    );
  }

  if (!briefingValido(briefing)) {
    throw new Error(
      "BRIEFING_IA_FALHOU: a resposta nao contem os campos minimos obrigatorios."
    );
  }

  const uso = extrairUsoTokensIa(respostaJson.usage);

  if (contexto.empresaId && uso.totalTokens > 0) {
    await registrarUsoTokensIa({
      empresaId: contexto.empresaId,
      usuarioId: contexto.usuarioId,
      origem: "assistente_fluxos_briefing",
      modelo: MODELO_BRIEFING_FLUXOS,
      uso,
      metadata: {
        etapa: "briefing_estruturado",
        modo: contexto.modo,
        versao: VERSAO_BRIEFING_FLUXOS,
      },
    });
    await verificarSaldoTokensIa(contexto.empresaId);
  }

  await registrarDiagnosticoIa({
    contexto,
    fase: "briefing_estruturado_response",
    payload: briefing,
    metadados: {
      modelo: MODELO_BRIEFING_FLUXOS,
      versao: VERSAO_BRIEFING_FLUXOS,
      tokens_input: uso.inputTokens,
      tokens_output: uso.outputTokens,
      briefing_caracteres: JSON.stringify(briefing).length,
    },
  });

  return briefing;
}

async function obterBriefingEstruturado(contexto: ContextoAssistenteFluxos) {
  const existente = briefingPorContexto.get(contexto);
  if (existente) return existente;

  const geracao = gerarBriefingEstruturado(contexto).catch(async (error) => {
    await registrarDiagnosticoIa({
      contexto,
      fase: "briefing_estruturado_fallback",
      problemas: [mensagemErro(error)],
      metadados: {
        estrategia:
          "continuar_com_pedido_original_quando_o_briefing_nao_ficar_disponivel",
      },
    });
    return null;
  });

  briefingPorContexto.set(contexto, geracao);
  return geracao;
}

async function aguardarRespostaBackground(params: {
  responses: PrototipoResponses;
  respostaInicial: RespostaOpenAI;
  prazoFinal: number;
}) {
  let resposta = params.respostaInicial;
  let intervalo = INTERVALO_CONSULTA_INICIAL_MS;

  while (statusEmProcessamento(resposta.status)) {
    if (!resposta.id) {
      throw new Error(
        "GERACAO_IA_FALHOU: a OpenAI iniciou a geração sem retornar o identificador da resposta."
      );
    }

    const restante = params.prazoFinal - Date.now();
    if (restante <= intervalo + 2_000) {
      throw new Error(
        `GERACAO_IA_TIMEOUT: a geração continuou em processamento além do tempo seguro do servidor. Resposta OpenAI: ${resposta.id}.`
      );
    }

    await aguardar(Math.min(intervalo, Math.max(500, restante - 2_000)));

    resposta = await params.responses.retrieve(resposta.id, {
      timeout: Math.min(LIMITE_REQUISICAO_OPENAI_MS, Math.max(5_000, restante)),
      maxRetries: 1,
      signal: AbortSignal.timeout(
        Math.min(LIMITE_REQUISICAO_OPENAI_MS, Math.max(5_000, restante))
      ),
    });

    intervalo = Math.min(
      INTERVALO_CONSULTA_MAXIMO_MS,
      Math.round(intervalo * 1.45)
    );
  }

  if (!statusConcluido(resposta.status)) {
    throw new Error(
      `GERACAO_IA_FALHOU: ${detalheFalhaResposta(resposta)}.`
    );
  }

  return resposta;
}

function normalizarRespostaFinal(resposta: RespostaOpenAI) {
  const texto = extrairTextoSaida(resposta);
  if (!texto) {
    throw new Error(
      "RESPOSTA_IA_ESTRUTURALMENTE_INVALIDA: a IA nao retornou o JSON final."
    );
  }

  let plano: ObjetoJson;
  try {
    plano = objeto(JSON.parse(texto));
  } catch (error) {
    throw new Error(
      `RESPOSTA_IA_ESTRUTURALMENTE_INVALIDA: JSON invalido: ${
        error instanceof Error ? error.message : "falha de leitura"
      }.`
    );
  }

  // Nao existe segunda etapa de IA. O plano precisa ser definitivo.
  plano.clarificacoes = [];
  const problemas = validarPlanoAssistenteEstrutural(plano);

  if (problemas.length > 0) {
    const detalhes = problemas
      .slice(0, 12)
      .map((problema) => problema.mensagem)
      .join(" ");
    throw new Error(
      `RESPOSTA_IA_ESTRUTURALMENTE_INVALIDA: ${detalhes}`
    );
  }

  substituirTextoSaida(resposta, JSON.stringify(plano));
  return plano;
}

/**
 * A solicitacao original passa primeiro por uma IA curta que gera um briefing
 * estruturado e fiel. O Prompt Mestre recebe esse briefing, os recursos e o
 * schema em uma unica chamada principal. Nao existe revisao ou reparo semantico
 * posterior da estrutura produzida.
 */
function instalarSdkUmaChamada() {
  if (sdkInstalado) return;
  sdkInstalado = true;

  const clienteInstrumentacao = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "instrumentacao",
  });
  const prototipo = Object.getPrototypeOf(
    clienteInstrumentacao.responses
  ) as PrototipoResponses;
  const criarOriginal = prototipo.create;

  prototipo.create = async function criarRespostaUnica(
    this: PrototipoResponses,
    body: Record<string, unknown>,
    options?: unknown
  ) {
    const contexto = contextoAssistenteFluxos.getStore();
    if (!contexto?.ativo) return criarOriginal.call(this, body, options);

    const briefing = await obterBriefingEstruturado(contexto);
    const instrucaoTratada = briefing
      ? montarInstrucaoTratada(briefing)
      : contexto.instrucaoCompleta;
    const contextoTratado: ContextoAssistenteFluxos = {
      ...contexto,
      instrucaoCompleta: instrucaoTratada,
    };

    const payload = prepararPayloadAssistente({
      body,
      limite: LIMITE_SAIDA_ASSISTENTE,
      contexto: contextoTratado,
    });

    payload.model = MODELO_ASSISTENTE_FLUXOS;
    payload.reasoning = {
      ...objeto(payload.reasoning),
      effort: ESFORCO_RACIOCINIO,
    };
    payload.prompt_cache_key = VERSAO_PROMPT_MESTRE_FLUXOS;
    payload.background = true;
    payload.store = true;

    await registrarDiagnosticoIa({
      contexto,
      fase: "geracao_prompt_mestre_request",
      payload,
      metadados: {
        estrategia:
          "briefing_estruturado_mais_prompt_mestre_um_json_final_background",
        modelo: MODELO_ASSISTENTE_FLUXOS,
        reasoning_effort: ESFORCO_RACIOCINIO,
        max_output_tokens: LIMITE_SAIDA_ASSISTENTE,
        prompt_mestre_versao: VERSAO_PROMPT_MESTRE_FLUXOS,
        briefing_estruturado: Boolean(briefing),
        briefing_versao: briefing ? VERSAO_BRIEFING_FLUXOS : null,
        instrucao_original_caracteres: contexto.instrucaoCompleta.length,
        instrucao_tratada_caracteres: instrucaoTratada.length,
        background: true,
        planejamento_adicional_no_sistema: false,
        revisao_adicional_no_sistema: false,
        reparo_semantico_no_sistema: false,
      },
    });

    const prazoFinal = Date.now() + LIMITE_TOTAL_GERACAO_MS;
    let resposta: RespostaOpenAI;

    try {
      const respostaInicial = await criarOriginal.call(this, payload, {
        ...objeto(options),
        timeout: LIMITE_REQUISICAO_OPENAI_MS,
        maxRetries: 0,
        signal: AbortSignal.timeout(LIMITE_REQUISICAO_OPENAI_MS),
      });

      await registrarDiagnosticoIa({
        contexto,
        fase: "geracao_prompt_mestre_background_iniciada",
        resposta: respostaInicial,
        metadados: {
          response_id: respostaInicial.id || null,
          status: respostaInicial.status || null,
          background: true,
          briefing_estruturado: Boolean(briefing),
        },
      });

      resposta = await aguardarRespostaBackground({
        responses: this,
        respostaInicial,
        prazoFinal,
      });
    } catch (error) {
      const erro = erroFoiAbortado(error)
        ? new Error(
            "GERACAO_IA_TIMEOUT: a comunicação com a OpenAI excedeu o tempo de uma das consultas."
          )
        : error;

      await registrarDiagnosticoIa({
        contexto,
        fase: "geracao_prompt_mestre_falhou",
        problemas: [mensagemErro(erro)],
        metadados: {
          modelo: MODELO_ASSISTENTE_FLUXOS,
          background: true,
          briefing_estruturado: Boolean(briefing),
        },
      });

      throw erro;
    }

    let plano: ObjetoJson | null = null;
    let erroEstrutural: string | null = null;

    try {
      plano = normalizarRespostaFinal(resposta);
    } catch (error) {
      erroEstrutural =
        error instanceof Error ? error.message : "Falha estrutural desconhecida.";
    }

    await registrarDiagnosticoIa({
      contexto,
      fase: erroEstrutural
        ? "geracao_prompt_mestre_estrutura_invalida"
        : "geracao_prompt_mestre_response",
      resposta,
      problemas: erroEstrutural ? [erroEstrutural] : [],
      metadados: {
        estrategia: "ia_entrega_fluxo_final_sem_reparo_background",
        modelo: MODELO_ASSISTENTE_FLUXOS,
        prompt_mestre_versao: VERSAO_PROMPT_MESTRE_FLUXOS,
        briefing_estruturado: Boolean(briefing),
        briefing_versao: briefing ? VERSAO_BRIEFING_FLUXOS : null,
        response_id: resposta.id || null,
        background: true,
        validacao_aplicada: "json_schema_refs_ids",
        validacao_semantica: false,
        reparo_semantico: false,
        etapas: Array.isArray(plano?.etapas) ? plano.etapas.length : null,
        rotas: Array.isArray(plano?.rotas) ? plano.rotas.length : null,
      },
    });

    if (erroEstrutural) throw new Error(erroEstrutural);
    return resposta;
  };
}

async function carregarModuloOriginal() {
  instalarSdkUmaChamada();
  moduloOriginalPromise ||= import("./route-original");
  return moduloOriginalPromise;
}

function respostaErroConhecido(mensagem: string) {
  if (mensagem.includes("RESPOSTA_IA_ESTRUTURALMENTE_INVALIDA")) {
    return Response.json(
      {
        ok: false,
        code: "RESPOSTA_IA_ESTRUTURALMENTE_INVALIDA",
        error: mensagem.replace(
          /^.*RESPOSTA_IA_ESTRUTURALMENTE_INVALIDA:\s*/,
          ""
        ),
      },
      { status: 422 }
    );
  }

  if (mensagem.includes("GERACAO_IA_TIMEOUT")) {
    return Response.json(
      {
        ok: false,
        code: "GERACAO_IA_TIMEOUT",
        error:
          "A IA ainda não concluiu o fluxo dentro do tempo seguro do servidor. O pedido já foi tratado em um briefing estruturado, mas a geração principal continuou processando além do limite. Nenhum fluxo incompleto foi salvo.",
      },
      { status: 504 }
    );
  }

  if (mensagem.includes("GERACAO_IA_FALHOU")) {
    return Response.json(
      {
        ok: false,
        code: "GERACAO_IA_FALHOU",
        error: mensagem.replace(/^.*GERACAO_IA_FALHOU:\s*/, ""),
      },
      { status: 502 }
    );
  }

  return null;
}

export async function executarAssistente(request: Request) {
  const body = objeto(await request.clone().json().catch(() => ({})));
  const contextoRequisicao = await carregarContextoAssistente(body);
  const moduloOriginal = await carregarModuloOriginal();

  return contextoAssistenteFluxos.run(
    contextoRequisicao.contexto,
    async () => {
      const response = await moduloOriginal.POST(request);

      await persistirInstrucaoCompleta({
        response,
        instrucaoCompleta: contextoRequisicao.contexto.instrucaoCompleta,
        empresaId: contextoRequisicao.empresaId,
        usuarioId: contextoRequisicao.usuarioId,
      });

      if (response.status !== 500) return response;

      const corpo = await response
        .clone()
        .json()
        .catch(() => null as ObjetoJson | null);
      const mensagem = String(corpo?.error || "");
      return respostaErroConhecido(mensagem) || response;
    }
  );
}
