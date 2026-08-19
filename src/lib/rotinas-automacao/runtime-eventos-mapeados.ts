import { randomUUID } from "node:crypto";
import { buscarRegistroSistemaMapeado, type ConexaoSistemaMapeado } from "@/lib/integracoes/adapters";
import { buscarRecursoSistemaMapeado, buscarSistemaMapeado } from "@/lib/integracoes/sistemas-mapeados";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { avaliarCondicoes, type CondicaoRotina, type ContextoEvento } from "./runtime-condicoes";
import { enviarDisparoWhatsappEventoMapeado } from "./runtime-acoes-whatsapp-externo";

const supabase = getSupabaseAdmin();

type OutboxRow = { id:string; empresa_id:string; integracao_id:string; sistema:string; recurso:string; evento:string; entidade_tipo:string; entidade_id:string; evento_chave:string; payload_json:Record<string,unknown>|null; tentativas:number; max_tentativas:number; };
type GatilhoRow = { id:string; automacao_id:string; evento:string; configuracao_json:Record<string,unknown>|null; };
type AcaoRow = { id:string; automacao_id:string; ordem:number; tipo_acao:string; configuracao_json:Record<string,unknown>|null; };
type JobRow = { id:string; empresa_id:string; automacao_id:string; execucao_id:string|null; acao_id:string|null; ordem:number; executar_em:string; proxima_tentativa_em:string|null; tentativas:number; max_tentativas:number; depende_de_job_id:string|null; cancelamento_solicitado_em:string|null; contexto_json:Record<string,unknown>|null; };

function obj(valor:unknown):Record<string,unknown>{ return valor&&typeof valor==="object"&&!Array.isArray(valor)?valor as Record<string,unknown>:{}; }
function ler(objeto:unknown,caminho:string):unknown{ let atual=objeto; for(const parte of String(caminho||"").split(".").filter(Boolean)){ if(!atual||typeof atual!=="object"||Array.isArray(atual)) return undefined; atual=(atual as Record<string,unknown>)[parte]; } return atual; }
function definir(alvo:Record<string,unknown>,caminho:string,valor:unknown){ const partes=String(caminho||"").split(".").filter(Boolean); if(!partes.length)return; let atual=alvo; for(let i=0;i<partes.length-1;i+=1){ const parte=partes[i]; if(!atual[parte]||typeof atual[parte]!=="object"||Array.isArray(atual[parte])) atual[parte]={}; atual=atual[parte] as Record<string,unknown>; } atual[partes[partes.length-1]]=valor; }

function montarContexto(params:{sistema:string;recurso:string;evento:string;integracaoId:string;registro:Record<string,unknown>;metadata?:Record<string,unknown>|null}){
  const recurso=buscarRecursoSistemaMapeado(params.sistema,params.recurso); if(!recurso) throw new Error(`Recurso ${params.sistema}/${params.recurso} não mapeado.`);
  const contexto:Record<string,unknown>={integracao:{id:params.integracaoId,sistema:params.sistema,recurso:params.recurso},evento:{chave:params.evento,...(params.metadata||{})}};
  for(const campo of recurso.campos) definir(contexto,campo.chave,ler(params.registro,campo.api_path));
  return contexto;
}

async function conexaoAtiva(integracaoId:string,empresaId:string){
  const r=await supabase.from("integracoes_api_externas").select("id,empresa_id,tipo,base_url,token_criptografado,codigo_empresa,status").eq("id",integracaoId).eq("empresa_id",empresaId).maybeSingle();
  if(r.error) throw r.error; if(!r.data||r.data.status!=="ativa") throw new Error("Conexão externa inativa ou não encontrada."); return r.data as ConexaoSistemaMapeado;
}
async function registroAtual(params:{empresaId:string;integracaoId:string;sistema:string;recurso:string;entidadeId:string}){
  const conexao=await conexaoAtiva(params.integracaoId,params.empresaId); if(conexao.tipo!==params.sistema) throw new Error("A conexão não corresponde ao sistema mapeado do evento.");
  return buscarRegistroSistemaMapeado({sistema:params.sistema,conexao,recurso:params.recurso,entidadeId:params.entidadeId});
}
function gatilhoCombina(g:GatilhoRow,o:OutboxRow){ const c=obj(g.configuracao_json); const i=String(c.integracao_api_id||"").trim(),s=String(c.sistema||"").trim(),r=String(c.recurso||"").trim(); return(!i||i===o.integracao_id)&&(!s||s===o.sistema)&&(!r||r===o.recurso); }
function minutos(config:Record<string,unknown>){ const q=Math.max(1,Number(config.quantidade||config.atraso||1)); const u=String(config.unidade||"minutos"); return u==="dias"?q*1440:u==="horas"?q*60:q; }
function tituloAcao(a:AcaoRow){ if(a.tipo_acao==="aguardar"){const c=obj(a.configuracao_json);return `Aguardar ${Math.max(1,Number(c.quantidade||1))} ${String(c.unidade||"minutos")}`;} if(a.tipo_acao==="whatsapp.enviar_template")return"Enviar disparo WhatsApp"; if(a.tipo_acao==="integracao.consultar_api")return"Consultar estado atual"; return a.tipo_acao; }

async function eventoNormalizado(o:OutboxRow,contexto:Record<string,unknown>){
  const r=await supabase.from("rotina_automacao_eventos").upsert({empresa_id:o.empresa_id,evento:o.evento,evento_chave:o.evento_chave,entidade_tipo:o.entidade_tipo,entidade_id:o.entidade_id,status:"processando",payload_json:contexto,erro:null,processado_em:null},{onConflict:"empresa_id,evento_chave"}).select("id").single();
  if(r.error)throw r.error; return String(r.data.id);
}
async function atualizarEvento(id:string,patch:Record<string,unknown>){const r=await supabase.from("rotina_automacao_eventos").update({...patch,updated_at:new Date().toISOString()}).eq("id",id);if(r.error)throw r.error;}

async function criarJobs(params:{outbox:OutboxRow;execucaoId:string;automacaoId:string;contexto:Record<string,unknown>;condicoes:CondicaoRotina[];acoes:AcaoRow[];revalidar:boolean}){
  let atraso=0; let dependencia:string|null=null; const inicio=Date.now();
  for(const acao of [...params.acoes].sort((a,b)=>a.ordem-b.ordem)){
    const config=obj(acao.configuracao_json); if(acao.tipo_acao==="aguardar")atraso+=minutos(config); if(acao.tipo_acao!=="aguardar"&&Number(config.atraso_minutos||0)>0)atraso+=Math.max(0,Number(config.atraso_minutos||0));
    const chave=`rotina:${params.execucaoId}:acao:${acao.id}`;
    const contexto={origem:"integracao_mapeada",sistema:params.outbox.sistema,recurso:params.outbox.recurso,evento:params.outbox.evento,integracao_api_id:params.outbox.integracao_id,entidade_id:params.outbox.entidade_id,evento_chave:params.outbox.evento_chave,evento_payload:params.outbox.payload_json||{},contexto_evento:params.contexto,condicoes_snapshot:params.condicoes,revalidar_antes_de_executar:params.revalidar,tipo_acao:acao.tipo_acao,acao_config:config};
    const inserir:any=await supabase.from("rotina_automacao_jobs").upsert({empresa_id:params.outbox.empresa_id,automacao_id:params.automacaoId,execucao_id:params.execucaoId,acao_id:acao.id,entidade_tipo:params.outbox.entidade_tipo,entidade_id:params.outbox.entidade_id,executar_em:new Date(inicio+atraso*60000).toISOString(),status:"pendente",tentativas:0,max_tentativas:5,chave_idempotencia:chave,contexto_json:contexto,ordem:acao.ordem,titulo:tituloAcao(acao),canal:acao.tipo_acao==="whatsapp.enviar_template"?"whatsapp":"integracao",depende_de_job_id:dependencia},{onConflict:"chave_idempotencia",ignoreDuplicates:true}).select("id").maybeSingle();
    if(inserir.error)throw inserir.error;
    if(inserir.data?.id)dependencia=String(inserir.data.id); else {const e=await supabase.from("rotina_automacao_jobs").select("id").eq("chave_idempotencia",chave).maybeSingle();if(e.error)throw e.error;if(e.data?.id)dependencia=String(e.data.id);}
  }
}

async function processarEvento(o:OutboxRow,registro:Record<string,unknown>){
  const sistema=buscarSistemaMapeado(o.sistema),recurso=buscarRecursoSistemaMapeado(o.sistema,o.recurso),eventoMapeado=recurso?.eventos.find(i=>i.chave===o.evento); if(!sistema||!recurso||!eventoMapeado)throw new Error("Evento de integração não mapeado.");
  const contexto=montarContexto({sistema:o.sistema,recurso:o.recurso,evento:o.evento,integracaoId:o.integracao_id,registro,metadata:o.payload_json}); const eventoId=await eventoNormalizado(o,contexto);
  const gr=await supabase.from("rotina_automacao_gatilhos").select("id,automacao_id,evento,configuracao_json").eq("empresa_id",o.empresa_id).eq("evento",o.evento).eq("ativo",true); if(gr.error)throw gr.error;
  const gatilhos=((gr.data||[]) as GatilhoRow[]).filter(g=>gatilhoCombina(g,o)); if(!gatilhos.length){await atualizarEvento(eventoId,{status:"ignorado",processado_em:new Date().toISOString()});return 0;}
  const ids=Array.from(new Set(gatilhos.map(g=>g.automacao_id)));
  const [ar,cr,xr]=await Promise.all([supabase.from("rotina_automacoes").select("id").eq("empresa_id",o.empresa_id).in("id",ids).eq("status","ativa"),supabase.from("rotina_automacao_condicoes").select("automacao_id,grupo,ordem,conjuncao,campo,operador,valor_json").eq("empresa_id",o.empresa_id).in("automacao_id",ids).order("ordem"),supabase.from("rotina_automacao_acoes").select("id,automacao_id,ordem,tipo_acao,configuracao_json").eq("empresa_id",o.empresa_id).in("automacao_id",ids).eq("ativo",true).order("ordem")]); const erro=ar.error||cr.error||xr.error;if(erro)throw erro;
  const ativas=new Set((ar.data||[]).map(i=>i.id)); let criadas=0;
  for(const g of gatilhos){
    if(!ativas.has(g.automacao_id))continue;
    const condicoes=(cr.data||[]).filter(i=>i.automacao_id===g.automacao_id).map(i=>({...i,conjuncao:i.conjuncao as CondicaoRotina["conjuncao"],operador:i.operador as CondicaoRotina["operador"]})) as CondicaoRotina[]; if(!avaliarCondicoes(condicoes,contexto as ContextoEvento))continue;
    const acoes=(xr.data||[]).filter(i=>i.automacao_id===g.automacao_id) as AcaoRow[]; if(!acoes.length)continue;
    const ex=await supabase.from("rotina_automacao_execucoes").select("id").eq("automacao_id",g.automacao_id).eq("evento_chave",o.evento_chave).maybeSingle(); if(ex.error)throw ex.error;if(ex.data)continue;
    const execucaoId=randomUUID(); const ins=await supabase.from("rotina_automacao_execucoes").insert({id:execucaoId,empresa_id:o.empresa_id,automacao_id:g.automacao_id,gatilho_id:g.id,evento_chave:o.evento_chave,entidade_tipo:o.entidade_tipo,entidade_id:o.entidade_id,status:"processando",contexto_json:contexto,resultado_json:{origem:"integracao_mapeada",sistema:o.sistema,recurso:o.recurso}}); if(ins.error){if(ins.error.code==="23505")continue;throw ins.error;}
    await criarJobs({outbox:o,execucaoId,automacaoId:g.automacao_id,contexto,condicoes,acoes,revalidar:eventoMapeado.revalidar_antes_de_executar===true}); criadas+=1;
  }
  await atualizarEvento(eventoId,{status:"processado",processado_em:new Date().toISOString()}); return criadas;
}

async function falharOutbox(o:OutboxRow,error:unknown){const t=Number(o.tentativas||0)+1,final=t>=Number(o.max_tentativas||5),atraso=Math.min(30,2**Math.max(0,t-1));await supabase.from("integracao_eventos_outbox").update({status:final?"erro":"pendente",tentativas:t,erro:error instanceof Error?error.message:"Erro no evento externo.",processar_em:final?new Date().toISOString():new Date(Date.now()+atraso*60000).toISOString(),bloqueado_em:null,updated_at:new Date().toISOString()}).eq("id",o.id);}
async function processarOutbox(o:OutboxRow){
  const claim=await supabase.from("integracao_eventos_outbox").update({status:"processando",bloqueado_em:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",o.id).eq("status","pendente").select("id").maybeSingle();if(claim.error)throw claim.error;if(!claim.data)return false;
  try{const registro=await registroAtual({empresaId:o.empresa_id,integracaoId:o.integracao_id,sistema:o.sistema,recurso:o.recurso,entidadeId:o.entidade_id});if(!registro){await supabase.from("integracao_eventos_outbox").update({status:"ignorado",erro:"Registro não encontrado na API externa.",bloqueado_em:null,processado_em:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",o.id);return false;}await processarEvento(o,obj(registro));await supabase.from("integracao_eventos_outbox").update({status:"processado",erro:null,bloqueado_em:null,processado_em:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",o.id);return true;}catch(error){await falharOutbox(o,error);throw error;}
}

function snapshots(c:Record<string,unknown>){return Array.isArray(c.condicoes_snapshot)?c.condicoes_snapshot as CondicaoRotina[]:[];}
function estadoValido(evento:string,contexto:Record<string,unknown>,meta:Record<string,unknown>){if(evento==="prosperity.carrinho.abandonado")return ler(contexto,"carrinho.pago_atualmente")!==true;if(["prosperity.pagamento.criado","prosperity.pagamento.status_alterado"].includes(evento)&&String(meta.status_novo||"").toLowerCase()==="waiting_payment")return ler(contexto,"pagamento.pago_atualmente")!==true&&String(ler(contexto,"pagamento.status")||"").toLowerCase()==="waiting_payment";return true;}
async function revalidarJob(job:JobRow){const c=obj(job.contexto_json),s=String(c.sistema||""),r=String(c.recurso||""),e=String(c.evento||""),i=String(c.integracao_api_id||""),id=String(c.entidade_id||""),m=obj(c.evento_payload);const registro=await registroAtual({empresaId:job.empresa_id,integracaoId:i,sistema:s,recurso:r,entidadeId:id});if(!registro)return{valido:false,contexto:obj(c.contexto_evento)};const contexto=montarContexto({sistema:s,recurso:r,evento:e,integracaoId:i,registro:obj(registro),metadata:m});return{valido:avaliarCondicoes(snapshots(c),contexto as ContextoEvento)&&estadoValido(e,contexto,m),contexto};}
async function cancelarPosteriores(job:JobRow,motivo:string){if(!job.execucao_id)return;await supabase.from("rotina_automacao_jobs").update({status:"cancelado",cancelado_em:new Date().toISOString(),origem_cancelamento:motivo,updated_at:new Date().toISOString()}).eq("execucao_id",job.execucao_id).eq("status","pendente").gt("ordem",job.ordem);}
async function finalizarExecucao(id:string){const q=await supabase.from("rotina_automacao_jobs").select("status,resultado_json,erro").eq("execucao_id",id);if(q.error)throw q.error;const jobs=q.data||[];if(!jobs.length||jobs.some(j=>["pendente","processando"].includes(j.status)))return;const falha=jobs.find(j=>j.status==="erro");await supabase.from("rotina_automacao_execucoes").update({status:falha?"erro":"concluida",erro:falha?.erro||null,finalizada_em:new Date().toISOString(),resultado_json:{origem:"integracao_mapeada",jobs},updated_at:new Date().toISOString()}).eq("id",id);}
async function concluirJob(job:JobRow,resultado:Record<string,unknown>,contexto?:Record<string,unknown>){await supabase.from("rotina_automacao_jobs").update({status:"concluido",resultado_json:resultado,...(contexto?{contexto_json:contexto}:{}),erro:null,executado_em:new Date().toISOString(),bloqueado_em:null,proxima_tentativa_em:null,updated_at:new Date().toISOString()}).eq("id",job.id);if(job.execucao_id)await finalizarExecucao(job.execucao_id);}

async function executarJob(job:JobRow){
  if(!job.execucao_id)throw new Error("Job de integração sem execução vinculada.");
  if(job.cancelamento_solicitado_em){await supabase.from("rotina_automacao_jobs").update({status:"cancelado",cancelado_em:new Date().toISOString(),origem_cancelamento:"cancelamento_solicitado",updated_at:new Date().toISOString()}).eq("id",job.id);await finalizarExecucao(job.execucao_id);return false;}
  if(job.depende_de_job_id){const d=await supabase.from("rotina_automacao_jobs").select("status").eq("id",job.depende_de_job_id).maybeSingle();if(d.error)throw d.error;if(!d.data||["cancelado","erro"].includes(d.data.status)){await supabase.from("rotina_automacao_jobs").update({status:"cancelado",cancelado_em:new Date().toISOString(),origem_cancelamento:"dependencia_nao_concluida",updated_at:new Date().toISOString()}).eq("id",job.id);await finalizarExecucao(job.execucao_id);return false;}if(d.data.status!=="concluido")return false;}
  const claim=await supabase.from("rotina_automacao_jobs").update({status:"processando",bloqueado_em:new Date().toISOString(),tentativas:Number(job.tentativas||0)+1,updated_at:new Date().toISOString()}).eq("id",job.id).eq("status","pendente").select("id").maybeSingle();if(claim.error)throw claim.error;if(!claim.data)return false;
  const c=obj(job.contexto_json),tipo=String(c.tipo_acao||"");
  try{
    if(tipo==="aguardar"){await concluirJob(job,{aguardou:true,executar_em:job.executar_em});return true;}
    let contextoEvento=obj(c.contexto_evento);if(c.revalidar_antes_de_executar===true){const rev=await revalidarJob(job);contextoEvento=rev.contexto;if(!rev.valido){await concluirJob(job,{ignorado:true,motivo:"estado_atual_nao_atende_mais_a_automacao"});await cancelarPosteriores(job,"revalidacao_nao_atendida");await finalizarExecucao(job.execucao_id);return true;}}
    let resultado:Record<string,unknown>;if(tipo==="whatsapp.enviar_template"){if(!job.acao_id)throw new Error("Job WhatsApp sem ação vinculada.");resultado=await enviarDisparoWhatsappEventoMapeado({empresaId:job.empresa_id,automacaoId:job.automacao_id,execucaoId:job.execucao_id,acaoId:job.acao_id,sistema:String(c.sistema||""),recurso:String(c.recurso||""),contexto:contextoEvento,config:obj(c.acao_config)});}else if(tipo==="integracao.consultar_api")resultado={consulta_realizada:true,contexto_atual:contextoEvento};else throw new Error(`A ação ${tipo||"sem tipo"} ainda não é suportada em integração mapeada.`);
    await concluirJob(job,resultado,{...c,contexto_evento:contextoEvento});return true;
  }catch(error){const t=Number(job.tentativas||0)+1,final=t>=Number(job.max_tentativas||5),atraso=Math.min(30,2**Math.max(0,t-1));await supabase.from("rotina_automacao_jobs").update({status:final?"erro":"pendente",tentativas:t,erro:error instanceof Error?error.message:"Erro no job de integração.",bloqueado_em:null,proxima_tentativa_em:final?null:new Date(Date.now()+atraso*60000).toISOString(),updated_at:new Date().toISOString()}).eq("id",job.id);if(final)await finalizarExecucao(job.execucao_id);throw error;}
}

export async function processarEventosIntegracoesMapeadas(limite=50){
  const max=Math.min(Math.max(limite,1),100),agora=new Date().toISOString();const resumo={outbox_encontrados:0,outbox_processados:0,outbox_ignorados:0,jobs_encontrados:0,jobs_processados:0,jobs_ignorados:0,erros:0};
  const or=await supabase.from("integracao_eventos_outbox").select("id,empresa_id,integracao_id,sistema,recurso,evento,entidade_tipo,entidade_id,evento_chave,payload_json,tentativas,max_tentativas").eq("status","pendente").lte("processar_em",agora).order("created_at").limit(max);if(or.error)throw or.error;const outbox=(or.data||[]) as OutboxRow[];resumo.outbox_encontrados=outbox.length;
  for(const item of outbox){try{if(await processarOutbox(item))resumo.outbox_processados+=1;else resumo.outbox_ignorados+=1;}catch(error){resumo.erros+=1;console.error("[AUTOMACOES INTEGRACOES] Falha no outbox",item.id,error);}}
  const jr=await supabase.from("rotina_automacao_jobs").select("id,empresa_id,automacao_id,execucao_id,acao_id,ordem,executar_em,proxima_tentativa_em,tentativas,max_tentativas,depende_de_job_id,cancelamento_solicitado_em,contexto_json").eq("status","pendente").eq("contexto_json->>origem","integracao_mapeada").lte("executar_em",agora).order("executar_em").order("ordem").limit(max*2);if(jr.error)throw jr.error;const jobs=((jr.data||[]) as JobRow[]).filter(j=>!j.proxima_tentativa_em||j.proxima_tentativa_em<=agora).slice(0,max);resumo.jobs_encontrados=jobs.length;
  for(const job of jobs){try{if(await executarJob(job))resumo.jobs_processados+=1;else resumo.jobs_ignorados+=1;}catch(error){resumo.erros+=1;console.error("[AUTOMACOES INTEGRACOES] Falha no job",job.id,error);}}
  return resumo;
}
