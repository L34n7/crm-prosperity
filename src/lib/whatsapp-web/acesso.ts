import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const EMPRESA_WHATSAPP_WEB_LOCAL = "crm prosperity";

function normalizarNomeEmpresa(valor: string | null | undefined) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export async function empresaPodeAcessarWhatsappWebLocal(
  empresaId: string | null | undefined
) {
  if (!empresaId) return false;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("empresas")
      .select("nome_fantasia")
      .eq("id", empresaId)
      .maybeSingle<{ nome_fantasia: string | null }>();

    if (error) {
      console.error(
        "[WHATSAPP_WEB_LOCAL] Erro ao validar empresa autorizada:",
        error.message
      );
      return false;
    }

    return (
      normalizarNomeEmpresa(data?.nome_fantasia) ===
      EMPRESA_WHATSAPP_WEB_LOCAL
    );
  } catch (error) {
    console.error(
      "[WHATSAPP_WEB_LOCAL] Falha ao validar empresa autorizada:",
      error
    );
    return false;
  }
}
