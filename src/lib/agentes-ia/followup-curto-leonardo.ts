/**
 * Proteção de tamanho exclusiva do Leonardo (CRM Prosperity).
 * O modelo é orientado a gerar até 230 caracteres. Se extrapolar muito,
 * substitui por uma retomada contextual curta sem cortar frases ou URLs.
 * Outros agentes e follow-ups configurados em texto/áudio não são alterados.
 */
export const LEONARDO_CRM_PROSPERITY_ID = "512da872-07df-49b6-87fe-dfec84c271c6";
export const MAX_CARACTERES_FOLLOWUP_LEONARDO = 260;

export function garantirFollowupCurtoLeonardo(params: {
  agenteId: string;
  texto: string;
  alternativa: string;
}): string {
  const texto = String(params.texto || "").trim();
  if (params.agenteId !== LEONARDO_CRM_PROSPERITY_ID ||
      texto.length <= MAX_CARACTERES_FOLLOWUP_LEONARDO) {
    return texto;
  }

  const alternativa = String(params.alternativa || "").trim();
  const fallback = alternativa.length <= MAX_CARACTERES_FOLLOWUP_LEONARDO && alternativa
    ? alternativa
    : "Quer continuar de onde paramos? Posso te mostrar o próximo passo.";

  // Evitar perder a URL de compra quando ela já foi incluída no follow-up
  // extenso. Não reescrever URLs, parâmetros ou links arbitrários.
  const checkout = texto.match(/https:\/\/(?:www\.)?crmprosperity\.com\/comecar(?:\/[^\s]*)?(?:\?[^\s]*)?/i)?.[0] || "";
  if (checkout && fallback.length + checkout.length + 1 <= MAX_CARACTERES_FOLLOWUP_LEONARDO) {
    return fallback + "\n" + checkout;
  }
  return fallback;
}
