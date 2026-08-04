import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildCalendarInvite,
  calendarInviteContentType,
} from "@/lib/email/calendar-invite"; // CRM_CALENDAR_EMAIL_REMINDER_BUTTONS_PRIORITY_V1

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
  tipo?: "criacao" | "remarcacao" | "cancelamento";
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
  tipo = "criacao",
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
  const appUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://crmprosperity.com"
  ).replace(/\/$/, "");
  const logoUrl = `${appUrl}/logo.png`;
  const contatoSeguro = escaparHtml(contatoNome || "Cliente");
  const dataSeguro = escaparHtml(dataLabel || "");
  const horaSeguro = escaparHtml(horaLabel || "");
  const ehRemarcacao = tipo === "remarcacao";
  const ehCancelamento = tipo === "cancelamento";
  const tituloEmail = ehRemarcacao
    ? "Agendamento remarcado"
    : ehCancelamento
    ? "Agendamento cancelado"
    : "Agendamento confirmado";
  const subtituloEmail = ehRemarcacao
    ? "Seu novo horario foi reservado com sucesso"
    : ehCancelamento
    ? "Seu horario foi cancelado"
    : "Seu horario foi reservado com sucesso";
  const textoConfirmacao = ehRemarcacao
    ? "Confirmamos a remarcacao do seu agendamento"
    : ehCancelamento
    ? "Confirmamos o cancelamento do seu agendamento"
    : "Confirmamos seu agendamento";
  const rodapeMotivo = ehRemarcacao
    ? "um agendamento foi remarcado"
    : ehCancelamento
    ? "um agendamento foi cancelado"
    : "um agendamento foi criado";
  const textoCalendario = ehCancelamento
    ? "A atualizacao de calendario para cancelar o evento esta anexada a este email."
    : "O convite de calendario esta anexado a este email.";
  const textoAcao = ehCancelamento
    ? "Se precisar marcar novamente, responda pelo mesmo canal em que realizou o agendamento."
    : "Para remarcar ou cancelar, responda pelo mesmo canal em que realizou o agendamento.";
  const conviteCalendario = buildCalendarInvite({
    appointmentId: agendamentoId,
    companyName: empresaNome,
    attendeeEmail: destinatario,
    attendeeName: contatoNome || "Cliente",
    title: `Agendamento com ${empresaNome}`,
    description: [
      `${textoConfirmacao} com ${empresaNome}.`,
      dataLabel ? `Data: ${dataLabel}.` : "",
      horaLabel ? `Horário: ${horaLabel}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    startAt: inicioAt,
    endAt: fimAt,
    sequence: ehCancelamento ? 2 : ehRemarcacao ? 1 : 0,
    method: ehCancelamento ? "CANCEL" : "REQUEST",
    status: ehCancelamento ? "CANCELLED" : "CONFIRMED",
  });
  const conviteContentType = calendarInviteContentType(
    ehCancelamento ? "CANCEL" : "REQUEST"
  );

  try {
    await resend.emails.send({
      from: "CRM Prosperity <no-reply@crmprosperity.com>",
      to: destinatario,
      subject: `${tituloEmail} - ${empresaCabecalho}`,
      text: [
        `Ola, ${contatoNome || "Cliente"}.`,
        `${textoConfirmacao} com ${empresaNome}.`,
        `Data: ${dataLabel || ""}`,
        `Horario: ${horaLabel || ""}`,
        textoCalendario,
        textoAcao,
      ].join("\n"),
      ...(conviteCalendario
        ? {
            attachments: [
              {
                filename: "agendamento.ics",
                content: conviteCalendario,
                contentType: conviteContentType,
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
                    <td style="background:linear-gradient(135deg,#0f509a,#0f172a);padding:28px 32px;color:#ffffff;">
                      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
                        <td style="padding:0;vertical-align:middle;">
                          <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">${empresaSeguro}</div>
                          <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;font-weight:800;">${tituloEmail}</h1>
                          <p style="margin:8px 0 0;font-size:15px;line-height:1.45;font-weight:700;opacity:0.95;">${subtituloEmail}</p>
                        </td>
                        <td width="86" align="right" style="width:86px;padding:0 0 0 18px;vertical-align:middle;">
                          <img src="${logoUrl}" alt="CRM Prosperity" width="72" style="display:block;width:72px;height:auto;border:0;outline:none;text-decoration:none;" />
                        </td>
                      </tr></table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:28px 30px;">
                      <p style="margin:0;color:#334155;font-size:15px;line-height:1.6;">
                        Ola, ${contatoSeguro}.
                      </p>
                      <p style="margin:10px 0 0;color:#334155;font-size:15px;line-height:1.6;">
                        ${textoConfirmacao} com <strong>${empresaSeguro}</strong>.
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
                              ${
                                ehCancelamento
                                  ? "Atualizacao de calendario anexada"
                                  : "Convite de calendario anexado"
                              }
                            </p>`
                          : ""
                      }

                      <p style="margin:22px 0 0;color:#64748b;font-size:13px;line-height:1.6;">
                        ${textoAcao}
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="background:#f8fafc;padding:16px 30px;border-top:1px solid #e2e8f0;">
                      <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                        Este email foi enviado automaticamente porque ${rodapeMotivo} no CRM Prosperity.
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
