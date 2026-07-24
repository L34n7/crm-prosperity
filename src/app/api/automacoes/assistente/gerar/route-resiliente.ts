import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import OpenAI from "openai";

import { validarPlanoAssistenteEstrutural } from "@/lib/automacoes/assistente-fluxos-validacao-estrutural";
import {
  extrairUsoTokensIa,
  registrarUsoTokensIa,
  verificarSaldoTokensIa,
} from "@/lib/ia/tokens";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
type ModuloOriginal = typeof import("./route-original");

type JobAssincronoRow = {
  id: string;
  fase: string;
  response_id: string | null;
  payload_json: unknown;
  resposta_json: unknown;
  problemas_json: unknown;
  metadados_json: unknown;
  created_at: string;
};

const supabaseAdmin = getSupabaseAdmin();
const contextoAssistenteFluxos =
  new AsyncLocalStorage<ContextoAssistenteFluxos>();
const briefingPorContexto = new WeakMap<
  ContextoAssistenteFluxos,
  Promise<ObjetoJson | null>
>();
const corpoOriginalPorContexto = new WeakMap<
  ContextoAssistenteFluxos,
  ObjetoJson
>();
const respostaProntaPorContexto = new WeakMap<
  ContextoAssistenteFluxos,
  RespostaOpenAI
>();

let sdkInstalado = false;
let moduloOriginalPromise: Promise<ModuloOriginal> | null = null;

const MODELO_ASSISTENTE_FLUXOS =
  process.env.OPENAI_ASSISTENTE_FLUXOS_MODEL || "gpt-5.5";
const MODELO_BRIEFING_FLUXOS =
  process.env.OPENAI_ASSISTENTE_FLUXOS_BRIEFING_MODEL || "gpt-5.4-mini";
const VERSAO_BRIEFING_FLUXOS =
  "crm-prosperity-briefing-estruturado-v2-2026-07-24";

const ESFORCO_RACIOCINIO = (() => {
  const informado = String(
    process.env.OPENAI_ASSISTENTE_FLUXOS_REASONING_EFFORT || "low"
  ).toLowerCase();
  return ["none", "low", "medium", "high", "xhigh"].includes(informado)
    ? informado
    : "low";
})();

const LIMITE_SAIDA_ASSISTENTE = (() => {
  const configurado = Number(
    process.env.OPENAI_ASSISTENTE_FLUXOS_MAX_OUTPUT_TOKENS || 18000
  );
  if (!Number.isFinite(configurado)) return 18000;
  return Math.max(8000, Math.min(28000, Math.floor(configurado)));
})();

const LIMITE_TOTAL_GERACAO_SINCRONA_MS = 220_000;
const LIMITE_REQUISICAO_OPENAI_MS = 45_000;
const LIMITE_BRIEFING_MS = 25_000;
const LIMITE_SAIDA_BRIEFING = 1_800;
const INTERVALO_CONSULTA_INICIAL_MS = 1_500;
const INTERVALO_CONSULTA_MAXIMO_MS = 6_000;
const FASE_JOB_AGUARDANDO = "geracao_assincrona_aguardando";
const FASE_JOB_MATERIALIZANDO = "geracao_assincrona_materializando";
const FASE_JOB_CONCLUIDO = "geracao_assincrona_concluida";
const FASE_JOB_FALHOU = "geracao_assincrona_falhou";

const SCHEMA_BRIEFING_FLUXOS = {
  type: "object",
  additionalProperties: false,
  properties: {
    titulo: { type: "string" },
    objetivo: { type: "string" },
    publico: { type: "string" },
    tom_de_voz: { type: "array", items: { type: "string" } },
    menu_principal: { type: "array", items: { type: "string" } },
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
          acoes: { type: "array", items: { type: "string" } },
        },
        required: ["nome", "categoria", "conteudos_obrigatorios", "acoes"],
      },
    },
    jornadas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nome: { type: "string" },
          etapas: { type: "array", items: { type: "string" } },
          saidas: { type: "array", items: { type: "string" } },
        },
        required: ["nome", "etapas", "saidas"],
      },
    },
    faq: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          contexto: { type: "string" },
          perguntas: { type: "array", items: { type: "string" } },
        },
        required: ["contexto", "perguntas"],
      },
    },
    dados_a_capturar: { type: "array", items: { type: "string" } },
    agendamento: {
      type: "object",
      additionalProperties: false,
      properties: {
        modo: {
          type: "string",
          enum: ["nao_solicitado", "manual", "automatico"],
        },
        dados: { type: "array", items: { type: "string" } },
        regra_confirmacao: { type: "string" },
      },
      required: ["modo", "dados", "regra_confirmacao"],
    },
    recursos_necessarios: {
      type: "object",
      additionalProperties: false,
      properties: {
        midias: { type: "array", items: { type: "string" } },
        transferencia_humana: { type: "boolean" },
        agenda_crm: { type: "boolean" },
        urls: { type: "array", items: { type: "string" } },
        setores: { type: "array", items: { type: "string" } },
      },
      required: [
        "midias",
        "transferencia_humana",
        "agenda_crm",
        "urls",
        "setores",
      ],
    },
    fatos_literais: {
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
    regras_obrigatorias: { type: "array", items: { type: "string" } },
    proibicoes: { type: "array", items: { type: "string" } },
    requisitos_pendentes: { type: "array", items: { type: "string" } },
  },
  required: [
    "titulo",
    "objetivo",
    "publico",
    "tom_de_voz",
    "menu_principal",
    "itens_principais",
    "jornadas",
    "faq",
    "dados_a_capturar",
    "agendamento",
    "recursos_necessarios",
    "fatos_literais",
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

function limitarTexto(valor: unknown, limite: number) {
  return String(valor || "").replace(/\s+/g, " ").trim().slice(0, limite);
}

function listaTextos(
  valor: unknown,
  maxItens: number,
  maxCaracteres: number
) {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<string>();
  const resultado: string[] = [];

  for (const item of valor) {
    const texto = limitarTexto(item, maxCaracteres);
    const chave = texto.toLocaleLowerCase("pt-BR");
    if (!texto || vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push(texto);
    if (resultado.length >= maxItens) break;
  }

  return resultado;
}

function compactarBriefing(valor: unknown): ObjetoJson {
  const briefing = objeto(valor);
  const agendamento = objeto(briefing.agendamento);
  const recursos = objeto(briefing.recursos_necessarios);

  return {
    titulo: limitarTexto(briefing.titulo, 180),
    objetivo: limitarTexto(briefing.objetivo, 700),
    publico: limitarTexto(briefing.publico, 320),
    tom_de_voz: listaTextos(briefing.tom_de_voz, 8, 80),
    menu_principal: listaTextos(briefing.menu_principal, 24, 140),
    itens_principais: Array.isArray(briefing.itens_principais)
      ? briefing.itens_principais.slice(0, 24).map((item) => {
          const registro = objeto(item);
          return {
            nome: limitarTexto(registro.nome, 160),
            categoria: limitarTexto(registro.categoria, 100),
            conteudos_obrigatorios: listaTextos(
              registro.conteudos_obrigatorios,
              10,
              260
            ),
            acoes: listaTextos(registro.acoes, 8, 180),
          };
        })
      : [],
    jornadas: Array.isArray(briefing.jornadas)
      ? briefing.jornadas.slice(0, 24).map((item) => {
          const registro = objeto(item);
          return {
            nome: limitarTexto(registro.nome, 160),
            etapas: listaTextos(registro.etapas, 18, 220),
            saidas: listaTextos(registro.saidas, 10, 160),
          };
        })
      : [],
    faq: Array.isArray(briefing.faq)
      ? briefing.faq.slice(0, 20).map((item) => {
          const registro = objeto(item);
          return {
            contexto: limitarTexto(registro.contexto, 160),
            perguntas: listaTextos(registro.perguntas, 16, 220),
          };
        })
      : [],
    dados_a_capturar: listaTextos(briefing.dados_a_capturar, 20, 160),
    agendamento: {
      modo: ["manual", "automatico"].includes(String(agendamento.modo))
        ? String(agendamento.modo)
        : "nao_solicitado",
      dados: listaTextos(agendamento.dados, 16, 160),
      regra_confirmacao: limitarTexto(agendamento.regra_confirmacao, 320),
    },
    recursos_necessarios: {
      midias: listaTextos(recursos.midias, 16, 160),
      transferencia_humana: recursos.transferencia_humana === true,
      agenda_crm: recursos.agenda_crm === true,
      urls: listaTextos(recursos.urls, 16, 500),
      setores: listaTextos(recursos.setores, 16, 160),
    },
    fatos_literais: Array.isArray(briefing.fatos_literais)
      ? briefing.fatos_literais.slice(0, 24).map((item) => {
          const registro = objeto(item);
          return {
            rotulo: limitarTexto(registro.rotulo, 120),
            texto: limitarTexto(registro.texto, 700),
          };
        })
      : [],
    regras_obrigatorias: listaTextos(
      briefing.regras_obrigatorias,
      30,
      260
    ),
    proibicoes: listaTextos(briefing.proibicoes, 24, 220),
    requisitos_pendentes: listaTextos(
      briefing.requisitos_pendentes,
      12,
      220
    ),
  };
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
    tipo_entrada: "briefing_estruturado",
    versao: VERSAO_BRIEFING_FLUXOS,
    regra:
      "Este briefing e a representacao fiel e compacta do pedido. Use todos os campos, preserve fatos literais, nao resuma novamente, nao omita itens e nao invente informacoes ausentes.",
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
      objetivo: "tratar_e_compactar_solicitacao_antes_da_geracao",
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
              text: `Voce e um analista de requisitos do CRM Prosperity.
Transforme o pedido em um briefing estruturado, fiel e compacto.

REGRAS
- Nao crie blocos, conexoes ou o fluxo.
- Preserve nomes, enderecos, horarios, URLs, textos literais e opcoes.
- Nao invente precos, servicos, recursos, setores, agendas ou midias.
- Distinga agendamento manual de agenda automatica do CRM.
- Registre menus, jornadas, FAQ, capturas, transferencia, midias, regras e proibicoes.
- Nao repita a mesma informacao em campos diferentes.
- Use frases curtas e objetivas.
- O JSON completo deve ter preferencialmente menos de 6.000 caracteres.
- Responda somente no schema fornecido.`,
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
    briefing = compactarBriefing(JSON.parse(texto));
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
        "GERACAO_IA_FALHOU: a OpenAI iniciou a geracao sem retornar o identificador da resposta."
      );
    }

    const restante = params.prazoFinal - Date.now();
    if (restante <= intervalo + 2_000) {
      throw new Error(
        `GERACAO_IA_TIMEOUT: a geracao continuou em processamento alem do tempo seguro do servidor. Resposta OpenAI: ${resposta.id}.`
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
    throw new Error(`GERACAO_IA_FALHOU: ${detalheFalhaResposta(resposta)}.`);
  }

  return resposta;
}

function respostaPendente(jobId: string, status: unknown) {
  const emFila = String(status || "") === "queued";
  return Response.json(
    {
      ok: true,
      code: "GERACAO_IA_EM_PROCESSAMENTO",
      proposta_id: jobId,
      sessao_id: jobId,
      modo: "criar_fluxo",
      fase: "coletando",
      mensagem: emFila
        ? "O briefing foi concluido e a geracao do fluxo entrou na fila da IA. Aguarde alguns instantes e use Atualizar opcoes para consultar a mesma geracao."
        : "A IA esta construindo e revisando o fluxo completo. Aguarde alguns instantes e use Atualizar opcoes para consultar a mesma geracao.",
      pergunta: {
        id: "geracao_assincrona:status",
        etapa_ref: "geracao_assincrona",
        campo: "clarificacao",
        tipo: "texto",
        mensagem: "A geracao principal ainda esta em andamento.",
        ajuda:
          "Atualizar opcoes apenas consulta o mesmo response_id. Nenhuma nova geracao e iniciada e nenhum fluxo incompleto e salvo.",
        obrigatoria: false,
        bloqueada: true,
        valor_sugerido: null,
        opcoes: [],
      },
      progresso: { respondidas: 0, total: 1 },
      historico: [],
      resumo: "Geracao em andamento",
      materializado: false,
      plano: { etapas: [] },
      avisos: [],
    },
    { status: 202 }
  );
}

async function criarJobAssincrono(params: {
  contexto: ContextoAssistenteFluxos;
  bodyOriginal: ObjetoJson;
  briefing: ObjetoJson | null;
  instrucaoTratada: string;
  respostaInicial: RespostaOpenAI;
}) {
  if (!params.contexto.empresaId || !params.contexto.usuarioId) {
    throw new Error(
      "GERACAO_IA_FALHOU: nao foi possivel identificar a empresa ou o usuario da geracao."
    );
  }

  const jobId = randomUUID();
  const agora = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("automacao_assistente_ia_diagnosticos")
    .insert({
      id: jobId,
      empresa_id: params.contexto.empresaId,
      usuario_id: params.contexto.usuarioId,
      sessao_id: jobId,
      fase: FASE_JOB_AGUARDANDO,
      response_id: params.respostaInicial.id || null,
      payload_json: {
        body_original: params.bodyOriginal,
        briefing: params.briefing,
        instrucao_tratada: params.instrucaoTratada,
      },
      resposta_json: null,
      problemas_json: null,
      metadados_json: {
        modo: params.contexto.modo,
        modelo: MODELO_ASSISTENTE_FLUXOS,
        openai_status: params.respostaInicial.status || "queued",
        criado_em: agora,
        ultima_consulta_em: agora,
        briefing_estruturado: Boolean(params.briefing),
        briefing_versao: params.briefing ? VERSAO_BRIEFING_FLUXOS : null,
        prompt_mestre_versao: VERSAO_PROMPT_MESTRE_FLUXOS,
      },
    });

  if (error) {
    throw new Error(
      `GERACAO_IA_FALHOU: nao foi possivel registrar a geracao assincrona: ${error.message}`
    );
  }

  return jobId;
}

async function buscarJobAssincrono(params: {
  jobId: string;
  empresaId: string | null;
  usuarioId: string | null;
}) {
  if (!params.empresaId || !params.usuarioId) return null;

  const { data, error } = await supabaseAdmin
    .from("automacao_assistente_ia_diagnosticos")
    .select(
      "id, fase, response_id, payload_json, resposta_json, problemas_json, metadados_json, created_at"
    )
    .eq("id", params.jobId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .maybeSingle();

  if (error) {
    throw new Error(`Nao foi possivel consultar a geracao: ${error.message}`);
  }

  return (data || null) as JobAssincronoRow | null;
}

async function marcarJobFalhou(params: {
  job: JobAssincronoRow;
  mensagem: string;
}) {
  const metadados = objeto(params.job.metadados_json);
  await supabaseAdmin
    .from("automacao_assistente_ia_diagnosticos")
    .update({
      fase: FASE_JOB_FALHOU,
      problemas_json: [params.mensagem],
      metadados_json: {
        ...metadados,
        falhou_em: new Date().toISOString(),
      },
    })
    .eq("id", params.job.id);
}

function respostaJobFalhou(job: JobAssincronoRow) {
  const problemas = Array.isArray(job.problemas_json)
    ? job.problemas_json
    : [];
  return Response.json(
    {
      ok: false,
      code: "GERACAO_IA_FALHOU",
      error:
        limitarTexto(problemas[0], 1200) ||
        "A geracao assincrona foi encerrada sem criar o fluxo.",
    },
    { status: 502 }
  );
}

async function finalizarJobAssincrono(params: {
  request: Request;
  job: JobAssincronoRow;
  respostaOpenAI: RespostaOpenAI;
  moduloOriginal: ModuloOriginal;
}) {
  const metadados = objeto(params.job.metadados_json);
  const agora = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("automacao_assistente_ia_diagnosticos")
    .update({
      fase: FASE_JOB_MATERIALIZANDO,
      metadados_json: {
        ...metadados,
        openai_status: params.respostaOpenAI.status || "completed",
        materializando_em: agora,
        ultima_consulta_em: agora,
      },
    })
    .eq("id", params.job.id)
    .eq("fase", FASE_JOB_AGUARDANDO)
    .select("id")
    .maybeSingle();

  if (claimError) {
    throw new Error(
      `Nao foi possivel reservar a materializacao: ${claimError.message}`
    );
  }

  if (!claimed) return respostaPendente(params.job.id, "in_progress");

  const payload = objeto(params.job.payload_json);
  const bodyOriginal = objeto(payload.body_original);

  if (!bodyOriginal.instrucao) {
    const mensagem =
      "GERACAO_IA_FALHOU: o pedido original nao foi encontrado para concluir a geracao.";
    await marcarJobFalhou({ job: params.job, mensagem });
    return Response.json(
      { ok: false, code: "GERACAO_IA_FALHOU", error: mensagem },
      { status: 502 }
    );
  }

  const contextoOriginal = await carregarContextoAssistente(bodyOriginal);
  const contexto = contextoOriginal.contexto;
  corpoOriginalPorContexto.set(contexto, bodyOriginal);
  respostaProntaPorContexto.set(contexto, params.respostaOpenAI);

  const requestOriginal = new Request(params.request.url, {
    method: "POST",
    headers: params.request.headers,
    body: JSON.stringify(bodyOriginal),
  });

  let response: Response;
  try {
    response = await contextoAssistenteFluxos.run(contexto, () =>
      params.moduloOriginal.POST(requestOriginal)
    );
    await persistirInstrucaoCompleta({
      response,
      instrucaoCompleta: contexto.instrucaoCompleta,
      empresaId: contextoOriginal.empresaId,
      usuarioId: contextoOriginal.usuarioId,
    });
  } catch (error) {
    const mensagem = mensagemErro(error);
    await marcarJobFalhou({ job: params.job, mensagem });
    throw error;
  }

  const corpoFinal = objeto(await response.clone().json().catch(() => ({})));

  if (!response.ok || corpoFinal.ok === false) {
    const mensagem = limitarTexto(
      corpoFinal.error || `A materializacao retornou HTTP ${response.status}.`,
      1600
    );
    await marcarJobFalhou({ job: params.job, mensagem });
    return response;
  }

  const { error: updateError } = await supabaseAdmin
    .from("automacao_assistente_ia_diagnosticos")
    .update({
      fase: FASE_JOB_CONCLUIDO,
      resposta_json: corpoFinal,
      problemas_json: null,
      metadados_json: {
        ...metadados,
        openai_status: params.respostaOpenAI.status || "completed",
        concluido_em: new Date().toISOString(),
        sessao_final_id: corpoFinal.sessao_id || null,
        fluxo_criado_id: objeto(corpoFinal.fluxo_criado).id || null,
      },
    })
    .eq("id", params.job.id);

  if (updateError) {
    console.warn(
      "[assistente-fluxos] fluxo concluido, mas job assincrono nao atualizado",
      updateError
    );
  }

  return response;
}

async function processarConsultaJobAssincrono(params: {
  request: Request;
  body: ObjetoJson;
  contextoRequisicao: Awaited<ReturnType<typeof carregarContextoAssistente>>;
  moduloOriginal: ModuloOriginal;
}) {
  const acao = limitarTexto(params.body.acao, 40);
  const modo = limitarTexto(params.body.modo, 80) || "criar_fluxo";
  const jobId = limitarTexto(
    params.body.sessao_id || params.body.sessaoId,
    120
  );

  if (
    modo !== "criar_fluxo" ||
    !["retomar", "atualizar", "criar"].includes(acao) ||
    !jobId
  ) {
    return null;
  }

  const job = await buscarJobAssincrono({
    jobId,
    empresaId: params.contextoRequisicao.empresaId,
    usuarioId: params.contextoRequisicao.usuarioId,
  });

  if (!job) return null;
  if (job.fase === FASE_JOB_CONCLUIDO) {
    return Response.json(objeto(job.resposta_json));
  }
  if (job.fase === FASE_JOB_FALHOU) return respostaJobFalhou(job);
  if (job.fase === FASE_JOB_MATERIALIZANDO) {
    return respostaPendente(job.id, "in_progress");
  }
  if (!job.response_id || !process.env.OPENAI_API_KEY) {
    const mensagem =
      "GERACAO_IA_FALHOU: o identificador da resposta da OpenAI nao esta disponivel.";
    await marcarJobFalhou({ job, mensagem });
    return respostaJobFalhou({
      ...job,
      problemas_json: [mensagem],
      fase: FASE_JOB_FALHOU,
    });
  }

  const cliente = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let resposta: RespostaOpenAI;

  try {
    resposta = (await cliente.responses.retrieve(job.response_id, {
      timeout: LIMITE_REQUISICAO_OPENAI_MS,
      maxRetries: 1,
      signal: AbortSignal.timeout(LIMITE_REQUISICAO_OPENAI_MS),
    })) as unknown as RespostaOpenAI;
  } catch (error) {
    if (erroFoiAbortado(error)) {
      return respostaPendente(job.id, objeto(job.metadados_json).openai_status);
    }

    const mensagem = `GERACAO_IA_FALHOU: ${mensagemErro(error)}`;
    await marcarJobFalhou({ job, mensagem });
    return Response.json(
      { ok: false, code: "GERACAO_IA_FALHOU", error: mensagem },
      { status: 502 }
    );
  }

  const metadados = objeto(job.metadados_json);
  await supabaseAdmin
    .from("automacao_assistente_ia_diagnosticos")
    .update({
      metadados_json: {
        ...metadados,
        openai_status: resposta.status || "desconhecido",
        ultima_consulta_em: new Date().toISOString(),
      },
    })
    .eq("id", job.id)
    .eq("fase", FASE_JOB_AGUARDANDO);

  if (statusEmProcessamento(resposta.status)) {
    return respostaPendente(job.id, resposta.status);
  }

  if (!statusConcluido(resposta.status)) {
    const mensagem = `GERACAO_IA_FALHOU: ${detalheFalhaResposta(resposta)}.`;
    await marcarJobFalhou({ job, mensagem });
    return Response.json(
      { ok: false, code: "GERACAO_IA_FALHOU", error: mensagem },
      { status: 502 }
    );
  }

  return finalizarJobAssincrono({
    request: params.request,
    job,
    respostaOpenAI: resposta,
    moduloOriginal: params.moduloOriginal,
  });
}

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

    const respostaPronta = respostaProntaPorContexto.get(contexto);
    if (respostaPronta) {
      const plano = normalizarRespostaFinal(respostaPronta);
      await registrarDiagnosticoIa({
        contexto,
        fase: "geracao_prompt_mestre_response",
        resposta: respostaPronta,
        metadados: {
          estrategia: "retomar_response_id_e_materializar",
          modelo: MODELO_ASSISTENTE_FLUXOS,
          prompt_mestre_versao: VERSAO_PROMPT_MESTRE_FLUXOS,
          response_id: respostaPronta.id || null,
          background: true,
          validacao_aplicada: "json_schema_refs_ids",
          etapas: Array.isArray(plano.etapas) ? plano.etapas.length : null,
          rotas: Array.isArray(plano.rotas) ? plano.rotas.length : null,
        },
      });
      return respostaPronta;
    }

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
          "briefing_compacto_prompt_mestre_response_id_persistido",
        modelo: MODELO_ASSISTENTE_FLUXOS,
        reasoning_effort: ESFORCO_RACIOCINIO,
        max_output_tokens: LIMITE_SAIDA_ASSISTENTE,
        prompt_mestre_versao: VERSAO_PROMPT_MESTRE_FLUXOS,
        briefing_estruturado: Boolean(briefing),
        briefing_versao: briefing ? VERSAO_BRIEFING_FLUXOS : null,
        instrucao_original_caracteres: contexto.instrucaoCompleta.length,
        instrucao_tratada_caracteres: instrucaoTratada.length,
        background: true,
        processamento_assincrono_real: contexto.modo === "criar_fluxo",
        revisao_adicional_no_sistema: false,
        reparo_semantico_no_sistema: false,
      },
    });

    const prazoFinal = Date.now() + LIMITE_TOTAL_GERACAO_SINCRONA_MS;
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

      const bodyOriginal = corpoOriginalPorContexto.get(contexto) || {};
      const acao = limitarTexto(bodyOriginal.acao, 40);

      if (
        contexto.modo === "criar_fluxo" &&
        acao === "preparar" &&
        statusEmProcessamento(respostaInicial.status)
      ) {
        const jobId = await criarJobAssincrono({
          contexto,
          bodyOriginal,
          briefing,
          instrucaoTratada,
          respostaInicial,
        });
        throw new Error(
          `GERACAO_IA_ASSINCRONA_INICIADA:${jobId}:${String(
            respostaInicial.status || "queued"
          )}`
        );
      }

      resposta = statusEmProcessamento(respostaInicial.status)
        ? await aguardarRespostaBackground({
            responses: this,
            respostaInicial,
            prazoFinal,
          })
        : respostaInicial;
    } catch (error) {
      const mensagem = mensagemErro(error);
      if (mensagem.includes("GERACAO_IA_ASSINCRONA_INICIADA")) throw error;

      const erro = erroFoiAbortado(error)
        ? new Error(
            "GERACAO_IA_TIMEOUT: a comunicacao com a OpenAI excedeu o tempo de uma das consultas."
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
      erroEstrutural = mensagemErro(error);
    }

    await registrarDiagnosticoIa({
      contexto,
      fase: erroEstrutural
        ? "geracao_prompt_mestre_estrutura_invalida"
        : "geracao_prompt_mestre_response",
      resposta,
      problemas: erroEstrutural ? [erroEstrutural] : [],
      metadados: {
        estrategia: "ia_entrega_fluxo_final_sem_reparo",
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
  const assincrona = mensagem.match(
    /GERACAO_IA_ASSINCRONA_INICIADA:([0-9a-f-]{36}):?([a-z_]+)?/i
  );
  if (assincrona) return respostaPendente(assincrona[1], assincrona[2]);

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
          "A geracao nao concluiu no tempo da operacao sincrona. Para criacao de fluxo completo, o sistema agora salva o response_id e permite continuar a mesma geracao sem reiniciar.",
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

  const respostaJob = await processarConsultaJobAssincrono({
    request,
    body,
    contextoRequisicao,
    moduloOriginal,
  });
  if (respostaJob) return respostaJob;

  corpoOriginalPorContexto.set(contextoRequisicao.contexto, body);

  return contextoAssistenteFluxos.run(
    contextoRequisicao.contexto,
    async () => {
      const response = await moduloOriginal.POST(request);

      if (response.status === 500) {
        const corpo = await response
          .clone()
          .json()
          .catch(() => null as ObjetoJson | null);
        const mensagem = String(corpo?.error || "");
        const conhecida = respostaErroConhecido(mensagem);
        if (conhecida) return conhecida;
      }

      await persistirInstrucaoCompleta({
        response,
        instrucaoCompleta: contextoRequisicao.contexto.instrucaoCompleta,
        empresaId: contextoRequisicao.empresaId,
        usuarioId: contextoRequisicao.usuarioId,
      });

      return response;
    }
  );
}
