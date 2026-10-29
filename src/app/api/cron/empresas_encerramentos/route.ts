import { NextResponse } from "next/server";
import { validarChamadaCron } from "@/lib/cron/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarAssinaturaEmpresa } from "@/lib/assinaturas/status";
import { encerrarEmpresaAdministrativamente } from "@/lib/empresas/encerramento";
import { enviarAvisoCancelamentoPendente, enviarAvisoReativacaoCanceladaPendente } from "@/lib/empresas/aviso-cancelamento";
import { excluirEmpresaAposRetencao, limparStorageEmpresaExcluida } from "@/lib/empresas/exclusao-definitiva";

export const runtime = "nodejs";
export const maxDuration = 300;

const DIA_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const auth = validarChamadaCron(request,{exigirVercelCron:true});
  if(!auth.ok) return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});
  const supabase=getSupabaseAdmin();
  const agora=new Date();
  const eventos:Array<{tipo:string;empresa_id:string;ok:boolean;detalhe?:string}>=[];

  // Apenas a assinatura efetivamente bloqueada há 30 dias pode ser cancelada.
  // Empresas antigas bloqueadas ganharam prazo de transição na migração.
  // Um cliente White Label não possui assinatura individual: depende da gestora.
  const {data:elegiveis,error:erroElegiveis}=await supabase.from("empresas")
    .select("id,assinatura_status,assinatura_bloqueio_em,restauracao_pendente_pagamento_em,cancelamento_auto_nao_antes_em,white_label_tipo,white_label_id")
    .eq("status","ativa").eq("assinatura_status","bloqueada")
    .lte("assinatura_bloqueio_em",new Date(agora.getTime()-30*DIA_MS).toISOString())
    .order("assinatura_bloqueio_em",{ascending:true}).limit(100);
  if(erroElegiveis)throw new Error(erroElegiveis.message);
  let processadas=0;
  for(const empresa of elegiveis||[]) {
    if(processadas>=10)break;
    if(empresa.white_label_tipo==="cliente")continue;
    const bloqueioMs=new Date(empresa.assinatura_bloqueio_em||0).getTime();
    const restauracaoMs=empresa.restauracao_pendente_pagamento_em
      ? new Date(empresa.restauracao_pendente_pagamento_em).getTime()+30*DIA_MS : 0;
    const transicaoMs=empresa.cancelamento_auto_nao_antes_em
      ? new Date(empresa.cancelamento_auto_nao_antes_em).getTime() : 0;
    if(!bloqueioMs || Math.max(bloqueioMs+30*DIA_MS,restauracaoMs,transicaoMs)>agora.getTime())
      continue;
    if(empresa.white_label_tipo==="gestora" && empresa.white_label_id) {
      // Evita apagar automaticamente tenants do parceiro sem decisão administrativa.
      const {count,error:filhosErro}=await supabase.from("empresas")
        .select("id",{head:true,count:"exact"})
        .eq("white_label_id",empresa.white_label_id)
        .eq("white_label_tipo","cliente").neq("status","cancelada");
      if(filhosErro)throw new Error(filhosErro.message);
      if((count||0)>0){
        eventos.push({tipo:"gestora_requer_revisao",empresa_id:empresa.id,ok:true,
          detalhe:"Gestora White Label com clientes ativos; requer encerramento coordenado."});
        continue;
      }
    }
    processadas++;
    try{
      // Reconciliamos com o gateway antes de executar um encerramento irreversível.
      const assinatura=await buscarAssinaturaEmpresa(empresa.id,{sincronizar:true});
      if(assinatura?.status!=="bloqueada"){
        eventos.push({tipo:"cancelamento_ignorado_pagamento",empresa_id:empresa.id,ok:true});
        continue;
      }
      // Revalida o estado cadastral e a pendência numa única consulta.
      const {data:atual,error:atualErro}=await supabase.from("empresas")
        .select("status,assinatura_status,assinatura_bloqueio_em,restauracao_pendente_pagamento_em,cancelamento_auto_nao_antes_em")
        .eq("id",empresa.id).maybeSingle();
      if(atualErro)throw new Error(atualErro.message);
      if(!atual || atual.status!=="ativa" || atual.assinatura_status!=="bloqueada")continue;
      const bloqueioAtualMs=new Date(atual.assinatura_bloqueio_em||0).getTime();
      const restAtualMs=atual.restauracao_pendente_pagamento_em
        ? new Date(atual.restauracao_pendente_pagamento_em).getTime()+30*DIA_MS:0;
      const transAtualMs=atual.cancelamento_auto_nao_antes_em
        ? new Date(atual.cancelamento_auto_nao_antes_em).getTime():0;
      if(!bloqueioAtualMs || Math.max(bloqueioAtualMs+30*DIA_MS,restAtualMs,transAtualMs)>Date.now())
        continue;
      const {count:pagamentosRecentes,error:pagamentosErro}=await supabase.from("pagamentos")
        .select("id",{head:true,count:"exact"})
        .eq("empresa_id",empresa.id).eq("status","paid")
        .gte("paid_at",new Date(bloqueioAtualMs).toISOString());
      if(pagamentosErro)throw new Error("Não foi possível verificar pagamentos recentes: "+pagamentosErro.message);
      if((pagamentosRecentes||0)>0){
        eventos.push({tipo:"cancelamento_ignorado_pagamento",empresa_id:empresa.id,ok:true,
          detalhe:"Há pagamento posterior ao bloqueio; conciliação financeira necessária."});
        continue;
      }
      const resultado=await encerrarEmpresaAdministrativamente(empresa.id,null,"inadimplencia");
      eventos.push({tipo:"cancelamento_automatico",empresa_id:empresa.id,ok:true,
        detalhe:resultado.email_cancelamento_enviado?"E-mail enviado":"E-mail em fila para nova tentativa"});
    }catch(error){
      eventos.push({tipo:"cancelamento_automatico",empresa_id:empresa.id,ok:false,
        detalhe:error instanceof Error?error.message:String(error)});
    }
  }

  // Notifica cancelamentos manuais e automáticos; não cria nem baixa backups.
  const limiteTravado=new Date(agora.getTime()-20*60*1000).toISOString();
  const {data:pendentes,error:erroPendentes}=await supabase.from("empresas")
    .select("id").eq("status","cancelada").eq("encerramento_email_estado","pendente")
    .gt("exclusao_prevista_em",agora.toISOString())
    .order("cancelada_em",{ascending:true}).limit(5);
  if(erroPendentes)throw new Error(erroPendentes.message);
  const {data:travados,error:erroTravados}=await supabase.from("empresas")
    .select("id").eq("status","cancelada").eq("encerramento_email_estado","processando")
    .lt("encerramento_email_tentado_em",limiteTravado)
    .gt("exclusao_prevista_em",agora.toISOString()).limit(2);
  if(erroTravados)throw new Error(erroTravados.message);
  const jaAvisados=new Set<string>();
  for(const empresa of [...(pendentes||[]),...(travados||[])]){
    if(jaAvisados.has(empresa.id))continue;
    jaAvisados.add(empresa.id);
    try{
      const resultado=await enviarAvisoCancelamentoPendente(empresa.id);
      eventos.push({tipo:"email_cancelamento",empresa_id:empresa.id,
        ok:!resultado.erro,detalhe:resultado.erro||undefined});
    }catch(error){
      eventos.push({tipo:"email_cancelamento",empresa_id:empresa.id,ok:false,
        detalhe:error instanceof Error?error.message:String(error)});
    }
  }

  // Recontato enviado 30 dias após o primeiro e-mail de cancelamento,
  // apenas se a empresa continua cancelada e o prazo de backup ainda não acabou.
  // Também recupera tentativas interrompidas sem duplicar e-mails confirmados.
  const retornoElegivelEm=new Date(Date.now()-30*DIA_MS).toISOString();
  const retornoTravadoEm=new Date(Date.now()-20*60*1000).toISOString();
  const {data:retornosPendentes,error:retornosErro}=await supabase.from("empresas")
    .select("id").eq("status","cancelada")
    .eq("encerramento_email_estado","enviado")
    .eq("encerramento_retorno_email_estado","pendente")
    .lte("encerramento_email_enviado_em",retornoElegivelEm)
    .gt("exclusao_prevista_em",new Date().toISOString())
    .order("encerramento_email_enviado_em",{ascending:true}).limit(7);
  if(retornosErro)throw new Error(retornosErro.message);
  const {data:retornosTravados,error:retornosTravadosErro}=await supabase.from("empresas")
    .select("id").eq("status","cancelada")
    .eq("encerramento_email_estado","enviado")
    .eq("encerramento_retorno_email_estado","processando")
    .lte("encerramento_email_enviado_em",retornoElegivelEm)
    .lt("encerramento_retorno_email_tentado_em",retornoTravadoEm)
    .gt("exclusao_prevista_em",new Date().toISOString()).limit(3);
  if(retornosTravadosErro)throw new Error(retornosTravadosErro.message);
  for(const e of [...(retornosPendentes||[]),...(retornosTravados||[])]){
    try{
      const resultado=await enviarAvisoReativacaoCanceladaPendente(e.id);
      eventos.push({tipo:"email_recuperacao_pos_cancelamento",empresa_id:e.id,
        ok:!resultado.erro,detalhe:resultado.enviado?"E-mail enviado":resultado.erro});
    }catch(error){
      eventos.push({tipo:"email_recuperacao_pos_cancelamento",empresa_id:e.id,ok:false,
        detalhe:error instanceof Error?error.message:String(error)});
    }
  }

  // Os dados operacionais são expurgados após 60 dias do cancelamento novo.
  // Clientes já cancelados mantêm o prazo previamente registrado.
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
