import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { gerarBackupEncerramento } from "@/lib/empresas/backup";
import { excluirEmpresaAposRetencao, limparStorageEmpresaExcluida } from "@/lib/empresas/exclusao-definitiva";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = validarChamadaCron(request, { exigirVercelCron: true });
  if (!auth.ok) return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});
  const supabase = getSupabaseAdmin();
  const eventos: Array<{tipo:string;empresa_id:string;ok:boolean;detalhe?:string}> = [];

  // Processa só uma empresa por execução para limitar memória e duração.
  const {data:pendentes,error:erroPendentes} = await supabase.from("empresas")
    .select("id")
    .eq("status","cancelada").in("encerramento_backup_estado",["pendente","erro"])
    .not("exclusao_prevista_em","is",null)
    .order("cancelada_em",{ascending:true}).limit(1);
  if(erroPendentes) throw new Error(erroPendentes.message);
  for (const empresa of pendentes || []) {
    try {
      await gerarBackupEncerramento(empresa.id);
      eventos.push({tipo:"backup",empresa_id:empresa.id,ok:true});
    } catch(error) {
      eventos.push({tipo:"backup",empresa_id:empresa.id,ok:false,
        detalhe:error instanceof Error?error.message:String(error)});
    }
  }

  // Não expurgar antes de 90 dias ou sem o backup estar disponível.
  const {data:vencidas,error:erroVencidas} = await supabase.from("empresas")
    .select("id").eq("status","cancelada")
    .eq("encerramento_backup_estado","pronto")
    .lte("exclusao_prevista_em",new Date().toISOString())
    .order("exclusao_prevista_em",{ascending:true}).limit(1);
  if(erroVencidas) throw new Error(erroVencidas.message);
  for(const empresa of vencidas || []) {
    try {
      const resultado = await excluirEmpresaAposRetencao(empresa.id);
      eventos.push({tipo:"exclusao_definitiva",empresa_id:empresa.id,ok:true,
        detalhe:resultado.limpeza.ok?"Storage limpo":"Limpeza Storage será repetida"});
    } catch(error) {
      eventos.push({tipo:"exclusao_definitiva",empresa_id:empresa.id,ok:false,
        detalhe:error instanceof Error?error.message:String(error)});
    }
  }
  const {data:limpezas} = await supabase.from("empresa_encerramento_financeiro")
    .select("empresa_id").eq("limpeza_status","pendente").limit(2);
  for(const item of limpezas || []) {
    const resultado = await limparStorageEmpresaExcluida(item.empresa_id);
    eventos.push({tipo:"limpeza_storage",empresa_id:item.empresa_id,
      ok:resultado.ok,detalhe:resultado.ok?undefined:resultado.erro});
  }
  return NextResponse.json({ok:eventos.every((e)=>e.ok),eventos});
}
