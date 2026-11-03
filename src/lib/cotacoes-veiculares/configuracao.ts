import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CATEGORIAS_COTACAO, type CategoriaCotacao, type PlanoEmpresa } from "./catalogo";
import { type RegraComercialPlano, type OpcionalComercial, validarRegraComercial } from "./comercial";

const admin=getSupabaseAdmin();
export async function listarPlanosEmpresa(empresaId:string,apenasAtivos=false):Promise<PlanoEmpresa[]> {
  let consulta=admin.from("cotacao_veicular_planos").select("empresa_id,codigo,nome,ordem,ativo")
    .eq("empresa_id",empresaId).order("ordem").order("created_at");
  if(apenasAtivos)consulta=consulta.eq("ativo",true);
  const {data,error}=await consulta;
  if(error)throw new Error(error.message);
  return (data||[]) as PlanoEmpresa[];
}
function regraNumerica(r:RegraComercialPlano):RegraComercialPlano{
  return {...r,
    participacao_percentual:Number(r.participacao_percentual),
    participacao_min_centavos:Number(r.participacao_min_centavos),
    terceiros_limite_centavos:Number(r.terceiros_limite_centavos),
    assistencia_km_total:Number(r.assistencia_km_total),
    assistencias_ano:Number(r.assistencias_ano),
    carro_reserva_incluso_dias:Number(r.carro_reserva_incluso_dias),
  };
}
export type ArquivoPlano = {empresa_id:string;plano:string;referencia:string;vigencia_ate:string|null;arquivo_precos_nome:string|null;arquivo_precos_em:string|null;arquivo_especiais_nome:string|null;arquivo_especiais_em:string|null};
export async function listarArquivosPlano(empresaId:string):Promise<ArquivoPlano[]>{
 const {data,error}=await admin.from("cotacao_veicular_planos_arquivos").select("*").eq("empresa_id",empresaId);
 if(error)throw new Error(error.message);
 return (data||[]) as ArquivoPlano[];
}
export type OpcionalDaEmpresa=OpcionalComercial&{categoria:string;plano:string};
export async function listarRegrasComerciais(empresaId:string,categoria:CategoriaCotacao){
  const [r,o]=await Promise.all([
    admin.from("cotacao_veicular_regras_empresa").select("*").eq("empresa_id",empresaId).eq("categoria",categoria),
    admin.from("cotacao_veicular_opcionais_empresa").select("*").eq("empresa_id",empresaId).eq("categoria",categoria),
  ]);
  if(r.error||o.error)throw new Error(r.error?.message||o.error?.message);
  return {regras:((r.data||[]) as RegraComercialPlano[]).map(regraNumerica),opcionais:(o.data||[]) as OpcionalDaEmpresa[]};
}
export async function consultarRegraComercial(empresaId:string,categoria:CategoriaCotacao,plano:string){
  const {regras,opcionais}=await listarRegrasComerciais(empresaId,categoria);
  const regra=regras.find(r=>r.plano===plano);
  if(!regra)throw new Error("Configure as regras comerciais do plano solicitado.");
  const extras=opcionais.filter(o=>o.plano===plano);
  const problema=validarRegraComercial(regra,extras);
  if(problema)throw new Error(problema);
  return {regra,opcionais:extras};
}
export type StatusConfiguracaoCotacao={pronta:boolean;pendencias:string[];categorias:CategoriaCotacao[];faixas:number;regras:number};
export async function statusConfiguracaoCotacao(empresaId:string):Promise<StatusConfiguracaoCotacao>{
 const [arquivosResp,planosResp,faixasResp,regrasResp,opcionaisResp,especiaisResp]=await Promise.all([
  admin.from("cotacao_veicular_planos_arquivos").select("*").eq("empresa_id",empresaId),
  admin.from("cotacao_veicular_planos").select("codigo,nome,ativo").eq("empresa_id",empresaId),
  admin.from("cotacao_veicular_precos_planos").select("categoria,plano,fipe_min_centavos,fipe_max_centavos,valor_centavos,codigo_produto").eq("empresa_id",empresaId).limit(10000),
  admin.from("cotacao_veicular_regras_empresa").select("*").eq("empresa_id",empresaId),
  admin.from("cotacao_veicular_opcionais_empresa").select("*").eq("empresa_id",empresaId),
  admin.from("cotacao_veicular_modelos_plano").select("plano").eq("empresa_id",empresaId).limit(5000),
 ]);
 for(const response of [arquivosResp,planosResp,faixasResp,regrasResp,opcionaisResp,especiaisResp]){
   if(response.error)throw new Error(response.error.message);
 }
 const arquivos=(arquivosResp.data||[]) as ArquivoPlano[];
 const planos=(planosResp.data||[]).filter(p=>p.ativo);
 const faixas=faixasResp.data||[];
 const regras=((regrasResp.data||[]) as RegraComercialPlano[]).map(regraNumerica);
 const opcionais=(opcionaisResp.data||[]) as OpcionalDaEmpresa[];
 const especiais=especiaisResp.data||[];
 const pendencias:string[]=[];
 const categorias=[...new Set(faixas.map(f=>f.categoria))]
  .filter((cat):cat is CategoriaCotacao=>Object.hasOwn(CATEGORIAS_COTACAO,cat));
 if(!planos.length)pendencias.push("Crie seu primeiro plano na aba Planos.");
 for(const plano of planos){
   const meta=arquivos.find(a=>a.plano===plano.codigo);
   const precos=faixas.filter(f=>f.plano===plano.codigo);
   if(!precos.length||!meta?.arquivo_precos_nome)
     pendencias.push(plano.nome+": importe a tabela de preços.");
   if(precos.some(f=>Number(f.valor_centavos)<=0||
     Number(f.fipe_max_centavos)<=Number(f.fipe_min_centavos)||!f.codigo_produto||
     !Object.hasOwn(CATEGORIAS_COTACAO,f.categoria)))
     pendencias.push(plano.nome+": existem faixas FIPE inválidas.");
   const categoriasPlano=[...new Set(precos.map(f=>f.categoria))].filter(
     (cat):cat is CategoriaCotacao=>Object.hasOwn(CATEGORIAS_COTACAO,cat));
   for(const categoria of categoriasPlano){
     const ordenadas=precos.filter(f=>f.categoria===categoria)
       .sort((a,b)=>Number(a.fipe_min_centavos)-Number(b.fipe_min_centavos));
     if(ordenadas.some((f,i)=>i>0&&Number(f.fipe_min_centavos)<=Number(ordenadas[i-1].fipe_max_centavos)))
       pendencias.push(plano.nome+": faixas FIPE sobrepostas em "+CATEGORIAS_COTACAO[categoria]+".");
     if(categoria==="especiais"&&
       (!meta?.arquivo_especiais_nome||!especiais.some(e=>e.plano===plano.codigo)))
       pendencias.push(plano.nome+": importe a lista de veículos especiais.");
     const regra=regras.find(r=>r.plano===plano.codigo&&r.categoria===categoria);
     if(!regra){pendencias.push(plano.nome+": configure as coberturas de "+CATEGORIAS_COTACAO[categoria]+".");continue;}
     const validacao=validarRegraComercial(regra,opcionais.filter(o=>o.categoria===categoria&&o.plano===plano.codigo));
     if(validacao)pendencias.push(plano.nome+" / "+CATEGORIAS_COTACAO[categoria]+": "+validacao);
   }
 }
 return {pronta:pendencias.length===0,pendencias:[...new Set(pendencias)].slice(0,100),
  categorias,faixas:faixas.length,regras:regras.length};
}
