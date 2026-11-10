import { NextResponse } from "next/server";
import {recalcularAdesaoDinamica} from "@/lib/cotacoes-veiculares/condicoes-contratacao";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listarPlanosEmpresa, listarArquivosPlano,statusConfiguracaoCotacao } from "@/lib/cotacoes-veiculares/configuracao";
import { USOS_VEICULO,motorizacaoDaFipe,type UsoVeiculo } from "@/lib/cotacoes-veiculares/comercial";
import { CATEGORIAS_COTACAO,categoriaValida,configuracaoCotacao,consultarFaixas,calcularCotacaoPlanos,salvarCotacaoPlanos } from "@/lib/cotacoes-veiculares/servico";
import {detalharVeiculoFipe,precoFipeCentavos,type TipoFipe} from "@/lib/cotacoes-veiculares/fipe";
import {registrarConsultaFipe} from "@/lib/cotacoes-veiculares/classificacao";

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
  const grupoId=new URL(req.url).searchParams.get("grupo_id");
  if(grupoId!==null){
    if(!/^[0-9a-fA-F-]{36}$/.test(grupoId))return erro(new Error("Identificador inválido."));
    const {data,error}=await admin.from("cotacao_veicular_cotacoes").select("*")
      .eq("empresa_id",auth.empresaId!).eq("grupo_id",grupoId)
      .order("created_at",{ascending:true}).limit(50);
    if(error)throw error;
    let itens=data||[];
    if(!itens.length){
      const {data:registro,error:err}=await admin.from("cotacao_veicular_cotacoes").select("*")
        .eq("empresa_id",auth.empresaId!).eq("id",grupoId).maybeSingle();
      if(err)throw err;
      if(registro)itens=[registro];
    }
    if(!itens.length)return erro(new Error("Cotação não encontrada."),404);
    return NextResponse.json({ok:true,cotacoes:itens});
  }
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
  const categoriaInterna=await registrarConsultaFipe({
    empresaId,tipo,anoCodigo:anoFipe,veiculo:veiculoFipe,uso,
  });
  if(!categoriaInterna.categoria)
    throw new Error("Classificação FIPE pendente: informe a categoria deste veículo no cadastro interno de veículos FIPE.");
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
    veiculo,modeloFipe:veiculoFipe.model,codigoFipe:veiculoFipe.codeFipe,
    valorFipeCentavos:precoFipeCentavos(veiculoFipe.price),uso,energia,
    origem:"manual" as const,opcionaisPorPlano,tipoFipe:tipo};
  if(acao==="simular")return NextResponse.json({ok:true,calculos:await calcularCotacaoPlanos(parametros)});
  const ano=veiculoFipe.modelYear;
  const resultado=await salvarCotacaoPlanos({...parametros,veiculo,anoModelo:ano,
    nomeContato:String(body.nome_contato||"").slice(0,160),
    referenciaFipe:(veiculoFipe.referenceMonth+" | "+veiculoFipe.codeFipe).slice(0,100)});
  return NextResponse.json({ok:true,...resultado});
 }catch(e){console.error("[COTACAO_POST]",e);return erro(e);}
}

export async function PATCH(req:Request){
 try{
  const auth=await acesso();if(auth.erro)return auth.erro;
  if(!auth.podeGerenciar)return erro(new Error("Sem permissão para editar cotações."),403);
  const body=await req.json() as Record<string,unknown>;
  const id=String(body.cotacao_id||"");
  const selecionados=body.opcionais;
  if(!/^[0-9a-fA-F-]{36}$/.test(id)||!Array.isArray(selecionados)||
     selecionados.length>60||selecionados.some(v=>typeof v!=="string"))
    throw new Error("Seleção de opcionais inválida.");
  const codigos=[...new Set(selecionados as string[])];
  const admin=getSupabaseAdmin();
  const {data:cotacao,error:erroConsulta}=await admin.from("cotacao_veicular_cotacoes")
    .select("*").eq("empresa_id",auth.empresaId!).eq("id",id).maybeSingle();
  if(erroConsulta)throw erroConsulta;
  if(!cotacao)return erro(new Error("Cotação não encontrada."),404);
  if(cotacao.origem!=="manual"||cotacao.status==="cancelada")
    throw new Error("Essa cotação não permite alterações de opcionais.");
  const snapshot=cotacao.regras_snapshot as Record<string,unknown>|null;
  if(!snapshot||!Array.isArray(snapshot.opcionais_disponiveis))
    throw new Error("Esta cotação antiga não tem catálogo de opcionais registrado. Gere uma nova cotação para editá-los.");
  const disponiveis=snapshot.opcionais_disponiveis as Array<Record<string,unknown>>;
  const escolhidos=codigos.map(codigo=>{
    const item=disponiveis.find(o=>o.codigo===codigo);
    if(!item||!Number.isSafeInteger(Number(item.centavos))||Number(item.centavos)<0)
      throw new Error("Opcional não cadastrado no plano.");
    return {codigo,nome:String(item.nome||"").slice(0,160),centavos:Number(item.centavos),
      grupo_exclusivo:String(item.grupo_exclusivo||"")};
  });
  const grupos=escolhidos.map(o=>o.grupo_exclusivo).filter(Boolean);
  if(new Set(grupos).size!==grupos.length)
    throw new Error("Não é possível combinar opcionais do mesmo grupo, como dois prazos de carro reserva.");
  const base=Number(cotacao.mensalidade_base_centavos);
  const taxaRastreador=Number(snapshot.rastreador_mensalidade_adicional_centavos||0);
  if(!Number.isSafeInteger(taxaRastreador)||taxaRastreador<0||taxaRastreador>100000000)
    throw new Error("Snapshot de rastreador inválido.");
  const total=base+escolhidos.reduce((n,o)=>n+o.centavos,0)+taxaRastreador;
  if(!Number.isSafeInteger(total)||total<0||total>100000000)
    throw new Error("Total de mensalidade inválido.");
  const opcionais=escolhidos.map(({codigo,nome,centavos})=>({codigo,nome,centavos}));
  const valoresAdesao=recalcularAdesaoDinamica({
    adesao_ativa:snapshot.adesao_ativa===true,
    adesao_tipo:snapshot.adesao_tipo==="mensalidade_mais_taxa"?"mensalidade_mais_taxa":"fixa",
    adesao_adicional_centavos:snapshot.adesao_adicional_centavos==null
      ?null:Number(snapshot.adesao_adicional_centavos),
    rastreador_obrigatorio:snapshot.rastreador_obrigatorio===true,
    rastreador_instalacao_centavos:Number(snapshot.rastreador_instalacao_centavos||0),
  },total);
  const {data:atualizada,error:erroUpdate}=await admin.from("cotacao_veicular_cotacoes")
    .update({opcionais_json:opcionais,total_centavos:total,
      regras_snapshot:{...snapshot,opcionais,total_centavos:total,...valoresAdesao}})
    .eq("empresa_id",auth.empresaId!).eq("id",id).select("*").single();
  if(erroUpdate)throw erroUpdate;
  return NextResponse.json({ok:true,cotacao:atualizada});
 }catch(e){return erro(e);}
}
