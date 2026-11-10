import {NextResponse} from "next/server";
import {getUsuarioContexto} from "@/lib/auth/get-usuario-contexto";
import {buscarNichoEmpresa} from "@/lib/nichos/empresa-nicho";
import {getSupabaseAdmin} from "@/lib/supabase/admin";
import {
  CATEGORIAS_POR_TIPO_MODELO,normalizarChaveModelo,
  type TipoModeloFipe,
} from "@/lib/cotacoes-veiculares/regras-modelos";
import type {CategoriaCotacao} from "@/lib/cotacoes-veiculares/catalogo";

const tabela="cotacao_veicular_regras_modelos";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function respostaErro(erro:unknown,status=400){
  const mensagem=erro instanceof Error?erro.message:"Erro ao gerenciar classificações.";
  const duplicado=typeof erro==="object"&&erro!==null&&"code" in erro&&
    (erro as {code?:string}).code==="23505";
  return NextResponse.json({ok:false,error:duplicado?
    "Esta marca e modelo já possuem uma classificação cadastrada.":mensagem},{
    status:duplicado?409:status,
  });
}

async function contexto(){
  const ctx=await getUsuarioContexto();
  if(!ctx.ok)return {erro:NextResponse.json({ok:false,error:ctx.error},{status:ctx.status})};
  const empresaId=ctx.usuario.empresa_id;
  if(!empresaId)return {erro:respostaErro(new Error("Empresa não encontrada."),403)};
  const nicho=await buscarNichoEmpresa(empresaId);
  if(nicho.codigo!=="seguro_veicular")
    return {erro:respostaErro(new Error("Acesso não autorizado."),403)};
  const permissoes=ctx.usuario.permissoes||[];
  const podeEditar=ctx.usuario.is_admin||permissoes.includes("cotacoes.configurar");
  const podeVer=podeEditar||permissoes.includes("cotacoes.visualizar")||
    permissoes.includes("cotacoes.gerenciar");
  if(!podeVer)return {erro:respostaErro(new Error("Sem permissão."),403)};
  return {empresaId,podeEditar};
}

function lerRegra(body:Record<string,unknown>){
  const tipo=String(body.tipo_fipe||"cars") as TipoModeloFipe;
  const marca=String(body.marca||"").trim().replace(/\s+/g," ");
  const modelo=String(body.modelo||"").trim().replace(/\s+/g," ");
  const categoria=String(body.categoria||"") as CategoriaCotacao;
  if(!Object.hasOwn(CATEGORIAS_POR_TIPO_MODELO,tipo)||
     !CATEGORIAS_POR_TIPO_MODELO[tipo].includes(categoria)||
     marca.length<2||marca.length>80||modelo.length<2||modelo.length>100||
     !normalizarChaveModelo(marca)||!normalizarChaveModelo(modelo))
    throw new Error("Informe marca, modelo e categoria comercial válidos.");
  return {
    tipo_fipe:tipo,marca,modelo,categoria,
    marca_chave:normalizarChaveModelo(marca),
    modelo_chave:normalizarChaveModelo(modelo),
  };
}

export async function GET(){
  try{
    const auth=await contexto();if(auth.erro)return auth.erro;
    const {data,error}=await getSupabaseAdmin().from(tabela)
      .select("id,tipo_fipe,marca,modelo,categoria,created_at,updated_at")
      .eq("empresa_id",auth.empresaId!).order("created_at",{ascending:false})
      .limit(500);
    if(error)throw error;
    return NextResponse.json({ok:true,regras:data||[],pode_editar:auth.podeEditar},{
      headers:{"Cache-Control":"no-store"},
    });
  }catch(erro){return respostaErro(erro,500);}
}

export async function POST(request:Request){
  try{
    const auth=await contexto();if(auth.erro)return auth.erro;
    if(!auth.podeEditar)return respostaErro(new Error("Sem permissão para configurar."),403);
    const body=await request.json() as Record<string,unknown>;
    const regra=lerRegra(body);
    const {data,error}=await getSupabaseAdmin().from(tabela)
      .insert({empresa_id:auth.empresaId,...regra})
      .select("id,tipo_fipe,marca,modelo,categoria,created_at,updated_at").single();
    if(error)throw error;
    return NextResponse.json({ok:true,regra:data},{status:201});
  }catch(erro){return respostaErro(erro);}
}

export async function PATCH(request:Request){
  try{
    const auth=await contexto();if(auth.erro)return auth.erro;
    if(!auth.podeEditar)return respostaErro(new Error("Sem permissão para configurar."),403);
    const body=await request.json() as Record<string,unknown>;
    const id=String(body.id||"");
    if(!uuid.test(id))throw new Error("Classificação inválida.");
    const regra=lerRegra(body);
    const {data,error}=await getSupabaseAdmin().from(tabela)
      .update({...regra,updated_at:new Date().toISOString()})
      .eq("empresa_id",auth.empresaId!).eq("id",id)
      .select("id,tipo_fipe,marca,modelo,categoria,created_at,updated_at").maybeSingle();
    if(error)throw error;
    if(!data)return respostaErro(new Error("Classificação não encontrada."),404);
    return NextResponse.json({ok:true,regra:data});
  }catch(erro){return respostaErro(erro);}
}

export async function DELETE(request:Request){
  try{
    const auth=await contexto();if(auth.erro)return auth.erro;
    if(!auth.podeEditar)return respostaErro(new Error("Sem permissão para configurar."),403);
    const id=new URL(request.url).searchParams.get("id")||"";
    if(!uuid.test(id))throw new Error("Classificação inválida.");
    const {data,error}=await getSupabaseAdmin().from(tabela).delete()
      .eq("empresa_id",auth.empresaId!).eq("id",id)
      .select("id").maybeSingle();
    if(error)throw error;
    if(!data)return respostaErro(new Error("Classificação não encontrada."),404);
    return NextResponse.json({ok:true});
  }catch(erro){return respostaErro(erro);}
}
