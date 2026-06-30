import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CampoPersonalizadoRow } from "@/lib/cadastros/validar-campos";

export async function buscarCamposPersonalizados(empresaId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("campos_personalizados")
    .select(
      "id, empresa_id, escopo, chave, nome, tipo, obrigatorio, opcoes, ordem, ativo"
    )
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Erro ao buscar campos personalizados: ${error.message}`);
  }

  return (data ?? []) as CampoPersonalizadoRow[];
}

