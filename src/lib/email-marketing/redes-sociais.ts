/** Componentes de redes sociais compatíveis com clientes de e-mail (tabelas + imagens PNG). */
export const REDES_EMAIL = ["facebook", "instagram", "whatsapp"] as const;
export type RedeSocialEmail = (typeof REDES_EMAIL)[number];
export const NOMES_REDES_EMAIL: Record<RedeSocialEmail, string> = {
  facebook: "Facebook", instagram: "Instagram", whatsapp: "WhatsApp",
};
const ORIGEM_ICONES = "https://crmprosperity.com/api/email-marketing/icone-social";
export function corHexEmail(valor: string, fallback = "#ffffff") {
  return /^#[0-9a-f]{6}$/i.test(valor) ? valor.toLowerCase() : fallback;
}
export function urlIconeSocial(rede: RedeSocialEmail, cor = "#ffffff") {
  return ORIGEM_ICONES + "/" + rede + "?cor=" + corHexEmail(cor).slice(1);
}
export function criarHtmlRedesSociais(opcoes?: { fundo?: string; corIcone?: string; titulo?: string }) {
  const fundo = corHexEmail(opcoes?.fundo || "#565091", "#565091");
  const corIcone = corHexEmail(opcoes?.corIcone || "#ffffff");
  const titulo = (opcoes?.titulo || "SIGA-NOS NAS REDES SOCIAIS").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const links = REDES_EMAIL.map(rede =>
    '<td style="padding:0 8px" align="center"><a data-prosperity-social="'+rede+'" data-prosperity-icon-color="'+corIcone+'" aria-label="'+NOMES_REDES_EMAIL[rede]+'" style="display:inline-block;padding:6px;border-radius:8px;background-color:'+fundo+';text-decoration:none">' +
    '<img data-prosperity-social-icon="'+rede+'" src="'+urlIconeSocial(rede,corIcone)+'" width="24" height="24" alt="'+NOMES_REDES_EMAIL[rede]+'" style="display:block;width:24px;height:24px;border:0" /></a></td>'
  ).join("");
  return '<table data-prosperity-social-group="true" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:'+fundo+';border-radius:8px"><tbody><tr>' +
    '<td style="padding:18px 24px;color:#ffffff;font-family:Arial,sans-serif;font-weight:700;font-size:14px;vertical-align:middle">'+titulo+'</td>' +
    '<td align="right" style="padding:12px 15px;vertical-align:middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tbody><tr>'+links+'</tr></tbody></table></td>' +
    '</tr></tbody></table>';
}
