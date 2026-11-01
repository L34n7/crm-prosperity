import { getSupabaseAdmin } from "@/lib/supabase/admin";
const supabase = getSupabaseAdmin();

/** Confere o estado atual no banco, sem cache nem renovação implícita. Falha de consulta impede execução. */
export async function automacoesEmpresaEstaoBloqueadas(empresaId: string): Promise<boolean> {
  if (!empresaId) throw new Error("Empresa ausente para validar automações.");
  const { data: empresa, error } = await supabase.from("empresas")
    .select("status,assinatura_status,white_label_id,white_label_tipo")
    .eq("id", empresaId).maybeSingle();
  if (error) throw new Error(`Falha ao consultar bloqueio: ${error.message}`);
  if (!empresa) throw new Error("Empresa inexistente na validação de automações.");
  if (empresa.status === "cancelada" || empresa.assinatura_status === "bloqueada") return true;
  if (empresa.white_label_tipo === "cliente" && empresa.white_label_id) {
    const { data: wl, error: wlError } = await supabase.from("white_labels")
      .select("empresa_gestora_id").eq("id", empresa.white_label_id).maybeSingle();
    if (wlError) throw new Error(`Falha ao consultar White Label: ${wlError.message}`);
    if (wl?.empresa_gestora_id) {
      const { data: gestora, error: gestoraError } = await supabase.from("empresas")
        .select("status,assinatura_status").eq("id", wl.empresa_gestora_id).maybeSingle();
      if (gestoraError) throw new Error(`Falha ao consultar gestora: ${gestoraError.message}`);
      if (!gestora || gestora.status === "cancelada" || gestora.assinatura_status === "bloqueada") return true;
    }
  }
  // Status vencida não é bloqueada: mantém funcionamento no prazo de tolerância.
  return false;
}
