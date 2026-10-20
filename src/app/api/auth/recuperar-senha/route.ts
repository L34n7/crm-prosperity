import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  obterBrandingDaEmpresa,
  obterBrandingPorHost,
} from "@/lib/white-label/branding";
import {
  montarEmailBranding,
  type EmailBrandingContext,
} from "@/lib/email/white-label-branding";

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = getSupabaseAdmin();

function escaparHtml(valor: string) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizarEmail(valor: unknown) {
  return String(valor || "").trim().toLowerCase();
}

async function buscarEmpresaIdPorEmail(email: string) {
  const { data: usuario } = await supabase
    .from("usuarios")
    .select("empresa_id")
    .ilike("email", email)
    .eq("status", "ativo")
    .limit(1)
    .maybeSingle<{ empresa_id: string | null }>();

  if (usuario?.empresa_id) return usuario.empresa_id;

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (empresa?.id) return empresa.id;

  const { data: adminWhiteLabel } = await supabase
    .from("white_label_administradores")
    .select("white_label_id")
    .ilike("email", email)
    .eq("status", "ativo")
    .limit(1)
    .maybeSingle<{ white_label_id: string }>();

  if (!adminWhiteLabel?.white_label_id) return null;

  const { data: whiteLabel } = await supabase
    .from("white_labels")
    .select("empresa_gestora_id")
    .eq("id", adminWhiteLabel.white_label_id)
    .maybeSingle<{ empresa_gestora_id: string | null }>();

  return whiteLabel?.empresa_gestora_id || null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = normalizarEmail(body?.email);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Informe um e-mail válido." },
      { status: 400 }
    );
  }

  try {
    const host =
      req.headers.get("x-forwarded-host") || req.headers.get("host");
    const brandingHost = await obterBrandingPorHost(host);
    const empresaId = await buscarEmpresaIdPorEmail(email);
    const brandingConta = empresaId
      ? await obterBrandingDaEmpresa(empresaId)
      : brandingHost;

    if (
      brandingHost.is_white_label &&
      (!brandingConta.is_white_label || brandingConta.id !== brandingHost.id)
    ) {
      return NextResponse.json({ ok: true });
    }

    const contextoEmail = montarEmailBranding(brandingConta);
    const redirectTo = contextoEmail.siteUrl + "/atualizar-senha";

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (error) {
      const mensagem = String(error.message || "").toLowerCase();
      if (
        mensagem.includes("not found") ||
        mensagem.includes("no user") ||
        mensagem.includes("invalid")
      ) {
        return NextResponse.json({ ok: true });
      }
      throw error;
    }

    const recoveryLink = data.properties?.action_link;
    if (!recoveryLink) {
      throw new Error("Não foi possível gerar o link de recuperação.");
    }

    const envio = await resend.emails.send({
      from: contextoEmail.from,
      to: email,
      subject: "Recuperação de senha • " + contextoEmail.nomeProduto,
      text: [
        "Recuperação de senha",
        "",
        "Recebemos uma solicitação para redefinir a senha da sua conta no " +
          contextoEmail.nomeProduto +
          ".",
        "",
        "Acesse o link abaixo para criar uma nova senha:",
        recoveryLink,
        "",
        "Se você não solicitou a recuperação, ignore este e-mail.",
        contextoEmail.rodapeWhiteLabelTexto,
      ]
        .filter(Boolean)
        .join("\n"),
      html: getEmailTemplate(recoveryLink, contextoEmail),
    });

    if (envio.error) {
      throw new Error(envio.error.message || "Falha ao enviar e-mail.");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[RECUPERAR SENHA]", err);
    return NextResponse.json({ error: "Erro ao enviar email" }, { status: 500 });
  }
}

function getEmailTemplate(link: string, contexto: EmailBrandingContext) {
  const linkSeguro = escaparHtml(link);
  const logoUrl = escaparHtml(contexto.logoUrl);
  const nomeProduto = escaparHtml(contexto.nomeProduto);
  const nomeMarca = escaparHtml(contexto.nomeMarca);

  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Recuperação de senha</title>
    </head>
    <body style="margin:0;padding:0;background:#eef3ff;font-family:Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef3ff;padding:40px 16px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(15,23,42,.14);">
              <tr>
                <td style="background:linear-gradient(135deg,#04254d 0%,#0b1526 25%,#0b1526 75%,#082d29 100%);padding:40px 32px;text-align:center;">
                  <img src="${logoUrl}" alt="${nomeProduto}" width="170" style="display:block;margin:0 auto 18px;max-width:170px;max-height:82px;object-fit:contain;height:auto;" />
                  <h1 style="margin:0;color:#ffffff;font-size:26px;line-height:1.3;font-weight:700;">Recuperação de senha</h1>
                  <p style="margin:10px 0 0;color:#cbd5f5;font-size:15px;line-height:1.6;">Segurança e acesso à sua conta ${nomeProduto}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px 34px 32px;">
                  <p style="margin:0 0 18px;color:#0f172a;font-size:18px;line-height:1.6;font-weight:700;">Olá,</p>
                  <p style="margin:0 0 18px;color:#475569;font-size:15px;line-height:1.7;">Recebemos uma solicitação para redefinir a senha da sua conta no <strong>${nomeProduto}</strong>.</p>
                  <p style="margin:0 0 28px;color:#475569;font-size:15px;line-height:1.7;">Para criar uma nova senha com segurança, clique no botão abaixo:</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding:8px 0 32px;">
                        <a href="${linkSeguro}" style="display:inline-block;background:linear-gradient(135deg,#0f509a 10%,#0b2551 100%);color:#ffffff;text-decoration:none;padding:16px 30px;border-radius:999px;font-size:15px;font-weight:700;box-shadow:0 10px 24px rgba(37,99,235,.35);">Redefinir minha senha</a>
                      </td>
                    </tr>
                  </table>
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px;margin-bottom:26px;">
                    <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">Se o botão não funcionar, copie e cole este link no seu navegador:</p>
                    <p style="margin:10px 0 0;color:#0b5ebd;font-size:12px;line-height:1.6;word-break:break-all;">${linkSeguro}</p>
                  </div>
                  <p style="margin:0;color:#64748b;font-size:13px;line-height:1.7;">Se você não solicitou a recuperação de senha, pode ignorar este e-mail com segurança. Nenhuma alteração será feita na sua conta.</p>
                </td>
              </tr>
              <tr>
                <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px;text-align:center;">
                  <p style="margin:0 0 8px;color:#0f172a;font-size:14px;font-weight:700;">${nomeProduto}</p>
                  <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">© ${new Date().getFullYear()} ${nomeMarca}. Todos os direitos reservados.</p>
                  ${contexto.rodapeWhiteLabelHtml}
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
