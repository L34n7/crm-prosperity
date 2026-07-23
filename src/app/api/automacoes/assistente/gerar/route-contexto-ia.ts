import { INSTRUCAO_ARQUITETURA_FLUXOS } from "./route-arquitetura-fluxos-ia.ts";

export type AgendaAssistente = {
  id: string;
  nome: string;
  descricao: string | null;
  timezone: string | null;
  duracao_minutos: number | null;
  janela_dias: number | null;
};

export type ContextoAssistenteFluxos = {
  ativo: true;
  modo: string;
  instrucaoCompleta: string;
  agendas: AgendaAssistente[];
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

const INSTRUCAO_QUALIDADE = INSTRUCAO_ARQUITETURA_FLUXOS;

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

function anexarInstrucaoSistema(payload: ObjetoJson, instrucao: string) {
  const mensagem = localizarMensagem(payload, "system");
  if (!mensagem) return;

  if (typeof mensagem.content === "string") {
    if (!mensagem.content.includes(instrucao)) {
      mensagem.content = `${mensagem.content}\n\n${instrucao}`;
    }
    return;
  }

  if (Array.isArray(mensagem.content)) {
    mensagem.content = [
      ...mensagem.content,
      { type: "input_text", text: instrucao },
    ];
  }
}

function atualizarContextoRecursivo(
  valor: unknown,
  contexto: ContextoAssistenteFluxos
) {
  if (!valor || typeof valor !== "object") return;

  if (Array.isArray(valor)) {
    valor.forEach((item) => atualizarContextoRecursivo(item, contexto));
    return;
  }

  const registro = valor as ObjetoJson;

  if (
    contexto.instrucaoCompleta &&
    Object.prototype.hasOwnProperty.call(registro, "instrucao")
  ) {
    registro.instrucao = contexto.instrucaoCompleta;
  }

  if (Object.prototype.hasOwnProperty.call(registro, "recursos")) {
    const recursos = objeto(registro.recursos);
    recursos.agendas = contexto.agendas;
    registro.recursos = recursos;
  }

  Object.values(registro).forEach((item) =>
    atualizarContextoRecursivo(item, contexto)
  );
}

function injetarContextoCompleto(
  payload: ObjetoJson,
  contexto: ContextoAssistenteFluxos
) {
  const mensagem = localizarMensagem(payload, "user");
  if (!mensagem || typeof mensagem.content !== "string") return;

  try {
    const conteudo = JSON.parse(mensagem.content) as unknown;
    atualizarContextoRecursivo(conteudo, contexto);

    const raiz = objeto(conteudo);
    if (!Object.prototype.hasOwnProperty.call(raiz, "recursos")) {
      raiz.recursos = { agendas: contexto.agendas };
    }

    mensagem.content = JSON.stringify(conteudo);
  } catch {
    // Mantem o payload original quando a mensagem nao e um contexto JSON.
  }
}

function expandirSchemaAgenda(payload: ObjetoJson) {
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
  items.properties = propriedadesEtapa;

  const obrigatorios = Array.isArray(items.required)
    ? [...items.required]
    : [];

  for (const campo of ["agenda_id", "agenda_nome"]) {
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
  repetir: boolean;
  problemas?: string[];
  rascunhoAnterior?: string;
  fase?: "estrutura" | "revisao";
  contexto: ContextoAssistenteFluxos;
}) {
  const payload = structuredClone(params.body);
  const limiteAtual = Number(payload.max_output_tokens || 0);

  payload.max_output_tokens = Math.max(
    Number.isFinite(limiteAtual) ? limiteAtual : 0,
    params.limite
  );

  expandirSchemaAgenda(payload);
  injetarContextoCompleto(payload, params.contexto);
  anexarInstrucaoSistema(payload, INSTRUCAO_QUALIDADE);

  if (params.repetir) {
    const fase = params.fase === "revisao" ? "revisao final" : "correcao estrutural";
    const rascunho = String(params.rascunhoAnterior || "").trim();

    anexarInstrucaoSistema(
      payload,
      [
        `Esta e a fase de ${fase} do mesmo plano.`,
        "Nao recomecar do zero e nao remover blocos, rotas ou conteudos que ja estejam corretos.",
        "Use o rascunho integral abaixo como base e altere somente o necessario para corrigir os problemas listados.",
        "Problemas que ainda precisam ser corrigidos:",
        ...(params.problemas || []).map((problema) => `- ${problema}`),
        rascunho ? "Rascunho integral da fase anterior:" : "",
        rascunho,
        "Retorne somente o JSON final conforme o schema.",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return payload;
}
