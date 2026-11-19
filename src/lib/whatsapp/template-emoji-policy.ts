/**
 * Emojis são permitidos no BODY, mas não em títulos de cabeçalho nem
 * nos rótulos dos botões de templates criados pelo CRM.
 *
 * Extended_Pictographic detecta emojis comuns (inclusive com ZWJ),
 * Regional_Indicator cobre bandeiras e U+20E3/FE0F cobre keycaps.
 * Não usar \\p{Emoji}: ela também inclui dígitos normais.
 */
const EMOJI_RESTRITO_TEMPLATE = /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u20E3\uFE0F]/u;

export function textoTemEmojiTemplateRestrito(texto: unknown): boolean {
  return typeof texto === "string" && EMOJI_RESTRITO_TEMPLATE.test(texto);
}
