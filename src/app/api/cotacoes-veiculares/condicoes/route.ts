import {NextResponse} from "next/server";
import {getUsuarioContexto} from "@/lib/auth/get-usuario-contexto";
import {buscarNichoEmpresa} from "@/lib/nichos/empresa-nicho";
import {getSupabaseAdmin} from "@/lib/supabase/admin";
import {listarPlanosEmpresa} from "@/lib/cotacoes-veiculares/configuracao";
import {
  validarCondicoesContratacao,
} from "@/lib/cotacoes-veiculares/condicoes-contratacao";
import {
  carregarCondicoesContratacao,
} from "@/lib/cotacoes-veiculares/condicoes-servidor";

const admin=getSupabaseAdmin();

async function acesso(){
  const ctx=await getUsuarioContexto();
  if(!ctx.ok)return {erro:NextResponse.json(
    {ok:false,error:ctx.error},{status:ctx.status})};
  const empresaId=ctx.usuario.empresa_id;
  if(!empresaId)return {erro:NextResponse.json(
    {ok:false,error:"Empresa não encontrada."},{status:403})};
  const nicho=await buscarNichoEmpresa(empresaId);
  if(nicho.codigo!=="seguro_veicular")return {erro:NextResponse.json(
    {ok:false,error:"Nicho não autorizado."},{status:403})};
  const p=ctx.usuario.permissoes||[];
  const configurar=ctx.usuario.is_admin||p.includes("cotacoes.configurar");
  const visualizar=configurar||p.includes("cotacoes.visualizar")||
    p.includes("cotacoes.gerenciar");
  if(!visualizar)return {erro:NextResponse.json(
    {ok:false,error:"Sem permissão para consultar condições."},{status:403})};
  return {empresaId,configurar};
}

async function planoValido(empresaId:string,codigo:string){
  if(!/^[a-z0-9_]{2,50}$/.test(codigo))
    throw new Error("Plano inválido.");
  const planos=await listarPlanosEmpresa(empresaId);
  if(!planos.some(p=>p.codigo===codigo))
    throw new Error("Plano não encontrado nesta empresa.");
}

function falha(e:unknown,status=400){
  return NextResponse.json({
    ok:false,error:e instanceof Error?e.message:"Não foi possível salvar condições.",
  },{status});
}

export async function GET(req:Request){
  try{
    const auth=await acesso();if(auth.erro)return auth.erro;
    const codigo=new URL(req.url).searchParams.get("plano");
    if(codigo)await planoValido(auth.empresaId!,codigo);
    const {padrao,porPlano}=await carregarCondicoesContratacao(auth.empresaId!);
    return NextResponse.json({
      ok:true,padrao,personalizada:codigo?porPlano[codigo]||null:null,
      efetiva:codigo?porPlano[codigo]||padrao:padrao,
      pode_configurar:auth.configurar,
    });
  }catch(e){console.error("[COTACAO_TAXAS] GET",e);return falha(e,400);}
}

export async function PUT(req:Request){
  try{
    const auth=await acesso();if(auth.erro)return auth.erro;
    if(!auth.configurar)return falha(new Error("Sem permissão para configurar."),403);
    const body=await req.json() as Record<string,unknown>;
    const escopo=String(body.escopo||"");
    const plano=String(body.plano||"");
    const agora=new Date().toISOString();
    if(escopo==="padrao"){
      const config=validarCondicoesContratacao(body.config);
      const {error}=await admin.from("cotacao_veicular_taxas_empresa").upsert({
        empresa_id:auth.empresaId,config_json:config,updated_at:agora,
      },{onConflict:"empresa_id"});
      if(error)throw error;
    }else if(escopo==="plano"){
      await planoValido(auth.empresaId!,plano);
      const config=validarCondicoesContratacao(body.config);
      const {error}=await admin.from("cotacao_veicular_taxas_planos").upsert({
        empresa_id:auth.empresaId,plano,config_json:config,updated_at:agora,
      },{onConflict:"empresa_id,plano"});
      if(error)throw error;
    }else if(escopo==="herdar"){
      await planoValido(auth.empresaId!,plano);
      const {error}=await admin.from("cotacao_veicular_taxas_planos")
        .delete().eq("empresa_id",auth.empresaId).eq("plano",plano);
      if(error)throw error;
    }else return falha(new Error("Escolha uma operação válida."));
    const {padrao,porPlano}=await carregarCondicoesContratacao(auth.empresaId!);
    return NextResponse.json({ok:true,padrao,
      personalizada:plano?porPlano[plano]||null:null,
      efetiva:plano?porPlano[plano]||padrao:padrao});
  }catch(e){console.error("[COTACAO_TAXAS] PUT",e);return falha(e);}
}
