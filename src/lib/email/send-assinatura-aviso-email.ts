import { Resend } from "resend";
import { obterEmailBrandingEmpresa } from "@/lib/email/white-label-branding";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export type TipoAvisoAssinatura =
  | "pre_vencimento"
  | "vencida"
  | "bloqueada"
  | "reativacao_20d"
  | "cancelamento"
  | "reativacao_apos_cancelamento";

function escaparHtml(valor: string) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatarData(data: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(data));
}

export async function sendAssinaturaAvisoEmail(params: {
  empresaId: string;
  to: string[];
  nome: string;
  vencimentoEm: string;
  tipo: TipoAvisoAssinatura;
  checkoutUrl?: string | null;
  canceladaEm?: string | null;
  exclusaoPrevistaEm?: string | null;
}) {
  if (!resend) {
    console.warn("[ASSINATURA_AVISO] RESEND_API_KEY não configurada.");
    return false;
  }

  const destinatarios = Array.from(
    new Set(
      params.to
        .map((email) => email.trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    )
  );

  if (destinatarios.length === 0) return false;

  const vencimentoData = new Date(params.vencimentoEm);
  const bloqueioData = new Date(vencimentoData.getTime() + 7 * 24 * 60 * 60 * 1000);
  const vencimento = formatarData(params.vencimentoEm);
  const bloqueio = formatarData(bloqueioData.toISOString());
  const cancelada = params.canceladaEm ? formatarData(params.canceladaEm) : null;
  const exclusao = params.exclusaoPrevistaEm ? formatarData(params.exclusaoPrevistaEm) : null;

  const conteudo = {
    pre_vencimento: {
      etiqueta: "Aviso de renovação",
      titulo: "Sua mensalidade vence em 3 dias",
      cor: "#20b486",
      texto: "Este é um aviso para você se programar e renovar sua assinatura antes da data de vencimento.",
      acao: "Antecipar pagamento",
      pontos: [
        `Até ${vencimento}, o sistema continuará funcionando normalmente.`,
        "Se o pagamento não for identificado, a assinatura ficará vencida e a franquia mensal de IA ficará indisponível. Tokens avulsos permanecem preservados.",
        "Enquanto a assinatura estiver vencida, o sistema continuará exibindo avisos sobre a pendência.",
        `Se a pendência continuar por 7 dias, até ${bloqueio}, as automações serão pausadas, os disparos e os demais módulos serão bloqueados.`,
        "Após o pagamento, a assinatura será regularizada e os tokens serão renovados imediatamente.",
      ],
    },
    vencida: {
      etiqueta: "Mensalidade em aberto",
      titulo: "Sua assinatura está vencida",
      cor: "#c9a86a",
      texto: "A mensalidade não foi renovada até a data de vencimento e sua assinatura agora está com o status vencida.",
      acao: "Regularizar mensalidade",
      pontos: [
        `O vencimento ocorreu em ${vencimento}.`,
        "A franquia mensal de IA está indisponível enquanto a assinatura permanecer vencida. Tokens avulsos permanecem preservados.",
        "O sistema continuará exibindo avisos de vencimento enquanto houver pendência.",
        `Se o pagamento não for identificado até ${bloqueio}, as automações serão pausadas, não será possível fazer disparos e os módulos serão bloqueados.`,
        "Após o bloqueio, somente a página de Conversas ficará disponível, permitindo apenas responder conversas que já estiverem abertas.",
        "Assim que o pagamento for confirmado, a assinatura será regularizada e os tokens serão renovados imediatamente.",
      ],
    },
    bloqueada: {
      etiqueta: "Acesso bloqueado",
      titulo: "Seu acesso foi bloqueado por inadimplência",
      cor: "#b42318",
      texto: "A mensalidade permanece em aberto há mais de 7 dias. Por isso, o bloqueio temporário foi aplicado à conta.",
      acao: "Regularizar e reativar acesso",
      pontos: [
        `O vencimento original foi em ${vencimento}.`,
        "A franquia mensal de IA permanece indisponível enquanto a assinatura estiver bloqueada. Tokens avulsos ficam preservados para a reativação.",
        "As automações foram pausadas e não é possível realizar disparos.",
        "Todos os módulos foram bloqueados, exceto a página de Conversas, que permite apenas responder conversas que já estiverem abertas.",
        "Os avisos de inadimplência continuarão sendo exibidos enquanto houver pendência.",
        "Se o bloqueio durar 30 dias, a conta será cancelada e os dados ficarão disponíveis por mais 60 dias para solicitar backup.",
        "Assim que o pagamento for confirmado, a assinatura será reativada, os tokens serão renovados e o funcionamento do sistema voltará ao normal.",
      ],
    },
    reativacao_20d: {
      etiqueta: "Queremos você de volta",
      titulo: "Sentimos sua falta",
      cor: "#0f766e",
      texto: "Sua estrutura ainda está preservada no CRM e você pode regularizar o plano antes do cancelamento.",
      acao: "Regularizar e voltar",
      pontos: [
        `Sua assinatura está bloqueada desde ${bloqueio}.`,
        "Você tem até completar 30 dias de bloqueio para regularizar sua mensalidade antes do cancelamento automático.",
        "Após o cancelamento, os acessos e as integrações são interrompidos; os dados poderão ser solicitados para backup por mais 60 dias.",
        "O backup não é criado automaticamente. A solicitação deve ser feita à equipe administrativa dentro do prazo.",
        "Se precisar de ajuda para regularizar seu plano, nossa equipe está à disposição.",
      ],
    },
    reativacao_apos_cancelamento: {
      etiqueta: "Uma última oportunidade de retorno",
      titulo: "Sentimos sua falta",
      cor: "#0f766e",
      texto: "Sua conta no CRM foi cancelada há cerca de 30 dias, mas seus dados ainda estão preservados por tempo limitado. Gostaríamos muito de ter sua empresa de volta.",
      acao: "",
      pontos: [
        `Sua empresa foi cancelada em ${cancelada || "data registrada no sistema"}.`,
        `Seus dados operacionais serão excluídos definitivamente em ${exclusao || "aproximadamente 30 dias"} caso a conta não seja restaurada.`,
        "Antes desse prazo, você pode solicitar à nossa equipe a restauração da empresa e regularizar sua assinatura para voltar a utilizar o CRM.",
        "A restauração não libera os recursos automaticamente: eles permanecem bloqueados por pendência financeira até a renovação do plano.",
        "Se preferir não voltar agora, solicite e baixe o backup antes da data indicada. O backup não é gerado automaticamente.",
        "Obrigado por ter feito parte do CRM Prosperity. Estamos à disposição para ajudar você a retornar.",
      ],
    },
    cancelamento: {
      etiqueta: "Encerramento da conta",
      titulo: "Sua conta foi cancelada",
      cor: "#ab5346",
      texto: "A empresa foi cancelada e o acesso operacional ao CRM foi encerrado. Agradecemos pela confiança durante o período de uso.",
      acao: "",
      pontos: [
        `Data do cancelamento: ${cancelada || "registrada no sistema"}.`,
        `Prazo final para solicitar e baixar o backup: ${exclusao || "60 dias após o cancelamento"}.`,
        "O backup não é gerado automaticamente. Entre em contato com a equipe administrativa do CRM Prosperity para solicitar a exportação dos dados dentro do prazo.",
        "Caso a exportação tenha várias partes, baixe e guarde todos os arquivos ZIP.",
        "Após o prazo, os dados operacionais poderão ser excluídos definitivamente e não poderão ser restaurados pelo CRM. Registros legalmente exigidos poderão ser preservados.",
        "Se desejar retornar antes do fim da retenção, procure nossa equipe para avaliar a restauração e a regularização financeira.",
      ],
    },
  }[params.tipo];

  const nome = escaparHtml(params.nome || "Cliente");
  const pontosHtml = conteudo.pontos
    .map(
      (ponto) =>
        `<li style="margin:0 0 10px;padding-left:2px;">${escaparHtml(ponto)}</li>`
    )
    .join("");
  const pontosTexto = conteudo.pontos.map((ponto) => `• ${ponto}`).join("\n");
  const emailBranding = await obterEmailBrandingEmpresa(params.empresaId);
  const logoUrl = emailBranding.logoUrl;
  const cta = !["cancelamento","reativacao_apos_cancelamento"].includes(params.tipo) && params.checkoutUrl
    ? `<a href="${escaparHtml(params.checkoutUrl)}" style="display:inline-block;background:${conteudo.cor};color:#fff;text-decoration:none;padding:15px 24px;border-radius:10px;font-size:15px;font-weight:700;">${conteudo.acao}</a>`
    : "";

  try {
    const email = {
      from: emailBranding.from,
      subject: `${conteudo.titulo} • ${emailBranding.nomeProduto}`,
      text: [conteudo.titulo, conteudo.texto, "", "O que acontece:", pontosTexto, emailBranding.rodapeWhiteLabelTexto].filter(Boolean).join("\n"),
      html: `
        <div style="margin:0;padding:32px 16px;background:#eef4f2;font-family:Arial,Helvetica,sans-serif">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr><td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:620px;background:#fff;border:1px solid #dce7e4;border-radius:20px;overflow:hidden;box-shadow:0 18px 45px rgba(7,19,26,.10)">
                <tr><td style="padding:30px 32px;background:linear-gradient(135deg,${conteudo.cor},#07131a);color:#fff">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
                    <td style="padding:0;vertical-align:middle">
                      <div style="font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;opacity:.85">${escaparHtml(emailBranding.nomeProduto)} · ${conteudo.etiqueta}</div>
                      <h1 style="margin:12px 0 0;font-size:25px;line-height:1.25">${conteudo.titulo}</h1>
                    </td>
                    <td width="86" align="right" style="width:86px;padding:0 0 0 18px;vertical-align:middle"><img src="${logoUrl}" alt="${escaparHtml(emailBranding.nomeProduto)}" width="72" style="display:block;width:72px;height:auto;border:0;outline:none;text-decoration:none" /></td>
                  </tr></table>
                </td></tr>
                <tr><td style="padding:30px 32px;color:#3f5752;font-size:15px;line-height:1.65">
                  <p style="margin:0 0 14px">Olá, <strong>${nome}</strong>.</p>
                  <p style="margin:0">${escaparHtml(conteudo.texto)}</p>
                  <div style="margin:22px 0;padding:19px 20px;background:#f6f9f8;border:1px solid #dce7e4;border-left:4px solid ${conteudo.cor};border-radius:10px">
                    <div style="margin:0 0 12px;color:#17322f;font-size:15px;font-weight:800">Entenda o que acontece</div>
                    <ul style="margin:0;padding-left:20px;color:#506862;font-size:14px;line-height:1.55">${pontosHtml}</ul>
                  </div>
                  <div style="text-align:center;margin-top:26px">${cta}</div>
                </td></tr>
                <tr><td style="padding:16px 32px;background:#f6f9f8;border-top:1px solid #dce7e4;color:#8ca09b;font-size:12px;line-height:1.5">Este é um aviso automático sobre sua assinatura do ${escaparHtml(emailBranding.nomeProduto)}.${emailBranding.rodapeWhiteLabelHtml}</td></tr>
              </table>
            </td></tr>
          </table>
        </div>`,
    };

    await Promise.all(
      destinatarios.map(async (to) => {
        const { error } = await resend.emails.send({ ...email, to });
        if (error) throw new Error(error.message);
      })
    );

    return true;
  } catch (error) {
    console.error("[ASSINATURA_AVISO] Erro ao enviar email:", error);
    return false;
  }
}
