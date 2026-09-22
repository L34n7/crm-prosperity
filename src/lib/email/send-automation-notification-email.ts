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
  fluxoNome?: string | null;
  blocoTitulo?: string | null;
  blocoTipo?: string | null;
  contatoNome?: string | null;
  contatoTelefone?: string | null;
  setorDestino?: string | null;
  tipoNotificacao?: "fluxo" | "excesso_tentativas";
};

function escaparHtml(valor: string) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatarDataEmail(data = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

export async function sendAutomationNotificationEmail({
  empresaId,
  conversaId,
  titulo,
  mensagem,
  fluxoNome,
  blocoTitulo,
  blocoTipo,
  contatoNome,
  contatoTelefone,
  setorDestino,
  tipoNotificacao = "fluxo",
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
    console.error("[AUTOMATION_EMAIL] Erro ao buscar usuários:", usuariosError);
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
    "https://crmprosperity.com";

  const linkConversa = `${appUrl}/conversas?id=${conversaId}`;
  const logoUrl = `${appUrl.replace(/\/$/, "")}/logo.png`;

  const tituloSeguro = escaparHtml(titulo || "Nova notificação da automação");
  const ehExcessoTentativas =
    tipoNotificacao === "excesso_tentativas";

  const tituloPrincipal = ehExcessoTentativas
    ? "🚨 EXCESSO DE TENTATIVAS"
    : "🚨 ALERTA DE FLUXO";

  const subtituloPrincipal = ehExcessoTentativas
    ? "Um contato excedeu o limite de tentativas configurado no fluxo."
    : "Um contato chegou em um ponto importante do fluxo.";
  const mensagemSegura = escaparHtml(mensagem || "Um contato chegou em um ponto importante do fluxo.");
  const fluxoSeguro = escaparHtml(fluxoNome || "Não informado");
  const blocoSeguro = escaparHtml(blocoTitulo || "Não informado");
  const tipoSeguro = escaparHtml(blocoTipo || "Não informado");
  const dataSeguro = escaparHtml(formatarDataEmail());
  const contatoNomeSeguro = escaparHtml(
    contatoNome || "Contato não identificado"
  );

  const contatoTelefoneSeguro = escaparHtml(
    contatoTelefone || "Não informado"
  );
  const setorDestinoSeguro = escaparHtml(
    setorDestino || "Não informado"
  );

  try {
    await resend.emails.send({
      from: "CRM Prosperity <no-reply@crmprosperity.com>",
      to: destinatarios,
      subject: `${tituloPrincipal} • ${titulo || "Nova notificação"}`,
      html: `
        <div style="margin:0;padding:0;background:#eef4f2;font-family:Arial,Helvetica,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef4f2;padding:32px 16px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #dce7e4;box-shadow:0 18px 45px rgba(7,19,26,0.10);">
                  
                  <tr>
                    <td style="background:linear-gradient(135deg,#20b486,#07131a);padding:28px 32px;color:#ffffff;">
                      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                        <tr>
                          <td style="padding:0;vertical-align:middle;">
                            <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">CRM Prosperity</div>
                            <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;font-weight:800;">${tituloPrincipal}</h1>
                            <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:0.9;">${subtituloPrincipal}</p>
                          </td>
                          <td width="86" align="right" style="width:86px;padding:0 0 0 18px;vertical-align:middle;">
                            <img src="${logoUrl}" alt="CRM Prosperity" width="72" style="display:block;width:72px;height:auto;border:0;outline:none;text-decoration:none;" />
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:30px 32px 18px;">
                      <div style="background:#edf8f4;border:1px solid #cde8df;border-radius:16px;padding:18px 20px;">
                        <div style="font-size:12px;font-weight:800;color:#13825f;text-transform:uppercase;letter-spacing:0.06em;">
                          Alerta
                        </div>
                        <h2 style="margin:8px 0 8px;color:#17322f;font-size:20px;line-height:1.3;">
                          ${tituloSeguro}
                        </h2>
                        <p style="margin:0;color:#506862;font-size:15px;line-height:1.6;">
                          ${mensagemSegura}
                        </p>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:0 32px 0;">
                      <div
                        style="
                          background:#f6f9f8;
                          border:1px solid #dce7e4;
                          border-radius:16px;
                          padding:18px 20px;
                        "
                      >
                        <div
                          style="
                            font-size:12px;
                            font-weight:800;
                            color:#20b486;
                            text-transform:uppercase;
                            letter-spacing:0.06em;
                            margin-bottom:12px;
                          "
                        >
                          Contato
                        </div>

                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="width:120px;color:#68827d;font-size:13px;">
                              Nome
                            </td>

                            <td style="color:#17322f;font-size:14px;font-weight:700;">
                              ${contatoNomeSeguro}
                            </td>
                          </tr>

                          <tr>
                            <td
                              style="
                                width:120px;
                                color:#68827d;
                                font-size:13px;
                                padding-top:10px;
                              "
                            >
                              Telefone
                            </td>

                            <td
                              style="
                                color:#17322f;
                                font-size:14px;
                                font-weight:700;
                                padding-top:10px;
                              "
                            >
                              ${contatoTelefoneSeguro}
                            </td>
                          </tr>
                          <tr>
                            <td
                              style="
                                width:120px;
                                color:#68827d;
                                font-size:13px;
                                padding-top:10px;
                              "
                            >
                              Setor transferido
                            </td>

                            <td
                              style="
                                color:#17322f;
                                font-size:14px;
                                font-weight:700;
                                padding-top:10px;
                              "
                            >
                              ${setorDestinoSeguro}
                            </td>
                          </tr>
                        </table>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 32px 0;">
                      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 10px;">
                        <tr>
                          <td style="width:160px;color:#68827d;font-size:13px;">Fluxo</td>
                          <td style="color:#17322f;font-size:14px;font-weight:700;">${fluxoSeguro}</td>
                        </tr>
                        <tr>
                          <td style="width:160px;color:#68827d;font-size:13px;">Bloco</td>
                          <td style="color:#17322f;font-size:14px;font-weight:700;">${blocoSeguro}</td>
                        </tr>
                        <tr>
                          <td style="width:160px;color:#68827d;font-size:13px;">Tipo do bloco</td>
                          <td style="color:#17322f;font-size:14px;font-weight:700;">${tipoSeguro}</td>
                        </tr>
                        <tr>
                          <td style="width:160px;color:#68827d;font-size:13px;">Data e hora</td>
                          <td style="color:#17322f;font-size:14px;font-weight:700;">${dataSeguro}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:26px 32px 34px;">
                      <a
                        href="${linkConversa}"
                        style="display:inline-block;background:#20b486;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-size:14px;font-weight:800;"
                      >
                        Abrir conversa no CRM
                      </a>

                      <p style="margin:18px 0 0;color:#68827d;font-size:13px;line-height:1.6;">
                        Ao clicar no botão, você será direcionado para a conversa relacionada a essa notificação.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="background:#f6f9f8;padding:18px 32px;border-top:1px solid #dce7e4;">
                      <p style="margin:0;color:#8ca09b;font-size:12px;line-height:1.5;">
                        Este email foi enviado automaticamente pelo CRM Prosperity porque um bloco do fluxo foi configurado para gerar notificação.
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

    console.log("[AUTOMATION_EMAIL] Email enviado.", {
      destinatarios: destinatarios.length,
      conversaId,
    });
  } catch (error) {
    console.error("[AUTOMATION_EMAIL] Erro ao enviar email:", error);
  }
}
