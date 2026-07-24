import {
  INSTRUCAO_ARQUITETURA_FLUXOS,
  VERSAO_PROMPT_MESTRE_FLUXOS,
} from "./route-arquitetura-fluxos-ia.ts";

export type AgendaAssistente = {
  id: string;
  nome: string;
  descricao: string | null;
  timezone: string | null;
  duracao_minutos: number | null;
  janela_dias: number | null;
};

export type MidiaAssistente = {
  id: string;
  nome: string;
  tipo: "imagem" | "video" | "audio" | "arquivo";
  url: string;
};

export type ContextoAssistenteFluxos = {
  ativo: true;
  modo: string;
  instrucaoCompleta: string;
  agendas: AgendaAssistente[];
  midias: MidiaAssistente[];
  empresaId?: string | null;
  usuarioId?: string | null;
  sessaoId?: string | null;
};

type ObjetoJson = Record<string, unknown>;

const TIPOS_AGENDA = [
  "agenda_escolher_horario",
  "agenda_criar_agendamento",
  "agenda_buscar_agendamento",
  "agenda_remarcar_agendamento",
  "agenda_cancelar_agendamento",
];

const ESTRATEGIAS_DISTRIBUICAO = [
  "fila_setor",
  "atendente_especifico",
  "rodizio_aleatorio",
  "menos_conversas",
];

function objeto(valor: unknown): ObjetoJson {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ObjetoJson)
    : {};
}

function localizarMensagem(
  payload: ObjetoJson,
  role: "system" | "user"
): ObjetoJson | null {
  if (!Array.isArray(payload.input)) return null;
  const mensagem = payload.input.find((item) => objeto(item).role === role);
  return mensagem ? objeto(mensagem) : null;
}

function textoConteudoMensagem(mensagem: ObjetoJson | null) {
  if (!mensagem) return "";
  if (typeof mensagem.content === "string") return mensagem.content;
  if (!Array.isArray(mensagem.content)) return "";

  return mensagem.content
    .map(objeto)
    .filter((item) => item.type === "input_text")
    .map((item) => String(item.text || ""))
    .join("");
}

function definirConteudoMensagem(mensagem: ObjetoJson | null, texto: string) {
  if (!mensagem) return;
  mensagem.content = texto;
}

function contextoOriginal(payload: ObjetoJson) {
  const bruto = textoConteudoMensagem(localizarMensagem(payload, "user"));
  try {
    return objeto(JSON.parse(bruto));
  } catch {
    return {};
  }
}

function modoPrompt(modo: string) {
  return [
    "",
    "======================================================================",
    "CONTRATO DESTA EXECUCAO",
    "======================================================================",
    `Modo solicitado: ${modo}.`,
    `Versao do Prompt Mestre: ${VERSAO_PROMPT_MESTRE_FLUXOS}.`,
    "Planeje e revise internamente, mas responda uma unica vez.",
    "Nao gere clarificacoes. Use clarificacoes: [].",
    "Nao dependa de reparo, revisao ou interpretacao posterior do backend.",
    "O schema JSON estrito enviado no response_format e o contrato formal da resposta.",
  ].join("\n");
}

function substituirPromptSistema(
  payload: ObjetoJson,
  contexto: ContextoAssistenteFluxos
) {
  const mensagem = localizarMensagem(payload, "system");
  definirConteudoMensagem(
    mensagem,
    `${INSTRUCAO_ARQUITETURA_FLUXOS}${modoPrompt(contexto.modo)}`
  );
}

function organizarContextoUsuario(
  payload: ObjetoJson,
  contexto: ContextoAssistenteFluxos
) {
  const mensagem = localizarMensagem(payload, "user");
  if (!mensagem) return;

  const raiz = contextoOriginal(payload);
  const recursos = objeto(raiz.recursos);
  const fluxoAtual = objeto(raiz.fluxo_atual);

  const conteudoOrganizado = {
    secao_solicitacao_usuario: {
      titulo: "SOLICITACAO DO USUARIO",
      texto: contexto.instrucaoCompleta,
      regra:
        "Preserve todos os requisitos explicitos. Nao resuma, nao omita e nao reinterpretar para simplificar.",
    },
    secao_empresa: {
      titulo: "EMPRESA",
      dados: objeto(raiz.empresa),
    },
    secao_recursos_disponiveis: {
      titulo: "RECURSOS DISPONIVEIS",
      setores: Array.isArray(recursos.setores) ? recursos.setores : [],
      agendas: contexto.agendas,
      midias: contexto.midias,
      variaveis: Array.isArray(recursos.variaveis) ? recursos.variaveis : [],
      regra:
        "IDs desta secao sao a unica fonte valida. Nao invente setor, agenda, midia ou variavel existente.",
    },
    secao_fluxo_atual: {
      titulo: "FLUXO ATUAL",
      aplicavel: contexto.modo !== "criar_fluxo",
      dados:
        contexto.modo !== "criar_fluxo" && Object.keys(fluxoAtual).length > 0
          ? fluxoAtual
          : null,
    },
    secao_schema_json: {
      titulo: "SCHEMA JSON",
      fornecido_em: "response_format.text.format.schema",
      nome: "plano_assistente_fluxos",
      strict: true,
      regra:
        "Responda exclusivamente no schema. Nao adicione campos e nao remova campos obrigatorios.",
    },
    secao_contrato_saida: {
      titulo: "CONTRATO DE SAIDA",
      modo: contexto.modo,
      uma_unica_resposta: true,
      planejamento_interno: true,
      revisao_interna: true,
      planejamento_posterior_no_sistema: false,
      revisao_posterior_no_sistema: false,
      reparo_semantico_no_sistema: false,
      clarificacoes: [],
      formato: "JSON final completo",
    },
  };

  definirConteudoMensagem(mensagem, JSON.stringify(conteudoOrganizado));
}

function expandirSchemaEtapas(payload: ObjetoJson) {
  const text = objeto(payload.text);
  const format = objeto(text.format);
  const schema = objeto(format.schema);
  const propriedadesRaiz = objeto(schema.properties);
  const etapas = objeto(propriedadesRaiz.etapas);
  const items = objeto(etapas.items);
  const propriedadesEtapa = objeto(items.properties);
  const tipo = objeto(propriedadesEtapa.tipo);
  const tipos = Array.isArray(tipo.enum) ? [...tipo.enum] : [];

  for (const tipoAgenda of TIPOS_AGENDA) {
    if (!tipos.includes(tipoAgenda)) tipos.push(tipoAgenda);
  }

  tipo.enum = tipos;
  propriedadesEtapa.tipo = tipo;
  propriedadesEtapa.agenda_id = { type: ["string", "null"] };
  propriedadesEtapa.agenda_nome = { type: ["string", "null"] };
  propriedadesEtapa.estrategia_transferencia = {
    type: ["string", "null"],
    enum: [...ESTRATEGIAS_DISTRIBUICAO, null],
  };
  propriedadesEtapa.atendente_id = { type: ["string", "null"] };
  propriedadesEtapa.setor_excesso_tentativas = {
    type: ["string", "null"],
  };
  propriedadesEtapa.estrategia_excesso_tentativas = {
    type: ["string", "null"],
    enum: [...ESTRATEGIAS_DISTRIBUICAO, null],
  };
  propriedadesEtapa.atendente_excesso_tentativas = {
    type: ["string", "null"],
  };
  items.properties = propriedadesEtapa;

  const obrigatorios = Array.isArray(items.required)
    ? [...items.required]
    : [];

  for (const campo of [
    "agenda_id",
    "agenda_nome",
    "estrategia_transferencia",
    "atendente_id",
    "setor_excesso_tentativas",
    "estrategia_excesso_tentativas",
    "atendente_excesso_tentativas",
  ]) {
    if (!obrigatorios.includes(campo)) obrigatorios.push(campo);
  }

  items.required = obrigatorios;
  etapas.items = items;
  propriedadesRaiz.etapas = etapas;
  schema.properties = propriedadesRaiz;
  format.schema = schema;
  text.format = format;
  payload.text = text;
}

export function prepararPayloadAssistente(params: {
  body: Record<string, unknown>;
  limite: number;
  contexto: ContextoAssistenteFluxos;
}) {
  const payload = structuredClone(params.body);
  const limiteAtual = Number(payload.max_output_tokens || 0);

  payload.max_output_tokens = Math.max(
    Number.isFinite(limiteAtual) ? limiteAtual : 0,
    params.limite
  );

  expandirSchemaEtapas(payload);
  substituirPromptSistema(payload, params.contexto);
  organizarContextoUsuario(payload, params.contexto);

  return payload;
}
