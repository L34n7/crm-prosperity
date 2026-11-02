import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CATEGORIAS_COTACAO, type CategoriaCotacao, type PlanoCotacao } from "./catalogo";
import {
  type RegraComercialPlano, type OpcionalComercial,
  validarRegraComercial,
} from "./comercial";

function normalizarRegra(regra: RegraComercialPlano):RegraComercialPlano {
  return {
    ...regra,
    participacao_percentual:Number(regra.participacao_percentual),
    participacao_min_centavos:Number(regra.participacao_min_centavos),
    terceiros_limite_centavos:Number(regra.terceiros_limite_centavos),
    assistencia_km_total:Number(regra.assistencia_km_total),
    assistencias_ano:Number(regra.assistencias_ano),
    carro_reserva_incluso_dias:Number(regra.carro_reserva_incluso_dias),
  };
}

export async function listarRegrasComerciais(empresaId: string, categoria: CategoriaCotacao) {
  const admin=getSupabaseAdmin();
  const [{data:regras,error:erroRegras},{data:opcionais,error:erroOpcionais}]=await Promise.all([
    admin.from("cotacao_veicular_regras_empresa").select("*").eq("empresa_id",empresaId).eq("categoria",categoria),
    admin.from("cotacao_veicular_opcionais_empresa").select("*").eq("empresa_id",empresaId).eq("categoria",categoria),
  ]);
  if(erroRegras||erroOpcionais)throw new Error(erroRegras?.message||erroOpcionais?.message);
  return {
    regras:((regras||[]) as RegraComercialPlano[]).map(normalizarRegra),
    opcionais:(opcionais||[]) as OpcionalComercial[],
  };
}

export async function consultarRegraComercial(empresaId: string, categoria: CategoriaCotacao, plano: PlanoCotacao) {
  const {regras,opcionais}=await listarRegrasComerciais(empresaId,categoria);
  const regra=regras.find(item=>item.plano===plano);
  if(!regra)throw new Error("As regras do plano "+plano+" não estão configuradas para esta categoria.");
  const extras=opcionais.filter(item=>(item as OpcionalComercial & {plano:string}).plano===plano);
  const erro=validarRegraComercial(regra,extras);
  if(erro)throw new Error("Configuração comercial incompleta: "+erro);
  return {regra,opcionais:extras};
}

export type StatusConfiguracaoCotacao = {
  pronta:boolean;
  pendencias:string[];
  categorias:CategoriaCotacao[];
  faixas:number;
  regras:number;
};

export async function statusConfiguracaoCotacao(empresaId:string):Promise<StatusConfiguracaoCotacao> {
  const admin=getSupabaseAdmin();
  const [configResp,faixasResp,regrasResp,opcionaisResp,especiaisResp]=await Promise.all([
    admin.from("cotacao_veicular_configuracoes")
      .select("tabela_importada,modelos_importados,referencia,vigencia_ate").eq("empresa_id",empresaId).maybeSingle(),
    admin.from("cotacao_veicular_faixas").select("categoria,fipe_min_centavos,fipe_max_centavos,premium_centavos,completo_centavos,codigo_premium,codigo_completo")
      .eq("empresa_id",empresaId).limit(5000),
    admin.from("cotacao_veicular_regras_empresa").select("*").eq("empresa_id",empresaId),
    admin.from("cotacao_veicular_opcionais_empresa").select("*").eq("empresa_id",empresaId),
    admin.from("cotacao_veicular_modelos_empresa").select("modelo",{count:"exact",head:true}).eq("empresa_id",empresaId),
  ]);
  for(const resp of [configResp,faixasResp,regrasResp,opcionaisResp,especiaisResp]){
    if(resp.error)throw new Error(resp.error.message);
  }
  const config=configResp.data;
  const faixas=faixasResp.data||[];
  const regras=((regrasResp.data||[]) as RegraComercialPlano[]).map(normalizarRegra);
  const opcionais=(opcionaisResp.data||[]) as (OpcionalComercial & {categoria:string;plano:string})[];
  const categorias=[...new Set(faixas.map(f=>String(f.categoria)).filter(
    (s):s is CategoriaCotacao=>Object.hasOwn(CATEGORIAS_COTACAO,s)
  ))];
  const pendencias:string[]=[];
  if(!config?.tabela_importada||!faixas.length)pendencias.push("Importe a tabela de preços desta empresa.");
  if(!config?.referencia?.trim())pendencias.push("Informe a referência comercial da tabela.");
  const hoje=new Date().toISOString().slice(0,10);
  if(!config?.vigencia_ate || config.vigencia_ate<hoje)
    pendencias.push("Defina uma data de validade comercial atual ou futura.");
  if(faixas.some(f=>Number(f.fipe_max_centavos)<=Number(f.fipe_min_centavos) ||
     Number(f.premium_centavos)<=0 || Number(f.completo_centavos)<=0 ||
     !f.codigo_premium || !f.codigo_completo))
    pendencias.push("A tabela contém faixas ou mensalidades inválidas.");
  if(categorias.includes("especiais") && (!config?.modelos_importados || !especiaisResp.count))
    pendencias.push("Importe os veículos especiais, pois a tabela possui essa categoria.");
  for(const categoria of categorias){
    for(const plano of ["premium","completo"] as const){
      const regra=regras.find(r=>r.categoria===categoria&&r.plano===plano);
      if(!regra){
        pendencias.push("Configure as regras de "+CATEGORIAS_COTACAO[categoria]+" — "+(plano==="premium"?"Premium":"Completo")+".");
        continue;
      }
      const extras=opcionais.filter(o=>o.categoria===categoria&&o.plano===plano);
      const erro=validarRegraComercial(regra,extras);
      if(erro)pendencias.push(CATEGORIAS_COTACAO[categoria]+" / "+plano+": "+erro);
    }
  }
  return {
    pronta:pendencias.length===0,
    pendencias,categorias,faixas:faixas.length,regras:regras.length,
  };
}
