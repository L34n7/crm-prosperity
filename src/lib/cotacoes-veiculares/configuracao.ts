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
  const [c,p,f,r,o,e]=await Promise.all([
    admin.from("cotacao_veicular_configuracoes").select("tabela_importada,modelos_importados,referencia,vigencia_ate")
      .eq("empresa_id",empresaId).maybeSingle(),
    admin.from("cotacao_veicular_planos").select("codigo,nome,ativo").eq("empresa_id",empresaId),
    admin.from("cotacao_veicular_precos_planos")
      .select("categoria,plano,fipe_min_centavos,fipe_max_centavos,valor_centavos,codigo_produto")
      .eq("empresa_id",empresaId).limit(10000),
    admin.from("cotacao_veicular_regras_empresa").select("*").eq("empresa_id",empresaId),
    admin.from("cotacao_veicular_opcionais_empresa").select("*").eq("empresa_id",empresaId),
    admin.from("cotacao_veicular_modelos_empresa").select("modelo",{head:true,count:"exact"}).eq("empresa_id",empresaId),
  ]);
  for(const resp of [c,p,f,r,o,e])if(resp.error)throw new Error(resp.error.message);
  const planos=(p.data||[]).filter(x=>x.ativo);
  const faixas=f.data||[];
  const regras=((r.data||[]) as RegraComercialPlano[]).map(regraNumerica);
  const opcionais=(o.data||[]) as OpcionalDaEmpresa[];
  const categorias=[...new Set(faixas.map(x=>x.categoria))].filter((x):x is CategoriaCotacao=>
    Object.hasOwn(CATEGORIAS_COTACAO,x));
  const pendencias:string[]=[];
  if(!planos.length)pendencias.push("Crie ao menos um plano.");
  if(!c.data?.tabela_importada||!faixas.length)pendencias.push("Importe a planilha de preços.");
  if(!c.data?.referencia?.trim())pendencias.push("Defina a referência comercial da tabela.");
  if(!c.data?.vigencia_ate||c.data.vigencia_ate<new Date().toISOString().slice(0,10))
    pendencias.push("Informe uma validade atual para a tabela.");
  if(faixas.some(x=>Number(x.valor_centavos)<=0||Number(x.fipe_max_centavos)<=Number(x.fipe_min_centavos)||
    !x.codigo_produto||!Object.hasOwn(CATEGORIAS_COTACAO,x.categoria)))
    pendencias.push("Existem faixas ou valores inválidos.");
  if(categorias.includes("especiais")&&(!c.data?.modelos_importados||!e.count))
    pendencias.push("Importe a lista dos veículos especiais.");
  for(const categoria of categorias){
    const porPlano=planos.map(plano=>({
      plano,faixas:faixas.filter(f=>f.categoria===categoria&&f.plano===plano.codigo)
        .sort((a,b)=>Number(a.fipe_min_centavos)-Number(b.fipe_min_centavos)),
    }));
    const base=porPlano[0]?.faixas.map(f=>[Number(f.fipe_min_centavos),Number(f.fipe_max_centavos)])||[];
    for(const item of porPlano){
      const atual=item.faixas;
      if(!atual.length || atual.length!==base.length || atual.some((f,i)=>
        Number(f.fipe_min_centavos)!==base[i][0] || Number(f.fipe_max_centavos)!==base[i][1]))
        pendencias.push("Complete as mesmas faixas FIPE em "+CATEGORIAS_COTACAO[categoria]+
          " para o plano "+item.plano.nome+".");
      if(atual.some((v,i)=>i>0&&Number(v.fipe_min_centavos)<=Number(atual[i-1].fipe_max_centavos)))
        pendencias.push("Faixas FIPE sobrepostas em "+CATEGORIAS_COTACAO[categoria]+".");
      const regra=regras.find(v=>v.categoria===categoria&&v.plano===item.plano.codigo);
      if(!regra){pendencias.push("Configure as coberturas do plano "+item.plano.nome+
        " em "+CATEGORIAS_COTACAO[categoria]+".");continue;}
      const erro=validarRegraComercial(regra,opcionais.filter(v=>v.categoria===categoria&&v.plano===item.plano.codigo));
      if(erro)pendencias.push(item.plano.nome+" / "+CATEGORIAS_COTACAO[categoria]+": "+erro);
    }
  }
  return {pronta:pendencias.length===0,pendencias:[...new Set(pendencias)].slice(0,120),
    categorias,faixas:faixas.length,regras:regras.length};
}
