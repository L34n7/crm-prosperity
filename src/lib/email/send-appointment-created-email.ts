import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/admin";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type SendAppointmentCreatedEmailParams = {
  empresaId: string;
  to: string;
  agendamentoId: string;
  contatoNome?: string | null;
  dataLabel?: string | null;
  horaLabel?: string | null;
  inicioAt?: string | null;
  fimAt?: string | null;
};

function escaparHtml(valor: string) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailValido(valor: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(valor || "").trim());
}

function textoCabecalhoSeguro(valor: string) {
  return String(valor || "")
    .replace(/[\r\n<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dataIcsValida(valor: string | null | undefined) {
  if (!valor) return null;

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

function formatarDataIcs(data: Date) {
  return data.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escaparIcsTexto(valor: string) {
  return String(valor || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function escaparIcsParametro(valor: string) {
  return `"${String(valor || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ")}"`;
}

function dobrarLinhaIcs(linha: string) {
  const limite = 73;
  const partes = [];
  let restante = linha;

  while (restante.length > limite) {
    partes.push(restante.slice(0, limite));
    restante = restante.slice(limite);
  }

  partes.push(restante);
  return partes.join("\r\n ");
}

function montarConviteCalendario(params: {
  agendamentoId: string;
  empresaNome: string;
  destinatario: string;
  contatoNome: string;
  dataLabel: string;
  horaLabel: string;
  inicioAt?: string | null;
  fimAt?: string | null;
}) {
  const inicio = dataIcsValida(params.inicioAt);
  const fim = dataIcsValida(params.fimAt);

  if (!inicio || !fim || fim <= inicio) return null;

  const resumo = `Agendamento com ${params.empresaNome}`;
  const descricao = [
    `Agendamento confirmado com ${params.empresaNome}.`,
    params.dataLabel ? `Data: ${params.dataLabel}.` : "",
    params.horaLabel ? `Horario: ${params.horaLabel}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CRM Prosperity//Agendamento//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${escaparIcsTexto(params.agendamentoId)}@crmprosperity.com`,
    `DTSTAMP:${formatarDataIcs(new Date())}`,
    `DTSTART:${formatarDataIcs(inicio)}`,
    `DTEND:${formatarDataIcs(fim)}`,
    `SUMMARY:${escaparIcsTexto(resumo)}`,
    `DESCRIPTION:${escaparIcsTexto(descricao)}`,
    `ORGANIZER;CN=${escaparIcsParametro(
      params.empresaNome
    )}:mailto:no-reply@crmprosperity.com`,
    `ATTENDEE;CN=${escaparIcsParametro(
      params.contatoNome
    )};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${params.destinatario}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${linhas.map(dobrarLinhaIcs).join("\r\n")}\r\n`;
}

async function buscarNomeEmpresa(empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("empresas")
    .select("nome_fantasia, razao_social")
    .eq("id", empresaId)
    .maybeSingle();

  if (error) {
    console.error("[APPOINTMENT_EMAIL] Erro ao buscar empresa:", error);
  }

  return (
    String(data?.nome_fantasia || "").trim() ||
    String(data?.razao_social || "").trim() ||
    "CRM Prosperity"
  );
}

export async function sendAppointmentCreatedEmail({
  empresaId,
  to,
  agendamentoId,
  contatoNome,
  dataLabel,
  horaLabel,
  inicioAt,
  fimAt,
}: SendAppointmentCreatedEmailParams) {
  if (!resend) {
    console.warn("[APPOINTMENT_EMAIL] RESEND_API_KEY nao configurada.");
    return;
  }

  const destinatario = String(to || "").trim().toLowerCase();

  if (!emailValido(destinatario)) {
    console.warn("[APPOINTMENT_EMAIL] Destinatario invalido.", {
      empresaId,
      agendamentoId,
    });
    return;
  }

  const empresaNome = await buscarNomeEmpresa(empresaId);
  const empresaSeguro = escaparHtml(empresaNome);
  const empresaCabecalho = textoCabecalhoSeguro(empresaNome || "CRM Prosperity");
  const contatoSeguro = escaparHtml(contatoNome || "Cliente");
  const dataSeguro = escaparHtml(dataLabel || "");
  const horaSeguro = escaparHtml(horaLabel || "");
  const conviteCalendario = montarConviteCalendario({
    agendamentoId,
    empresaNome,
    destinatario,
    contatoNome: contatoNome || "Cliente",
    dataLabel: dataLabel || "",
    horaLabel: horaLabel || "",
    inicioAt,
    fimAt,
  });

  try {
    await resend.emails.send({
      from: "CRM Prosperity <no-reply@crmprosperity.com>",
      to: destinatario,
      subject: `Agendamento confirmado - ${empresaCabecalho}`,
      text: [
        `Ola, ${contatoNome || "Cliente"}.`,
        `Confirmamos seu agendamento com ${empresaNome}.`,
        `Data: ${dataLabel || ""}`,
        `Horario: ${horaLabel || ""}`,
        "O convite de calendario esta anexado a este email.",
        "Para remarcar ou cancelar, responda pelo mesmo canal em que realizou o agendamento.",
      ].join("\n"),
      ...(conviteCalendario
        ? {
            attachments: [
              {
                filename: "agendamento.ics",
                content: conviteCalendario,
                contentType: "text/calendar; charset=UTF-8; method=REQUEST",
              },
            ],
          }
        : {}),
      html: `
        <div style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
                  <tr>
                    <td style="background:#0f509a;padding:26px 30px;color:#ffffff;">
                      <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">
                        ${empresaSeguro}
                      </div>
                      <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;font-weight:800;">
                        Agendamento confirmado
                      </h1>
                      <p style="margin:8px 0 0;font-size:18px;line-height:1.35;font-weight:700;opacity:0.95;">
                        Seu horario foi reservado com sucesso
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:28px 30px;">
                      <p style="margin:0;color:#334155;font-size:15px;line-height:1.6;">
                        Ola, ${contatoSeguro}.
                      </p>
                      <p style="margin:10px 0 0;color:#334155;font-size:15px;line-height:1.6;">
                        Confirmamos seu agendamento com <strong>${empresaSeguro}</strong>.
                      </p>

                      <div style="margin-top:20px;overflow:hidden;border:1px solid #dbe4ee;border-radius:14px;">
                        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                          <tr>
                            <td style="width:96px;background:#f8fafc;color:#64748b;font-size:13px;padding:16px;border-bottom:1px solid #e7edf5;">
                              Data
                            </td>
                            <td style="color:#0f172a;font-size:17px;font-weight:800;padding:16px;border-bottom:1px solid #e7edf5;">
                              ${dataSeguro}
                            </td>
                          </tr>
                          <tr>
                            <td style="width:96px;background:#f8fafc;color:#64748b;font-size:13px;padding:16px;">
                              Horario
                            </td>
                            <td style="color:#0f172a;font-size:17px;font-weight:800;padding:16px;">
                              ${horaSeguro}
                            </td>
                          </tr>
                        </table>
                      </div>

                      ${
                        conviteCalendario
                          ? `<p style="display:inline-block;margin:18px 0 0;padding:9px 12px;color:#0f509a;background:#eef6ff;border:1px solid #cfe5ff;border-radius:999px;font-size:13px;font-weight:700;line-height:1.2;">
                              Convite de calendario anexado
                            </p>`
                          : ""
                      }

                      <p style="margin:22px 0 0;color:#64748b;font-size:13px;line-height:1.6;">
                        Para remarcar ou cancelar, responda pelo mesmo canal em que realizou o agendamento.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="background:#f8fafc;padding:16px 30px;border-top:1px solid #e2e8f0;">
                      <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                        Este email foi enviado automaticamente porque um agendamento foi criado no CRM Prosperity.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      `,
    });

    console.log("[APPOINTMENT_EMAIL] Email enviado.", {
      empresaId,
      agendamentoId,
      destinatario,
    });
  } catch (error) {
    console.error("[APPOINTMENT_EMAIL] Erro ao enviar email:", error);
  }
}
