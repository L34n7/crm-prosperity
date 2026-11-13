/** Um agente pode ter vários arquivos sem expandir o cartão de ferramentas. */
export const MAX_MATERIAIS_POR_VINCULO = 40;
export const MAX_CONHECIMENTOS_POR_MATERIAL = 30;

export type MaterialVinculado = {
  midia_id: string;
  quando_enviar: string;
  conhecimento_ids?: string[];
};

export const UUID_MATERIAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Materiais autorizados por agente, com vínculos opcionais a conhecimentos.
 * Normalizar não autoriza recursos: o backend verifica empresa e agente. */
export function normalizarMateriais(valor: unknown): MaterialVinculado[] {
  if (!Array.isArray(valor)) return [];
  const ids = new Set<string>();
  const saida: MaterialVinculado[] = [];
  for (const item of valor) {
    if (!item || typeof item !== "object") continue;
    const objeto = item as Record<string, unknown>;
    const midia_id = String(objeto.midia_id || "").trim();
    const quando_enviar = String(objeto.quando_enviar || "")
      .trim().replace(/\s+/g, " ").slice(0, 240);
    if (!UUID_MATERIAL.test(midia_id) || !quando_enviar || ids.has(midia_id)) continue;
    const conhecimentos = Array.isArray(objeto.conhecimento_ids)
      ? [...new Set(objeto.conhecimento_ids.filter(
          (v):v is string=>typeof v==="string"&&UUID_MATERIAL.test(v),
        ))].slice(0,MAX_CONHECIMENTOS_POR_MATERIAL)
      : [];
    ids.add(midia_id);
    saida.push({
      midia_id,
      quando_enviar,
      ...(conhecimentos.length?{conhecimento_ids:conhecimentos}:{}),
    });
    if (saida.length >= MAX_MATERIAIS_POR_VINCULO) break;
  }
  return saida;
}

/** Sem vínculo: material direto, opcional para qualquer conversa.
 * Com vínculo: somente após consultar um dos conhecimentos selecionados. */
export function materialAutorizadoPorConhecimento(
  material: MaterialVinculado,
  consultados: ReadonlySet<string>,
): boolean {
  const vinculos=material.conhecimento_ids||[];
  return !vinculos.length||vinculos.some(id=>consultados.has(id));
}

export function materiaisDeConhecimento(
  valor: unknown,
  conhecimentoId: string,
): MaterialVinculado[] {
  return normalizarMateriais(valor).filter(item=>
    (item.conhecimento_ids||[]).includes(conhecimentoId));
}
