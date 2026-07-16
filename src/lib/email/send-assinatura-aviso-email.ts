import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export type TipoAvisoAssinatura = "pre_vencimento" | "vencida" | "bloqueada";

function escaparHtml(valor: string) {
  return String(valor || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function formatarData(data: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date(data));
}

export async function sendAssinaturaAvisoEmail(params: {
  to: string[]; nome: string; vencimentoEm: string; tipo: TipoAvisoAssinatura; checkoutUrl?: string | null;
}) {
  if (!resend) {
    console.warn("[ASSINATURA_AVISO] RESEND_API_KEY não configurada.");
    return false;
  }
  const destinatarios = Array.from(new Set(params.to.map((email) => email.trim().toLowerCase()).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))));
  if (destinatarios.length === 0) return false;

  const conteudo = {
    pre_vencimento: { etiqueta: "Aviso de renovação", titulo: "Sua mensalidade vence em 3 dias", cor: "#0f509a", texto: "Este é apenas um lembrete para você se organizar. A renovação da sua assinatura garante que o CRM continue disponível sem interrupções.", acao: "Antecipar pagamento" },
    vencida: { etiqueta: "Mensalidade em aberto", titulo: "Sua assinatura está vencida", cor: "#c26a00", texto: "Identificamos que a mensalidade do CRM Prosperity ainda não foi renovada. Regularize o pagamento para manter todos os recursos ativos.", acao: "Regularizar mensalidade" },
    bloqueada: { etiqueta: "Acesso bloqueado", titulo: "Seu acesso foi bloqueado por inadimplência", cor: "#b42318", texto: "Como a mensalidade permanece em aberto há mais de 7 dias, o acesso e as automações foram bloqueados temporariamente. Após a confirmação do pagamento, a regularização será feita automaticamente.", acao: "Regularizar e reativar acesso" },
  }[params.tipo];
  const nome = escaparHtml(params.nome || "Cliente");
  const vencimento = escaparHtml(formatarData(params.vencimentoEm));
  const appUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://crmprosperity.com").replace(/\/$/, "");
  const logoUrl = `${appUrl}/logo.png`;
  const cta = params.checkoutUrl ? `<a href="${escaparHtml(params.checkoutUrl)}" style="display:inline-block;background:${conteudo.cor};color:#fff;text-decoration:none;padding:15px 24px;border-radius:10px;font-size:15px;font-weight:700;">${conteudo.acao}</a>` : "";
  try {
    const email = { from: "CRM Prosperity <no-reply@crmprosperity.com>", subject: `${conteudo.titulo} • CRM Prosperity`, text: `${conteudo.titulo}. Vencimento: ${formatarData(params.vencimentoEm)}. ${conteudo.texto}`, html: `<div style="margin:0;padding:32px 16px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,.10)"><tr><td style="padding:30px 32px;background:linear-gradient(135deg,${conteudo.cor},#0f172a);color:#fff"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td style="padding:0;vertical-align:middle"><div style="font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;opacity:.85">CRM Prosperity · ${conteudo.etiqueta}</div><h1 style="margin:12px 0 0;font-size:25px;line-height:1.25">${conteudo.titulo}</h1></td><td width="86" align="right" style="width:86px;padding:0 0 0 18px;vertical-align:middle"><img src="${logoUrl}" alt="CRM Prosperity" width="72" style="display:block;width:72px;height:auto;border:0;outline:none;text-decoration:none" /></td></tr></table></td></tr><tr><td style="padding:30px 32px;color:#334155;font-size:15px;line-height:1.65"><p style="margin:0 0 14px">Olá, <strong>${nome}</strong>.</p><p style="margin:0">${conteudo.texto}</p><div style="margin:22px 0;padding:18px 20px;background:#f8fafc;border-left:4px solid ${conteudo.cor};border-radius:8px"><div style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700">Data de vencimento</div><div style="margin-top:4px;font-size:18px;color:#0f172a;font-weight:800">${vencimento}</div></div><div style="text-align:center;margin-top:26px">${cta}</div></td></tr><tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.5">Este é um aviso automático sobre sua assinatura do CRM Prosperity.</td></tr></table></td></tr></table></div>` };
    await Promise.all(destinatarios.map(async (to) => {
      const { error } = await resend.emails.send({ ...email, to });
      if (error) throw new Error(error.message);
    }));
    return true;
  } catch (error) {
    console.error("[ASSINATURA_AVISO] Erro ao enviar email:", error);
    return false;
  }
}
