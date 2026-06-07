import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type SendAppointmentCreatedEmailParams = {
  empresaId: string;
  to: string;
  agendamentoId: string;
  titulo?: string | null;
  agendaNome?: string | null;
  contatoNome?: string | null;
  dataLabel?: string | null;
  horaLabel?: string | null;
  label?: string | null;
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

export async function sendAppointmentCreatedEmail({
  empresaId,
  to,
  agendamentoId,
  titulo,
  agendaNome,
  contatoNome,
  dataLabel,
  horaLabel,
  label,
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

  const tituloSeguro = escaparHtml(titulo || "Agendamento");
  const agendaSeguro = escaparHtml(agendaNome || titulo || "Agendamento");
  const contatoSeguro = escaparHtml(contatoNome || "Cliente");
  const dataSeguro = escaparHtml(dataLabel || "");
  const horaSeguro = escaparHtml(horaLabel || "");
  const labelSeguro = escaparHtml(label || "");

  try {
    await resend.emails.send({
      from: "CRM Prosperity <no-reply@crmprosperity.com>",
      to: destinatario,
      subject: `Agendamento confirmado - ${agendaNome || titulo || "CRM Prosperity"}`,
      html: `
        <div style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
                  <tr>
                    <td style="background:#0f509a;padding:26px 30px;color:#ffffff;">
                      <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">
                        CRM Prosperity
                      </div>
                      <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;font-weight:800;">
                        Agendamento confirmado
                      </h1>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:28px 30px;">
                      <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.6;">
                        Ola, ${contatoSeguro}. Seu agendamento foi criado com sucesso.
                      </p>

                      <div style="border:1px solid #e2e8f0;border-radius:14px;padding:18px 20px;background:#f8fafc;">
                        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 10px;">
                          <tr>
                            <td style="width:130px;color:#64748b;font-size:13px;">Agenda</td>
                            <td style="color:#0f172a;font-size:14px;font-weight:700;">${agendaSeguro}</td>
                          </tr>
                          <tr>
                            <td style="width:130px;color:#64748b;font-size:13px;">Titulo</td>
                            <td style="color:#0f172a;font-size:14px;font-weight:700;">${tituloSeguro}</td>
                          </tr>
                          <tr>
                            <td style="width:130px;color:#64748b;font-size:13px;">Data</td>
                            <td style="color:#0f172a;font-size:14px;font-weight:700;">${dataSeguro}</td>
                          </tr>
                          <tr>
                            <td style="width:130px;color:#64748b;font-size:13px;">Horario</td>
                            <td style="color:#0f172a;font-size:14px;font-weight:700;">${horaSeguro}</td>
                          </tr>
                        </table>
                      </div>

                      ${
                        labelSeguro
                          ? `<p style="margin:18px 0 0;color:#475569;font-size:14px;line-height:1.6;">${labelSeguro}</p>`
                          : ""
                      }

                      <p style="margin:22px 0 0;color:#64748b;font-size:13px;line-height:1.6;">
                        Caso precise remarcar ou cancelar, responda ao atendimento pelo canal em que voce fez o agendamento.
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
