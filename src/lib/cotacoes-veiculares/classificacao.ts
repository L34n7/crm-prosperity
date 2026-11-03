import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CATEGORIAS_COTACAO,type CategoriaCotacao } from "./catalogo";
import { precoFipeCentavos,type TipoFipe,type DetalheFipe } from "./fipe";
import {motorizacaoDaFipe,type UsoVeiculo} from "./comercial";

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

/** Persiste somente versões FIPE efetivamente consultadas; os preços têm referência mensal. */
/** Armazena a versão FIPE efetivamente consultada e respeita ajustes
 * feitos diretamente na categoria do catálogo (inclusive por ano). */
export async function registrarConsultaFipe(params:{
 empresaId:string;tipo:TipoFipe;anoCodigo:string;veiculo:DetalheFipe;uso:UsoVeiculo;
}):Promise<ClassificacaoFipe>{
 const {veiculo,tipo,empresaId,anoCodigo,uso}=params;
 const energia=motorizacaoDaFipe(veiculo.fuel,veiculo.model);
 if(!energia)throw new Error(
   "A FIPE não identificou a motorização com segurança. O modelo precisa de revisão antes do cadastro."
 );
 const chave={empresa_id:empresaId,tipo_fipe:tipo,
   codigo_fipe:veiculo.codeFipe,codigo_ano_fipe:anoCodigo};
 const [classificacao,consulta]=await Promise.all([
   classificarVeiculoFipe({
     empresaId,tipo,codigoFipe:veiculo.codeFipe,modelo:veiculo.model,uso,
   }),
   admin.from("cotacao_veicular_catalogo_fipe")
     .select("categoria").match(chave).maybeSingle(),
 ]);
 if(consulta.error)throw new Error(consulta.error.message);
 const categoriaExistente=consulta.data?.categoria as CategoriaCotacao|null|undefined;
 const categoriaBase=categoriaExistente??classificacao.categoria_base;
 const categoria=categoriaBase==="auto_leves"&&(uso==="aplicativo"||uso==="taxi")
   ?"app_taxi":categoriaBase;
 const valores={
   marca:veiculo.brand.slice(0,160),modelo:veiculo.model.slice(0,240),
   ano_modelo:veiculo.modelYear,combustivel:veiculo.fuel.slice(0,80),energia,
   valor_fipe_centavos:precoFipeCentavos(veiculo.price),
   referencia_fipe:veiculo.referenceMonth.slice(0,100),
   consultado_em:new Date().toISOString(),
 };
 if(consulta.data){
   // Nunca regrava a categoria quando a linha já existe: administrador pode
   // corrigi-la diretamente no banco.
   const {error}=await admin.from("cotacao_veicular_catalogo_fipe")
     .update(valores).match(chave);
   if(error)throw new Error("Falha ao atualizar FIPE: "+error.message);
 }else{
   const {error}=await admin.from("cotacao_veicular_catalogo_fipe")
     .upsert({...chave,...valores,categoria:categoriaBase},{
       onConflict:"empresa_id,tipo_fipe,codigo_fipe,codigo_ano_fipe",
       ignoreDuplicates:true,
     });
   if(error)throw new Error("Falha ao inserir catálogo FIPE: "+error.message);
 }
 return {categoria,categoria_base:categoriaBase,origem:classificacao.origem,
   pendente:!categoria};
}
