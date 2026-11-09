import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  MAX_MATERIAIS_POR_VINCULO,
  normalizarMateriais,
  type MaterialVinculado,
} from "./materiais-config";

/** Verifica rigorosamente os IDs no tenant, inclusive para requests de edição. */
export async function validarMateriaisEmpresa(
  empresaId: string,
  valor: unknown,
): Promise<MaterialVinculado[]> {
  if (valor == null) return [];
  if (!Array.isArray(valor) || valor.length > MAX_MATERIAIS_POR_VINCULO) {
    throw new Error("Selecione no máximo 12 materiais válidos da biblioteca.");
  }
  const materiais = normalizarMateriais(valor);
  if (materiais.length !== valor.length) {
    throw new Error("Cada material precisa de um arquivo válido e uma regra de envio, sem repetições.");
  }
  if (!materiais.length) return materiais;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("midias")
    .select("id, url")
    .eq("empresa_id", empresaId)
    .in("tipo", ["imagem", "video", "audio", "arquivo"])
    .in("id", materiais.map((item) => item.midia_id));
  if (error) throw new Error(error.message);
  const validos = new Set(
    (data || []).filter((item) => Boolean(item.url)).map((item) => String(item.id)),
  );
  if (materiais.some((item) => !validos.has(item.midia_id))) {
    throw new Error("Um dos arquivos não pertence à empresa ou não está disponível na biblioteca.");
  }
  return materiais;
}
