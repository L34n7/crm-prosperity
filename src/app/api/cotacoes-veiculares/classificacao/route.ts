import { NextResponse } from "next/server";
import {getUsuarioContexto} from "@/lib/auth/get-usuario-contexto";
import {buscarNichoEmpresa} from "@/lib/nichos/empresa-nicho";
import {getSupabaseAdmin} from "@/lib/supabase/admin";
import {CATEGORIAS_COTACAO} from "@/lib/cotacoes-veiculares/catalogo";

const erro=(e:unknown,status=400)=>NextResponse.json({
 ok:false,error:e instanceof Error?e.message:"Erro na classificação FIPE.",
},{status});
async function acesso(){
 const ctx=await getUsuarioContexto();
 if(!ctx.ok)return {erro:NextResponse.json({ok:false,error:ctx.error},{status:ctx.status})};
 const empresaId=ctx.usuario.empresa_id;
 if(!empresaId)return {erro:erro(new Error("Empresa não encontrada."),403)};
 const nicho=await buscarNichoEmpresa(empresaId);
 if(nicho.codigo!=="seguro_veicular")return {erro:erro(new Error("Acesso não autorizado."),403)};
 const p=ctx.usuario.permissoes||[];
 if(!ctx.usuario.is_admin&&!p.includes("cotacoes.visualizar")&&!p.includes("cotacoes.gerenciar")&&!p.includes("cotacoes.configurar"))
  return {erro:erro(new Error("Sem permissão."),403)};
 return {empresaId,podeEditar:ctx.usuario.is_admin||p.includes("cotacoes.configurar")};
}
export async function GET(){
 try{
  const auth=await acesso();if(auth.erro)return auth.erro;
  const {data,error}=await getSupabaseAdmin().from("cotacao_veicular_classificacoes_fipe")
   .select("tipo_fipe,codigo_fipe,modelo,categoria,origem,updated_at")
   .eq("empresa_id",auth.empresaId!).order("updated_at",{ascending:false}).limit(300);
  if(error)throw error;
  return NextResponse.json({ok:true,registros:data||[],pode_editar:auth.podeEditar});
 }catch(e){return erro(e,500);}
}
export async function POST(request:Request){
 try{
  const auth=await acesso();if(auth.erro)return auth.erro;
  if(!auth.podeEditar)return erro(new Error("Sem permissão para alterar classificações."),403);
  const body=await request.json() as Record<string,unknown>;
  const tipo=String(body.tipo_fipe||"");
  const codigo=String(body.codigo_fipe||"");
  const categoria=String(body.categoria||"");
  if(!["cars","motorcycles","trucks"].includes(tipo)||
     !/^[\w-]{3,40}$/.test(codigo)||!Object.hasOwn(CATEGORIAS_COTACAO,categoria))
    throw new Error("Dados de classificação inválidos.");
  if(tipo==="motorcycles"&&categoria!=="motocicleta")
    throw new Error("Motocicletas precisam permanecer na categoria Motocicleta.");
  if(tipo==="trucks"&&!["caminhao_leve","caminhao_pesado","agregado"].includes(categoria))
    throw new Error("Selecione uma categoria de caminhões para este veículo.");
  if(tipo==="cars"&&["motocicleta","caminhao_leve","caminhao_pesado","agregado"].includes(categoria))
    throw new Error("Categoria incompatível com o tipo FIPE Automóveis.");
  const {data,error}=await getSupabaseAdmin().from("cotacao_veicular_classificacoes_fipe")
    .update({categoria,origem:"manual",updated_at:new Date().toISOString()})
    .eq("empresa_id",auth.empresaId!).eq("tipo_fipe",tipo).eq("codigo_fipe",codigo)
    .select("codigo_fipe").maybeSingle();
  if(error)throw error;
  if(!data)throw new Error("Consulte o veículo na FIPE antes de classificá-lo.");
  return NextResponse.json({ok:true});
 }catch(e){return erro(e);}
}
