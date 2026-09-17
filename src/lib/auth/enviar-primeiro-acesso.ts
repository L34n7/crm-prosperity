import { createHash, randomBytes } from "crypto";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();
const DURACAO_PRIMEIRO_ACESSO_MS = 24 * 60 * 60 * 1000;
const MAX_ABERTURAS_PRIMEIRO_ACESSO = 3;

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

export function hashTokenPrimeiroAcesso(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenPrimeiroAcessoValido(token: unknown): token is string {
  return (
    typeof token === "string" &&
    token.length >= 32 &&
    token.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(token)
  );
}

async function buscarAuthUserIdPorEmail(email: string) {
  const { data, error } = await supabaseAdmin.rpc(
    "obter_auth_user_id_por_email",
    { p_email: email }
  );

  if (error) {
    throw new Error(`Erro ao localizar usuário de autenticação: ${error.message}`);
  }

  return typeof data === "string" && data ? data : null;
}

async function garantirUsuarioAuth(params: {
  email: string;
  nome: string;
  empresaId: string;
  telefone?: string | null;
}) {
  const email = normalizarEmail(params.email);
  const metadata = {
    nome: params.nome,
    empresa_id: params.empresaId,
    telefone: params.telefone ?? null,
  };

  let authUserId = await buscarAuthUserIdPorEmail(email);

  if (!authUserId) {
    const criado = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (!criado.error && criado.data.user) {
      return criado.data.user.id;
    }

    const mensagem = String(criado.error?.message || "").toLowerCase();
    const usuarioJaExiste =
      mensagem.includes("already been registered") ||
      mensagem.includes("already registered") ||
      mensagem.includes("user already") ||
      mensagem.includes("already exists");

    if (!usuarioJaExiste) {
      throw new Error(
        criado.error?.message || "Erro ao criar usuário de autenticação."
      );
    }

    authUserId = await buscarAuthUserIdPorEmail(email);
  }

  if (!authUserId) {
    throw new Error("Não foi possível localizar o usuário de autenticação.");
  }

  const atual = await supabaseAdmin.auth.admin.getUserById(authUserId);
  if (atual.error || !atual.data.user) {
    throw new Error(
      atual.error?.message || "Usuário de autenticação não encontrado."
    );
  }

  const atualizado = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
    user_metadata: {
      ...(atual.data.user.user_metadata || {}),
      ...metadata,
    },
  });

  if (atualizado.error) {
    throw new Error(atualizado.error.message);
  }

  return authUserId;
}

function getPrimeiroAcessoTemplate(params: {
  nome: string;
  link: string;
}) {
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://crmprosperity.com"
  ).replace(/\/$/, "");
  const logoUrl = `${siteUrl}/logo.png`;
  const nomeCliente = escaparHtml(params.nome?.trim() || "cliente");
  const link = escaparHtml(params.link);

  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Acesso liberado</title>
    </head>

    <body style="margin:0; padding:0; background:#eef3ff; font-family:Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef3ff; padding:40px 16px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px; background:#ffffff; border-radius:24px; overflow:hidden; box-shadow:0 20px 60px rgba(15, 23, 42, 0.14);">
              <tr>
                <td style="background:linear-gradient(135deg,#04254d 0%,#0b1526 25%,#0b1526 75%,#082d29 100%);padding:40px 32px;text-align:center;position:relative;">
                  <div style="position:absolute;inset:0;background:radial-gradient(circle at top left,rgba(59,130,246,0.18),transparent 40%),radial-gradient(circle at bottom right,rgba(16,185,129,0.12),transparent 40%);opacity:0.6;"></div>
                  <div style="position:relative;z-index:1;">
                    <img src="${logoUrl}" alt="CRM Prosperity" width="170" style="display:block;margin:0 auto 18px auto;max-width:170px;height:auto;" />
                    <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;">Seu acesso foi liberado</h1>
                    <p style="margin:10px 0 0;color:#cbd5f5;font-size:15px;">Bem-vindo ao CRM Prosperity</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:40px 34px 32px 34px;">
                  <p style="margin:0 0 18px 0;color:#0f172a;font-size:18px;line-height:1.6;font-weight:700;">Olá, ${nomeCliente}!</p>
                  <p style="margin:0 0 18px 0;color:#475569;font-size:15px;line-height:1.7;">Seu acesso ao <strong>CRM Prosperity</strong> já está pronto.</p>
                  <p style="margin:0 0 18px 0;color:#475569;font-size:15px;line-height:1.7;">O link abaixo é válido por <strong>24 horas</strong> e pode ser aberto em até <strong>3 vezes</strong>. A senha poderá ser cadastrada apenas uma vez.</p>
                  <p style="margin:0 0 28px 0;color:#475569;font-size:15px;line-height:1.7;">Para começar a usar a plataforma, clique no botão abaixo e crie sua senha de acesso com segurança.</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding:8px 0 32px 0;">
                        <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#0f509a 10%,#0b2551 100%);color:#ffffff;text-decoration:none;padding:16px 30px;border-radius:999px;font-size:15px;font-weight:700;box-shadow:0 10px 24px rgba(37,99,235,0.35);">Criar senha e acessar</a>
                      </td>
                    </tr>
                  </table>
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px;margin-bottom:26px;">
                    <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">Se o botão não funcionar, copie e cole este link no seu navegador:</p>
                    <p style="margin:10px 0 0 0;color:#0b5ebd;font-size:12px;line-height:1.6;word-break:break-all;">${link}</p>
                  </div>
                  <p style="margin:0;color:#64748b;font-size:13px;line-height:1.7;">Por segurança, recomendamos criar uma senha forte e não compartilhar este link nem seus dados de acesso com terceiros.</p>
                </td>
              </tr>
              <tr>
                <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px;text-align:center;">
                  <p style="margin:0 0 8px 0;color:#0f172a;font-size:14px;font-weight:700;">CRM Prosperity</p>
                  <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">© ${new Date().getFullYear()} CRM Prosperity. Todos os direitos reservados.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}

export async function enviarPrimeiroAcesso(params: {
  email: string;
  nome: string;
  empresaId: string;
  telefone?: string | null;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    throw new Error("Envio de email não configurado.");
  }

  const email = normalizarEmail(params.email);
  if (!email) {
    throw new Error("Email inválido para primeiro acesso.");
  }

  const authUserId = await garantirUsuarioAuth({
    ...params,
    email,
  });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashTokenPrimeiroAcesso(token);
  const expiraEm = new Date(
    Date.now() + DURACAO_PRIMEIRO_ACESSO_MS
  ).toISOString();
  const agora = new Date().toISOString();

  const insercao = await supabaseAdmin
    .from("primeiro_acesso_tokens")
    .insert({
      empresa_id: params.empresaId,
      auth_user_id: authUserId,
      email,
      token_hash: tokenHash,
      expira_em: expiraEm,
      aberturas: 0,
      max_aberturas: MAX_ABERTURAS_PRIMEIRO_ACESSO,
    })
    .select("id")
    .single();

  if (insercao.error || !insercao.data) {
    throw new Error(
      `Erro ao criar link de primeiro acesso: ${
        insercao.error?.message || "registro não criado"
      }`
    );
  }

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://crmprosperity.com"
  ).replace(/\/$/, "");
  const link = `${siteUrl}/primeiro-acesso?token=${encodeURIComponent(token)}`;

  const resend = new Resend(resendApiKey);
  const envio = await resend.emails.send({
    from: "CRM Prosperity <no-reply@crmprosperity.com>",
    to: email,
    subject: "Seu acesso ao CRM Prosperity foi liberado",
    html: getPrimeiroAcessoTemplate({ nome: params.nome, link }),
  });

  if (envio.error) {
    await supabaseAdmin
      .from("primeiro_acesso_tokens")
      .delete()
      .eq("id", insercao.data.id);
    throw new Error(
      envio.error.message || "Erro ao enviar email de primeiro acesso."
    );
  }

  const invalidacao = await supabaseAdmin
    .from("primeiro_acesso_tokens")
    .update({ invalidado_em: agora, updated_at: agora })
    .eq("auth_user_id", authUserId)
    .neq("id", insercao.data.id)
    .is("senha_definida_em", null)
    .is("invalidado_em", null);

  if (invalidacao.error) {
    console.error(
      "[PRIMEIRO ACESSO] Falha ao invalidar links anteriores:",
      invalidacao.error
    );
  }

  return {
    enviado: true as const,
    expira_em: expiraEm,
    max_aberturas: MAX_ABERTURAS_PRIMEIRO_ACESSO,
  };
}
