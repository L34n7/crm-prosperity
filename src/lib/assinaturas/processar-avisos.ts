import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendAssinaturaAvisoEmail, type TipoAvisoAssinatura } from "@/lib/email/send-assinatura-aviso-email";

const supabase = getSupabaseAdmin();
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

function checkoutUrl(slug: string | null) {
  if (slug === "basico" || slug === "basic") return process.env.ATOMOPAY_CHECKOUT_URL_BASICO || process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL_BASICO || process.env.ATOMOPAY_CHECKOUT_URL_PADRAO || null;
  if (slug === "essencial") return process.env.ATOMOPAY_CHECKOUT_URL_ESSENCIAL || process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL_ESSENCIAL || process.env.ATOMOPAY_CHECKOUT_URL_PADRAO || null;
  return process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL || process.env.ATOMOPAY_CHECKOUT_URL_PADRAO || null;
}

function avisoElegivel(status: string, vencimento: Date, agora: Date): TipoAvisoAssinatura | null {
  const dias = (agora.getTime() - vencimento.getTime()) / 86_400_000;
  if (status === "ativa" && dias >= -3 && dias < 0) return "pre_vencimento";
  if (status === "vencida") return "vencida";
  if (status === "bloqueada") return "bloqueada";
  return null;
}

export async function processarAvisosAssinatura(agora = new Date()) {
  const { data: empresas, error } = await supabase.from("empresas").select("id,email,nome_fantasia,razao_social,assinatura_vencimento_em,planos(slug)").not("assinatura_vencimento_em", "is", null).order("assinatura_vencimento_em", { ascending: true }).limit(1000);
  if (error) throw new Error(`Erro ao buscar assinaturas: ${error.message}`);
  const resultado = { analisadas: empresas?.length || 0, atualizadas: 0, enviados: 0, ignorados: 0, erros: 0 };

  for (const empresa of empresas || []) {
    try {
      const { data: status, error: syncError } = await supabase.rpc("sincronizar_assinatura_empresa", { p_empresa_id: empresa.id });
      if (syncError) throw new Error(syncError.message);
      resultado.atualizadas += 1;
      const vencimento = new Date(String(empresa.assinatura_vencimento_em));
      const tipo = avisoElegivel(String(status), vencimento, agora);
      const email = String(empresa.email || "").trim();
      if (!tipo || !email || Number.isNaN(vencimento.getTime())) { resultado.ignorados += 1; continue; }

      // Reservas antigas são de execuções interrompidas antes do envio; podem ser tentadas novamente.
      await supabase.from("assinatura_avisos_email").delete().eq("empresa_id", empresa.id).eq("tipo", tipo).is("enviado_em", null).lt("created_at", new Date(agora.getTime() - 60 * 60 * 1000).toISOString());
      const { data: historico, error: historicoErro } = await supabase.from("assinatura_avisos_email").select("tentativa,enviado_em").eq("empresa_id", empresa.id).eq("tipo", tipo).eq("vencimento_em", vencimento.toISOString()).not("enviado_em", "is", null).order("enviado_em", { ascending: false });
      if (historicoErro) throw new Error(historicoErro.message);
      const enviados = historico || [];
      const ultimo = enviados[0]?.enviado_em ? new Date(enviados[0].enviado_em) : null;
      const limite = tipo === "pre_vencimento" ? 1 : 2;
      if (enviados.length >= limite || (ultimo && agora.getTime() - ultimo.getTime() < COOLDOWN_MS)) { resultado.ignorados += 1; continue; }
      const tentativa = enviados.length + 1;
      const { data: reserva, error: reservaErro } = await supabase.from("assinatura_avisos_email").insert({ empresa_id: empresa.id, tipo, vencimento_em: vencimento.toISOString(), tentativa, destinatario: email }).select("id").maybeSingle();
      if (reservaErro || !reserva) { resultado.ignorados += 1; continue; }
      const plano = Array.isArray(empresa.planos) ? empresa.planos[0] : empresa.planos;
      const enviado = await sendAssinaturaAvisoEmail({ to: email, nome: String(empresa.nome_fantasia || empresa.razao_social || "Cliente"), vencimentoEm: vencimento.toISOString(), tipo, checkoutUrl: checkoutUrl(plano?.slug || null) });
      if (!enviado) { await supabase.from("assinatura_avisos_email").delete().eq("id", reserva.id); resultado.erros += 1; continue; }
      await supabase.from("assinatura_avisos_email").update({ enviado_em: agora.toISOString(), updated_at: agora.toISOString() }).eq("id", reserva.id);
      resultado.enviados += 1;
    } catch (erro) { console.error("[ASSINATURA_AVISOS] Erro ao processar empresa", empresa.id, erro); resultado.erros += 1; }
  }
  return resultado;
}
