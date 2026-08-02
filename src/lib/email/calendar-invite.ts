export type CalendarInviteMethod = "REQUEST" | "CANCEL";
export type CalendarInviteStatus = "CONFIRMED" | "CANCELLED";

export type BuildCalendarInviteParams = {
  appointmentId: string;
  companyName: string;
  attendeeEmail: string;
  attendeeName: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  sequence?: number;
  method?: CalendarInviteMethod;
  status?: CalendarInviteStatus;
};

function validDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: unknown) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function escapeParameter(value: unknown) {
  return `"${String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ")}"`;
}

function foldLine(line: string) {
  const limit = 73;
  const parts: string[] = [];
  let remaining = line;
  while (remaining.length > limit) {
    parts.push(remaining.slice(0, limit));
    remaining = remaining.slice(limit);
  }
  parts.push(remaining);
  return parts.join("\r\n ");
}

export function buildCalendarInvite(params: BuildCalendarInviteParams) {
  const start = validDate(params.startAt);
  const end = validDate(params.endAt);
  if (!start || !end || end <= start) return null;

  const method = params.method || "REQUEST";
  const status = params.status || "CONFIRMED";
  const attendeeStatus = status === "CANCELLED" ? "DECLINED" : "NEEDS-ACTION";
  const rsvp = status === "CANCELLED" ? "FALSE" : "TRUE";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CRM Prosperity//Calendario//PT-BR",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${escapeText(params.appointmentId)}@crmprosperity.com`,
    `DTSTAMP:${formatDate(new Date())}`,
    `DTSTART:${formatDate(start)}`,
    `DTEND:${formatDate(end)}`,
    `SUMMARY:${escapeText(params.title)}`,
    `DESCRIPTION:${escapeText(params.description || params.title)}`,
    params.location ? `LOCATION:${escapeText(params.location)}` : "",
    `ORGANIZER;CN=${escapeParameter(params.companyName)}:mailto:no-reply@crmprosperity.com`,
    `ATTENDEE;CN=${escapeParameter(params.attendeeName)};ROLE=REQ-PARTICIPANT;PARTSTAT=${attendeeStatus};RSVP=${rsvp}:mailto:${params.attendeeEmail}`,
    `STATUS:${status}`,
    "TRANSP:OPAQUE",
    `SEQUENCE:${Math.max(0, Number(params.sequence || 0))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export function calendarInviteContentType(method: CalendarInviteMethod = "REQUEST") {
  return `text/calendar; charset=UTF-8; method=${method}`;
}
