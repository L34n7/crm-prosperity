export const ERRO_LINK_DIRETO_WHATSAPP_TEMPLATE =
  "A Meta não permite links que abrem diretamente o WhatsApp em botões Redirect. Use uma página/site externo ou troque o botão para Texto — resposta rápida para o cliente continuar a conversa no WhatsApp.";

function normalizarHost(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^www\./, "");
}

export function linkTemplateAbreWhatsappDiretamente(valor?: string | null) {
  const urlRecebida = String(valor || "").trim();
  if (!urlRecebida) return false;

  try {
    const url = new URL(urlRecebida);
    const host = normalizarHost(url.hostname);
    const path = url.pathname.toLowerCase();

    if (host === "wa.me" || host.endsWith(".wa.me")) {
      return true;
    }

    if (host === "chat.whatsapp.com") {
      return true;
    }

    if (host === "api.whatsapp.com" || host === "web.whatsapp.com") {
      return true;
    }

    if (host === "whatsapp.com" || host.endsWith(".whatsapp.com")) {
      return (
        path.startsWith("/send") ||
        path.startsWith("/message") ||
        path.startsWith("/channel") ||
        path.startsWith("/invite") ||
        path.startsWith("/join")
      );
    }

    return false;
  } catch {
    return false;
  }
}

export function traduzirErroLinkDiretoWhatsappTemplate(
  mensagem?: string | null
) {
  const texto = String(mensagem || "").trim();
  if (!texto) return texto;

  if (
    /direct links? to whatsapp/i.test(texto) ||
    /whatsapp.*aren['’]?t allowed for buttons/i.test(texto)
  ) {
    return ERRO_LINK_DIRETO_WHATSAPP_TEMPLATE;
  }

  return texto;
}
