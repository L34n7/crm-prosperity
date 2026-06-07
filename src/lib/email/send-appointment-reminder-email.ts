import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/admin";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type SendAppointmentReminderEmailParams = {
  empresaId: string;
  to: string;
  agendamentoId: string;
  contatoNome?: string | null;
  dataLabel?: string | null;
  horaLabel?: string | null;
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
    console.error("[APPOINTMENT_REMINDER_EMAIL] Erro ao buscar empresa:", error);
  }

  return (
    String(data?.nome_fantasia || "").trim() ||
    String(data?.razao_social || "").trim() ||
    "CRM Prosperity"
  );
}

export async function sendAppointmentReminderEmail({
  empresaId,
  to,
  agendamentoId,
  contatoNome,
  dataLabel,
  horaLabel,
}: SendAppointmentReminderEmailParams) {
  if (!resend) {
    console.warn("[APPOINTMENT_REMINDER_EMAIL] RESEND_API_KEY nao configurada.");
    return;
  }

  const destinatario = String(to || "").trim().toLowerCase();

  if (!emailValido(destinatario)) {
    console.warn("[APPOINTMENT_REMINDER_EMAIL] Destinatario invalido.", {
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

  try {
    await resend.emails.send({
      from: "CRM Prosperity <no-reply@crmprosperity.com>",
      to: destinatario,
      subject: `Lembrete de agendamento - ${empresaCabecalho}`,
      text: [
        `Ola, ${contatoNome || "Cliente"}.`,
        `Este e um lembrete do seu agendamento com ${empresaNome}.`,
        `Data: ${dataLabel || ""}`,
        `Horario: ${horaLabel || ""}`,
        "Para remarcar ou cancelar, responda pelo mesmo canal em que realizou o agendamento.",
      ].join("\n"),
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
                        Lembrete de agendamento
                      </h1>
                      <p style="margin:8px 0 0;font-size:18px;line-height:1.35;font-weight:700;opacity:0.95;">
                        Seu horario esta chegando
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:28px 30px;">
                      <p style="margin:0;color:#334155;font-size:15px;line-height:1.6;">
                        Ola, ${contatoSeguro}.
                      </p>
                      <p style="margin:10px 0 0;color:#334155;font-size:15px;line-height:1.6;">
                        Este e um lembrete do seu agendamento com <strong>${empresaSeguro}</strong>.
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

                      <p style="margin:22px 0 0;color:#64748b;font-size:13px;line-height:1.6;">
                        Para remarcar ou cancelar, responda pelo mesmo canal em que realizou o agendamento.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="background:#f8fafc;padding:16px 30px;border-top:1px solid #e2e8f0;">
                      <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                        Este email foi enviado automaticamente como lembrete de um agendamento criado no CRM Prosperity.
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

    console.log("[APPOINTMENT_REMINDER_EMAIL] Email enviado.", {
      empresaId,
      agendamentoId,
      destinatario,
    });
  } catch (error) {
    console.error("[APPOINTMENT_REMINDER_EMAIL] Erro ao enviar email:", error);
  }
}
