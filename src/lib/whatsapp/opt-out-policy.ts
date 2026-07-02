export type WhatsAppOptOutScope = "marketing" | "utility";
export type WhatsAppSupressaoScope =
  | "todos_disparos"
  | WhatsAppOptOutScope;

export const WHATSAPP_OPT_OUT_FOOTERS: Record<
  WhatsAppOptOutScope,
  string
> = {
  marketing: "Para não receber ofertas, responda SAIR.",
  utility: "Para não receber atualizações, responda SAIR.",
};

export const WHATSAPP_OPT_OUT_FEEDBACKS: Record<
  WhatsAppOptOutScope,
  string
> = {
  marketing:
    "Saída registrada. Você não receberá mais ofertas desta empresa.",
  utility:
    "Saída registrada. Você não receberá mais atualizações desta empresa.",
};

const WHATSAPP_OPT_OUT_FOOTER_LEGADO =
  "Para não receber mais mensagens, responda SAIR.";

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

export function normalizarCategoriaOptOut(
  categoria: unknown
): WhatsAppOptOutScope | null {
  const valor = String(categoria || "").trim().toLowerCase();
  return valor === "marketing" || valor === "utility" ? valor : null;
}

export function categoriaTemplateExigeOptOut(categoria: unknown) {
  return normalizarCategoriaOptOut(categoria) !== null;
}

export function obterFooterOptOut(categoria: unknown) {
  const escopo = normalizarCategoriaOptOut(categoria);
  return escopo ? WHATSAPP_OPT_OUT_FOOTERS[escopo] : null;
}

export function obterFeedbackOptOut(categoria: unknown) {
  const escopo = normalizarCategoriaOptOut(categoria);
  return escopo ? WHATSAPP_OPT_OUT_FEEDBACKS[escopo] : null;
}

export function escopoOptOutBloqueiaCategoria(
  escopo: unknown,
  categoria: unknown
) {
  if (escopo === "todos_disparos") return true;
  const categoriaNormalizada = normalizarCategoriaOptOut(categoria);
  return Boolean(categoriaNormalizada && escopo === categoriaNormalizada);
}

export function templatePossuiInstrucaoOptOut(
  payload: TemplatePayloadLike,
  categoria: unknown
) {
  const footerEsperado = obterFooterOptOut(categoria);
  if (!footerEsperado) return false;

  const footer = (payload?.components || []).find(
    (component) => String(component.type || "").toUpperCase() === "FOOTER"
  );
  const footerNormalizado = normalizarTextoComandoWhatsapp(footer?.text);

  return (
    footerNormalizado === normalizarTextoComandoWhatsapp(footerEsperado) ||
    footerNormalizado ===
      normalizarTextoComandoWhatsapp(WHATSAPP_OPT_OUT_FOOTER_LEGADO)
  );
}

export function aplicarFooterOptOut<T extends TemplateComponentLike>(
  components: T[],
  categoria: unknown
) {
  const footerOptOut = obterFooterOptOut(categoria);
  if (!footerOptOut) {
    return components;
  }

  const semFooter = components.filter(
    (component) => String(component.type || "").toUpperCase() !== "FOOTER"
  );
  const footer = {
    type: "FOOTER",
    text: footerOptOut,
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
