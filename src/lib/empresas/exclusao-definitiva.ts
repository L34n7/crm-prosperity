import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BACKUP_BUCKET } from "@/lib/empresas/backup";

const supabase = getSupabaseAdmin();

type RetencaoFinanceira = {
  empresa_id: string;
  arquivos_midias: unknown;
  backup_path: string | null;
};

function lerCaminhos(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.filter((x): x is string => typeof x === "string" && !!x.trim())
    : [];
}

export async function limparStorageEmpresaExcluida(empresaId: string) {
  const {data, error} = await supabase.from("empresa_encerramento_financeiro")
    .select("empresa_id,arquivos_midias,backup_path").eq("empresa_id",empresaId)
    .single<RetencaoFinanceira>();
  if (error || !data) throw new Error("Arquivo financeiro de encerramento não encontrado.");
  try {
    const paths = [...new Set(lerCaminhos(data.arquivos_midias))];
    for(let i=0;i<paths.length;i+=100){
      const {error:e} = await supabase.storage.from("midias").remove(paths.slice(i,i+100));
      if(e) throw new Error("Falha na limpeza das mídias: "+e.message);
    }
    if (data.backup_path) {
      const {error:e} = await supabase.storage.from(BACKUP_BUCKET).remove([data.backup_path]);
      if(e) throw new Error("Falha na remoção do backup expirado: "+e.message);
    }
    const {error:marcarErro} = await supabase.from("empresa_encerramento_financeiro")
      .update({limpeza_status:"concluida",limpeza_erro:null})
      .eq("empresa_id",empresaId);
    if(marcarErro) throw new Error(marcarErro.message);
    return {ok:true,midias:paths.length};
  } catch(error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    await supabase.from("empresa_encerramento_financeiro")
      .update({limpeza_status:"pendente",limpeza_erro:mensagem.slice(0,500)})
      .eq("empresa_id",empresaId);
    return {ok:false,erro:mensagem};
  }
}

export async function excluirEmpresaAposRetencao(empresaId: string) {
  const {data:empresa,error:consultaErro} = await supabase.from("empresas")
    .select("encerramento_backup_path,encerramento_backup_estado")
    .eq("id",empresaId).single();
  if(consultaErro || empresa?.encerramento_backup_estado !== "pronto" || !empresa.encerramento_backup_path)
    throw new Error("Backup de encerramento não registrado.");
  const {data:objeto,error:objetoErro} = await supabase.storage.from(BACKUP_BUCKET)
    .info(empresa.encerramento_backup_path);
  if(objetoErro || !objeto)
    throw new Error("O arquivo ZIP não está disponível no Storage. Exclusão definitiva bloqueada.");
  const {data,error} = await supabase.rpc("excluir_empresa_com_retentcao_admin",{p_empresa_id:empresaId});
  if(error) throw new Error(error.message);
  const limpeza = await limparStorageEmpresaExcluida(empresaId);
  return {resultado:data,limpeza};
}
