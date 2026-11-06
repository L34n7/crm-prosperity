import "server-only";
import {getSupabaseAdmin} from "@/lib/supabase/admin";
import type {Plano} from "./comparacao-planos";
type Linha=Plano&{veiculo:string;ano_modelo:number;uso:string;grupo_id:string|null};
const admin=getSupabaseAdmin();
export async function cotacoesDoGrupo(empresaId:string,conversaId:string,grupoId:string):Promise<Linha[]>{
 const {data,error}=await admin.from("cotacao_veicular_cotacoes")
   .select("veiculo,ano_modelo,plano,plano_nome,mensalidade_base_centavos,regras_snapshot,grupo_id")
   .eq("empresa_id",empresaId).eq("conversa_id",conversaId)
   .eq("origem","agente_ia").eq("grupo_id",grupoId);
 if(error)throw new Error(error.message);
 return (data||[]).map(r=>({
   veiculo:String(r.veiculo||""),ano_modelo:Number(r.ano_modelo),
   plano:String(r.plano||""),plano_nome:String(r.plano_nome||r.plano||""),
   mensalidade_base_centavos:Number(r.mensalidade_base_centavos),
   uso:String((r.regras_snapshot as {uso?:string}|null)?.uso||""),
   grupo_id:r.grupo_id||null,
 }));
}
