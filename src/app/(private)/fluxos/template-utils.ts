import type {
  PreviewTemplateWhatsapp,
  TemplateWhatsappOpcao,
} from "./types";

export function contarVariaveisTextoTemplate(texto?: string | null) {
  const matches = String(texto || "").match(/\{\{\d+\}\}/g) || [];
  const numeros = matches
    .map((item) => Number(item.replace(/[{}]/g, "")))
    .filter((numero) => Number.isFinite(numero));

  return numeros.length > 0 ? Math.max(...numeros) : 0;
}

export function contarVariaveisTemplateWhatsapp(
  template?: TemplateWhatsappOpcao | null
) {
  const components = Array.isArray(template?.payload?.components)
    ? template?.payload?.components
    : [];

  const header = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "HEADER"
  );
  const body = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BODY"
  );
  const buttons = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BUTTONS"
  );

  const totalHeader = contarVariaveisTextoTemplate(header?.text);
  const totalBody = contarVariaveisTextoTemplate(body?.text);
  const totalButtons = (buttons?.buttons || []).reduce(
    (total: number, button: any) => {
      if (String(button?.type || "").toUpperCase() !== "URL") return total;
      return total + contarVariaveisTextoTemplate(button?.url);
    },
    0
  );

  return totalHeader + totalBody + totalButtons;
}

export function templateWhatsappTemCabecalhoMidia(
  template?: TemplateWhatsappOpcao | null
) {
  const components = Array.isArray(template?.payload?.components)
    ? template?.payload?.components
    : [];
  const header = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "HEADER"
  );
  const formatoHeader = String(header?.format || "").toUpperCase();

  return ["IMAGE", "VIDEO", "DOCUMENT"].includes(formatoHeader);
}

export function obterLinhasVariaveisTemplate(valor: string) {
  const linhas = String(valor || "").split("\n");
  return [linhas[0] || "", linhas[1] || "", linhas[2] || ""];
}

export function contarVariaveisObrigatoriasPreenchidas(
  variaveis: string[] | string,
  totalObrigatorio: number
) {
  const linhas = Array.isArray(variaveis)
    ? variaveis
    : obterLinhasVariaveisTemplate(variaveis);

  return linhas
    .slice(0, totalObrigatorio)
    .map((item) => String(item || "").trim())
    .filter(Boolean).length;
}

export function normalizarEntradaVariavelTemplate(valor: string) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+/g, "");
}

export function atualizarLinhaVariavelTemplate(
  valorAtual: string,
  index: number,
  novoValor: string
) {
  const linhas = obterLinhasVariaveisTemplate(valorAtual);
  linhas[index] = normalizarEntradaVariavelTemplate(novoValor);
  return linhas.join("\n");
}

export function preencherPrimeiraLinhaVariavelTemplate(
  valorAtual: string,
  novoValor: string
) {
  const linhas = obterLinhasVariaveisTemplate(valorAtual);
  const indiceVazio = linhas.findIndex((item) => !item.trim());
  linhas[indiceVazio >= 0 ? indiceVazio : 0] =
    normalizarEntradaVariavelTemplate(novoValor);
  return linhas.join("\n");
}

function substituirVariaveisPreviewTemplate(
  texto: string,
  variaveis: string[],
  offset: number
) {
  return String(texto || "").replace(/\{\{(\d+)\}\}/g, (_, numero) => {
    const index = offset + Number(numero) - 1;
    return variaveis[index]?.trim() || `{{${numero}}}`;
  });
}

export function montarPreviewTemplateWhatsapp(
  template: TemplateWhatsappOpcao | null,
  variaveisRaw: string
): PreviewTemplateWhatsapp | null {
  if (!template) return null;

  const variaveis = obterLinhasVariaveisTemplate(variaveisRaw);
  const components = Array.isArray(template.payload?.components)
    ? template.payload.components
    : [];
  const header = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "HEADER"
  );
  const body = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BODY"
  );
  const footer = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "FOOTER"
  );
  const buttons = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BUTTONS"
  );

  let offset = 0;
  const headerText = substituirVariaveisPreviewTemplate(
    header?.text || "",
    variaveis,
    offset
  ).trim();
  offset += contarVariaveisTextoTemplate(header?.text);

  const bodyText = substituirVariaveisPreviewTemplate(
    body?.text || "",
    variaveis,
    offset
  ).trim();

  const quickReplies =
    buttons?.buttons
      ?.filter(
        (button: any) => button?.type === "QUICK_REPLY" && button?.text
      )
      .map((button: any) => String(button.text || "").trim())
      .filter(Boolean) || [];

  return {
    titulo: headerText || template.nome || "Template WhatsApp",
    corpo: bodyText || "Template sem texto para previsualizacao.",
    rodape: String(footer?.text || "").trim() || "Equipe de atendimento",
    botoes: quickReplies,
  };
}
