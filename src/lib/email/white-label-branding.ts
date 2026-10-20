import "server-only";

import {
  obterBrandingDaEmpresa,
  obterSiteUrlBranding,
} from "@/lib/white-label/branding";
import type { WhiteLabelBranding } from "@/lib/white-label/types";

function escaparHtml(valor: string) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export type EmailBrandingContext = {
  branding: WhiteLabelBranding;
  siteUrl: string;
  nomeProduto: string;
  nomeMarca: string;
  logoUrl: string;
  from: string;
  rodapeWhiteLabelHtml: string;
  rodapeWhiteLabelTexto: string;
};

export async function obterEmailBrandingEmpresa(
  empresaId: string
): Promise<EmailBrandingContext> {
  const branding = await obterBrandingDaEmpresa(empresaId);
  return montarEmailBranding(branding);
}

export function montarEmailBranding(
  branding: WhiteLabelBranding
): EmailBrandingContext {
  const siteUrl = obterSiteUrlBranding(branding);
  const nomeProduto = branding.nome_produto || branding.nome_marca;
  const nomeMarca = branding.nome_marca || nomeProduto;
  const logoUrl = branding.logo_url
    ? branding.logo_url.startsWith("http")
      ? branding.logo_url
      : siteUrl + (branding.logo_url.startsWith("/") ? "" : "/") + branding.logo_url
    : siteUrl + "/logo.png";
  const fromNome = nomeProduto.replace(/[<>"]/g, "").trim() || "CRM Prosperity";
  const rodapeWhiteLabelHtml = branding.is_white_label
    ? '<div style="margin-top:8px;color:#94a3b8;font-size:10px;line-height:1.5;letter-spacing:.03em;">By <strong style="color:#64748b;font-size:11px;">Prosperity Developer</strong></div>'
    : "";
  const rodapeWhiteLabelTexto = branding.is_white_label
    ? "\nBy Prosperity Developer"
    : "";

  return {
    branding,
    siteUrl,
    nomeProduto,
    nomeMarca,
    logoUrl,
    from: fromNome + " <no-reply@crmprosperity.com>",
    rodapeWhiteLabelHtml,
    rodapeWhiteLabelTexto,
  };
}

export function rodapeEmailWhiteLabel(contexto: EmailBrandingContext) {
  return contexto.rodapeWhiteLabelHtml;
}

export function nomeProdutoEmail(contexto: EmailBrandingContext) {
  return escaparHtml(contexto.nomeProduto);
}
