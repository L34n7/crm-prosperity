/* eslint-disable @typescript-eslint/no-explicit-any */

export type AgendaTemplateAction = "confirmar" | "cancelar" | "reagendar" | "ignorar";
export type AgendaTemplateSourceKind = "text" | "datetime" | "fixed";
export type AgendaTemplateSourceCategory =
  | "Nome e número"
  | "Agenda"
  | "Fixa";

export type AgendaTemplateSourceOption = {
  value: string;
  variable: string;
  label: string;
  description: string;
  kind: AgendaTemplateSourceKind;
  category: AgendaTemplateSourceCategory;
};

export type AgendaTemplateVariableMapping = {
  posicao: number;
  fonte: string;
  formato: string;
  valor_fixo?: string | null;
  valor_padrao?: string | null;
};

export type AgendaTemplateButtonMapping = {
  indice: number;
  texto_snapshot: string;
  acao: AgendaTemplateAction;
  fluxo_id?: string | null;
};

export type AgendaTemplateContext = {
  appointment: Record<string, any>;
  agenda: Record<string, any>;
  contact?: Record<string, any> | null;
  responsible?: Record<string, any> | null;
  variables?: Record<string, string>;
  protocols?: {
    protocolo_atual?: string;
    ultimo_protocolo?: string;
  } | null;
};

const CUSTOM_VARIABLE_PREFIX = "variavel.";

export const TEMPLATE_SOURCE_OPTIONS: readonly AgendaTemplateSourceOption[] = [
  {
    value: "nome_contato",
    variable: "{{nome_contato}}",
    label: "Nome salvo no contato",
    description: "Nome salvo no cadastro do contato.",
    kind: "text",
    category: "Nome e número",
  },
  {
    value: "nome",
    variable: "{{nome}}",
    label: "Nome do contato",
    description: "Nome do contato usado no padrão geral do sistema.",
    kind: "text",
    category: "Nome e número",
  },
  {
    value: "nome_whatsapp",
    variable: "{{nome_whatsapp}}",
    label: "Nome do WhatsApp",
    description:
      "Nome do perfil do WhatsApp; quando não existir, usa o nome salvo no contato.",
    kind: "text",
    category: "Nome e número",
  },
  {
    value: "nome_captura",
    variable: "{{nome_captura}}",
    label: "Nome captura",
    description:
      "Último nome capturado por um nó do tipo Nome; quando não existir, usa o nome do WhatsApp.",
    kind: "text",
    category: "Nome e número",
  },
  {
    value: "primeiro_nome_captura",
    variable: "{{primeiro_nome_captura}}",
    label: "Primeiro nome da captura",
    description:
      "Primeira palavra do Nome captura; quando não existir captura, usa o primeiro nome do WhatsApp.",
    kind: "text",
    category: "Nome e número",
  },
  {
    value: "numero_contato",
    variable: "{{numero_contato}}",
    label: "Número do contato",
    description: "Número ou telefone salvo no cadastro do contato.",
    kind: "text",
    category: "Nome e número",
  },
  {
    value: "agendamento.titulo",
    variable: "{{agendamento.titulo}}",
    label: "Título do agendamento",
    description: "Título do compromisso; usa o nome da agenda quando estiver vazio.",
    kind: "text",
    category: "Agenda",
  },
  {
    value: "agendamento.inicio_at",
    variable: "{{agendamento.inicio_at}}",
    label: "Data e hora de início",
    description: "Início do agendamento, formatado conforme a opção escolhida.",
    kind: "datetime",
    category: "Agenda",
  },
  {
    value: "agendamento.fim_at",
    variable: "{{agendamento.fim_at}}",
    label: "Data e hora de término",
    description: "Término do agendamento, formatado conforme a opção escolhida.",
    kind: "datetime",
    category: "Agenda",
  },
  {
    value: "agendamento.local",
    variable: "{{agendamento.local}}",
    label: "Local do agendamento",
    description: "Local informado no compromisso.",
    kind: "text",
    category: "Agenda",
  },
  {
    value: "agendamento.link_reuniao",
    variable: "{{agendamento.link_reuniao}}",
    label: "Link da reunião",
    description: "Link de reunião associado ao compromisso.",
    kind: "text",
    category: "Agenda",
  },
  {
    value: "agendamento.observacoes",
    variable: "{{agendamento.observacoes}}",
    label: "Observações do agendamento",
    description: "Observações públicas registradas no compromisso.",
    kind: "text",
    category: "Agenda",
  },
  {
    value: "agenda.nome",
    variable: "{{agenda.nome}}",
    label: "Nome da agenda",
    description: "Nome da agenda à qual o compromisso pertence.",
    kind: "text",
    category: "Agenda",
  },
  {
    value: "responsavel.nome",
    variable: "{{responsavel.nome}}",
    label: "Nome do responsável",
    description: "Nome do usuário responsável pelo compromisso.",
    kind: "text",
    category: "Agenda",
  },
  {
    value: "responsavel.email",
    variable: "{{responsavel.email}}",
    label: "E-mail do responsável",
    description: "E-mail do usuário responsável pelo compromisso.",
    kind: "text",
    category: "Agenda",
  },
  {
    value: "responsavel.telefone",
    variable: "{{responsavel.telefone}}",
    label: "Telefone do responsável",
    description: "Telefone do usuário responsável pelo compromisso.",
    kind: "text",
    category: "Agenda",
  },
  {
    value: "email_contato",
    variable: "{{email_contato}}",
    label: "E-mail do contato",
    description: "E-mail salvo no cadastro do contato.",
    kind: "text",
    category: "Fixa",
  },
  {
    value: "campanha",
    variable: "{{campanha}}",
    label: "Campanha do contato",
    description: "Campanha vinculada ao contato.",
    kind: "text",
    category: "Fixa",
  },
  {
    value: "origem",
    variable: "{{origem}}",
    label: "Origem do contato",
    description: "Origem cadastrada para o contato.",
    kind: "text",
    category: "Fixa",
  },
  {
    value: "status_lead",
    variable: "{{status_lead}}",
    label: "Status do lead",
    description: "Status atual do lead no CRM.",
    kind: "text",
    category: "Fixa",
  },
  {
    value: "classificacao_lead",
    variable: "{{classificacao_lead}}",
    label: "Classificação do lead",
    description: "Classificação global atual do lead.",
    kind: "text",
    category: "Fixa",
  },
  {
    value: "protocolo_atual",
    variable: "{{protocolo_atual}}",
    label: "Protocolo atual",
    description: "Protocolo ativo da conversa mais recente do contato.",
    kind: "text",
    category: "Fixa",
  },
  {
    value: "ultimo_protocolo",
    variable: "{{ultimo_protocolo}}",
    label: "Último protocolo",
    description: "Último protocolo encerrado do contato.",
    kind: "text",
    category: "Fixa",
  },
  {
    value: "texto_fixo",
    variable: "Texto fixo",
    label: "Texto fixo",
    description: "Valor digitado manualmente e repetido em todos os envios.",
    kind: "fixed",
    category: "Fixa",
  },
] as const;

const LEGACY_TEMPLATE_SOURCES = new Set([
  "contato.nome",
  "contato.primeiro_nome",
  "contato.telefone",
  "contato.email",
  "nome_paciente",
]);

const TEMPLATE_SOURCE_ALIASES = new Map<string, string>([
  ["contato.nome", "nome_contato"],
  ["contato.telefone", "numero_contato"],
  ["contato.email", "email_contato"],
  ["nome_paciente", "nome_captura"],
]);

export const TEMPLATE_FORMAT_OPTIONS = [
  { value: "texto", label: "Texto padrão", kinds: ["text", "fixed"] },
  { value: "data_numerica", label: "02/08/2026", kinds: ["datetime"] },
  { value: "dia_mes_numerico", label: "02/08", kinds: ["datetime"] },
  { value: "data_extenso_sem_ano", label: "2 de agosto", kinds: ["datetime"] },
  { value: "data_extenso_com_ano", label: "2 de agosto de 2026", kinds: ["datetime"] },
  { value: "dia_semana_data", label: "domingo, 2 de agosto", kinds: ["datetime"] },
  { value: "hora_numerica", label: "14:30", kinds: ["datetime"] },
  { value: "hora_abreviada", label: "14h30", kinds: ["datetime"] },
  { value: "data_hora_numerica", label: "02/08/2026 às 14:30", kinds: ["datetime"] },
  { value: "data_hora_extenso", label: "domingo, 2 de agosto, às 14h30", kinds: ["datetime"] },
] as const;

export const ALLOWED_TEMPLATE_SOURCES = new Set([
  ...TEMPLATE_SOURCE_OPTIONS.map((item) => item.value),
  ...LEGACY_TEMPLATE_SOURCES,
]);
export const ALLOWED_TEMPLATE_FORMATS = new Set(TEMPLATE_FORMAT_OPTIONS.map((item) => item.value));
export const ALLOWED_TEMPLATE_ACTIONS = new Set<AgendaTemplateAction>([
  "confirmar",
  "cancelar",
  "reagendar",
  "ignorar",
]);

export function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeTemplateVariableKey(value: unknown) {
  return String(value || "")
    .replace(/[{}]/g, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function customTemplateSource(key: unknown) {
  const normalized = normalizeTemplateVariableKey(key);
  return normalized ? `${CUSTOM_VARIABLE_PREFIX}${normalized}` : "";
}

export function templateCustomVariableKey(source: unknown) {
  const text = String(source || "").trim();
  if (!text.startsWith(CUSTOM_VARIABLE_PREFIX)) return "";
  return normalizeTemplateVariableKey(text.slice(CUSTOM_VARIABLE_PREFIX.length));
}

export function canonicalTemplateSource(source: unknown) {
  const text = String(source || "").trim();
  return TEMPLATE_SOURCE_ALIASES.get(text) || text;
}

export function isAllowedTemplateSource(source: unknown) {
  const text = canonicalTemplateSource(source);
  return ALLOWED_TEMPLATE_SOURCES.has(text) || Boolean(templateCustomVariableKey(text));
}

export function templateSourceKind(source: unknown): AgendaTemplateSourceKind {
  const text = canonicalTemplateSource(source);
  if (templateCustomVariableKey(text)) return "text";
  if (text === "contato.primeiro_nome") return "text";
  return TEMPLATE_SOURCE_OPTIONS.find((item) => item.value === text)?.kind || "text";
}

export function templateComponents(payload: unknown) {
  const components = asRecord(payload).components;
  return Array.isArray(components) ? (components as Array<Record<string, any>>) : [];
}

export function extractTemplateBody(payload: unknown) {
  const body = templateComponents(payload).find(
    (component) => String(component.type || "").toUpperCase() === "BODY"
  );
  return String(body?.text || "");
}

export function extractTemplateVariablePositions(payload: unknown) {
  const matches = extractTemplateBody(payload).match(/\{\{\s*(\d+)\s*\}\}/g) || [];
  return Array.from(
    new Set(
      matches
        .map((item) => Number(item.replace(/\D/g, "")))
        .filter((item) => Number.isInteger(item) && item > 0 && item <= 100)
    )
  ).sort((a, b) => a - b);
}

export function extractTemplateQuickReplyButtons(payload: unknown) {
  const buttonsComponent = templateComponents(payload).find(
    (component) => String(component.type || "").toUpperCase() === "BUTTONS"
  );
  const buttons = Array.isArray(buttonsComponent?.buttons)
    ? (buttonsComponent.buttons as Array<Record<string, any>>)
    : [];
  return buttons.flatMap((button, originalIndex) => {
    if (String(button?.type || "").toUpperCase() !== "QUICK_REPLY") return [];
    return [{ indice: originalIndex, texto: String(button?.text || "").trim() }];
  });
}

export function suggestVariableMapping(posicao: number): AgendaTemplateVariableMapping {
  if (posicao === 1) {
    return { posicao, fonte: "nome_contato", formato: "texto", valor_padrao: "Cliente" };
  }
  if (posicao === 2) {
    return {
      posicao,
      fonte: "agendamento.inicio_at",
      formato: "data_numerica",
      valor_padrao: "Data a confirmar",
    };
  }
  if (posicao === 3) {
    return {
      posicao,
      fonte: "agendamento.inicio_at",
      formato: "hora_numerica",
      valor_padrao: "Horário a confirmar",
    };
  }
  return { posicao, fonte: "agendamento.titulo", formato: "texto", valor_padrao: "Agendamento" };
}

export function suggestButtonAction(text: unknown): AgendaTemplateAction {
  const normalized = normalizeText(text);
  if (normalized.includes("confirm") || normalized.includes("presente") || normalized === "sim") {
    return "confirmar";
  }
  if (normalized.includes("cancel") || normalized.includes("nao poderei")) {
    return "cancelar";
  }
  if (
    normalized.includes("reagend") ||
    normalized.includes("remarc") ||
    normalized.includes("outra data") ||
    normalized.includes("trocar horario")
  ) {
    return "reagendar";
  }
  return "ignorar";
}

export function normalizeVariableMappings(value: unknown) {
  if (!Array.isArray(value)) return [] as AgendaTemplateVariableMapping[];
  return value.flatMap((item) => {
    const record = asRecord(item);
    const posicao = Number(record.posicao);
    const fonte = canonicalTemplateSource(record.fonte);
    const formato = String(record.formato || "texto").trim();
    if (!Number.isInteger(posicao) || posicao < 1 || posicao > 100) return [];
    if (!isAllowedTemplateSource(fonte)) return [];
    if (!ALLOWED_TEMPLATE_FORMATS.has(formato as any)) return [];
    return [
      {
        posicao,
        fonte,
        formato,
        valor_fixo: record.valor_fixo == null ? null : String(record.valor_fixo),
        valor_padrao: record.valor_padrao == null ? null : String(record.valor_padrao),
      },
    ];
  });
}

export function normalizeButtonMappings(value: unknown) {
  if (!Array.isArray(value)) return [] as AgendaTemplateButtonMapping[];
  return value.flatMap((item) => {
    const record = asRecord(item);
    const indice = Number(record.indice);
    const acao = String(record.acao || "ignorar") as AgendaTemplateAction;
    if (!Number.isInteger(indice) || indice < 0 || indice > 9) return [];
    if (!ALLOWED_TEMPLATE_ACTIONS.has(acao)) return [];
    return [
      {
        indice,
        texto_snapshot: String(record.texto_snapshot || "").trim(),
        acao,
        fluxo_id: record.fluxo_id ? String(record.fluxo_id) : null,
      },
    ];
  });
}

function formatParts(value: string | Date, timezone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const tz = timezone || "America/Sao_Paulo";
  return { date, tz };
}

function abbreviatedTime(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((item) => item.type === "hour")?.value || "00";
  const minute = parts.find((item) => item.type === "minute")?.value || "00";
  return minute === "00" ? `${Number(hour)}h` : `${Number(hour)}h${minute}`;
}

export function formatAgendaDateTime(value: string | Date, timezone: string, format: string) {
  const parsed = formatParts(value, timezone);
  if (!parsed) return "";
  const { date, tz } = parsed;
  const dateNumeric = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const dayMonthNumeric = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
  }).format(date);
  const dayMonthLong = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    day: "numeric",
    month: "long",
  }).format(date);
  const fullLong = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const weekdayLong = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  const timeNumeric = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const timeShort = abbreviatedTime(date, tz);

  switch (format) {
    case "data_numerica":
      return dateNumeric;
    case "dia_mes_numerico":
      return dayMonthNumeric;
    case "data_extenso_sem_ano":
      return dayMonthLong;
    case "data_extenso_com_ano":
      return fullLong;
    case "dia_semana_data":
      return weekdayLong;
    case "hora_numerica":
      return timeNumeric;
    case "hora_abreviada":
      return timeShort;
    case "data_hora_numerica":
      return `${dateNumeric} às ${timeNumeric}`;
    case "data_hora_extenso":
      return `${weekdayLong}, às ${timeShort}`;
    default:
      return dateNumeric;
  }
}

function firstWord(value: unknown) {
  return String(value || "").trim().split(/\s+/).filter(Boolean)[0] || "";
}

function sourceValue(context: AgendaTemplateContext, source: string) {
  const appointment = context.appointment || {};
  const contact = context.contact || {};
  const responsible = context.responsible || {};
  const customKey = templateCustomVariableKey(source);
  if (customKey) return context.variables?.[customKey] || "";

  switch (canonicalTemplateSource(source)) {
    case "nome_contato":
    case "nome":
      return appointment.nome_cliente || contact.nome || "";
    case "nome_whatsapp":
      return contact.whatsapp_profile_name || appointment.nome_cliente || contact.nome || "";
    case "nome_captura":
      return (
        context.variables?.nome_captura ||
        context.variables?.nome_paciente ||
        contact.whatsapp_profile_name ||
        appointment.nome_cliente ||
        contact.nome ||
        ""
      );
    case "primeiro_nome_captura":
      return (
        context.variables?.primeiro_nome_captura ||
        firstWord(
          context.variables?.nome_captura ||
            context.variables?.nome_paciente ||
            contact.whatsapp_profile_name ||
            appointment.nome_cliente ||
            contact.nome ||
            ""
        )
      );
    case "numero_contato":
      return appointment.telefone_cliente || contact.telefone || "";
    case "email_contato":
      return appointment.email_cliente || contact.email || "";
    case "contato.primeiro_nome":
      return firstWord(appointment.nome_cliente || contact.nome || "");
    case "agendamento.titulo":
      return appointment.titulo || context.agenda?.nome || "";
    case "agendamento.inicio_at":
      return appointment.inicio_at || "";
    case "agendamento.fim_at":
      return appointment.fim_at || "";
    case "agendamento.local":
      return appointment.local || "";
    case "agendamento.link_reuniao":
      return appointment.link_reuniao || "";
    case "agendamento.observacoes":
      return appointment.observacoes || "";
    case "agenda.nome":
      return context.agenda?.nome || "";
    case "responsavel.nome":
      return responsible.nome || "";
    case "responsavel.email":
      return responsible.email || "";
    case "responsavel.telefone":
      return responsible.telefone || "";
    case "campanha":
      return contact.campanha || "";
    case "origem":
      return contact.origem || "";
    case "status_lead":
      return contact.status_lead || "";
    case "classificacao_lead":
      return contact.classificacao || "";
    case "protocolo_atual":
      return context.protocols?.protocolo_atual || "";
    case "ultimo_protocolo":
      return context.protocols?.ultimo_protocolo || "";
    default:
      return "";
  }
}

export function resolveMappedValue(
  context: AgendaTemplateContext,
  mapping: AgendaTemplateVariableMapping
) {
  const source = canonicalTemplateSource(mapping.fonte);
  if (source === "texto_fixo") {
    return String(mapping.valor_fixo || mapping.valor_padrao || "-").slice(0, 1024);
  }
  const raw = sourceValue(context, source);
  let value = "";
  if (templateSourceKind(source) === "datetime") {
    value = formatAgendaDateTime(
      String(raw || ""),
      String(context.agenda?.timezone || "America/Sao_Paulo"),
      mapping.formato
    );
  } else {
    value = String(raw || "").trim();
  }
  return String(value || mapping.valor_padrao || "-").slice(0, 1024);
}

export function resolveTemplateParameters(params: {
  payload: unknown;
  configuracao: unknown;
  context: AgendaTemplateContext;
}) {
  const config = asRecord(params.configuracao);
  const positions = extractTemplateVariablePositions(params.payload);
  const mappings = normalizeVariableMappings(config.template_variaveis);
  const byPosition = new Map(mappings.map((item) => [item.posicao, item]));
  const missing = positions.filter((position) => !byPosition.has(position));
  if (missing.length > 0) {
    throw new Error(`Mapeie as variáveis ${missing.map((item) => `{{${item}}}`).join(", ")} do template.`);
  }
  const snapshot: Record<string, string> = {};
  const values = positions.map((position) => {
    const mapping = byPosition.get(position)!;
    const value = resolveMappedValue(params.context, mapping);
    snapshot[String(position)] = value;
    return value;
  });
  return { positions, mappings, values, snapshot };
}

export function mappedQuickReplyButtons(params: {
  payload: unknown;
  configuracao: unknown;
  appointmentId: string;
}) {
  const config = asRecord(params.configuracao);
  const mappings = normalizeButtonMappings(config.template_botoes);
  const available = new Set(extractTemplateQuickReplyButtons(params.payload).map((item) => item.indice));
  return mappings.flatMap((mapping) => {
    if (!available.has(mapping.indice) || mapping.acao === "ignorar") return [];
    return [
      {
        index: mapping.indice,
        payload: `agenda_${mapping.acao}:${params.appointmentId}`,
      },
    ];
  });
}
