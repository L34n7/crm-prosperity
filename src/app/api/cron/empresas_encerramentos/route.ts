import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { excluirEmpresaAposRetencao, limparStorageEmpresaExcluida } from "@/lib/empresas/exclusao-definitiva";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = validarChamadaCron(request,{exigirVercelCron:true});
  if(!auth.ok) return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});
  const supabase=getSupabaseAdmin();
  const eventos:Array<{tipo:string;empresa_id:string;ok:boolean;detalhe?:string}>=[];
  // Não inicia nem retoma backups. Só o clique autenticado do administrador gera arquivos.
  // Aos 90 dias, remove o cliente mesmo que nunca tenha solicitado o ZIP.
  const {data:vencidas,error:erroVencidas}=await supabase.from("empresas")
    .select("id").eq("status","cancelada")
    .lte("exclusao_prevista_em",new Date().toISOString())
    .order("exclusao_prevista_em",{ascending:true}).limit(2);
  if(erroVencidas)throw new Error(erroVencidas.message);
  for(const empresa of vencidas||[]){
    try{
      const resultado=await excluirEmpresaAposRetencao(empresa.id);
      eventos.push({tipo:"exclusao_definitiva",empresa_id:empresa.id,ok:true,
        detalhe:resultado.limpeza.ok?"Arquivos eliminados":"Limpeza do Storage será repetida"});
    }catch(error){
      eventos.push({tipo:"exclusao_definitiva",empresa_id:empresa.id,ok:false,
        detalhe:error instanceof Error?error.message:String(error)});
    }
  }
  const {data:limpezas,error:erroLimpezas}=await supabase.from("empresa_encerramento_financeiro")
    .select("cliente_id").eq("limpeza_status","pendente").limit(2);
  if(erroLimpezas)throw new Error(erroLimpezas.message);
  for(const item of limpezas||[]){
    const resultado=await limparStorageEmpresaExcluida(item.cliente_id);
    eventos.push({tipo:"limpeza_storage",empresa_id:item.cliente_id,
      ok:resultado.ok,detalhe:resultado.ok?undefined:resultado.erro});
  }
  return NextResponse.json({ok:eventos.every(e=>e.ok),eventos});
}
