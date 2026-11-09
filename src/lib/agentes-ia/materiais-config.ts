export const MAX_MATERIAIS_POR_VINCULO = 12;

export type MaterialVinculado = {
  midia_id: string;
  quando_enviar: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Configuração declarativa; o arquivo real sempre é resolvido no backend pela empresa. */
export function normalizarMateriais(valor: unknown): MaterialVinculado[] {
  if (!Array.isArray(valor)) return [];
  const ids = new Set<string>();
  const saida: MaterialVinculado[] = [];
  for (const item of valor) {
    if (!item || typeof item !== "object") continue;
    const objeto = item as Record<string, unknown>;
    const midia_id = String(objeto.midia_id || "").trim();
    const quando_enviar = String(objeto.quando_enviar || "").trim().replace(/\s+/g, " ").slice(0, 240);
    if (!UUID.test(midia_id) || !quando_enviar || ids.has(midia_id)) continue;
    ids.add(midia_id);
    saida.push({ midia_id, quando_enviar });
    if (saida.length >= MAX_MATERIAIS_POR_VINCULO) break;
  }
  return saida;
}
