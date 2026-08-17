import { registrarLogAuditoriaSeguro } from "@/lib/auditoria/logs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

export async function adicionarEtiquetaRotina(params: {
  empresaId: string;
  conversaId: string;
  automacaoId: string;
  execucaoId: string;
  config: Record<string, unknown>;
}) {
  const etiquetaId = String(params.config.etiqueta_id || "").trim();
  if (!etiquetaId) {
    throw new Error("A ação de etiqueta precisa de uma etiqueta.");
  }

  const [
    { data: etiqueta, error: etiquetaError },
    { data: antes, error: conversaError },
  ] = await Promise.all([
    supabase
      .from("etiquetas")
      .select("id,nome,cor")
      .eq("empresa_id", params.empresaId)
      .eq("id", etiquetaId)
      .eq("ativo", true)
      .maybeSingle(),
    supabase
      .from("conversas")
      .select("id,etiqueta_id,etiqueta_cor")
      .eq("empresa_id", params.empresaId)
      .eq("id", params.conversaId)
      .maybeSingle(),
  ]);

  if (etiquetaError) throw etiquetaError;
  if (conversaError) throw conversaError;
  if (!etiqueta) throw new Error("Etiqueta não encontrada ou inativa.");
  if (!antes) throw new Error("Conversa não encontrada para aplicar etiqueta.");

  const { data: conversa, error: updateError } = await supabase
    .from("conversas")
    .update({
      etiqueta_id: etiqueta.id,
      etiqueta_cor: etiqueta.cor,
      updated_at: new Date().toISOString(),
    })
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId)
    .select("id,etiqueta_id,etiqueta_cor")
    .single();
  if (updateError) throw updateError;

  await registrarLogAuditoriaSeguro({
    empresa_id: params.empresaId,
    categoria: "conversas",
    entidade: "conversa",
    entidade_id: params.conversaId,
    acao: "conversa_etiqueta_automacao",
    descricao: `Etiqueta ${etiqueta.nome} aplicada automaticamente à conversa`,
    antes,
    depois: conversa,
    detalhes: {
      automacao_id: params.automacaoId,
      execucao_id: params.execucaoId,
      etiqueta_id: etiqueta.id,
      origem: "rotina_automacao",
    },
  });

  return { etiqueta, conversa };
}
