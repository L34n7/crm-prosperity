import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { obterEmailBrandingEmpresa } from "@/lib/email/white-label-branding";
import {
  WHATSAPP_META_BLOCK_HELP_URL,
  WHATSAPP_META_MANAGER_URL,
} from "@/lib/whatsapp/meta-block";

const supabaseAdmin = getSupabaseAdmin();
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type Params = {
  empresaId: string;
  integracaoId: string;
  codigoMeta?: number | null;
  motivo?: string | null;
  detalhe?: string | null;
  ocorridoEm?: string | null;
};

function escaparHtml(valor: string) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailValido(valor: unknown) {
  const email = String(valor || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

function dataPtBr(valor?: string | null) {
  const data = valor ? new Date(valor) : new Date();
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

async function buscarEmailAdministrador(empresaId: string) {
  const { data: perfis, error: perfisError } = await supabaseAdmin
    .from("perfis_empresa")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .ilike("nome", "Administrador");

  if (perfisError) {
    console.warn(
      "[META ACCOUNT BLOCK EMAIL] Erro ao buscar perfil Administrador:",
      perfisError
    );
    return null;
  }

  const perfilIds = (perfis || []).map((item) => item.id).filter(Boolean);
  if (!perfilIds.length) return null;

  const { data: vinculos, error: vinculosError } = await supabaseAdmin
    .from("usuarios_perfis")
    .select("usuario_id")
    .in("perfil_empresa_id", perfilIds);

  if (vinculosError) {
    console.warn(
      "[META ACCOUNT BLOCK EMAIL] Erro ao buscar vínculo de administradores:",
      vinculosError
    );
    return null;
  }

  const usuarioIds = Array.from(
    new Set((vinculos || []).map((item) => item.usuario_id).filter(Boolean))
  );
  if (!usuarioIds.length) return null;

  const { data: usuarios, error: usuariosError } = await supabaseAdmin
    .from("usuarios")
    .select("email")
    .eq("empresa_id", empresaId)
    .eq("status", "ativo")
    .in("id", usuarioIds)
    .limit(10);

  if (usuariosError) {
    console.warn(
      "[META ACCOUNT BLOCK EMAIL] Erro ao buscar e-mail dos administradores:",
      usuariosError
    );
    return null;
  }

  for (const usuario of usuarios || []) {
    const email = emailValido(usuario.email);
    if (email) return email;
  }

  return null;
}

async function buscarContexto(params: Params) {
  const [{ data: empresa, error: empresaError }, { data: integracao, error: integracaoError }] =
    await Promise.all([
      supabaseAdmin
        .from("empresas")
        .select("email,nome_fantasia,razao_social")
        .eq("id", params.empresaId)
        .maybeSingle(),
      supabaseAdmin
        .from("integracoes_whatsapp")
        .select("nome_conexao,numero")
        .eq("id", params.integracaoId)
        .eq("empresa_id", params.empresaId)
        .maybeSingle(),
    ]);

  if (empresaError || integracaoError) {
    console.warn("[META ACCOUNT BLOCK EMAIL] Erro ao carregar contexto:", {
      empresaError,
      integracaoError,
    });
  }

  const destinatario =
    emailValido(empresa?.email) ||
    (await buscarEmailAdministrador(params.empresaId));

  return {
    destinatario,
    empresaNome:
      String(empresa?.nome_fantasia || "").trim() ||
      String(empresa?.razao_social || "").trim() ||
      "sua empresa",
    integracaoNome:
      String(integracao?.nome_conexao || "").trim() || "WhatsApp",
    numero: String(integracao?.numero || "").trim(),
  };
}

export async function sendMetaAccountBlockedEmail(params: Params) {
  if (!resend) {
    console.warn("[META ACCOUNT BLOCK EMAIL] RESEND_API_KEY não configurada.");
    return { enviado: false, motivo: "resend_nao_configurado" };
  }

  const ocorridoEm = params.ocorridoEm || new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc(
    "claim_whatsapp_meta_block_email",
    {
      p_empresa_id: params.empresaId,
      p_integracao_id: params.integracaoId,
      p_claimed_at: ocorridoEm,
    }
  );

  if (claimError) {
    console.warn(
      "[META ACCOUNT BLOCK EMAIL] Não foi possível reservar o envio:",
      claimError
    );
    return { enviado: false, motivo: "erro_claim" };
  }

  if (claimed !== true) {
    return { enviado: false, motivo: "ja_notificado_ou_em_processamento" };
  }

  const [contexto, emailBranding] = await Promise.all([
    buscarContexto(params),
    obterEmailBrandingEmpresa(params.empresaId),
  ]);
  if (!contexto.destinatario) {
    console.warn("[META ACCOUNT BLOCK EMAIL] Empresa sem e-mail válido.", {
      empresaId: params.empresaId,
      integracaoId: params.integracaoId,
    });
    return { enviado: false, motivo: "sem_email" };
  }

  const logoUrl = emailBranding.logoUrl;
  const numeroLabel = contexto.numero || contexto.integracaoNome;
  const codigoMeta = Number(params.codigoMeta || 0) || null;
  const detalhe = String(params.detalhe || params.motivo || "").trim();

  const titulo = "Seu WhatsApp precisa de uma análise da Meta";
  const assunto = `Seu WhatsApp precisa de uma análise da Meta · ${numeroLabel}`;
  const texto = [
    `Olá, ${contexto.empresaNome}.`,
    "",
    `Identificamos que a Meta bloqueou ou desativou a conta vinculada ao WhatsApp ${numeroLabel}.`,
    "Sabemos que esse aviso preocupa, mas existe um próximo passo simples: solicitar uma análise diretamente pelo WhatsApp Business no celular.",
    "",
    "O que fazer agora:",
    "1. Abra o WhatsApp Business no aparelho em que esse número está conectado.",
    '2. Localize o aviso sobre a conta e toque em "Solicitar análise", se a opção estiver disponível.',
    "3. Envie a solicitação e acompanhe o retorno pelo próprio aplicativo.",
    "",
    "Enquanto a conta estiver bloqueada, o CRM interrompe as automações desse número para evitar novas tentativas de envio.",
    "Se precisar de ajuda durante o processo, nossa equipe está disponível para orientar você.",
    "",
    `Suporte ${emailBranding.nomeProduto}: ${WHATSAPP_META_BLOCK_HELP_URL}`,
    `Gerenciador da Meta: ${WHATSAPP_META_MANAGER_URL}`,
    emailBranding.rodapeWhiteLabelTexto,
  ].filter(Boolean).join("\n");

  try {
    const { error } = await resend.emails.send({
      from: emailBranding.from,
      to: contexto.destinatario,
      subject: assunto,
      text: texto,
      html: `
        <div style="margin:0;padding:0;background:#eef4f2;font-family:Arial,Helvetica,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#eef4f2;padding:32px 16px;">
            <tr><td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:680px;background:#fff;border-radius:22px;overflow:hidden;border:1px solid #dce7e4;box-shadow:0 18px 45px rgba(7,19,26,.10);">
                <tr>
                  <td style="background:linear-gradient(135deg,#20b486,#07131a);padding:28px 32px;color:#fff;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
                      <td>
                        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.86;">${escaparHtml(emailBranding.nomeProduto)} · WhatsApp</div>
                        <h1 style="margin:10px 0 0;font-size:24px;line-height:1.28;">${escaparHtml(titulo)}</h1>
                        <p style="margin:9px 0 0;font-size:14px;line-height:1.55;opacity:.92;">Estamos aqui para ajudar você a seguir com a revisão da conta.</p>
                      </td>
                      <td width="86" align="right"><img src="${logoUrl}" alt="${escaparHtml(emailBranding.nomeProduto)}" width="72" style="display:block;width:72px;height:auto;border:0;" /></td>
                    </tr></table>
                  </td>
                </tr>

                <tr><td style="padding:28px 32px 10px;color:#3f5752;font-size:15px;line-height:1.68;">
                  <p style="margin:0 0 16px;">Olá, <strong>${escaparHtml(contexto.empresaNome)}</strong>.</p>
                  <p style="margin:0 0 16px;">
                    Identificamos que a Meta bloqueou ou desativou a conta vinculada ao WhatsApp
                    <strong>${escaparHtml(numeroLabel)}</strong>.
                  </p>
                  <p style="margin:0;">
                    Sabemos que esse aviso preocupa, mas existe um próximo passo simples: solicitar uma análise diretamente pelo <strong>WhatsApp Business no celular</strong>.
                  </p>
                </td></tr>

                <tr><td style="padding:10px 32px 0;">
                  <div style="background:#f6f9f8;border:1px solid #dce7e4;border-radius:16px;padding:20px;">
                    <div style="font-size:12px;font-weight:800;color:#13825f;text-transform:uppercase;letter-spacing:.06em;">O que fazer agora</div>
                    <ol style="margin:12px 0 0;padding-left:20px;color:#3f5752;font-size:14px;line-height:1.75;">
                      <li>Abra o <strong>WhatsApp Business</strong> no aparelho em que esse número está conectado.</li>
                      <li>Localize o aviso sobre a conta e toque em <strong>“Solicitar análise”</strong>, se a opção estiver disponível.</li>
                      <li>Envie a solicitação e acompanhe o retorno pelo próprio aplicativo.</li>
                    </ol>
                  </div>
                </td></tr>

                <tr><td style="padding:18px 32px 0;">
                  <div style="background:#fffaf0;border:1px solid #f5dfb5;border-radius:16px;padding:18px 20px;">
                    <strong style="display:block;color:#6b4f16;font-size:14px;">O CRM já protegeu suas automações</strong>
                    <p style="margin:7px 0 0;color:#6b604b;font-size:13px;line-height:1.65;">
                      Enquanto a conta estiver bloqueada, as automações ligadas a esse número ficam interrompidas para evitar novas tentativas de envio. Assim que a Meta liberar a conta, o funcionamento pode ser retomado.
                    </p>
                  </div>
                </td></tr>

                ${detalhe ? `
                  <tr><td style="padding:18px 32px 0;">
                    <p style="margin:0;color:#8a9b97;font-size:12px;line-height:1.55;">
                      Identificação da Meta${codigoMeta ? ` · código ${codigoMeta}` : ""}: ${escaparHtml(detalhe)}
                    </p>
                  </td></tr>
                ` : ""}

                <tr><td style="padding:26px 32px 34px;">
                  <p style="margin:0 0 18px;color:#526963;font-size:14px;line-height:1.65;">
                    Se tiver qualquer dificuldade para localizar a análise ou entender o retorno da Meta, fale com a nossa equipe. Vamos orientar você no que for possível.
                  </p>
                  <a href="${WHATSAPP_META_BLOCK_HELP_URL}" style="display:inline-block;background:#20b486;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;font-size:14px;font-weight:800;margin:0 8px 8px 0;">Falar com o suporte</a>
                  <a href="${WHATSAPP_META_MANAGER_URL}" style="display:inline-block;background:#fff;color:#17322f;text-decoration:none;padding:13px 21px;border:1px solid #cfded9;border-radius:999px;font-size:14px;font-weight:800;margin:0 0 8px;">Abrir Gerenciador da Meta</a>
                  <p style="margin:14px 0 0;color:#8ca09b;font-size:12px;">Ocorrência identificada em ${escaparHtml(dataPtBr(ocorridoEm))}.</p>
                </td></tr>

                <tr><td style="background:#f6f9f8;padding:17px 32px;border-top:1px solid #dce7e4;color:#8ca09b;font-size:12px;line-height:1.5;">
                  Este e-mail foi enviado automaticamente porque o ${escaparHtml(emailBranding.nomeProduto)} identificou que a Meta bloqueou ou desativou a conta WhatsApp vinculada a esta integração.${emailBranding.rodapeWhiteLabelHtml}
                </td></tr>
              </table>
            </td></tr>
          </table>
        </div>
      `,
    });

    if (error) {
      throw new Error(error.message);
    }

    const { error: markError } = await supabaseAdmin.rpc(
      "mark_whatsapp_meta_block_email_sent",
      {
        p_empresa_id: params.empresaId,
        p_integracao_id: params.integracaoId,
        p_sent_at: new Date().toISOString(),
        p_destinatario: contexto.destinatario,
      }
    );

    if (markError) {
      console.warn(
        "[META ACCOUNT BLOCK EMAIL] E-mail enviado, mas não foi possível registrar o envio:",
        markError
      );
    }

    console.log("[META ACCOUNT BLOCK EMAIL] E-mail enviado.", {
      empresaId: params.empresaId,
      integracaoId: params.integracaoId,
      destinatario: contexto.destinatario,
    });

    return { enviado: true, destinatario: contexto.destinatario };
  } catch (error) {
    console.error("[META ACCOUNT BLOCK EMAIL] Erro ao enviar e-mail:", error);
    return { enviado: false, motivo: "erro_envio" };
  }
}
