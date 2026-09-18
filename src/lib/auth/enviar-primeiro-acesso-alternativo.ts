import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function escaparHtml(valor: string) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizarEmail(valor: string) {
  return String(valor || "").trim().toLowerCase();
}

function getTemplate(params: { nome: string; link: string }) {
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://crmprosperity.com"
  ).replace(/\/$/, "");
  const logoUrl = `${siteUrl}/logo.png`;
  const nome = escaparHtml(params.nome || "cliente");
  const link = escaparHtml(params.link);

  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Seu acesso ao CRM Prosperity</title>
    </head>
    <body style="margin:0;padding:0;background:#eef3ff;font-family:Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef3ff;padding:40px 16px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(15,23,42,.14);">
              <tr>
                <td style="background:linear-gradient(135deg,#04254d 0%,#0b1526 25%,#0b1526 75%,#082d29 100%);padding:40px 32px;text-align:center;">
                  <img src="${logoUrl}" alt="CRM Prosperity" width="170" style="display:block;margin:0 auto 18px;max-width:170px;height:auto;" />
                  <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;">Seu acesso foi liberado</h1>
                  <p style="margin:10px 0 0;color:#cbd5f5;font-size:15px;">Acesso alternativo CRM Prosperity</p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px 34px 32px;">
                  <p style="margin:0 0 18px;color:#0f172a;font-size:18px;line-height:1.6;font-weight:700;">Olá, ${nome}!</p>
                  <p style="margin:0 0 18px;color:#475569;font-size:15px;line-height:1.7;">Este é um link alternativo para criar sua senha de acesso ao <strong>CRM Prosperity</strong>.</p>
                  <p style="margin:0 0 28px;color:#475569;font-size:15px;line-height:1.7;">Clique no botão abaixo para continuar pelo processo seguro do Supabase Auth.</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding:8px 0 32px;">
                        <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#0f509a 10%,#0b2551 100%);color:#ffffff;text-decoration:none;padding:16px 30px;border-radius:999px;font-size:15px;font-weight:700;box-shadow:0 10px 24px rgba(37,99,235,.35);">Criar senha e acessar</a>
                      </td>
                    </tr>
                  </table>
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px;margin-bottom:26px;">
                    <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">Se o botão não funcionar, copie e cole este link no navegador:</p>
                    <p style="margin:10px 0 0;color:#0b5ebd;font-size:12px;line-height:1.6;word-break:break-all;">${link}</p>
                  </div>
                  <p style="margin:0;color:#64748b;font-size:13px;line-height:1.7;">Se você já criou sua senha, ignore este e-mail e faça login normalmente.</p>
                </td>
              </tr>
              <tr>
                <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px;text-align:center;">
                  <p style="margin:0 0 8px;color:#0f172a;font-size:14px;font-weight:700;">CRM Prosperity</p>
                  <p style="margin:0;color:#94a3b8;font-size:12px;">© ${new Date().getFullYear()} CRM Prosperity. Todos os direitos reservados.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}

export async function enviarPrimeiroAcessoAlternativo(params: {
  email: string;
  nome: string;
  empresaId: string;
  telefone?: string | null;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("Envio de e-mail não configurado.");
  }

  const email = normalizarEmail(params.email);
  if (!email) {
    throw new Error("A empresa não possui um e-mail válido.");
  }

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://crmprosperity.com"
  ).replace(/\/$/, "");
  const redirectTo = `${siteUrl}/auth/callback?next=/definir-senha`;

  let generated = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo,
      data: {
        nome: params.nome,
        empresa_id: params.empresaId,
        telefone: params.telefone ?? null,
      },
    },
  });

  if (generated.error) {
    const mensagem = String(generated.error.message || "").toLowerCase();
    const usuarioJaExiste =
      mensagem.includes("already been registered") ||
      mensagem.includes("already registered") ||
      mensagem.includes("user already") ||
      mensagem.includes("already exists");

    if (!usuarioJaExiste) {
      throw new Error(generated.error.message);
    }

    generated = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
  }

  if (generated.error) {
    throw new Error(generated.error.message);
  }

  const link = generated.data.properties?.action_link;
  if (!link) {
    throw new Error("Não foi possível gerar o link alternativo.");
  }

  const resend = new Resend(resendApiKey);
  const envio = await resend.emails.send({
    from: "CRM Prosperity <no-reply@crmprosperity.com>",
    to: email,
    subject: "Seu acesso alternativo ao CRM Prosperity",
    html: getTemplate({ nome: params.nome, link }),
  });

  if (envio.error) {
    throw new Error(
      envio.error.message || "Não foi possível enviar o e-mail alternativo."
    );
  }

  return {
    enviado: true as const,
    email,
  };
}
