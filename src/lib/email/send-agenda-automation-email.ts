import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
      intro: `${params.contactName || "O cliente"} possui um compromisso agendado em breve.`,
      closing: "Acesse a agenda para consultar todos os dados do atendimento.",
      name,
      location,
    };
  }

  if (params.kind === "confirmacao") {
    return {
      subject: `Confirmação de agendamento - ${company}`,
      headline: "Confirme seu agendamento",
      intro: `Seu compromisso com ${company} está reservado.`,
      closing:
        "Para confirmar, cancelar ou solicitar um novo horário, responda pelo WhatsApp utilizado no atendimento.",
      name,
      location,
    };
  }

  return {
    subject: `Lembrete de agendamento - ${company}`,
    headline: "Seu horário está chegando",
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
  const agendaUrl = `https://crmprosperity.com/agendas?agenda=${encodeURIComponent(
    params.agendaId
  )}&agendamento=${encodeURIComponent(params.appointmentId)}`;
  const locationRow = content.location
    ? `<tr><td style="width:100px;background:#f8fafc;color:#64748b;padding:14px;border-top:1px solid #e2e8f0;">Local</td><td style="color:#0f172a;font-weight:700;padding:14px;border-top:1px solid #e2e8f0;">${escapeHtml(content.location)}</td></tr>`
    : "";

  const result = await resend.emails.send({
    from: "CRM Prosperity <no-reply@crmprosperity.com>",
    to: recipient,
    subject: safeHeader(content.subject),
    headers: {
      "X-Entity-Ref-ID": `agenda-automation-${params.jobId}`,
    },
    text: [
      `Olá, ${content.name}.`,
      content.intro,
      `Compromisso: ${params.appointmentTitle}`,
      `Data: ${params.dateLabel}`,
      `Horário: ${params.timeLabel}`,
      content.location ? `Local: ${content.location}` : "",
      content.closing,
      params.kind === "aviso_responsavel" ? agendaUrl : "",
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <div style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 14px;">
          <tr><td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid #dbe4ee;border-radius:18px;overflow:hidden;">
              <tr><td style="padding:25px 28px;background:#123448;color:#fff;">
                <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.82;">${escapeHtml(company)}</div>
                <h1 style="margin:9px 0 0;font-size:23px;line-height:1.25;">${escapeHtml(content.headline)}</h1>
              </td></tr>
              <tr><td style="padding:27px 28px;color:#334155;font-size:15px;line-height:1.6;">
                <p style="margin:0;">Olá, ${escapeHtml(content.name)}.</p>
                <p style="margin:10px 0 18px;">${escapeHtml(content.intro)}</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:13px;overflow:hidden;border-collapse:separate;border-spacing:0;">
                  <tr><td style="width:100px;background:#f8fafc;color:#64748b;padding:14px;">Compromisso</td><td style="color:#0f172a;font-weight:800;padding:14px;">${escapeHtml(params.appointmentTitle)}</td></tr>
                  <tr><td style="width:100px;background:#f8fafc;color:#64748b;padding:14px;border-top:1px solid #e2e8f0;">Data</td><td style="color:#0f172a;font-weight:700;padding:14px;border-top:1px solid #e2e8f0;">${escapeHtml(params.dateLabel)}</td></tr>
                  <tr><td style="width:100px;background:#f8fafc;color:#64748b;padding:14px;border-top:1px solid #e2e8f0;">Horário</td><td style="color:#0f172a;font-weight:700;padding:14px;border-top:1px solid #e2e8f0;">${escapeHtml(params.timeLabel)}</td></tr>
                  ${locationRow}
                </table>
                <p style="margin:20px 0 0;color:#64748b;font-size:13px;">${escapeHtml(content.closing)}</p>
                ${
                  params.kind === "aviso_responsavel"
                    ? `<p style="margin:20px 0 0;"><a href="${agendaUrl}" style="display:inline-block;padding:11px 16px;border-radius:10px;background:#123448;color:#fff;text-decoration:none;font-weight:800;font-size:13px;">Abrir agenda</a></p>`
                    : ""
                }
              </td></tr>
              <tr><td style="padding:15px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">Mensagem automática enviada pelo CRM Prosperity.</td></tr>
            </table>
          </td></tr>
        </table>
      </div>
    `,
  });

  if (result.error) {
    throw new Error(result.error.message || "Erro ao enviar e-mail da agenda.");
  }

  return {
    id: result.data?.id || null,
    recipient,
  };
}
