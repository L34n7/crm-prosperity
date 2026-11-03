import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listarPlanosEmpresa, listarArquivosPlano,statusConfiguracaoCotacao } from "@/lib/cotacoes-veiculares/configuracao";
import { USOS_VEICULO,motorizacaoDaFipe,type UsoVeiculo } from "@/lib/cotacoes-veiculares/comercial";
import { CATEGORIAS_COTACAO,categoriaValida,configuracaoCotacao,consultarFaixas,calcularCotacaoPlanos,salvarCotacaoPlanos } from "@/lib/cotacoes-veiculares/servico";
import {detalharVeiculoFipe,precoFipeCentavos,type TipoFipe} from "@/lib/cotacoes-veiculares/fipe";
import {classificarVeiculoFipe} from "@/lib/cotacoes-veiculares/classificacao";

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
  const [config,planos,faixas,arquivos,status,cot,especial]=await Promise.all([
    configuracaoCotacao(auth.empresaId!),listarPlanosEmpresa(auth.empresaId!),
    consultarFaixas(auth.empresaId!,categoria),listarArquivosPlano(auth.empresaId!),statusConfiguracaoCotacao(auth.empresaId!),
    admin.from("cotacao_veicular_cotacoes").select("*").eq("empresa_id",auth.empresaId!).order("created_at",{ascending:false}).limit(100),
    admin.from("cotacao_veicular_modelos_empresa").select("modelo",{head:true,count:"exact"}).eq("empresa_id",auth.empresaId!),
  ]);
  if(cot.error||especial.error)throw new Error(cot.error?.message||especial.error?.message);
  return NextResponse.json({ok:true,config,planos,faixas,arquivos,status,cotacoes:cot.data||[],
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
    const {error:err}=await getSupabaseAdmin().from("cotacao_veicular_planos_arquivos")
      .update({vigencia_ate:null,updated_at:new Date().toISOString()})
      .eq("empresa_id",empresaId).eq("plano",plano);
    if(err)throw err;
    return NextResponse.json({ok:true});
  }
  if(!["simular","salvar"].includes(acao))throw new Error("Operação inválida.");
  if(!auth.podeGerenciar)return erro(new Error("Sem permissão para gerar cotações."),403);
  // Os dados FIPE e a categoria comercial são obtidos no servidor, nunca aceitos do cliente.
  const tipo=String(body.tipo_fipe||"") as TipoFipe;
  const marcaFipe=String(body.marca_fipe||"");
  const modeloFipe=String(body.modelo_fipe||"");
  const anoFipe=String(body.ano_fipe||"");
  if(!["cars","motorcycles","trucks"].includes(tipo)||
    [marcaFipe,modeloFipe,anoFipe].some(v=>!v||v.length>60||!/^\w[\w-]*$/.test(v)))
    throw new Error("Selecione marca, modelo e ano diretamente na consulta FIPE.");
  const uso=String(body.uso||"") as UsoVeiculo;
  if(!Object.hasOwn(USOS_VEICULO,uso))throw new Error("Informe a finalidade de uso.");
  const veiculoFipe=await detalharVeiculoFipe(tipo,marcaFipe,modeloFipe,anoFipe);
  const energia=motorizacaoDaFipe(veiculoFipe.fuel,veiculoFipe.model);
  if(!energia)throw new Error(
    "A FIPE não identificou a motorização deste veículo. Solicite uma conferência antes de cotar."
  );
  const categoriaInterna=await classificarVeiculoFipe({
    empresaId,tipo,codigoFipe:veiculoFipe.codeFipe,modelo:veiculoFipe.model,uso,
  });
  if(!categoriaInterna.categoria)
    throw new Error("Classificação FIPE pendente: informe a categoria deste veículo na aba Planos, em Classificações FIPE.");
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
  const veiculo=veiculoFipe.brand+" "+veiculoFipe.model;
  const parametros={empresaId,categoria:categoriaInterna.categoria,
    veiculo,codigoFipe:veiculoFipe.codeFipe,
    valorFipeCentavos:precoFipeCentavos(veiculoFipe.price),uso,energia,
    origem:"manual" as const,opcionaisPorPlano};
  if(acao==="simular")return NextResponse.json({ok:true,calculos:await calcularCotacaoPlanos(parametros)});
  const ano=veiculoFipe.modelYear;
  const resultado=await salvarCotacaoPlanos({...parametros,veiculo,anoModelo:ano,
    nomeContato:String(body.nome_contato||"").slice(0,160),
    referenciaFipe:(veiculoFipe.referenceMonth+" | "+veiculoFipe.codeFipe).slice(0,100)});
  return NextResponse.json({ok:true,...resultado});
 }catch(e){console.error("[COTACAO_POST]",e);return erro(e);}
}
