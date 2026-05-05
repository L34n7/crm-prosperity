import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { email } = await req.json();

  try {
    // 1. Gera link de recuperação
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/atualizar-senha`,
      },
    });

    if (error) throw error;

    const recoveryLink = data.properties?.action_link;

    // 2. Enviar email customizado
    await resend.emails.send({
      from: "CRM Prosperity <no-reply@crmprosperity.com>",
      to: email,
      subject: "Recuperação de senha",
      html: getEmailTemplate(recoveryLink!),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro ao enviar email" }, { status: 500 });
  }
}

function getEmailTemplate(link: string) {
  const logoUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/logo-crm-prosperity.png`;

  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Recuperação de senha</title>
    </head>

    <body style="margin:0; padding:0; background:#eef3ff; font-family:Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef3ff; padding:40px 16px;">
        <tr>
          <td align="center">

            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px; background:#ffffff; border-radius:24px; overflow:hidden; box-shadow:0 20px 60px rgba(15, 23, 42, 0.14);">

            <tr>
              <td style="
                background: linear-gradient(135deg, #04254d 0%, #0b1526 25%, #0b1526 75%, #082d29 100%);
                padding: 40px 32px;
                text-align: center;
                position: relative;
              ">

                <div style="
                  position:absolute;
                  inset:0;
                  background:
                    radial-gradient(circle at top left, rgba(59,130,246,0.18), transparent 40%),
                    radial-gradient(circle at bottom right, rgba(16,185,129,0.12), transparent 40%);
                  opacity:0.6;
                "></div>

                <div style="position:relative; z-index:1;">

                  <img 
                    src="${logoUrl}" 
                    alt="CRM Prosperity" 
                    width="170" 
                    style="display:block; margin:0 auto 18px auto; max-width:170px; height:auto;" 
                  />

                  <h1 style="margin:0; color:#ffffff; font-size:26px; line-height:1.3; font-weight:700;">
                    Recuperação de senha
                  </h1>

                  <p style="margin:10px 0 0 0; color:#cbd5f5; font-size:15px; line-height:1.6;">
                    Segurança e acesso à sua conta CRM Prosperity
                  </p>

                </div>

              </td>
            </tr>

              <tr>
                <td style="padding:40px 34px 32px 34px;">
                  <p style="margin:0 0 18px 0; color:#0f172a; font-size:18px; line-height:1.6; font-weight:700;">
                    Olá,
                  </p>

                  <p style="margin:0 0 18px 0; color:#475569; font-size:15px; line-height:1.7;">
                    Recebemos uma solicitação para redefinir a senha da sua conta no <strong>CRM Prosperity</strong>.
                  </p>

                  <p style="margin:0 0 28px 0; color:#475569; font-size:15px; line-height:1.7;">
                    Para criar uma nova senha com segurança, clique no botão abaixo:
                  </p>

                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding:8px 0 32px 0;">
                        <a 
                          href="${link}"
                          style="display:inline-block; background: linear-gradient(135deg, #0f509a 10%, #0b2551 100%); color:#ffffff; text-decoration:none; padding:16px 30px; border-radius:999px; font-size:15px; font-weight:700; box-shadow:0 10px 24px rgba(37,99,235,0.35);"
                        >
                          Redefinir minha senha
                        </a>
                      </td>
                    </tr>
                  </table>

                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:18px 20px; margin-bottom:26px;">
                    <p style="margin:0; color:#64748b; font-size:13px; line-height:1.6;">
                      Se o botão não funcionar, copie e cole este link no seu navegador:
                    </p>

                    <p style="margin:10px 0 0 0; color:#0b5ebd; font-size:12px; line-height:1.6; word-break:break-all;">
                      ${link}
                    </p>
                  </div>

                  <p style="margin:0; color:#64748b; font-size:13px; line-height:1.7;">
                    Se você não solicitou a recuperação de senha, pode ignorar este e-mail com segurança. Nenhuma alteração será feita na sua conta.
                  </p>
                </td>
              </tr>

              <tr>
                <td style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:24px 32px; text-align:center;">
                  <p style="margin:0 0 8px 0; color:#0f172a; font-size:14px; font-weight:700;">
                    CRM Prosperity
                  </p>

                  <p style="margin:0; color:#94a3b8; font-size:12px; line-height:1.6;">
                    © ${new Date().getFullYear()} CRM Prosperity. Todos os direitos reservados.
                  </p>
                </td>
              </tr>

            </table>

          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}