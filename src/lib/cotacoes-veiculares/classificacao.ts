import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CATEGORIAS_COTACAO,type CategoriaCotacao } from "./catalogo";
import { precoFipeCentavos,type TipoFipe,type DetalheFipe } from "./fipe";
import {motorizacaoDaFipe,type UsoVeiculo} from "./comercial";
import {categoriaAutomaticaPorFipe,categoriaBaseEfetivaFipe} from "./classificacao-automatica";
import {selecionarRegraModelo,type RegraModeloCotacao} from "./regras-modelos";

export type ClassificacaoFipe={
 categoria:CategoriaCotacao|null;categoria_base:CategoriaCotacao|null;
 origem:"automatica"|"manual";pendente:boolean;
};
const admin=getSupabaseAdmin();

async function regraComercialDoModelo(params:{
  empresaId:string;tipo:TipoFipe;marca:string;modelo:string;
}):Promise<RegraModeloCotacao|null>{
  const {data,error}=await admin.from("cotacao_veicular_regras_modelos")
    .select("tipo_fipe,marca,modelo,categoria")
    .eq("empresa_id",params.empresaId).eq("tipo_fipe",params.tipo)
    .limit(500);
  if(error)throw new Error("Falha ao consultar classificação por modelo: "+error.message);
  return selecionarRegraModelo((data||[]) as RegraModeloCotacao[],{
    tipo_fipe:params.tipo,marca:params.marca,modelo:params.modelo,
  });
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
  // Registros antigos com classificação automática pendente também
  // recebem uma categoria caso uma regra conservadora tenha evidência
  // suficiente. Nunca altera classificação manual do administrador.
  if(existente&&!base&&existente.origem!=="manual"){
    const novaCategoria=categoriaAutomaticaPorFipe(params.tipo,params.modelo);
    if(novaCategoria){
      const {error:erroAtualizacao}=await admin
        .from("cotacao_veicular_classificacoes_fipe")
        .update({categoria:novaCategoria,updated_at:new Date().toISOString()})
        .match(chave).eq("origem","automatica").is("categoria",null);
      if(erroAtualizacao)throw new Error(erroAtualizacao.message);
      const {data:revisada,error:erroRevisao}=await admin
        .from("cotacao_veicular_classificacoes_fipe")
        .select("categoria,origem").match(chave).maybeSingle();
      if(erroRevisao)throw new Error(erroRevisao.message);
      base=revisada?.categoria as CategoriaCotacao|null ?? null;
      origem=revisada?.origem==="manual"?"manual":"automatica";
    }
  }
  if(!existente){
    base=categoriaAutomaticaPorFipe(params.tipo,params.modelo);
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
 const [classificacao,consulta,regraModelo]=await Promise.all([
   classificarVeiculoFipe({
     empresaId,tipo,codigoFipe:veiculo.codeFipe,modelo:veiculo.model,uso,
   }),
   admin.from("cotacao_veicular_catalogo_fipe")
     .select("categoria").match(chave).maybeSingle(),
   regraComercialDoModelo({
     empresaId,tipo,marca:veiculo.brand,modelo:veiculo.model,
   }),
 ]);
 if(consulta.error)throw new Error(consulta.error.message);
 const categoriaExistente=consulta.data?.categoria as CategoriaCotacao|null|undefined;
 const categoriaBase=categoriaBaseEfetivaFipe({
   categoriaClassificacao:classificacao.categoria_base,
   origemClassificacao:classificacao.origem,
   categoriaCatalogo:categoriaExistente,
 });
 // A regra por FAMÍLIA prevalece sobre o automático e o catálogo por
 // ano, mas nunca sobre a classificação manual específica do código FIPE.
 // O catálogo conserva a categoria-base; remover uma regra deve voltar ao
 // comportamento anterior, sem deixar categorias comerciais gravadas no cache.
 const categoriaRegra=classificacao.origem==="manual"?null:regraModelo?.categoria;
 const categoriaBaseEfetiva=categoriaRegra||categoriaBase;
 const categoria=categoriaBaseEfetiva==="auto_leves"&&(uso==="aplicativo"||uso==="taxi")
   ?"app_taxi":categoriaBaseEfetiva;
 const valores={
   marca:veiculo.brand.slice(0,160),modelo:veiculo.model.slice(0,240),
   ano_modelo:veiculo.modelYear,combustivel:veiculo.fuel.slice(0,80),energia,
   valor_fipe_centavos:precoFipeCentavos(veiculo.price),
   referencia_fipe:veiculo.referenceMonth.slice(0,100),
   consultado_em:new Date().toISOString(),
 };
 if(consulta.data){
   // Uma edição manual na classificação prevalece sobre o catálogo
   // por ano, que pode conter uma categoria automática anterior.
   // Sem edição manual, apenas preenche categorias pendentes.
   const sincronizarCategoria=Boolean(categoriaBase)&&(
     categoriaExistente===null||
     (classificacao.origem==="manual"&&categoriaExistente!==categoriaBase)
   );
   const {error}=await admin.from("cotacao_veicular_catalogo_fipe")
     .update({...valores,...(sincronizarCategoria?{categoria:categoriaBase}:{})})
     .match(chave);
   if(error)throw new Error("Falha ao atualizar FIPE: "+error.message);
 }else{
   const {error}=await admin.from("cotacao_veicular_catalogo_fipe")
     .upsert({...chave,...valores,categoria:categoriaBase},{
       onConflict:"empresa_id,tipo_fipe,codigo_fipe,codigo_ano_fipe",
       ignoreDuplicates:true,
     });
   if(error)throw new Error("Falha ao inserir catálogo FIPE: "+error.message);
 }
 return {categoria,categoria_base:categoriaBaseEfetiva,
   origem:categoriaRegra?"manual":classificacao.origem,pendente:!categoria};
}
