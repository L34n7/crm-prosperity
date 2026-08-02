import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildCalendarInvite,
  calendarInviteContentType,
} from "@/lib/email/calendar-invite";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export type AgendaAutomationEmailKind =
  | "confirmacao"
  | "lembrete"
  | "aviso_responsavel";

type SendAgendaAutomationEmailParams = {
  jobId: string;
  empresaId: string;
  kind: AgendaAutomationEmailKind;
  to: string;
  recipientName?: string | null;
  contactName?: string | null;
  appointmentTitle: string;
  dateLabel: string;
  timeLabel: string;
  location?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  agendaId: string;
  appointmentId: string;
};

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeHeader(value: unknown) {
  return String(value || "")
    .replace(/[\r\n<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function companyName(empresaId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("empresas")
    .select("nome_fantasia, razao_social")
    .eq("id", empresaId)
    .maybeSingle();
  return (
    String(data?.nome_fantasia || "").trim() ||
    String(data?.razao_social || "").trim() ||
    "CRM Prosperity"
  );
}

function copy(params: SendAgendaAutomationEmailParams, company: string) {
  const name = params.recipientName || params.contactName || "Olá";
  const location = String(params.location || "").trim();

  if (params.kind === "aviso_responsavel") {
    return {
      subject: `Agendamento próximo: ${params.appointmentTitle}`,
      headline: "Agendamento próximo",
      subtitle: "Um compromisso da sua agenda está se aproximando",
      intro: `${params.contactName || "O cliente"} possui um compromisso agendado em breve.`,
      closing: "Acesse o calendário para consultar todos os dados do atendimento.",
      name,
      location,
    };
  }

  if (params.kind === "confirmacao") {
    return {
      subject: `Confirmação de agendamento - ${company}`,
      headline: "Confirme seu agendamento",
      subtitle: "Seu horário foi reservado com sucesso",
      intro: `Seu compromisso com ${company} está reservado.`,
      closing:
        "Para confirmar, cancelar ou solicitar um novo horário, responda pelo WhatsApp utilizado no atendimento.",
      name,
      location,
    };
  }

  return {
    subject: `Lembrete de agendamento - ${company}`,
    headline: "Lembrete do agendamento",
    subtitle: "Seu horário está chegando",
    intro: `Este é um lembrete do seu compromisso com ${company}.`,
    closing:
      "Para remarcar ou cancelar, entre em contato pelo mesmo canal usado no atendimento.",
    name,
    location,
  };
}

export async function sendAgendaAutomationEmail(
  params: SendAgendaAutomationEmailParams
) {
  if (!resend) {
    throw Object.assign(new Error("RESEND_API_KEY não configurada."), {
      permanent: true,
    });
  }

  const recipient = String(params.to || "").trim().toLowerCase();
  if (!validEmail(recipient)) {
    throw Object.assign(new Error("Destinatário de e-mail inválido."), {
      permanent: true,
    });
  }

  const company = await companyName(params.empresaId);
  const content = copy(params, company);
  const appUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://crmprosperity.com"
  ).replace(/\/$/, "");
  const logoUrl = `${appUrl}/logo.png`;
  const agendaUrl = `${appUrl}/agendas?agenda=${encodeURIComponent(
    params.agendaId
  )}&agendamento=${encodeURIComponent(params.appointmentId)}`;
  const locationRow = content.location
    ? `<tr><td style="width:100px;background:#f8fafc;color:#64748b;padding:14px;border-top:1px solid #e2e8f0;">Local</td><td style="color:#0f172a;font-weight:700;padding:14px;border-top:1px solid #e2e8f0;">${escapeHtml(content.location)}</td></tr>`
    : "";
  const shouldAttachInvite = ["confirmacao", "lembrete"].includes(params.kind);
  const calendarInvite = shouldAttachInvite
    ? buildCalendarInvite({
        appointmentId: params.appointmentId,
        companyName: company,
        attendeeEmail: recipient,
        attendeeName: params.contactName || params.recipientName || "Cliente",
        title: params.appointmentTitle || `Agendamento com ${company}`,
        description: `${params.kind === "lembrete" ? "Lembrete" : "Confirmação"} do agendamento com ${company}. Data: ${params.dateLabel}. Horário: ${params.timeLabel}.`,
        location: params.location,
        startAt: params.startAt,
        endAt: params.endAt,
        sequence: params.kind === "lembrete" ? 1 : 0,
        method: "REQUEST",
        status: "CONFIRMED",
      })
    : null;

  const result = await resend.emails.send({
    from: "CRM Prosperity <no-reply@crmprosperity.com>",
    to: recipient,
    subject: safeHeader(content.subject),
    headers: {
      "X-Entity-Ref-ID": `agenda-automation-${params.jobId}`,
    },
    ...(calendarInvite
      ? {
          attachments: [
            {
              filename: "agendamento.ics",
              content: calendarInvite,
              contentType: calendarInviteContentType("REQUEST"),
            },
          ],
        }
      : {}),
    text: [
      `Olá, ${content.name}.`,
      content.intro,
      `Compromisso: ${params.appointmentTitle}`,
      `Data: ${params.dateLabel}`,
      `Horário: ${params.timeLabel}`,
      content.location ? `Local: ${content.location}` : "",
      calendarInvite ? "O convite de calendário está anexado a este e-mail." : "",
      content.closing,
      params.kind === "aviso_responsavel" ? agendaUrl : "",
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <div style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
          <tr><td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,.10);">
              <tr><td style="padding:28px 32px;background:linear-gradient(135deg,#0f509a,#0f172a);color:#fff;">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
                  <td style="padding:0;vertical-align:middle;">
                    <div style="font-size:12px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;opacity:.86;">CRM Prosperity · ${escapeHtml(company)}</div>
                    <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;font-weight:800;">${escapeHtml(content.headline)}</h1>
                    <p style="margin:8px 0 0;font-size:14px;line-height:1.5;opacity:.92;">${escapeHtml(content.subtitle)}</p>
                  </td>
                  <td width="86" align="right" style="width:86px;padding:0 0 0 18px;vertical-align:middle;">
                    <img src="${logoUrl}" alt="CRM Prosperity" width="72" style="display:block;width:72px;height:auto;border:0;outline:none;text-decoration:none;" />
                  </td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:28px 30px;color:#334155;font-size:15px;line-height:1.6;">
                <p style="margin:0;">Olá, ${escapeHtml(content.name)}.</p>
                <p style="margin:10px 0 18px;">${escapeHtml(content.intro)}</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:13px;overflow:hidden;border-collapse:separate;border-spacing:0;">
                  <tr><td style="width:100px;background:#f8fafc;color:#64748b;padding:14px;">Compromisso</td><td style="color:#0f172a;font-weight:800;padding:14px;">${escapeHtml(params.appointmentTitle)}</td></tr>
                  <tr><td style="width:100px;background:#f8fafc;color:#64748b;padding:14px;border-top:1px solid #e2e8f0;">Data</td><td style="color:#0f172a;font-weight:700;padding:14px;border-top:1px solid #e2e8f0;">${escapeHtml(params.dateLabel)}</td></tr>
                  <tr><td style="width:100px;background:#f8fafc;color:#64748b;padding:14px;border-top:1px solid #e2e8f0;">Horário</td><td style="color:#0f172a;font-weight:700;padding:14px;border-top:1px solid #e2e8f0;">${escapeHtml(params.timeLabel)}</td></tr>
                  ${locationRow}
                </table>
                ${calendarInvite ? '<p style="display:inline-block;margin:18px 0 0;padding:9px 12px;color:#0f509a;background:#eef6ff;border:1px solid #cfe5ff;border-radius:999px;font-size:13px;font-weight:700;line-height:1.2;">Convite de calendário anexado</p>' : ""}
                <p style="margin:20px 0 0;color:#64748b;font-size:13px;">${escapeHtml(content.closing)}</p>
                ${
                  params.kind === "aviso_responsavel"
                    ? `<p style="margin:20px 0 0;"><a href="${agendaUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#0f509a;color:#fff;text-decoration:none;font-weight:800;font-size:13px;">Abrir calendário</a></p>`
                    : ""
                }
              </td></tr>
              <tr><td style="padding:16px 30px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">Mensagem automática enviada pelo CRM Prosperity.</td></tr>
            </table>
          </td></tr>
        </table>
      </div>
    `,
  });

  if (result.error) {
    throw new Error(result.error.message || "Erro ao enviar e-mail do calendário.");
  }

  return {
    id: result.data?.id || null,
    recipient,
    calendarInviteAttached: Boolean(calendarInvite),
  };
}
