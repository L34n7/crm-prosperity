import { getSupabaseAdmin } from "@/lib/supabase/admin";
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

export async function encerrarEmpresaAdministrativamente(empresaId: string, usuarioId: string | null) {
  const empresa = await consultarEmpresa(empresaId);
  const { data, error } = await supabase.rpc("encerrar_empresa_admin", {
    p_empresa_id: empresaId,
    p_usuario_id: usuarioId,
  });
  if (error) throw new Error(error.message);
  // O worker/inbound pode manter cache do número por até 15 segundos.
  // A invalidacão local é somada ao filtro de empresas ativas no lookup.
  invalidarCacheIntegracaoWhatsapp();
  const warning = empresa.white_label_tipo === "cliente"
    ? await sincronizarCobrancaSeWhiteLabel(empresa)
    : "Confira o encerramento da cobrança recorrente no gateway (Prosperity Pay/Mercado Pago). O bloqueio operacional não cancela sozinho uma assinatura externa.";
  return { ...(data as Record<string, unknown>), warning };
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
  const { data, error } = await supabase.rpc("restaurar_empresa_admin", {p_empresa_id: empresaId});
  if (error) throw new Error(error.message);
  const warning = await sincronizarCobrancaSeWhiteLabel(empresa);
  return { ...(data as Record<string, unknown>), warning };
}
