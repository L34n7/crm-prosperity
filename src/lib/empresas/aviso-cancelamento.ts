import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendAssinaturaAvisoEmail } from "@/lib/email/send-assinatura-aviso-email";

const supabase = getSupabaseAdmin();
const EMAIL_TIMEOUT_MS = 20*60*1000;

/**
 * Notifica somente empresas canceladas sob o novo regime.
 * Registra o envio e permite retentativa pelo cron, inclusive para cancelamentos manuais.
 */
export async function enviarAvisoCancelamentoPendente(empresaId:string) {
  const {data:empresa,error} = await supabase.from("empresas")
    .select("id,nome_fantasia,email,status,assinatura_vencimento_em,cancelada_em,exclusao_prevista_em,encerramento_email_estado,encerramento_email_tentado_em")
    .eq("id",empresaId).maybeSingle();
  if(error || !empresa) throw new Error("Empresa não encontrada para aviso de encerramento.");
  if(empresa.status!=="cancelada" || !empresa.cancelada_em || !empresa.exclusao_prevista_em ||
     empresa.encerramento_email_estado==="enviado" || empresa.encerramento_email_estado==="legado")
    return {enviado:false,ignorado:true};
  const agora=new Date();
  const expirou=empresa.encerramento_email_estado==="processando"
    && (agora.getTime()-new Date(empresa.encerramento_email_tentado_em || 0).getTime())>EMAIL_TIMEOUT_MS;
  if(empresa.encerramento_email_estado==="processando" && !expirou)
    return {enviado:false,ignorado:true};

  let reservar=supabase.from("empresas")
    .update({encerramento_email_estado:"processando",encerramento_email_tentado_em:agora.toISOString(),encerramento_email_erro:null})
    .eq("id",empresaId).eq("status","cancelada");
  if(expirou){
    reservar=reservar.eq("encerramento_email_estado","processando")
      .lt("encerramento_email_tentado_em",new Date(agora.getTime()-EMAIL_TIMEOUT_MS).toISOString());
  }else{
    reservar=reservar.eq("encerramento_email_estado","pendente");
  }
  const {data:reservado,error:reservaErro}=await reservar.select("id").maybeSingle();
  if(reservaErro)throw new Error(reservaErro.message);
  if(!reservado)return {enviado:false,ignorado:true};

  try{
    const {data:usuarios,error:usuariosErro}=await supabase.from("usuarios")
      .select("email").eq("empresa_id",empresaId);
    if(usuariosErro)throw new Error(usuariosErro.message);
    const destinatarios=Array.from(new Set([
      String(empresa.email||""),
      ...(usuarios||[]).map(u=>String(u.email||"")),
    ].map(e=>e.trim().toLowerCase()).filter(e=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e))));
    if(!destinatarios.length)throw new Error("Empresa sem destinatários válidos.");

    const enviado=await sendAssinaturaAvisoEmail({
      empresaId,
      to:destinatarios,
      nome:String(empresa.nome_fantasia||"Cliente"),
      vencimentoEm:empresa.assinatura_vencimento_em || empresa.cancelada_em,
      tipo:"cancelamento",
      canceladaEm:empresa.cancelada_em,
      exclusaoPrevistaEm:empresa.exclusao_prevista_em,
    });
    if(!enviado)throw new Error("O provedor de e-mail não confirmou o envio.");
    const {error:registrarErro}=await supabase.from("empresas").update({
      encerramento_email_estado:"enviado",encerramento_email_enviado_em:new Date().toISOString(),
      encerramento_email_erro:null,
    }).eq("id",empresaId).eq("status","cancelada").eq("encerramento_email_estado","processando");
    if(registrarErro)throw new Error("E-mail enviado, mas o registro falhou: "+registrarErro.message);
    return {enviado:true,ignorado:false};
  }catch(error){
    const mensagem=error instanceof Error?error.message:String(error);
    const {error:liberarErro}=await supabase.from("empresas").update({
      encerramento_email_estado:"pendente",encerramento_email_erro:mensagem.slice(0,800)
    }).eq("id",empresaId).eq("status","cancelada")
      .eq("encerramento_email_estado","processando");
    if(liberarErro)console.error("[ENCERRAMENTO EMAIL] Falha em liberar retentativa:",liberarErro);
    console.error("[ENCERRAMENTO EMAIL] Aviso pendente",empresaId,mensagem);
    return {enviado:false,ignorado:false,erro:mensagem};
  }
}
