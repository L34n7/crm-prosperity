import {NextResponse} from "next/server";
import {getUsuarioContexto} from "@/lib/auth/get-usuario-contexto";
import {buscarNichoEmpresa} from "@/lib/nichos/empresa-nicho";
import {getSupabaseAdmin} from "@/lib/supabase/admin";
import {listarPlanosEmpresa} from "@/lib/cotacoes-veiculares/configuracao";
import {normalizarCondicoesContratacao} from "@/lib/cotacoes-veiculares/condicoes-contratacao";

export async function GET(req:Request){
  try{
    const ctx=await getUsuarioContexto();
    if(!ctx.ok)return NextResponse.json({ok:false,error:ctx.error},{status:ctx.status});
    const empresaId=ctx.usuario.empresa_id;
    if(!empresaId)return NextResponse.json({
      ok:false,error:"Empresa não encontrada.",
    },{status:403});
    const nicho=await buscarNichoEmpresa(empresaId);
    if(nicho.codigo!=="seguro_veicular")return NextResponse.json({
      ok:false,error:"Nicho não autorizado.",
    },{status:403});
    const permissoes=ctx.usuario.permissoes||[];
    const podeConfigurar=ctx.usuario.is_admin||permissoes.includes("cotacoes.configurar");
    if(!podeConfigurar&&!permissoes.includes("cotacoes.visualizar")&&
       !permissoes.includes("cotacoes.gerenciar"))
      return NextResponse.json({ok:false,error:"Sem permissão."},{status:403});
    const plano=new URL(req.url).searchParams.get("plano")||"";
    if(!/^[a-z0-9_]{2,50}$/.test(plano)||
      !(await listarPlanosEmpresa(empresaId,true)).some(p=>p.codigo===plano))
      return NextResponse.json({ok:false,error:"Plano não encontrado."},{status:404});
    const {data,error}=await getSupabaseAdmin()
      .from("cotacao_veicular_taxas_planos")
      .select("config_json")
      .eq("empresa_id",empresaId)
      .eq("plano",plano)
      .maybeSingle();
    if(error)throw error;
    return NextResponse.json({
      ok:true,condicoes:normalizarCondicoesContratacao(data?.config_json),
      pode_configurar:podeConfigurar,
    });
  }catch(e){
    console.error("[COTACAO_TAXAS] GET",e);
    return NextResponse.json({
      ok:false,error:e instanceof Error?e.message:"Não foi possível consultar as taxas.",
    },{status:500});
  }
}

// Alterações são gravadas exclusivamente junto das regras comerciais,
// no mesmo comando/transação do botão "Salvar regras e avançar".
