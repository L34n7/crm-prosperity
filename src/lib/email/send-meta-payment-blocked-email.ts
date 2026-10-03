import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { META_PAYMENT_SETTINGS_URL } from "@/lib/whatsapp/meta-payment-block";

const supabaseAdmin = getSupabaseAdmin();
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type Pausas = {
  conversasEncerradas?: number;
  execucoesCanceladas?: number;
  agendamentosCancelados?: number;
  pendenciasIaCanceladas?: number;
  execucoesIaCanceladas?: number;
  campanhasPausadas?: number;
};

type Params = {
  empresaId: string;
  integracaoNome?: string | null;
  numero?: string | null;
  codigoMeta: number;
  detalhe?: string | null;
  ocorridoEm?: string | null;
  pausas?: Pausas;
};

function escaparHtml(valor: string) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dataPtBr(valor?: string | null) {
  const data = valor ? new Date(valor) : new Date();
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

export async function sendMetaPaymentBlockedEmail({
  empresaId,
  integracaoNome,
  numero,
  codigoMeta,
  detalhe,
  ocorridoEm,
  pausas = {},
}: Params) {
  if (!resend) {
    console.warn("[META PAYMENT EMAIL] RESEND_API_KEY não configurada.");
    return { enviado: false, motivo: "resend_nao_configurado" };
  }

  const { data: empresa, error } = await supabaseAdmin
    .from("empresas")
    .select("email,nome_fantasia,razao_social")
    .eq("id", empresaId)
    .maybeSingle();

  if (error) {
    console.error("[META PAYMENT EMAIL] Erro ao buscar empresa:", error);
    return { enviado: false, motivo: "erro_empresa" };
  }

  const destinatario = String(empresa?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(destinatario)) {
    console.warn("[META PAYMENT EMAIL] Empresa sem e-mail válido.", { empresaId });
    return { enviado: false, motivo: "sem_email" };
  }

  const empresaNome =
    String(empresa?.nome_fantasia || "").trim() ||
    String(empresa?.razao_social || "").trim() ||
    "sua empresa";
  const appUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://crmprosperity.com"
  ).replace(/\/$/, "");
  const logoUrl = `${appUrl}/logo.png`;
  const nomeNumero = String(numero || integracaoNome || "Número WhatsApp");
  const resumo = [
    [pausas.execucoesCanceladas, "execução(ões) de fluxo"],
    [pausas.agendamentosCancelados, "agendamento(s) automático(s)"],
    [pausas.pendenciasIaCanceladas, "pendência(s) do agente de IA"],
    [pausas.execucoesIaCanceladas, "execução(ões) do agente de IA"],
    [pausas.campanhasPausadas, "campanha(s) de disparo"],
  ]
    .filter(([valor]) => Number(valor || 0) > 0)
    .map(([valor, label]) => `${valor} ${label}`)
    .join(" · ");

  const detalheSeguro = escaparHtml(
    detalhe || "A Meta informou uma pendência financeira ou problema com a forma de pagamento."
  );

  try {
    await resend.emails.send({
      from: "CRM Prosperity <no-reply@crmprosperity.com>",
      to: destinatario,
      subject: `Ação necessária: pagamento da Meta pendente · ${nomeNumero}`,
      text: [
        `Olá, ${empresaNome}.`,
        `A Meta recusou um envio do número ${nomeNumero} por pendência financeira (código ${codigoMeta}).`,
        "Para evitar novas tentativas com falha, o CRM pausou as automações vinculadas a esse número, incluindo fluxos ativos e agente de IA.",
        resumo ? `Pausado: ${resumo}.` : "",
        "Cadastre ou regularize a forma de pagamento na Meta. Depois, volte ao CRM e use a opção “Já configurei · reativar”.",
        META_PAYMENT_SETTINGS_URL,
      ]
        .filter(Boolean)
        .join("\n"),
      html: `
        <div style="margin:0;padding:0;background:#eef4f2;font-family:Arial,Helvetica,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef4f2;padding:32px 16px;">
            <tr><td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#fff;border-radius:22px;overflow:hidden;border:1px solid #dce7e4;box-shadow:0 18px 45px rgba(7,19,26,.10);">
                <tr>
                  <td style="background:linear-gradient(135deg,#20b486,#07131a);padding:28px 32px;color:#fff;">
                    <table width="100%" cellpadding="0" cellspacing="0"><tr>
                      <td>
                        <div style="font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.86;">CRM Prosperity</div>
                        <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;">Forma de pagamento da Meta necessária</h1>
                        <p style="margin:9px 0 0;font-size:14px;line-height:1.55;opacity:.92;">As automações do número afetado foram pausadas preventivamente.</p>
                      </td>
                      <td width="86" align="right"><img src="${logoUrl}" alt="CRM Prosperity" width="72" style="display:block;width:72px;height:auto;border:0;" /></td>
                    </tr></table>
                  </td>
                </tr>
                <tr><td style="padding:28px 32px 12px;">
                  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:18px 20px;">
                    <div style="font-size:12px;font-weight:800;color:#c2410c;text-transform:uppercase;letter-spacing:.06em;">Envio recusado pela Meta</div>
                    <h2 style="margin:8px 0;color:#172b27;font-size:20px;">${escaparHtml(nomeNumero)}</h2>
                    <p style="margin:0;color:#526963;font-size:14px;line-height:1.65;">Código Meta <strong>${codigoMeta}</strong> · ${escaparHtml(dataPtBr(ocorridoEm))}</p>
                    <p style="margin:10px 0 0;color:#526963;font-size:14px;line-height:1.65;">${detalheSeguro}</p>
                  </div>
                </td></tr>
                <tr><td style="padding:8px 32px 0;">
                  <div style="background:#f6f9f8;border:1px solid #dce7e4;border-radius:16px;padding:18px 20px;">
                    <div style="font-size:12px;font-weight:800;color:#13825f;text-transform:uppercase;letter-spacing:.06em;">O que o CRM fez</div>
                    <p style="margin:9px 0 0;color:#3f5752;font-size:14px;line-height:1.65;">
                      Para impedir tentativas repetidas com falha, o CRM interrompeu as execuções de fluxo, filas do agente de IA e agendamentos automáticos ligados a este número.
                    </p>
                    ${resumo ? `<p style="margin:10px 0 0;color:#17322f;font-size:13px;font-weight:700;line-height:1.6;">${escaparHtml(resumo)}</p>` : ""}
                  </div>
                </td></tr>
                <tr><td style="padding:26px 32px 34px;">
                  <p style="margin:0 0 16px;color:#526963;font-size:14px;line-height:1.65;">
                    Regularize a cobrança na Meta. Depois, retorne ao CRM e clique em <strong>“Já configurei · reativar”</strong> no aviso exibido no sistema.
                  </p>
                  <a href="${META_PAYMENT_SETTINGS_URL}" style="display:inline-block;background:#20b486;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;font-size:14px;font-weight:800;">Configurar forma de pagamento na Meta</a>
                </td></tr>
                <tr><td style="background:#f6f9f8;padding:17px 32px;border-top:1px solid #dce7e4;color:#8ca09b;font-size:12px;line-height:1.5;">
                  Este e-mail foi enviado automaticamente pelo CRM Prosperity após uma falha financeira reportada pela Meta.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </div>
      `,
    });

    return { enviado: true, destinatario };
  } catch (sendError) {
    console.error("[META PAYMENT EMAIL] Erro ao enviar e-mail:", sendError);
    return { enviado: false, motivo: "erro_envio" };
  }
}
