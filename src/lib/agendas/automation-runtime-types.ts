/* eslint-disable @typescript-eslint/no-explicit-any */

export type Job = {
  id: string;
  empresa_id: string;
  agenda_id: string;
  agendamento_id: string;
  regra_id: string | null;
  tipo: "confirmacao" | "lembrete" | "aviso_responsavel" | "pos_atendimento";
  canal: "whatsapp" | "email" | "sistema" | "fluxo";
  executar_em: string;
  status: string;
  tentativas: number;
  max_tentativas: number;
  mensagem_externa_id: string | null;
  payload_json: Record<string, any> | null;
  resultado_json: Record<string, any> | null;
};

export type Context = {
  job: Job;
  rule: any;
  agenda: any;
  appointment: any;
  contact: any | null;
  responsible: any | null;
  conversation: any | null;
  integration: any | null;
  template: any | null;
  flow: any | null;
};

export class AgendaAutomationError extends Error {
  permanent: boolean;
  cancel: boolean;

  constructor(message: string, options?: { permanent?: boolean; cancel?: boolean }) {
    super(message);
    this.name = "AgendaAutomationError";
    this.permanent = options?.permanent === true;
    this.cancel = options?.cancel === true;
  }
}

export function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function digits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

export function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function validEmail(value: unknown) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}

export function dateLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone || "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function timeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone || "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function contactName(context: Context) {
  return String(
    context.appointment.nome_cliente || context.contact?.nome || "cliente"
  ).trim();
}

export function appointmentTitle(context: Context) {
  return String(
    context.appointment.titulo || context.agenda.nome || "Agendamento"
  ).trim();
}

export function customerPhone(context: Context) {
  return digits(
    context.appointment.telefone_cliente || context.contact?.telefone || ""
  );
}

export function customerEmail(context: Context) {
  const value = String(
    context.appointment.email_cliente || context.contact?.email || ""
  )
    .trim()
    .toLowerCase();
  return validEmail(value) ? value : "";
}

export function humanText(context: Context) {
  const date = dateLabel(context.appointment.inicio_at, context.agenda.timezone);
  const time = timeLabel(context.appointment.inicio_at, context.agenda.timezone);
  const location = String(context.appointment.local || "").trim();
  const locationLine = location ? ` Local: ${location}.` : "";

  if (context.job.tipo === "confirmacao") {
    return `Confirmação de ${appointmentTitle(context)} para ${contactName(context)}, em ${date}, às ${time}.${locationLine}`;
  }
  if (context.job.tipo === "lembrete") {
    return `Lembrete de ${appointmentTitle(context)} para ${contactName(context)}, em ${date}, às ${time}.${locationLine}`;
  }
  if (context.job.tipo === "aviso_responsavel") {
    return `${contactName(context)} possui “${appointmentTitle(context)}” em ${date}, às ${time}.${locationLine}`;
  }
  return `Fluxo de pós-atendimento de “${appointmentTitle(context)}” para ${contactName(context)}.`;
}

export function templateVariableCount(payload: unknown) {
  const components = Array.isArray(asObject(payload).components)
    ? (asObject(payload).components as Array<Record<string, any>>)
    : [];
  const body = components.find(
    (component) => String(component.type || "").toUpperCase() === "BODY"
  );
  const matches = String(body?.text || "").match(/\{\{\s*\d+\s*\}\}/g) || [];
  return new Set(matches.map((value) => value.replace(/\D/g, ""))).size;
}

export function templateParameters(context: Context) {
  const count = templateVariableCount(context.template?.payload);
  const values = [
    contactName(context),
    appointmentTitle(context),
    dateLabel(context.appointment.inicio_at, context.agenda.timezone),
    timeLabel(context.appointment.inicio_at, context.agenda.timezone),
    String(context.appointment.local || "Não informado"),
    String(context.responsible?.nome || "Equipe de atendimento"),
  ];
  return Array.from({ length: count }, (_, index) => values[index] || "-");
}

export function quickReplyButtons(context: Context) {
  if (context.job.tipo !== "confirmacao") return [];
  const components = Array.isArray(asObject(context.template?.payload).components)
    ? (asObject(context.template?.payload).components as Array<Record<string, any>>)
    : [];
  const buttonsComponent = components.find(
    (component) => String(component.type || "").toUpperCase() === "BUTTONS"
  );
  const buttons = Array.isArray(buttonsComponent?.buttons)
    ? (buttonsComponent?.buttons as Array<Record<string, any>>)
    : [];

  return buttons.flatMap((button, index) => {
    if (String(button?.type || "").toUpperCase() !== "QUICK_REPLY") return [];
    const label = normalize(button?.text);
    const appointmentId = context.appointment.id;
    if (label.includes("confirm")) {
      return [{ index, payload: `agenda_confirmar:${appointmentId}` }];
    }
    if (label.includes("cancel")) {
      return [{ index, payload: `agenda_cancelar:${appointmentId}` }];
    }
    if (label.includes("reagend") || label.includes("remarc")) {
      return [{ index, payload: `agenda_reagendar:${appointmentId}` }];
    }
    return [];
  });
}

export function ruleExecutionEnabled(rule: any) {
  const config = asObject(rule?.configuracao_json);
  return rule?.ativo === true && config.execucao_habilitada !== false;
}

export function isApplicable(context: Context) {
  if (context.agenda.status !== "ativo" || !ruleExecutionEnabled(context.rule)) {
    return false;
  }

  const status = String(context.appointment.status || "");
  const confirmation = String(context.appointment.confirmacao_status || "pendente");
  const start = new Date(context.appointment.inicio_at).getTime();
  const now = Date.now();

  if (context.job.tipo === "confirmacao") {
    return (
      ["agendado", "confirmado"].includes(status) &&
      confirmation === "pendente" &&
      start > now
    );
  }

  if (["lembrete", "aviso_responsavel"].includes(context.job.tipo)) {
    return (
      ["agendado", "confirmado"].includes(status) &&
      confirmation !== "reagendamento_solicitado" &&
      start > now
    );
  }

  return ["agendado", "confirmado", "realizado"].includes(status);
}
