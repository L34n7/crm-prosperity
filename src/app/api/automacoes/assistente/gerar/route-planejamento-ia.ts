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
  jornada: Array<{
    id: string;
    titulo: string;
    proposito: string;
    ordem_conteudo: string[];
    opcoes: Array<{
      texto: string;
      intencao: string;
      destino: string;
    }>;
    proximo: string | null;
  }>;
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
  criterios_qualidade: string[];
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
    jornada: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          titulo: { type: "string" },
          proposito: { type: "string" },
          ordem_conteudo: { type: "array", items: { type: "string" } },
          opcoes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                texto: { type: "string" },
                intencao: { type: "string" },
                destino: { type: "string" },
              },
              required: ["texto", "intencao", "destino"],
            },
          },
          proximo: { type: ["string", "null"] },
        },
        required: [
          "id",
          "titulo",
          "proposito",
          "ordem_conteudo",
          "opcoes",
          "proximo",
        ],
      },
    },
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
    criterios_qualidade: { type: "array", items: { type: "string" } },
  },
  required: [
    "negocio",
    "comunicacao",
    "objetivo_principal",
    "conversao_esperada",
    "inicio",
    "jornada",
    "ramos",
    "finais_permitidos",
    "adaptacoes_crm",
    "ambiguidades_essenciais",
    "criterios_qualidade",
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
  const pedido = String(
    params.contexto.instrucaoCompleta || original.instrucao || ""
  );

  return {
    model: params.body.model,
    input: [
      {
        role: "system",
        content: `
Voce e o planejador principal de experiencias conversacionais do CRM Prosperity.
Atue em conjunto como interpretador da intencao, especialista do nicho, arquiteto
conversacional e especialista em conversao. O JSON nao e o objetivo: ele apenas
registra a experiencia que voce projetou antes da implementacao tecnica.

Regras obrigatorias:
- Preserve todos os requisitos e fatos explicitos do pedido.
- Interprete pedidos incompletos, desorganizados ou contraditorios e reorganize-os sem perder a intencao original.
- Complete lacunas com boas praticas reais do segmento, usando vocabulario, jornada, objecoes e CTAs naturais daquele nicho.
- Adapte incompatibilidades para os tipos e limites tecnicos recebidos, sem omitir caminhos.
- Organize a jornada em inicio, meio e fim.
- O inicio deve acolher, contextualizar a empresa e identificar a intencao.
- Cada escolha deve abrir um ramo coerente que desenvolva o objetivo daquela escolha.
- Cada ramo deve terminar em objetivo concluido, transferencia, encerramento ou retorno consciente a um menu identificado.
- Para cada tela, defina proposito, ordem do conteudo e o que o cliente provavelmente desejara fazer depois.
- Para cada opcao, declare texto, intencao semantica e id conceitual do destino. Nunca escolha destinos por semelhanca de palavras.
- Nunca use "voltar ao menu" para um submenu. Use "Voltar", "Voltar ao procedimento" ou "Voltar ao Menu Principal" conforme o destino real.
- Diferencie agendamento automatico pelo CRM de coleta manual para atendimento humano.
- Padronize jornadas equivalentes: produtos, servicos, procedimentos, FAQs e menus semelhantes devem seguir estruturas semelhantes.
- Cada FAQ deve responder exclusivamente a pergunta escolhida. Dor, duracao, recorrencia, naturalidade, resultado e sessoes sao intencoes diferentes.
- Mantenha a leitura confortavel no WhatsApp: titulos curtos, frases curtas, listas, quebras de linha e emojis discretos.
- Reduza redundancias e CTAs repetidos. O CTA deve aparecer quando for o proximo passo natural, sem insistencia.
- Respeite terminais: transferencia e encerramento nao possuem continuacao.
- Registre ambiguidades somente quando mudarem materialmente a jornada; nao pergunte por dados que a interface confirma.
- Identifique segmento, publico, oferta, termos naturais e restricoes de comunicacao.
- Percorra mentalmente todos os caminhos e registre criterios de qualidade especificos para validar a experiencia final.
- Nao crie tipos de bloco, ids de banco, conexoes ou propriedades internas nesta etapa.
Retorne somente JSON conforme o schema.
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify({
          pedido,
          empresa: original.empresa || null,
          recursos: {
            ...objeto(original.recursos),
            agendas: params.contexto.agendas,
          },
        }),
      },
    ],
    max_output_tokens: Math.min(
      10000,
      Math.max(5000, Math.ceil(pedido.length * 1.5))
    ),
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
      "Eles representam uma experiencia conversacional ja projetada, nao uma sugestao de JSON.",
      "Trate jornada, intencao e destino conceitual como contrato: nao omita ramos e nao altere o significado de uma escolha.",
      "Converta cada tela conceitual em etapas reais do CRM; os textos devem cumprir o proposito e respeitar a ordem de conteudo definida.",
      "Associe opcoes por significado e funcao na jornada, nunca apenas por palavras semelhantes.",
      "Antes de responder, percorra mentalmente todos os caminhos e confirme os criterios_qualidade.",
      "A resposta ja deve conter copy final especializada, curta e natural; nao dependa de uma revisao posterior.",
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
