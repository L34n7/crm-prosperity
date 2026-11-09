import "server-only";
import {getSupabaseAdmin} from "@/lib/supabase/admin";
import {
  normalizarCondicoesContratacao,
  type CondicoesContratacao,
} from "./condicoes-contratacao";

const admin=getSupabaseAdmin();

/** Cada plano possui suas próprias condições. Sem herança entre planos. */
export async function carregarCondicoesContratacao(empresaId:string):Promise<{
  porPlano:Record<string,CondicoesContratacao>;
}>{
  const {data,error}=await admin.from("cotacao_veicular_taxas_planos")
    .select("plano,config_json").eq("empresa_id",empresaId);
  if(error)throw new Error(error.message);
  const porPlano:Record<string,CondicoesContratacao>={};
  for(const item of data||[]){
    if(typeof item.plano!=="string")continue;
    porPlano[item.plano]=normalizarCondicoesContratacao(item.config_json);
  }
  return {porPlano};
}

/** Plano ainda não configurado não herda condições de outros planos. */
export function condicoesEfetivasPlano(
  configuracao:{porPlano:Record<string,CondicoesContratacao>},
  plano:string,
):CondicoesContratacao{
  return configuracao.porPlano[plano]||normalizarCondicoesContratacao(null);
}
