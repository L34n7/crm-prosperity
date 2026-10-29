import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BACKUP_BUCKET } from "@/lib/empresas/backup";

const supabase = getSupabaseAdmin();

type RetencaoFinanceira = {
  cliente_id: string;
  arquivos_midias: unknown;
  backup_path: string | null;
  backup_paths: unknown;
  auth_user_ids: string[] | null;
};

function lerCaminhos(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.filter((x): x is string => typeof x === "string" && !!x.trim())
    : [];
}

export async function limparStorageEmpresaExcluida(empresaId: string) {
  const {data, error} = await supabase.from("empresa_encerramento_financeiro")
    .select("cliente_id,arquivos_midias,backup_path,backup_paths,auth_user_ids").eq("cliente_id",empresaId)
    .single<RetencaoFinanceira>();
  if (error || !data) throw new Error("Arquivo financeiro de encerramento não encontrado.");
  try {
    const paths = [...new Set(lerCaminhos(data.arquivos_midias))];
    for(let i=0;i<paths.length;i+=100){
      const {error:e} = await supabase.storage.from("midias").remove(paths.slice(i,i+100));
      if(e) throw new Error("Falha na limpeza das mídias: "+e.message);
    }
    const partes = Array.isArray(data.backup_paths)
      ? data.backup_paths.filter((p): p is {path:string} =>
        !!p && typeof p === "object" && typeof p.path === "string").map(p=>p.path)
      : [];
    const backups = [...new Set([...(data.backup_path ? [data.backup_path] : []),...partes])];
    for (let i=0;i<backups.length;i+=100) {
      const {error:e} = await supabase.storage.from(BACKUP_BUCKET).remove(backups.slice(i,i+100));
      if(e) throw new Error("Falha na remoção dos backups expirados: "+e.message);
    }
    const authIds = [...new Set(lerCaminhos(data.auth_user_ids))];
    for (let inicio=0; inicio<authIds.length; inicio+=100) {
      const ids = authIds.slice(inicio,inicio+100);
      const {data:usuariosRestantes,error:restantesErro} = await supabase.from("usuarios")
        .select("auth_user_id").in("auth_user_id", ids);
      if (restantesErro) throw new Error("Não foi possível conferir contas Auth compartilhadas: "+restantesErro.message);
      const aindaVinculados = new Set((usuariosRestantes || []).map(x=>String(x.auth_user_id || "")));
      for (const authId of ids) {
        if (aindaVinculados.has(authId)) continue;
        const {error:authErro} = await supabase.auth.admin.deleteUser(authId);
        if (authErro && !/not found|not exist|404/i.test(authErro.message))
          throw new Error("Falha ao remover usuário Auth: "+authErro.message);
      }
    }
    const {error:marcarErro} = await supabase.from("empresa_encerramento_financeiro")
      .update({limpeza_status:"concluida",limpeza_erro:null,auth_user_ids:[]})
      .eq("cliente_id",empresaId);
    if(marcarErro) throw new Error(marcarErro.message);
    return {ok:true,midias:paths.length};
  } catch(error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    await supabase.from("empresa_encerramento_financeiro")
      .update({limpeza_status:"pendente",limpeza_erro:mensagem.slice(0,500)})
      .eq("cliente_id",empresaId);
    return {ok:false,erro:mensagem};
  }
}

export async function excluirEmpresaAposRetencao(
  empresaId: string,
  options?: { antecipada?: boolean }
) {
  if(options?.antecipada) {
    // Todas as partes devem existir antes da exclusão irreversível.
    const {data:empresa,error:consultaErro}=await supabase.from("empresas")
      .select("status,exclusao_prevista_em,encerramento_backup_estado,encerramento_backup_path,encerramento_backup_partes")
      .eq("id",empresaId).single();
    if(consultaErro || !empresa || empresa.status!=="cancelada" ||
       empresa.encerramento_backup_estado!=="pronto")
      throw new Error("A exclusão antecipada exige um backup concluído da empresa cancelada.");
    const partes=Array.isArray(empresa.encerramento_backup_partes)
      ? empresa.encerramento_backup_partes.filter((v): v is {path:string} =>
          v && typeof v.path==="string" && v.path.length>0).map(v=>v.path)
      : [];
    if(!partes.length && empresa.encerramento_backup_path)
      partes.push(empresa.encerramento_backup_path);
    if(!partes.length)throw new Error("Não foi encontrado backup para a exclusão antecipada.");
    for(const path of partes){
      const {data,error}=await supabase.storage.from(BACKUP_BUCKET).info(path);
      if(error || !data)throw new Error("A parte do backup não está disponível no Storage: "+path);
    }
  }
  const rpc=options?.antecipada
    ? "excluir_empresa_antecipada_admin"
    : "excluir_empresa_com_retentcao_admin";
  const {data,error}=await supabase.rpc(rpc,{p_empresa_id:empresaId});
  if(error)throw new Error(error.message);
  const limpeza=await limparStorageEmpresaExcluida(empresaId);
  return {resultado:data,limpeza};
}
