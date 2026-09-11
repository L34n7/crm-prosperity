import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processarPendenciaAgenteIa } from "./processar-pendencia-configurada";

const supabaseAdmin = getSupabaseAdmin();

export async function processarPendenciasAgenteIaVencidas(limite = 30) {
  const quantidade = Math.min(100, Math.max(1, Math.floor(limite)));
  const { data, error } = await supabaseAdmin
    .from("agente_ia_pendencias")
    .select("id")
    .eq("status", "pendente")
    .lte("processar_em", new Date().toISOString())
    .order("processar_em", { ascending: true })
    .limit(quantidade);
  if (error) throw new Error(error.message);

  const pendencias = data || [];
  const resultados = await Promise.allSettled(
    pendencias.map((item) => processarPendenciaAgenteIa(item.id))
  );
  const erros = resultados.filter((item) => item.status === "rejected").length;

  return {
    encontrados: pendencias.length,
    processados: resultados.length - erros,
    erros,
  };
}
