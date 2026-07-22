import type { ContextoAssistenteFluxos } from "./route-contexto-ia.ts";
import {
  extrairTextoSaida,
  substituirTextoSaida,
  type RespostaOpenAI,
} from "./route-validacao-ia.ts";

type ObjetoJson = Record<string, unknown>;

export type RequisitosNormalizadosFluxo = {
  negocio: {
    segmento: string;
    empresa: string;
    publico: string;
    oferta: string;
  };
  comunicacao: {
    tom: string;
    linguagem: string;
    termos_relevantes: string[];
    restricoes: string[];
  };
  objetivo_principal: string;
  conversao_esperada: string;
  inicio: string[];
  ramos: Array<{
    id: string;
    entrada: string;
    objetivo: string;
    passos: string[];
    saidas: string[];
  }>;
  finais_permitidos: string[];
  adaptacoes_crm: string[];
  ambiguidades_essenciais: string[];
};

const requisitosSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    negocio: {
      type: "object",
      additionalProperties: false,
      properties: {
        segmento: { type: "string" },
        empresa: { type: "string" },
        publico: { type: "string" },
        oferta: { type: "string" },
      },
      required: ["segmento", "empresa", "publico", "oferta"],
    },
    comunicacao: {
      type: "object",
      additionalProperties: false,
      properties: {
        tom: { type: "string" },
        linguagem: { type: "string" },
        termos_relevantes: { type: "array", items: { type: "string" } },
        restricoes: { type: "array", items: { type: "string" } },
      },
      required: ["tom", "linguagem", "termos_relevantes", "restricoes"],
    },
    objetivo_principal: { type: "string" },
    conversao_esperada: { type: "string" },
    inicio: { type: "array", items: { type: "string" } },
    ramos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          entrada: { type: "string" },
          objetivo: { type: "string" },
          passos: { type: "array", items: { type: "string" } },
          saidas: { type: "array", items: { type: "string" } },
        },
        required: ["id", "entrada", "objetivo", "passos", "saidas"],
      },
    },
    finais_permitidos: { type: "array", items: { type: "string" } },
    adaptacoes_crm: { type: "array", items: { type: "string" } },
    ambiguidades_essenciais: { type: "array", items: { type: "string" } },
  },
  required: [
    "negocio",
    "comunicacao",
    "objetivo_principal",
    "conversao_esperada",
    "inicio",
    "ramos",
    "finais_permitidos",
    "adaptacoes_crm",
    "ambiguidades_essenciais",
  ],
};

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

function localizarMensagem(payload: ObjetoJson, role: "system" | "user") {
  if (!Array.isArray(payload.input)) return null;
  return (
    payload.input.find((item) => objeto(item).role === role) as
      | ObjetoJson
      | undefined
  ) || null;
}

function contextoUsuario(payload: ObjetoJson) {
  const mensagem = localizarMensagem(payload, "user");
  if (!mensagem || typeof mensagem.content !== "string") return {};

  try {
    return objeto(JSON.parse(mensagem.content));
  } catch {
    return {};
  }
}

export function devePlanejarJornada(
  payload: ObjetoJson,
  contexto: ContextoAssistenteFluxos
) {
  if (contexto.modo !== "criar_fluxo") return false;
  const conteudo = contextoUsuario(payload);

  return (
    typeof conteudo.modo === "string" &&
    typeof conteudo.instrucao === "string" &&
    !Object.prototype.hasOwnProperty.call(conteudo, "plano_invalido") &&
    !Object.prototype.hasOwnProperty.call(conteudo, "plano_provisorio") &&
    !Object.prototype.hasOwnProperty.call(conteudo, "contexto_original")
  );
}

export function criarPayloadPlanejamento(params: {
  body: ObjetoJson;
  contexto: ContextoAssistenteFluxos;
}) {
  const original = contextoUsuario(params.body);

  return {
    model: params.body.model,
    input: [
      {
        role: "system",
        content: `
Voce e analista de processos, jornada do cliente e automacao de atendimento.
Antes de desenhar blocos, converta o pedido livre em um contrato logico compativel com o CRM.

Regras obrigatorias:
- Preserve todos os requisitos e fatos explicitos do pedido.
- Adapte incompatibilidades para os tipos e limites tecnicos recebidos, sem omitir caminhos.
- Organize a jornada em inicio, meio e fim.
- O inicio deve acolher, contextualizar a empresa e identificar a intencao.
- Cada escolha deve abrir um ramo coerente que desenvolva o objetivo daquela escolha.
- Cada ramo deve terminar em objetivo concluido, transferencia, encerramento ou retorno consciente a um menu identificado.
- Nunca use "voltar" sem informar o destino exato.
- Diferencie agendamento automatico pelo CRM de coleta manual para atendimento humano.
- Registre ambiguidades somente quando mudarem materialmente a jornada; nao pergunte por dados que a interface confirma.
- Identifique segmento, publico, oferta, termos naturais e restricoes de comunicacao.
- Nao escreva as mensagens finais e nao crie blocos ou rotas nesta etapa.
Retorne somente JSON conforme o schema.
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify({
          pedido: params.contexto.instrucaoCompleta || original.instrucao,
          empresa: original.empresa || null,
          recursos: {
            ...objeto(original.recursos),
            agendas: params.contexto.agendas,
          },
        }),
      },
    ],
    max_output_tokens: 5000,
    text: {
      format: {
        type: "json_schema",
        name: "requisitos_normalizados_fluxo",
        strict: true,
        schema: requisitosSchema,
      },
    },
  };
}

export function extrairRequisitosNormalizados(resposta: RespostaOpenAI) {
  try {
    const requisitos = JSON.parse(extrairTextoSaida(resposta));
    return requisitos && typeof requisitos === "object" && !Array.isArray(requisitos)
      ? (requisitos as RequisitosNormalizadosFluxo)
      : null;
  } catch {
    return null;
  }
}

export function injetarPlanejamentoNoPayload(
  body: ObjetoJson,
  requisitos: RequisitosNormalizadosFluxo
) {
  const payload = structuredClone(body);
  const sistema = localizarMensagem(payload, "system");
  const usuario = localizarMensagem(payload, "user");

  if (sistema && typeof sistema.content === "string") {
    sistema.content = `${sistema.content}\n\n${[
      "Construa o fluxo a partir dos requisitos normalizados abaixo.",
      "Trate-os como contrato da jornada: nao omita ramos e nao altere o objetivo de uma escolha.",
      "Primeiro transforme inicio, ramos e finais em etapas e rotas; os textos devem servir a funcao definida para cada ponto.",
      "Toda rota deve avancar de forma semanticamente coerente ate conversao, transferencia, retorno consciente ou encerramento.",
    ].join("\n")}`;
  }

  if (usuario && typeof usuario.content === "string") {
    try {
      const conteudo = objeto(JSON.parse(usuario.content));
      conteudo.requisitos_normalizados = requisitos;
      usuario.content = JSON.stringify(conteudo);
    } catch {
      // O payload original continua utilizavel quando o contexto nao for JSON.
    }
  }

  return payload;
}

const mensagensSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mensagens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ref: { type: "string" },
          mensagem: { type: "string" },
        },
        required: ["ref", "mensagem"],
      },
    },
  },
  required: ["mensagens"],
};

export function criarPayloadOtimizacaoTextos(params: {
  body: ObjetoJson;
  plano: ObjetoJson;
  requisitos: RequisitosNormalizadosFluxo;
}) {
  const etapas = Array.isArray(params.plano.etapas)
    ? params.plano.etapas
        .map(objeto)
        .filter((etapa) => typeof etapa.mensagem === "string" && etapa.mensagem)
        .map((etapa) => ({
          ref: etapa.ref,
          tipo: etapa.tipo,
          titulo: etapa.titulo,
          mensagem_atual: etapa.mensagem,
        }))
    : [];

  return {
    model: params.body.model,
    input: [
      {
        role: "system",
        content: `
Voce e copywriter de conversao especializado em atendimento humano por WhatsApp.
Revise somente os textos das etapas recebidas. Nao crie, remova, renomeie ou reorganize etapas, opcoes ou rotas.

Objetivos da escrita:
- cumprir exatamente a finalidade comercial e logica de cada etapa;
- comunicar com clareza, objetividade e atencao aos detalhes;
- soar natural e um pouco espontanea, como uma pessoa atenciosa, sem parecer texto robotico;
- usar termos, nivel de formalidade e linguagem proprios do segmento e do publico;
- conduzir para a proxima acao com CTA contextual, sem pressao artificial;
- priorizar maior conversao sem promessas enganosas, urgencia falsa ou alteracao de fatos;
- preservar restricoes, enderecos, horarios, valores, nomes, variaveis {{chave}} e informacoes do pedido;
- manter mensagens curtas e confortaveis para leitura no WhatsApp;
- evitar repeticoes, exageros, frases genericas e excesso de emojis.

Retorne uma mensagem para cada ref recebida e somente JSON conforme o schema.
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify({
          requisitos: params.requisitos,
          etapas,
        }),
      },
    ],
    max_output_tokens: Math.min(12000, Math.max(2500, etapas.length * 220)),
    text: {
      format: {
        type: "json_schema",
        name: "mensagens_otimizadas_fluxo",
        strict: true,
        schema: mensagensSchema,
      },
    },
  };
}

export function aplicarTextosOtimizados(
  respostaPlano: RespostaOpenAI,
  respostaTextos: RespostaOpenAI
) {
  try {
    const plano = objeto(JSON.parse(extrairTextoSaida(respostaPlano)));
    const revisao = objeto(JSON.parse(extrairTextoSaida(respostaTextos)));
    const mensagens = new Map(
      (Array.isArray(revisao.mensagens) ? revisao.mensagens : [])
        .map(objeto)
        .filter(
          (item) =>
            typeof item.ref === "string" &&
            typeof item.mensagem === "string" &&
            item.mensagem.trim()
        )
        .map((item) => [String(item.ref), String(item.mensagem).trim()])
    );

    if (!Array.isArray(plano.etapas) || mensagens.size === 0) return respostaPlano;

    const variaveis = (mensagem: unknown) =>
      [...String(mensagem || "").matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)]
        .map((item) => item[1].trim())
        .sort();

    plano.etapas = plano.etapas.map((valor) => {
      const etapa = objeto(valor);
      const ref = String(etapa.ref || "");
      const revisada = mensagens.get(ref);

      if (!revisada) return etapa;
      if (
        JSON.stringify(variaveis(etapa.mensagem)) !==
        JSON.stringify(variaveis(revisada))
      ) {
        return etapa;
      }

      return { ...etapa, mensagem: revisada };
    });
    substituirTextoSaida(respostaPlano, JSON.stringify(plano));
  } catch {
    // Uma falha na revisao de copy nao invalida o grafo ja aprovado.
  }

  return respostaPlano;
}
