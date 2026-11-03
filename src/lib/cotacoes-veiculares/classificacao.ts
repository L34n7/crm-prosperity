import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CATEGORIAS_COTACAO,type CategoriaCotacao } from "./catalogo";
import type { TipoFipe } from "./fipe";
import type { UsoVeiculo } from "./comercial";

export type ClassificacaoFipe={
 categoria:CategoriaCotacao|null;categoria_base:CategoriaCotacao|null;
 origem:"automatica"|"manual";pendente:boolean;
};
const admin=getSupabaseAdmin();
function categoriaInicial(tipo:TipoFipe,modelo:string):CategoriaCotacao|null{
  if(tipo==="motorcycles")return "motocicleta";
  if(tipo==="trucks")return null; // A FIPE não diz se o caminhão é leve ou pesado.
  const nome=modelo.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
  // Somente modelos inequivocamente de vans; demais carros ficam em automóveis leves.
  if(/\b(SPRINTER|DUCATO|MASTER|TRANSIT|JUMPER|BOXER|IVECO DAILY)\b/.test(nome))
    return "van_utilitario";
  return "auto_leves";
}
export async function classificarVeiculoFipe(params:{
 empresaId:string;tipo:TipoFipe;codigoFipe:string;modelo:string;uso:UsoVeiculo;
}):Promise<ClassificacaoFipe>{
  const codigo=params.codigoFipe.trim();
  if(!codigo||codigo.length>40||params.modelo.length>240)
    throw new Error("Código ou descrição FIPE inválidos.");
  const chave={empresa_id:params.empresaId,tipo_fipe:params.tipo,codigo_fipe:codigo};
  const {data:existente,error}=await admin.from("cotacao_veicular_classificacoes_fipe")
    .select("categoria,origem").match(chave).maybeSingle();
  if(error)throw new Error(error.message);
  let base:CategoriaCotacao|null=existente?.categoria as CategoriaCotacao|null ?? null;
  let origem:"automatica"|"manual"=existente?.origem==="manual"?"manual":"automatica";
  if(!existente){
    base=categoriaInicial(params.tipo,params.modelo);
    const {error:erroInsert}=await admin.from("cotacao_veicular_classificacoes_fipe")
      .upsert({...chave,modelo:params.modelo.slice(0,240),categoria:base,origem:"automatica"},
        {onConflict:"empresa_id,tipo_fipe,codigo_fipe",ignoreDuplicates:true});
    if(erroInsert)throw new Error(erroInsert.message);
    const {data:gravada,error:erroLeitura}=await admin.from("cotacao_veicular_classificacoes_fipe")
      .select("categoria,origem").match(chave).maybeSingle();
    if(erroLeitura)throw new Error(erroLeitura.message);
    base=gravada?.categoria as CategoriaCotacao|null ?? base;
    origem=gravada?.origem==="manual"?"manual":"automatica";
  }
  if(base&&!Object.hasOwn(CATEGORIAS_COTACAO,base))throw new Error("Categoria interna inválida.");
  // Aplicativo e táxi são regras comerciais baseadas na finalidade de uso informada.
  const categoria=base==="auto_leves"&&(params.uso==="aplicativo"||params.uso==="taxi")
    ?"app_taxi":base;
  return {categoria,categoria_base:base,origem,pendente:!categoria};
}
