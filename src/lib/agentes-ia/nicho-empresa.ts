import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ContextoNichoFerramenta } from "./ferramentas-por-nicho";

const supabaseAdmin = getSupabaseAdmin();

export async function carregarNichoEmpresa(
  empresaId: string
): Promise<ContextoNichoFerramenta | null> {
  const { data: empresa, error: empresaError } = await supabaseAdmin
    .from("empresas")
    .select("nicho_id")
    .eq("id", empresaId)
    .maybeSingle();

  if (empresaError) throw new Error(empresaError.message);
  const nichoId = String(empresa?.nicho_id || "").trim();
  if (!nichoId) return null;

  const { data: nicho, error: nichoError } = await supabaseAdmin
    .from("nichos")
    .select("codigo, grupo, nome")
    .eq("id", nichoId)
    .maybeSingle();

  if (nichoError) throw new Error(nichoError.message);
  if (!nicho) return null;

  return {
    codigo: String(nicho.codigo || "").trim() || null,
    grupo: String(nicho.grupo || "").trim() || null,
    nome: String(nicho.nome || "").trim() || null,
  };
}
