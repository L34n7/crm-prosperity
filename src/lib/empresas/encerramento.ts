import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enviarAvisoCancelamentoPendente } from "@/lib/empresas/aviso-cancelamento";
import { sincronizarCobrancaWhiteLabel } from "@/lib/white-label/billing";
import { invalidarCacheIntegracaoWhatsapp } from "@/lib/whatsapp/find-integration";

const supabase = getSupabaseAdmin();

type EmpresaEncerramento = {
  id: string;
  status: string;
  white_label_id: string | null;
  white_label_tipo: string | null;
};

async function consultarEmpresa(id: string): Promise<EmpresaEncerramento> {
  const { data, error } = await supabase
    .from("empresas")
    .select("id,status,white_label_id,white_label_tipo")
    .eq("id", id).single();
  if (error || !data) throw new Error(error?.message || "Empresa não encontrada.");
  return data;
}

async function sincronizarCobrancaSeWhiteLabel(empresa: EmpresaEncerramento) {
  if (!empresa.white_label_id || empresa.white_label_tipo !== "cliente") {
    return null;
  }
  try {
    const cobranca = await sincronizarCobrancaWhiteLabel(empresa.white_label_id);
    return cobranca.warning || null;
  } catch (error) {
    const aviso = error instanceof Error ? error.message : String(error);
    console.error("[ENCERRAMENTO EMPRESA] Reconciliar cobrança White Label:", aviso);
    return "Encerramento concluído, mas a cobrança White Label precisa ser reconciliada: " + aviso;
  }
}

export async function encerrarEmpresaAdministrativamente(empresaId: string, usuarioId: string | null, origem: "manual" | "inadimplencia" = "manual") {
  const empresa = await consultarEmpresa(empresaId);
  const { data, error } = await supabase.rpc("encerrar_empresa_admin", {
    p_empresa_id: empresaId,
    p_usuario_id: usuarioId,
  });
  if (error) throw new Error(error.message);
  // O worker/inbound pode manter cache do número por até 15 segundos.
  // A invalidacão local é somada ao filtro de empresas ativas no lookup.
  invalidarCacheIntegracaoWhatsapp();
  const {error:origemErro}=await supabase.from("empresas").update({encerramento_origem:origem})
    .eq("id",empresaId).eq("status","cancelada");
  if(origemErro)console.error("[ENCERRAMENTO] Falha ao registrar origem",empresaId,origemErro);
  const aviso=await enviarAvisoCancelamentoPendente(empresaId);
  const warning = empresa.white_label_tipo === "cliente"
    ? await sincronizarCobrancaSeWhiteLabel(empresa)
    : "Confira o encerramento da cobrança recorrente no gateway (Prosperity Pay/Mercado Pago). O bloqueio operacional não cancela sozinho uma assinatura externa.";
  const avisoWarning=aviso.erro
    ? "O e-mail de cancelamento ainda não foi enviado. O sistema tentará novamente: "+aviso.erro
    : null;
  return { ...(data as Record<string, unknown>), warning: [warning,avisoWarning].filter(Boolean).join(" ") || null, email_cancelamento_enviado:aviso.enviado };
}

export async function restaurarEmpresaAdministrativamente(empresaId: string) {
  const empresa = await consultarEmpresa(empresaId);
  if (empresa.status !== "cancelada") throw new Error("Empresa não está cancelada.");
  if (empresa.white_label_tipo === "cliente" && empresa.white_label_id) {
    const { data: wl, error: wlError } = await supabase.from("white_labels")
      .select("licencas_contratadas").eq("id", empresa.white_label_id).single();
    if (wlError || !wl) throw new Error("Não foi possível validar as licenças do White Label.");
    const { count, error: countError } = await supabase.from("empresas")
      .select("id", { count: "exact", head: true })
      .eq("white_label_id", empresa.white_label_id)
      .eq("white_label_tipo", "cliente")
      .neq("status", "cancelada");
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) >= Number(wl.licencas_contratadas || 0))
      throw new Error("O White Label não possui licença livre para restaurar este cliente.");
  }
  // Ao restaurar, a próxima eventual rescisão deve iniciar um backup novo.
  const {data:arquivosAnteriores} = await supabase.from("empresas")
    .select("encerramento_backup_path,encerramento_backup_partes")
    .eq("id",empresaId).single();
  const { data, error } = await supabase.rpc("restaurar_empresa_admin", {p_empresa_id: empresaId});
  if (error) throw new Error(error.message);
  const {error:limpezaErro} = await supabase.from("empresas").update({
    encerramento_backup_cursor:null,encerramento_backup_partes:[],
    encerramento_backup_path:null,encerramento_backup_gerado_em:null,
    encerramento_backup_tentado_em:null,encerramento_backup_solicitado_em:null,
  }).eq("id",empresaId);
  if(limpezaErro)throw new Error("Empresa restaurada, mas não foi possível liberar metadados do backup antigo: "+limpezaErro.message);
  const paths = Array.isArray(arquivosAnteriores?.encerramento_backup_partes)
    ? arquivosAnteriores.encerramento_backup_partes
      .filter((x): x is {path:string} => x && typeof x.path==="string")
      .map(x=>x.path)
    : [];
  if(arquivosAnteriores?.encerramento_backup_path)
    paths.push(arquivosAnteriores.encerramento_backup_path);
  if(paths.length) {
    const {error:storageErro}=await supabase.storage.from("empresa-encerramentos")
      .remove([...new Set(paths)]);
    if(storageErro)console.error("[ENCERRAMENTO] Limpeza de ZIP antigo na restauração:",storageErro);
  }
  const warning = await sincronizarCobrancaSeWhiteLabel(empresa);
  return { ...(data as Record<string, unknown>), warning };
}
