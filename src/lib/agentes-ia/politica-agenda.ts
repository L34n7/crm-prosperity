/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarSaldoTokensIa } from "@/lib/ia/tokens";
import { dataLocalDeIso, filtrarSlotsPorPreferencia, formatarSlotAgenda, interpretarDataHorarioAgenda, listarSlotsDisponiveis } from "@/lib/agendas/agenda-service";
import { sincronizarAgendamentoGoogleCalendar } from "@/lib/agendas/google-calendar";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text-message";
import { detectarAutomacaoExterna } from "./protecao-automacao-externa";
import { agendarFollowupAgenteIa, cancelarFollowupsPendentesAgenteIa } from "./followup-inatividade";

const db = getSupabaseAdmin();
type Pendencia = { id:string; empresa_id:string; agente_id:string; conversa_id:string; contato_id?:string|null; numero_destino?:string|null; mensagem_ids:string[]; conteudo_agregado:string; status?:string|null; versao:number };
type Estado = { estagio?:string|null; proxima_acao?:string|null; [key:string]:unknown };
type Slot = { data:string; hora:string; label?:string|null };
type Ctx = { pendencia:Pendencia; lockToken:string; agenda:any; agendaId:string; estado:Estado; ativos:any[]; slot:Slot|null; remarcacao:boolean; execucaoId:string; mensagem:string };

const norm = (v:unknown) => String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const pedidoRemarca = (v:string) => /\b(remarcar|remarca|remarcacao|reagendar|reagenda|reagendamento|mudar (?:o )?horario|trocar (?:o )?(?:dia|horario))\b/.test(norm(v));
const estadoRemarca = (e:Estado) => /remarc|reagend/i.test(`${e.estagio||""} ${e.proxima_acao||""}`);
const agendaEmCurso = (e:Estado) => /agend|remarc|reagend|horario|disponibilidade|aguardar escolha|reuni|demonstr/i.test(`${e.estagio||""} ${e.proxima_acao||""}`);

function hora(v:unknown) {
  const m=String(v||"").trim().match(/^(\d{1,2})(?::(\d{2}))?$/); if(!m)return null;
  const h=Number(m[1]), min=Number(m[2]||0); if(h>23||min>59)return null;
  return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}`;
}
function horaMensagem(v:string) {
  const t=norm(v); let m=t.match(/(?:^|\s)(\d{1,2}):(\d{2})(?=$|\s|[?!.,;])/); if(m)return hora(`${m[1]}:${m[2]}`);
  m=t.match(/(?:^|\s)(\d{1,2})\s*h\s*(\d{2})?(?=$|\s|[?!.,;])/); if(m)return hora(`${m[1]}:${m[2]||"00"}`);
  m=t.match(/(?:^|\s)(\d{1,2})\s*(?:hr|hrs|hora|horas)(?=$|\s|[?!.,;])/); if(m)return hora(m[1]);
  return /^\d{1,2}$/.test(t)?hora(t):null;
}
function ordinal(v:string){ const t=norm(v).replace(/[?!.,;]+$/g,""); if(/^(?:o )?primeiro$/.test(t))return 0; if(/^(?:o )?segundo$/.test(t))return 1; if(/^(?:o )?terceiro$/.test(t))return 2; return null; }
const tituloAgenda=(v:unknown)=>String(v||"").replace(/^agenda\s+/i,"").trim()||"Agendamento";
function label(slot:any,tz:string){ if(slot?.label)return String(slot.label).replace(/\s*\(([^)]+)\)\s*$/," até $1").trim(); if(slot?.inicio_at)return String(formatarSlotAgenda(slot.inicio_at,slot.fim_at,tz).label||"").replace(/\s*\(([^)]+)\)\s*$/," até $1").trim(); return `${slot?.data||""} às ${slot?.hora||""}`.trim(); }

async function configAgenda(empresaId:string,agenteId:string){
  const {data,error}=await db.from("agente_ia_ferramentas").select("tipo, config_json").eq("empresa_id",empresaId).eq("agente_id",agenteId).eq("ativo",true).in("tipo",["consultar_agenda","criar_agendamento","remarcar_agendamento"]); if(error)throw new Error(error.message);
  const mapa=new Map((data||[]).map((x:any)=>[String(x.tipo),x.config_json||{}])); if(!mapa.has("consultar_agenda")||!mapa.has("criar_agendamento"))return null;
  const ids=Array.from(new Set(Array.from(mapa.values()).map((c:any)=>String(c?.agenda_id||"").trim()).filter(Boolean))); if(ids.length!==1)return null;
  const agendaId=ids[0]; const {data:agenda,error:e}=await db.from("calendarios").select("id, nome, timezone, duracao_minutos, status").eq("empresa_id",empresaId).eq("id",agendaId).eq("status","ativo").maybeSingle(); if(e)throw new Error(e.message); if(!agenda)return null;
  return {agendaId,agenda,podeRemarcar:mapa.has("remarcar_agendamento")};
}
async function estadoAtual(p:Pendencia){ const {data}=await db.from("agente_ia_conversa_estados").select("estado_json").eq("empresa_id",p.empresa_id).eq("agente_id",p.agente_id).eq("conversa_id",p.conversa_id).maybeSingle(); return (data?.estado_json||{}) as Estado; }
async function ativos(p:Pendencia,agendaId:string){
  let q=db.from("agenda_agendamentos").select("id, agenda_id, contato_id, conversa_id, titulo, inicio_at, fim_at, status, metadata_json").eq("empresa_id",p.empresa_id).eq("agenda_id",agendaId).in("status",["agendado","confirmado"]).gte("fim_at",new Date().toISOString()).order("inicio_at",{ascending:true});
  q=p.contato_id?q.or(`conversa_id.eq.${p.conversa_id},contato_id.eq.${p.contato_id}`):q.eq("conversa_id",p.conversa_id); const {data,error}=await q.limit(5); if(error)throw new Error(error.message); return data||[];
}
async function slotsRecentes(p:Pendencia){
  const desde=new Date(Date.now()-24*60*60*1000).toISOString(); const {data,error}=await db.from("agente_ia_execucoes").select("ferramentas_json, finished_at").eq("empresa_id",p.empresa_id).eq("agente_id",p.agente_id).eq("conversa_id",p.conversa_id).in("status",["concluido","fallback"]).gte("finished_at",desde).order("finished_at",{ascending:false}).limit(6); if(error)throw new Error(error.message);
  for(const ex of data||[]){ for(const f of [...(Array.isArray(ex.ferramentas_json)?ex.ferramentas_json:[])].reverse()){ if(f?.nome!=="consultar_agenda"||f?.resultado?.ok!==true)continue; const s=Array.isArray(f.resultado?.slots)?f.resultado.slots:[]; if(s.length)return s.map((x:any)=>({data:String(x.data||""),hora:hora(x.hora),label:x.label||null})).filter((x:any)=>/^\d{4}-\d{2}-\d{2}$/.test(x.data)&&x.hora) as Slot[]; } } return [];
}
async function slotEscolhido(p:Pendencia,agenda:any,agendaId:string,recentes:Slot[]){
  const tz=agenda.timezone||"America/Sao_Paulo", i=interpretarDataHorarioAgenda(p.conteudo_agregado,tz), ord=ordinal(p.conteudo_agregado); if(ord!==null&&recentes[ord])return recentes[ord];
  const h=horaMensagem(p.conteudo_agregado); if(!h)return null; let c=recentes.filter(x=>x.hora===h); if(i.data)c=c.filter(x=>x.data===i.data); if(c.length===1)return c[0]; if(!i.data)return null;
  const r=await listarSlotsDisponiveis({supabase:db,empresaId:p.empresa_id,agendaId,data:i.data,janelaDias:1,limite:50}); const s=(r.slots||[]).find((x:any)=>dataLocalDeIso(x.inicio_at,tz)===i.data&&String(x.hora_label)===h); return s?{data:i.data,hora:h,label:s.label}:null;
}
async function opcoes(p:Pendencia,agenda:any,agendaId:string){
  const tz=agenda.timezone||"America/Sao_Paulo", i=interpretarDataHorarioAgenda(p.conteudo_agregado,tz); if(!i.data)return {data:null,slots:[] as Slot[]};
  const r=await listarSlotsDisponiveis({supabase:db,empresaId:p.empresa_id,agendaId,data:i.data,janelaDias:1,limite:i.preferencia?50:12}); const s=filtrarSlotsPorPreferencia(r.slots||[],i.preferencia,tz).slice(0,3).map((x:any)=>({data:dataLocalDeIso(x.inicio_at,tz),hora:String(x.hora_label),label:x.label})); return {data:i.data,slots:s};
}
function humano(c:any){ return !c||c.aguardando_atendente===true||(c.bot_ativo!==true&&String(c.status||"")==="em_atendimento")||(c.bot_ativo!==true&&String(c.status||"")==="fila"&&c.responsavel_id); }

async function abrir(p:Pendencia){ const now=new Date().toISOString(); const {data,error}=await db.from("agente_ia_execucoes").insert({empresa_id:p.empresa_id,agente_id:p.agente_id,conversa_id:p.conversa_id,contato_id:p.contato_id||null,mensagem_ids:p.mensagem_ids,status:"processando",entrada_resumida:p.conteudo_agregado.slice(0,4000),modelo:"politica_agenda",started_at:now,metadata_json:{politica_agenda:true}}).select("id").single(); if(error||!data)throw new Error(error?.message||"Não foi possível abrir execução da política de agenda."); return data.id as string; }
async function fimPend(ctx:Ctx,status:"processado"|"cancelado"|"erro",erro?:string|null){ await db.rpc("agente_ia_finalizar_pendencia",{p_pendencia_id:ctx.pendencia.id,p_lock_token:ctx.lockToken,p_versao:ctx.pendencia.versao,p_status:status,p_erro:erro||null}); }
async function salvarEstado(ctx:Ctx,e:Estado){ const now=new Date().toISOString(), resumo=[e.estagio?`Estágio: ${e.estagio}`:"",e.proxima_acao?`Próxima ação: ${e.proxima_acao}`:""].filter(Boolean).join(" | "); await db.from("agente_ia_conversa_estados").upsert({empresa_id:ctx.pendencia.empresa_id,agente_id:ctx.pendencia.agente_id,conversa_id:ctx.pendencia.conversa_id,resumo,estado_json:e,ultima_mensagem_id:ctx.pendencia.mensagem_ids.at(-1)||null,ultima_interacao_at:now,updated_at:now},{onConflict:"agente_id,conversa_id"}); }
async function enviar(ctx:Ctx,texto:string){
  const {data:c,error}=await db.from("conversas").select("id,status,responsavel_id,bot_ativo,aguardando_atendente,integracao_whatsapp_id").eq("empresa_id",ctx.pendencia.empresa_id).eq("id",ctx.pendencia.conversa_id).maybeSingle(); if(error)throw new Error(error.message); if(humano(c)||c?.bot_ativo!==true||c?.status!=="bot")throw new Error("ATENDIMENTO_HUMANO_ASSUMIU"); if(!c.integracao_whatsapp_id||!ctx.pendencia.numero_destino)throw new Error("Conversa sem integração ou destino.");
  const {data:int,error:e}=await db.from("integracoes_whatsapp").select("id,phone_number_id,config_json,token_ref").eq("empresa_id",ctx.pendencia.empresa_id).eq("id",c.integracao_whatsapp_id).maybeSingle(); if(e)throw new Error(e.message); if(!int?.phone_number_id)throw new Error("Integração WhatsApp inválida."); const token=getWhatsAppAccessToken(int); if(!token)throw new Error("Token do WhatsApp indisponível.");
  const envio=await sendWhatsAppTextMessage({phoneNumberId:int.phone_number_id,accessToken:token,to:ctx.pendencia.numero_destino,body:texto}), now=new Date().toISOString(); const {data:prot}=await db.from("conversa_protocolos").select("id").eq("empresa_id",ctx.pendencia.empresa_id).eq("conversa_id",ctx.pendencia.conversa_id).eq("ativo",true).order("created_at",{ascending:false}).limit(1).maybeSingle();
  await db.from("mensagens").insert({empresa_id:ctx.pendencia.empresa_id,conversa_id:ctx.pendencia.conversa_id,conversa_protocolo_id:prot?.id||null,remetente_tipo:"bot",conteudo:texto,tipo_mensagem:"texto",origem:"automatica",status_envio:envio.ok?"enviada":"falha",mensagem_externa_id:envio.messageId,metadata_json:{origem:"agente_ia",agente_id:ctx.pendencia.agente_id,agente_execucao_id:ctx.execucaoId,politica_agenda:true,meta_status:envio.status,meta_error:envio.error},created_at:now,updated_at:now}); if(!envio.ok)throw new Error(envio.error||"Falha ao enviar resposta."); await db.from("conversas").update({last_message_at:now,updated_at:now}).eq("empresa_id",ctx.pendencia.empresa_id).eq("id",ctx.pendencia.conversa_id);
}
async function revalidar(ctx:Ctx,s:Slot){ const tz=ctx.agenda.timezone||"America/Sao_Paulo", r=await listarSlotsDisponiveis({supabase:db,empresaId:ctx.pendencia.empresa_id,agendaId:ctx.agendaId,data:s.data,janelaDias:1,limite:50}); return (r.slots||[]).find((x:any)=>dataLocalDeIso(x.inicio_at,tz)===s.data&&String(x.hora_label)===s.hora)||null; }
async function criar(ctx:Ctx,s:Slot){
  const slot=await revalidar(ctx,s); if(!slot)return {ok:false}; const now=new Date().toISOString(), titulo=tituloAgenda(ctx.agenda.nome); const {data:cont}=ctx.pendencia.contato_id?await db.from("contatos").select("nome,telefone,email").eq("empresa_id",ctx.pendencia.empresa_id).eq("id",ctx.pendencia.contato_id).maybeSingle():({data:null} as any);
  const {data:exist}=await db.from("agenda_agendamentos").select("id,titulo,status").eq("empresa_id",ctx.pendencia.empresa_id).eq("agenda_id",ctx.agendaId).eq("conversa_id",ctx.pendencia.conversa_id).eq("inicio_at",slot.inicio_at).eq("fim_at",slot.fim_at).in("status",["agendado","confirmado"]).maybeSingle(); if(exist)return {ok:true,idempotente:true,agendamento:exist,quando:label(slot,ctx.agenda.timezone||"America/Sao_Paulo")};
  const {data:a,error}=await db.from("agenda_agendamentos").insert({empresa_id:ctx.pendencia.empresa_id,agenda_id:ctx.agendaId,contato_id:ctx.pendencia.contato_id||null,conversa_id:ctx.pendencia.conversa_id,titulo,nome_cliente:cont?.nome||null,telefone_cliente:cont?.telefone||ctx.pendencia.numero_destino||null,email_cliente:cont?.email||null,inicio_at:slot.inicio_at,fim_at:slot.fim_at,status:"agendado",origem:"api",metadata_json:{origem:"agente_ia",agente_id:ctx.pendencia.agente_id,agente_execucao_id:ctx.execucaoId,remarcacao_sem_agendamento_ativo:ctx.remarcacao},created_at:now,updated_at:now}).select("id,titulo,status").single(); if(error||!a)throw new Error(error?.message||"Erro ao criar agendamento."); await sincronizarAgendamentoGoogleCalendar({empresaId:ctx.pendencia.empresa_id,agendaId:ctx.agendaId,agendamentoId:a.id}).catch(console.error); return {ok:true,agendamento:a,quando:label(slot,ctx.agenda.timezone||"America/Sao_Paulo")};
}
async function remarcar(ctx:Ctx,a:any,s:Slot){
  const tz=ctx.agenda.timezone||"America/Sao_Paulo", atual=formatarSlotAgenda(a.inicio_at,a.fim_at,tz); if(dataLocalDeIso(a.inicio_at,tz)===s.data&&String(atual.hora_label)===s.hora)return {ok:true,idempotente:true,quando:label(a,tz)}; const slot=await revalidar(ctx,s); if(!slot)return {ok:false};
  const {data:u,error}=await db.from("agenda_agendamentos").update({inicio_at:slot.inicio_at,fim_at:slot.fim_at,metadata_json:{...(a.metadata_json||{}),origem_ultima_alteracao:"agente_ia",agente_id:ctx.pendencia.agente_id,agente_execucao_id:ctx.execucaoId},updated_at:new Date().toISOString()}).eq("empresa_id",ctx.pendencia.empresa_id).eq("agenda_id",ctx.agendaId).eq("id",a.id).in("status",["agendado","confirmado"]).select("id,titulo,status").single(); if(error||!u)throw new Error(error?.message||"Erro ao remarcar agendamento."); await sincronizarAgendamentoGoogleCalendar({empresaId:ctx.pendencia.empresa_id,agendaId:ctx.agendaId,agendamentoId:u.id}).catch(console.error); return {ok:true,agendamento:u,quando:label(slot,tz)};
}
async function concluir(ctx:Ctx,resposta:string,ferramenta:string,resultado:any,e:Estado){ const now=new Date().toISOString(); await db.from("agente_ia_execucoes").update({status:"concluido",resposta,ferramentas_json:[{nome:ferramenta,argumentos:{},resultado}],tokens_input:0,tokens_output:0,tokens_total:0,finished_at:now,updated_at:now,metadata_json:{politica_agenda:true,estado_estruturado:e,resposta_deterministica_pos_ferramenta:true}}).eq("id",ctx.execucaoId); }

async function executar(ctx:Ctx){
  const {data:c}=await db.from("conversas").select("status,responsavel_id,bot_ativo,aguardando_atendente").eq("empresa_id",ctx.pendencia.empresa_id).eq("id",ctx.pendencia.conversa_id).maybeSingle(); if(humano(c)||c?.bot_ativo!==true||c?.status!=="bot"){await fimPend(ctx,"cancelado","atendimento_humano");return {ok:true,processado:false,motivo:"atendimento_humano"};}
  let resposta="", ferramenta="politica_agenda", resultado:any={ok:true}, e:Estado={...ctx.estado};
  if(ctx.slot){
    if(ctx.remarcacao&&ctx.ativos.length>1){resposta="Encontrei mais de um agendamento ativo. Qual deles você quer remarcar? Me diga a data ou o horário atual.";e={...e,estagio:"remarcação em andamento",proxima_acao:"identificar qual agendamento ativo deve ser remarcado"};}
    else if(ctx.remarcacao&&ctx.ativos.length===1){ferramenta="remarcar_agendamento";resultado=await remarcar(ctx,ctx.ativos[0],ctx.slot);resposta=resultado.ok?`Pronto — ficou remarcado para ${resultado.quando}.`:"Esse horário não está mais disponível. Me diga outro horário que fique bom para você.";e={...e,estagio:resultado.ok?"agendamento remarcado":"remarcação em andamento",proxima_acao:resultado.ok?"acompanhar agendamento":"aguardar nova escolha de horário"};}
    else {ferramenta="criar_agendamento";resultado=await criar(ctx,ctx.slot);resposta=resultado.ok?`Fechado — ficou agendado para ${resultado.quando}.`:"Esse horário não está mais disponível. Me diga outro horário que fique bom para você.";e={...e,estagio:resultado.ok?"agendamento confirmado":(ctx.remarcacao?"remarcação sem agendamento ativo":"agendamento em andamento"),proxima_acao:resultado.ok?"acompanhar agendamento":"aguardar nova escolha de horário"};}
  } else {
    const o=await opcoes(ctx.pendencia,ctx.agenda,ctx.agendaId); if(o.slots.length){const hs=o.slots.map(x=>x.hora.replace(/^0/,"")).join(", ");resposta=ctx.remarcacao?`Claro! Para esse dia tenho ${hs}. Qual horário fica melhor para você?`:`Tenho ${hs} disponíveis. Qual horário fica melhor para você?`;ferramenta="consultar_agenda";resultado={ok:true,slots:o.slots,data:o.data};e={...e,estagio:ctx.remarcacao?(ctx.ativos.length?"remarcação em andamento":"remarcação sem agendamento ativo"):"agendamento em andamento",proxima_acao:"aguardar escolha de horário"};}
    else if(o.data){resposta="Não encontrei horário disponível nesse dia. Qual outro dia ou período fica melhor para você?";ferramenta="consultar_agenda";resultado={ok:true,slots:[],data:o.data};e={...e,estagio:ctx.remarcacao?(ctx.ativos.length?"remarcação em andamento":"remarcação sem agendamento ativo"):"agendamento em andamento",proxima_acao:"aguardar outra preferência de dia ou período"};}
    else {resposta=ctx.remarcacao?"Claro! Qual dia ou período fica melhor para o novo horário?":"Qual dia ou período fica melhor para o agendamento?";resultado={ok:true,aguardando_preferencia:true};e={...e,estagio:ctx.remarcacao?(ctx.ativos.length?"remarcação em andamento":"remarcação sem agendamento ativo"):"agendamento em andamento",proxima_acao:"aguardar preferência de dia ou período"};}
  }
  try{await salvarEstado(ctx,e);await enviar(ctx,resposta);await concluir(ctx,resposta,ferramenta,resultado,e);const mid=ctx.pendencia.mensagem_ids.at(-1)||"";if(resposta.includes("?")&&e.proxima_acao&&mid&&ctx.pendencia.numero_destino){await agendarFollowupAgenteIa({empresaId:ctx.pendencia.empresa_id,agenteId:ctx.pendencia.agente_id,conversaId:ctx.pendencia.conversa_id,numeroDestino:ctx.pendencia.numero_destino,ultimaMensagemContatoId:mid,proximaAcao:String(e.proxima_acao),tentativa:1,referenciaExecucaoId:ctx.execucaoId,cancelarAnteriores:true}).catch(console.error);}else await cancelarFollowupsPendentesAgenteIa({empresaId:ctx.pendencia.empresa_id,conversaId:ctx.pendencia.conversa_id,motivo:"politica_agenda_sem_espera"}).catch(console.error);await fimPend(ctx,"processado");return {ok:true,processado:true,runtime:"politica_agenda",execucaoId:ctx.execucaoId,ferramenta};}
  catch(err){const m=err instanceof Error?err.message:String(err), h=m==="ATENDIMENTO_HUMANO_ASSUMIU";await db.from("agente_ia_execucoes").update({status:h?"cancelado":"erro",erro:h?"atendimento_humano":m,finished_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",ctx.execucaoId);await fimPend(ctx,h?"cancelado":"erro",h?"atendimento_humano":m);if(h)return {ok:true,processado:false,motivo:"atendimento_humano"};throw err;}
}

export async function processarPoliticaAgendaPendencia(pendenciaId:string,options:{forcar?:boolean}={}):Promise<{tratado:boolean;resultado?:any}>{
  const {data:s,error}=await db.from("agente_ia_pendencias").select("id,empresa_id,agente_id,conversa_id,contato_id,numero_destino,mensagem_ids,conteudo_agregado,status,versao").eq("id",pendenciaId).maybeSingle(); if(error)throw new Error(error.message); if(!s||["processado","erro","cancelado"].includes(String(s.status||"")))return {tratado:false}; const p=s as Pendencia;
  const cfg=await configAgenda(p.empresa_id,p.agente_id); if(!cfg)return {tratado:false}; const e=await estadoAtual(p), remExp=pedidoRemarca(p.conteudo_agregado), rem=remExp||estadoRemarca(e), emCurso=agendaEmCurso(e), recentes=await slotsRecentes(p), slot=await slotEscolhido(p,cfg.agenda,cfg.agendaId,recentes), i=interpretarDataHorarioAgenda(p.conteudo_agregado,cfg.agenda.timezone||"America/Sao_Paulo"), ref=Boolean(i.data||i.preferencia||horaMensagem(p.conteudo_agregado)||ordinal(p.conteudo_agregado)!==null); if(!(remExp||(rem&&ref)||(emCurso&&slot)))return {tratado:false};
  const [saldo,det,ats,ag]=await Promise.all([buscarSaldoTokensIa(p.empresa_id),detectarAutomacaoExterna({empresaId:p.empresa_id,conversaId:p.conversa_id,conteudoAgregado:p.conteudo_agregado}),ativos(p,cfg.agendaId),db.from("agentes_ia").select("id").eq("empresa_id",p.empresa_id).eq("id",p.agente_id).eq("status","ativo").maybeSingle()]); if(!ag.data||det.detectado||(saldo.limite!==null&&Number(saldo.restantes||0)<=0)||(rem&&ats.length>0&&!cfg.podeRemarcar))return {tratado:false};
  const lock=crypto.randomUUID(), {data:r,error:re}=await db.rpc("agente_ia_reservar_pendencia",{p_pendencia_id:pendenciaId,p_lock_token:lock,p_forcar:options.forcar===true}); if(re)throw new Error(re.message); if(!r)return {tratado:true,resultado:{ok:true,processado:false,motivo:"pendencia_indisponivel_ou_debounce"}}; const pr=r as Pendencia, ex=await abrir(pr), ctx:Ctx={pendencia:pr,lockToken:lock,agenda:cfg.agenda,agendaId:cfg.agendaId,estado:e,ativos:ats,slot,remarcacao:rem,execucaoId:ex,mensagem:pr.conteudo_agregado}; return {tratado:true,resultado:await executar(ctx)};
}
