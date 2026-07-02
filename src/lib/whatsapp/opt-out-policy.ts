export const WHATSAPP_OPT_OUT_FOOTER =
  "Para não receber mais mensagens, responda SAIR.";

export const WHATSAPP_OPT_OUT_FEEDBACK =
  "Solicitação registrada. Você não receberá mais disparos desta empresa.";

export const WHATSAPP_OPT_OUT_CONTEXT_DAYS = 7;

type TemplateComponentLike = {
  type?: string;
  text?: string;
  [key: string]: unknown;
};

type TemplatePayloadLike = {
  components?: TemplateComponentLike[];
} | null;

export function normalizarTextoComandoWhatsapp(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/^[\s.,;:!?¡¿"'`()\[\]{}*-]+/, "")
    .replace(/[\s.,;:!?¡¿"'`()\[\]{}*-]+$/, "")
    .replace(/\s+/g, " ");
}

export function identificarComandoOptOutWhatsapp(valor: unknown) {
  const normalizado = normalizarTextoComandoWhatsapp(valor);
  return normalizado === "sair" || normalizado === "stop"
    ? normalizado
    : null;
}

export function categoriaTemplateExigeOptOut(categoria: unknown) {
  const valor = String(categoria || "").trim().toUpperCase();
  return valor === "MARKETING" || valor === "UTILITY";
}

export function templatePossuiInstrucaoOptOut(payload: TemplatePayloadLike) {
  const footer = (payload?.components || []).find(
    (component) => String(component.type || "").toUpperCase() === "FOOTER"
  );

  return (
    normalizarTextoComandoWhatsapp(footer?.text) ===
    normalizarTextoComandoWhatsapp(WHATSAPP_OPT_OUT_FOOTER)
  );
}

export function aplicarFooterOptOut<T extends TemplateComponentLike>(
  components: T[],
  categoria: unknown
) {
  if (!categoriaTemplateExigeOptOut(categoria)) {
    return components;
  }

  const semFooter = components.filter(
    (component) => String(component.type || "").toUpperCase() !== "FOOTER"
  );
  const footer = {
    type: "FOOTER",
    text: WHATSAPP_OPT_OUT_FOOTER,
  } as T;
  const buttonsIndex = semFooter.findIndex(
    (component) => String(component.type || "").toUpperCase() === "BUTTONS"
  );

  if (buttonsIndex < 0) {
    return [...semFooter, footer];
  }

  return [
    ...semFooter.slice(0, buttonsIndex),
    footer,
    ...semFooter.slice(buttonsIndex),
  ];
}
