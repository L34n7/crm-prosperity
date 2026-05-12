import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type SendAutomationNotificationEmailParams = {
  empresaId: string;
  conversaId: string;
  titulo: string;
  mensagem: string;
};

export async function sendAutomationNotificationEmail({
  empresaId,
  conversaId,
  titulo,
  mensagem,
}: SendAutomationNotificationEmailParams) {
  if (!resend) {
    console.warn("[AUTOMATION_EMAIL] RESEND_API_KEY não configurada.");
    return;
  }

  const { data: usuarios, error: usuariosError } = await supabaseAdmin
    .from("usuarios")
    .select("id,nome,email,status")
    .eq("empresa_id", empresaId)
    .eq("status", "ativo");

  if (usuariosError) {
    console.error(
      "[AUTOMATION_EMAIL] Erro ao buscar usuários:",
      usuariosError
    );

    return;
  }

  const destinatarios = (usuarios || [])
    .map((usuario) => String(usuario.email || "").trim())
    .filter(Boolean);

  if (destinatarios.length === 0) {
    console.warn("[AUTOMATION_EMAIL] Nenhum destinatário.");
    return;
  }

  const appUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://crm-prosperity.vercel.app";

  const linkConversa = `${appUrl}/conversas?id=${conversaId}`;

  try {
    await resend.emails.send({
      from: "CRM Prosperity <no-reply@crmprosperity.com>",
      to: destinatarios,
      subject: titulo || "Nova notificação do CRM Prosperity",
      html: `
        <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:32px;">
          <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px;border:1px solid #e2e8f0;">
            
            <h2 style="margin:0 0 16px;color:#0f172a;">
              ${titulo}
            </h2>

            <p style="font-size:15px;line-height:1.6;color:#475569;">
              ${mensagem}
            </p>

            <a
              href="${linkConversa}"
              style="display:inline-block;margin-top:18px;background:#0f509a;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:999px;font-weight:700;"
            >
              Abrir conversa
            </a>

            <p style="margin-top:24px;color:#94a3b8;font-size:12px;">
              CRM Prosperity
            </p>

          </div>
        </div>
      `,
    });

    console.log("[AUTOMATION_EMAIL] Email enviado.", {
      destinatarios: destinatarios.length,
      conversaId,
    });
  } catch (error) {
    console.error("[AUTOMATION_EMAIL] Erro ao enviar email:", error);
  }
}