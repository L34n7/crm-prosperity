import "server-only";
import {getSupabaseAdmin} from "@/lib/supabase/admin";
import {
  normalizarCondicoesContratacao,
  type CondicoesContratacao,
} from "./condicoes-contratacao";

const admin=getSupabaseAdmin();

export async function carregarCondicoesContratacao(empresaId:string):Promise<{
  padrao:CondicoesContratacao;
  porPlano:Record<string,CondicoesContratacao>;
}>{
  const [empresa,planos]=await Promise.all([
    admin.from("cotacao_veicular_taxas_empresa")
      .select("config_json").eq("empresa_id",empresaId).maybeSingle(),
    admin.from("cotacao_veicular_taxas_planos")
      .select("plano,config_json").eq("empresa_id",empresaId),
  ]);
  if(empresa.error)throw new Error(empresa.error.message);
  if(planos.error)throw new Error(planos.error.message);
  const porPlano:Record<string,CondicoesContratacao>={};
  for(const item of planos.data||[]){
    if(typeof item.plano!=="string")continue;
    porPlano[item.plano]=normalizarCondicoesContratacao(item.config_json);
  }
  return {
    padrao:normalizarCondicoesContratacao(empresa.data?.config_json),
    porPlano,
  };
}

export function condicoesEfetivasPlano(
  configuracao:{padrao:CondicoesContratacao;
    porPlano:Record<string,CondicoesContratacao>},
  plano:string,
):CondicoesContratacao{
  return configuracao.porPlano[plano]||configuracao.padrao;
}
