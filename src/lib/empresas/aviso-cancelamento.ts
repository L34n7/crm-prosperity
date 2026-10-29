import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendAssinaturaAvisoEmail } from "@/lib/email/send-assinatura-aviso-email";

const supabase = getSupabaseAdmin();
const EMAIL_TIMEOUT_MS = 20 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

type EtapaEmail = "cancelamento" | "reativacao_apos_cancelamento";

const CAMPOS = {
  cancelamento: {
    estado: "encerramento_email_estado",
    tentado: "encerramento_email_tentado_em",
    enviado: "encerramento_email_enviado_em",
    erro: "encerramento_email_erro",
  },
  reativacao_apos_cancelamento: {
    estado: "encerramento_retorno_email_estado",
    tentado: "encerramento_retorno_email_tentado_em",
    enviado: "encerramento_retorno_email_enviado_em",
    erro: "encerramento_retorno_email_erro",
  },
} as const;

async function destinatariosAdministrativos(empresaId: string, emailPrincipal: string | null) {
  const { data: usuarios, error: usuariosErro } = await supabase.from("usuarios")
    .select("id,email").eq("empresa_id", empresaId);
  if (usuariosErro) throw new Error(usuariosErro.message);
  const ids = (usuarios || []).map(u => u.id);
  let admins = new Set<string>();
  if (ids.length) {
    const { data: perfis, error: perfisErro } = await supabase.from("usuarios_perfis")
      .select("usuario_id,perfis_empresa(nome,ativo,empresa_id)").in("usuario_id", ids);
    if (perfisErro) throw new Error(perfisErro.message);
    admins = new Set((perfis || []).filter(v => {
      const perfil = Array.isArray(v.perfis_empresa) ? v.perfis_empresa[0] : v.perfis_empresa;
      return String(perfil?.nome || "").toLowerCase() === "administrador" &&
        perfil?.ativo !== false && perfil?.empresa_id === empresaId;
    }).map(v => v.usuario_id));
  }
  const emails = [emailPrincipal || "",
    ...(usuarios || []).filter(u => admins.has(u.id)).map(u => String(u.email || ""))];
  return Array.from(new Set(emails.map(v => v.trim().toLowerCase())
    .filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))));
}

/**
 * Um e-mail de cancelamento no encerramento e outro 30 dias APÓS o primeiro
 * ter sido efetivamente enviado. A atualização é idempotente e retomável.
 */
async function enviarAvisoPendente(empresaId: string, etapa: EtapaEmail) {
  const campos = CAMPOS[etapa];
  const { data: empresa, error } = await supabase.from("empresas")
    .select("id,nome_fantasia,email,status,assinatura_vencimento_em,cancelada_em,exclusao_prevista_em,encerramento_email_estado,encerramento_email_enviado_em,encerramento_email_tentado_em,encerramento_retorno_email_estado,encerramento_retorno_email_tentado_em")
    .eq("id", empresaId).maybeSingle();
  if (error || !empresa) throw new Error("Empresa não encontrada para aviso de encerramento.");

  const agora = new Date();
  const estado = empresa[campos.estado];
  const tentado = empresa[campos.tentado];
  if (empresa.status !== "cancelada" || !empresa.cancelada_em ||
      !empresa.exclusao_prevista_em || new Date(empresa.exclusao_prevista_em) <= agora ||
      estado === "enviado" || estado === "legado")
    return { enviado: false, ignorado: true };

  if (etapa === "reativacao_apos_cancelamento") {
    const primeiroEmail = empresa.encerramento_email_enviado_em;
    if (empresa.encerramento_email_estado !== "enviado" || !primeiroEmail ||
        agora.getTime() < new Date(primeiroEmail).getTime() + 30 * DIA_MS)
      return { enviado: false, ignorado: true };
  }

  const travado = estado === "processando";
  const expirou = travado &&
    agora.getTime() - new Date(tentado || 0).getTime() > EMAIL_TIMEOUT_MS;
  if (travado && !expirou) return { enviado: false, ignorado: true };

  let reserva = supabase.from("empresas").update({
    [campos.estado]: "processando",
    [campos.tentado]: agora.toISOString(),
    [campos.erro]: null,
  }).eq("id", empresaId).eq("status", "cancelada")
    .gt("exclusao_prevista_em", agora.toISOString());
  if (expirou) {
    reserva = reserva.eq(campos.estado, "processando")
      .lt(campos.tentado, new Date(agora.getTime() - EMAIL_TIMEOUT_MS).toISOString());
  } else {
    reserva = reserva.eq(campos.estado, "pendente");
  }
  const { data: reservado, error: reservaErro } = await reserva.select("id").maybeSingle();
  if (reservaErro) throw new Error(reservaErro.message);
  if (!reservado) return { enviado: false, ignorado: true };

  try {
    const destinatarios = await destinatariosAdministrativos(empresaId, empresa.email);
    if (!destinatarios.length) throw new Error("Empresa sem destinatários válidos.");

    const enviado = await sendAssinaturaAvisoEmail({
      empresaId,
      to: destinatarios,
      nome: String(empresa.nome_fantasia || "Cliente"),
      vencimentoEm: empresa.assinatura_vencimento_em || empresa.cancelada_em,
      tipo: etapa,
      canceladaEm: empresa.cancelada_em,
      exclusaoPrevistaEm: empresa.exclusao_prevista_em,
    });
    if (!enviado) throw new Error("O provedor de e-mail não confirmou o envio.");

    const { error: registrarErro } = await supabase.from("empresas").update({
      [campos.estado]: "enviado",
      [campos.enviado]: new Date().toISOString(),
      [campos.erro]: null,
    }).eq("id", empresaId).eq("status", "cancelada")
      .eq(campos.estado, "processando");
    if (registrarErro) throw new Error("E-mail enviado, mas o registro falhou: " + registrarErro.message);
    return { enviado: true, ignorado: false };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    const { error: liberarErro } = await supabase.from("empresas").update({
      [campos.estado]: "pendente",
      [campos.erro]: mensagem.slice(0, 800),
    }).eq("id", empresaId).eq("status", "cancelada")
      .eq(campos.estado, "processando");
    if (liberarErro) console.error("[ENCERRAMENTO EMAIL] Erro ao liberar retentativa", liberarErro);
    console.error("[ENCERRAMENTO EMAIL] Aviso não enviado", etapa, empresaId, mensagem);
    return { enviado: false, ignorado: false, erro: mensagem };
  }
}

export function enviarAvisoCancelamentoPendente(empresaId: string) {
  return enviarAvisoPendente(empresaId, "cancelamento");
}

export function enviarAvisoReativacaoCanceladaPendente(empresaId: string) {
  return enviarAvisoPendente(empresaId, "reativacao_apos_cancelamento");
}
