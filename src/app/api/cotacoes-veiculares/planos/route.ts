import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listarPlanosEmpresa,statusConfiguracaoCotacao } from "@/lib/cotacoes-veiculares/configuracao";

async function acesso(){
 const ctx=await getUsuarioContexto();
 if(!ctx.ok)return {erro:NextResponse.json({ok:false,error:ctx.error},{status:ctx.status})};
 const id=ctx.usuario.empresa_id;
 if(!id)return {erro:NextResponse.json({ok:false,error:"Empresa inválida."},{status:403})};
 const nicho=await buscarNichoEmpresa(id);
 if(nicho.codigo!=="seguro_veicular")return {erro:NextResponse.json({ok:false,error:"Nicho não autorizado."},{status:403})};
 const pode=ctx.usuario.is_admin||(ctx.usuario.permissoes||[]).includes("cotacoes.configurar");
 return {empresaId:id,pode};
}
const erro=(e:unknown,status=400)=>NextResponse.json({ok:false,error:e instanceof Error?e.message:"Falha ao configurar planos."},{status});
export async function GET(){
 try{const auth=await acesso();if(auth.erro)return auth.erro;
   return NextResponse.json({ok:true,planos:await listarPlanosEmpresa(auth.empresaId!),pode_configurar:auth.pode});
 }catch(e){return erro(e,500);}
}
export async function POST(req:Request){
 try{
  const auth=await acesso();if(auth.erro)return auth.erro;
  if(!auth.pode)return erro(new Error("Sem permissão para configurar planos."),403);
  const body=await req.json() as Record<string,unknown>;
  const acao=String(body.acao||"");
  const admin=getSupabaseAdmin();const empresaId=auth.empresaId!;
  const planos=await listarPlanosEmpresa(empresaId);
  if(acao==="criar"){
    if(planos.length>=30)throw new Error("Limite de 30 planos por empresa.");
    const nome=String(body.nome||"").trim().replace(/\s+/g," ");
    if(nome.length<2||nome.length>90)throw new Error("Nome do plano deve conter entre 2 e 90 caracteres.");
    if(planos.some(p=>p.nome.toLocaleLowerCase("pt-BR")===nome.toLocaleLowerCase("pt-BR")))
      throw new Error("Já existe um plano com este nome.");
    const codigo="p_"+randomUUID().replace(/-/g,"").slice(0,24);
    const {error}=await admin.from("cotacao_veicular_planos").insert({
      empresa_id:empresaId,codigo,nome,ordem:planos.length+1,ativo:true,
    });if(error)throw error;
  }else if(acao==="renomear"){
    const codigo=String(body.codigo||"");
    if(!planos.some(p=>p.codigo===codigo))throw new Error("Plano não encontrado.");
    const nome=String(body.nome||"").trim().replace(/\s+/g," ");
    if(nome.length<2||nome.length>90)throw new Error("Nome inválido.");
    if(planos.some(p=>p.codigo!==codigo&&p.nome.toLocaleLowerCase("pt-BR")===nome.toLocaleLowerCase("pt-BR")))
      throw new Error("Este nome já está em uso.");
    const {error}=await admin.from("cotacao_veicular_planos")
      .update({nome,updated_at:new Date().toISOString()})
      .eq("empresa_id",empresaId).eq("codigo",codigo);
    if(error)throw error;
  }else if(acao==="excluir"){
    const codigo=String(body.codigo||"");
    if(!planos.some(p=>p.codigo===codigo))throw new Error("Plano não encontrado.");
    // Apaga as regras e os preços por FK CASCADE, sem excluir o histórico de cotações.
    const {error}=await admin.from("cotacao_veicular_planos")
      .delete().eq("empresa_id",empresaId).eq("codigo",codigo);
    if(error)throw error;
  }else throw new Error("Operação inválida.");
  return NextResponse.json({ok:true,planos:await listarPlanosEmpresa(empresaId),status:await statusConfiguracaoCotacao(empresaId)});
 }catch(e){console.error("[COTACAO_PLANOS]",e);return erro(e);}
}
