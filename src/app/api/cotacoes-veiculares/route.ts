import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listarPlanosEmpresa,statusConfiguracaoCotacao } from "@/lib/cotacoes-veiculares/configuracao";
import { USOS_VEICULO,ENERGIAS_VEICULO,type UsoVeiculo,type EnergiaVeiculo } from "@/lib/cotacoes-veiculares/comercial";
import { CATEGORIAS_COTACAO,categoriaValida,configuracaoCotacao,consultarFaixas,calcularCotacaoPlanos,salvarCotacaoPlanos } from "@/lib/cotacoes-veiculares/servico";

async function acesso(){
 const ctx=await getUsuarioContexto();
 if(!ctx.ok)return {erro:NextResponse.json({ok:false,error:ctx.error},{status:ctx.status})};
 const empresaId=ctx.usuario.empresa_id;
 if(!empresaId)return {erro:NextResponse.json({ok:false,error:"Empresa inválida."},{status:403})};
 const nicho=await buscarNichoEmpresa(empresaId);
 if(nicho.codigo!=="seguro_veicular")return {erro:NextResponse.json({ok:false,error:"Nicho não autorizado."},{status:403})};
 const p=ctx.usuario.permissoes||[];
 const podeConfigurar=ctx.usuario.is_admin||p.includes("cotacoes.configurar");
 const podeGerenciar=ctx.usuario.is_admin||p.includes("cotacoes.gerenciar");
 if(!podeConfigurar&&!podeGerenciar&&!p.includes("cotacoes.visualizar"))
   return {erro:NextResponse.json({ok:false,error:"Sem permissão."},{status:403})};
 return {empresaId,podeConfigurar,podeGerenciar};
}
const erro=(e:unknown,status=400)=>NextResponse.json({ok:false,error:e instanceof Error?e.message:"Falha na cotação."},{status});
function valorInteiro(v:unknown,nome:string,max=2000000000){
 const n=Number(v);
 if(!Number.isSafeInteger(n)||n<0||n>max)throw new Error(nome+" inválido.");
 return n;
}
export async function GET(req:Request){
 try{
  const auth=await acesso();if(auth.erro)return auth.erro;
  const categoria=new URL(req.url).searchParams.get("categoria")||"auto_leves";
  if(!categoriaValida(categoria))throw new Error("Categoria inválida.");
  const admin=getSupabaseAdmin();
  const [config,planos,faixas,status,cot,especial]=await Promise.all([
    configuracaoCotacao(auth.empresaId!),listarPlanosEmpresa(auth.empresaId!),
    consultarFaixas(auth.empresaId!,categoria),statusConfiguracaoCotacao(auth.empresaId!),
    admin.from("cotacao_veicular_cotacoes").select("*").eq("empresa_id",auth.empresaId!).order("created_at",{ascending:false}).limit(100),
    admin.from("cotacao_veicular_modelos_empresa").select("modelo",{head:true,count:"exact"}).eq("empresa_id",auth.empresaId!),
  ]);
  if(cot.error||especial.error)throw new Error(cot.error?.message||especial.error?.message);
  return NextResponse.json({ok:true,config,planos,faixas,status,cotacoes:cot.data||[],
    modelos_especiais_total:especial.count||0,categorias:CATEGORIAS_COTACAO,
    pode_configurar:auth.podeConfigurar,pode_gerenciar:auth.podeGerenciar});
 }catch(e){console.error("[COTACAO_GET]",e);return erro(e,500);}
}
export async function POST(req:Request){
 try{
  const auth=await acesso();if(auth.erro)return auth.erro;
  const empresaId=auth.empresaId!;
  const body=await req.json() as Record<string,unknown>;
  const acao=String(body.acao||"");
  if(acao==="preco"){
    if(!auth.podeConfigurar)return erro(new Error("Sem permissão para editar preços."),403);
    const categoria=body.categoria,plano=String(body.plano||"");
    if(!categoriaValida(categoria))throw new Error("Categoria inválida.");
    const min=valorInteiro(body.fipe_min_centavos,"FIPE");
    const valor=valorInteiro(body.valor_centavos,"Preço",100000000);
    if(valor<=0)throw new Error("Informe uma mensalidade maior que zero.");
    const {data,error}=await getSupabaseAdmin().from("cotacao_veicular_precos_planos")
      .update({valor_centavos:valor,updated_at:new Date().toISOString()})
      .eq("empresa_id",empresaId).eq("categoria",categoria).eq("plano",plano)
      .eq("fipe_min_centavos",min).select("plano").maybeSingle();
    if(error)throw error;
    if(!data)throw new Error("Faixa e plano não encontrados.");
    const {error:err}=await getSupabaseAdmin().from("cotacao_veicular_configuracoes")
      .update({vigencia_ate:null,updated_at:new Date().toISOString()}).eq("empresa_id",empresaId);
    if(err)throw err;
    return NextResponse.json({ok:true});
  }
  if(!["simular","salvar"].includes(acao))throw new Error("Operação inválida.");
  if(!auth.podeGerenciar)return erro(new Error("Sem permissão para gerar cotações."),403);
  if(!categoriaValida(body.categoria))throw new Error("Categoria inválida.");
  const uso=String(body.uso||"") as UsoVeiculo,energia=String(body.energia||"") as EnergiaVeiculo;
  if(!Object.hasOwn(USOS_VEICULO,uso)||!Object.hasOwn(ENERGIAS_VEICULO,energia))
    throw new Error("Informe o uso e a motorização.");
  const op=body.opcionais_por_plano;
  if(op!==undefined && (typeof op!=="object"||op===null||Array.isArray(op)))
    throw new Error("Opcionais inválidos.");
  const opc=op as Record<string,unknown>|undefined;
  const opcionaisPorPlano:Record<string,string[]>={};
  for(const [plano,codigos] of Object.entries(opc||{})){
    if(!Array.isArray(codigos)||codigos.length>60||codigos.some(v=>typeof v!=="string"))
      throw new Error("Opcionais inválidos.");
    opcionaisPorPlano[plano]=codigos as string[];
  }
  const parametros={empresaId,categoria:body.categoria,
    valorFipeCentavos:valorInteiro(body.valor_fipe_centavos,"Valor FIPE"),uso,energia,
    origem:"manual" as const,opcionaisPorPlano};
  if(acao==="simular")return NextResponse.json({ok:true,calculos:await calcularCotacaoPlanos(parametros)});
  const veiculo=String(body.veiculo||"").trim();
  if(veiculo.length<3||veiculo.length>240)throw new Error("Informe o veículo.");
  const ano=body.ano_modelo==null||body.ano_modelo===""?null:valorInteiro(body.ano_modelo,"Ano",32000);
  if(ano!==null&&ano<1950)throw new Error("Ano inválido.");
  const resultado=await salvarCotacaoPlanos({...parametros,veiculo,anoModelo:ano,
    nomeContato:String(body.nome_contato||"").slice(0,160),
    referenciaFipe:String(body.referencia_fipe||"").slice(0,100)});
  return NextResponse.json({ok:true,...resultado});
 }catch(e){console.error("[COTACAO_POST]",e);return erro(e);}
}
