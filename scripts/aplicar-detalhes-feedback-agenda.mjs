import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const marker = "CRM_AGENDA_FEEDBACK_DETAILS_V1";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function replaceRequired(content, search, replacement, description) {
  if (content.includes(replacement)) return content;
  if (!content.includes(search)) {
    throw new Error(`Não foi possível aplicar ${description}.`);
  }
  return content.replace(search, replacement);
}

const routePath = "src/app/api/agendas/feedback/route.ts";
let route = read(routePath);

if (!route.includes(marker)) {
  route = replaceRequired(
    route,
    `const RESULTADOS_VALIDOS = ["realizado", "faltou", "cancelado"] as const;`,
    `// ${marker}\nconst RESULTADOS_VALIDOS = ["realizado", "faltou", "cancelado"] as const;`,
    "marcador dos detalhes do feedback da agenda"
  );

  route = replaceRequired(
    route,
    `        conversa_id,\n        nome_cliente,\n        telefone_cliente,\n        inicio_at,`,
    `        conversa_id,\n        titulo,\n        tipo_id,\n        responsavel_id,\n        prioridade,\n        origem,\n        local,\n        link_reuniao,\n        observacoes,\n        nome_cliente,\n        telefone_cliente,\n        email_cliente,\n        inicio_at,`,
    "campos de identificação do agendamento no feedback"
  );

  route = replaceRequired(
    route,
    `          nome,\n          telefone\n        )`,
    `          nome,\n          telefone,\n          email\n        )`,
    "e-mail do contato no feedback do agendamento"
  );
}

write(routePath, route);

const pagePath = "src/app/(private)/agendas/page.tsx";
let page = read(pagePath);

if (!page.includes(marker)) {
  const helperAnchor = `const range=(m:Date)=>({start:new Date(m.getFullYear(),m.getMonth(),1).toISOString(),end:new Date(m.getFullYear(),m.getMonth()+1,1).toISOString()});`;
  const helpers = `// ${marker}\nconst relationOne=(value:any)=>Array.isArray(value)?value[0]||null:value||null;\nconst feedbackOriginLabel=(value?:string|null)=>{const origem=String(value||"").toLowerCase();if(origem==="automacao")return"Automação";if(origem==="api")return"API";if(origem==="google")return"Google";return"Manual"};\n${helperAnchor}`;

  page = replaceRequired(
    page,
    helperAnchor,
    helpers,
    "helpers do card de resultado pendente"
  );

  const cssAnchor = `@media(max-width:1100px){.layout{grid-template-columns:1fr}.aside{grid-template-columns:1fr 1fr}.stats{grid-template-columns:repeat(3,1fr)}}`;
  const feedbackCss = `.feedbackCard{background:var(--crm-ui-private-surface-hex-fff7e4);border:1px solid var(--crm-ui-private-border-hex-f3d990);border-radius:14px;padding:13px 14px;margin-bottom:12px;display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:13px;box-shadow:0 3px 12px var(--crm-ui-private-shadow-hex-14213d0a)}.feedbackIcon{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:var(--crm-surface);color:var(--crm-ui-private-content-hex-9a6700);border:1px solid var(--crm-ui-private-border-hex-f3d990)}.feedbackMain{min-width:0;display:grid;gap:5px}.feedbackHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.feedbackHeadLabel{font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--crm-ui-private-content-hex-9a6700)}.feedbackCounter{font-size:9px;font-weight:800;border-radius:99px;padding:3px 7px;background:var(--crm-surface);border:1px solid var(--crm-ui-private-border-hex-f3d990);color:var(--crm-ui-private-content-hex-6e5a18)}.feedbackTitle{display:block;font-size:15px;line-height:1.25;color:var(--crm-ui-private-content-hex-172033);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.feedbackClient{display:flex;align-items:center;gap:5px;min-width:0;font-size:11px;color:var(--crm-ui-private-content-hex-405066)}.feedbackClient b,.feedbackClient span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.feedbackMeta{display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;margin-top:2px}.feedbackMetaItem{display:inline-flex;align-items:center;gap:5px;min-width:0;font-size:10px;color:var(--crm-ui-private-content-hex-667085)}.feedbackMetaItem svg{flex:0 0 auto}.feedbackMetaItem strong{color:var(--crm-ui-private-content-hex-405066)}.feedbackActions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap;max-width:360px}.feedbackActions .btn{height:32px;font-size:11px;white-space:nowrap}.feedbackOpen{background:var(--crm-surface)}.feedbackSuccess{background:var(--crm-surface);border-color:var(--crm-ui-private-border-hex-b7e4d6);color:var(--crm-ui-private-content-hex-08785a)}.feedbackMissed{background:var(--crm-surface);border-color:var(--crm-ui-private-border-hex-ffc6cf);color:var(--crm-ui-private-content-hex-c32640)}@media(max-width:980px){.feedbackCard{grid-template-columns:38px minmax(0,1fr)}.feedbackIcon{width:38px;height:38px}.feedbackActions{grid-column:1/-1;max-width:none;justify-content:flex-end;border-top:1px solid var(--crm-ui-private-border-hex-f3d990);padding-top:10px}}@media(max-width:620px){.feedbackCard{grid-template-columns:1fr;padding:12px}.feedbackIcon{display:none}.feedbackTitle{white-space:normal}.feedbackActions{justify-content:stretch}.feedbackActions .btn{flex:1}.feedbackOpen{flex-basis:100%!important}}\n${cssAnchor}`;

  page = replaceRequired(
    page,
    cssAnchor,
    feedbackCss,
    "estilos responsivos do card de resultado pendente"
  );

  const bannerBefore = `{feedbacks.length>0&&<div className="banner"><Clock3 size={16}/><strong>{feedbacks.length} resultado{feedbacks.length>1?"s":""} pendente{feedbacks.length>1?"s":""}</strong><span>{feedbacks[0].nome_cliente||"Cliente"}</span><button className="btn" style={{height:30}} onClick={()=>answer(feedbacks[0].id,"realizado")}><Check size={13}/>Realizado</button><button className="btn" style={{height:30}} onClick={()=>answer(feedbacks[0].id,"faltou")}>Não compareceu</button></div>}`;
  const bannerAfter = `{feedbacks.length>0&&(()=>{const feedback=feedbacks[0],contato=relationOne(feedback.contatos),calendario=relationOne(feedback.agenda_calendarios),nomeCliente=feedback.nome_cliente||contato?.nome||"Cliente não informado",telefone=feedback.telefone_cliente||contato?.telefone||"";const abrirDetalhes=()=>{const agendamento=ags.find(a=>a.id===feedback.id);if(agendamento){edit(agendamento);return}const data=new Date(feedback.inicio_at);if(feedback.agenda_id&&feedback.agenda_id!==agendaId)setAgendaId(feedback.agenda_id);setMonth(new Date(data.getFullYear(),data.getMonth(),1));setDay(key(data))};return <section className="feedbackCard"><div className="feedbackIcon"><Clock3 size={19}/></div><div className="feedbackMain"><div className="feedbackHead"><span className="feedbackHeadLabel">Confirme o resultado do agendamento</span><span className="feedbackCounter">{feedbacks.length} pendente{feedbacks.length>1?"s":""}</span></div><strong className="feedbackTitle">{feedback.titulo||"Agendamento"}</strong><div className="feedbackClient"><UserRound size={13}/><b>{nomeCliente}</b>{telefone&&<span>· {telefone}</span>}</div><div className="feedbackMeta"><span className="feedbackMetaItem"><CalendarDays size={13}/><strong>{dt(feedback.inicio_at)}</strong>{feedback.fim_at&&<span>até {time(feedback.fim_at)}</span>}</span><span className="feedbackMetaItem"><CalendarDays size={13}/><span>Calendário: <strong>{calendario?.nome||"Não informado"}</strong></span></span><span className="feedbackMetaItem"><span>Status: <strong>{labels[feedback.status]||feedback.status||"Agendado"}</strong></span></span><span className="feedbackMetaItem"><span>Origem: <strong>{feedbackOriginLabel(feedback.origem)}</strong></span></span>{feedback.local&&<span className="feedbackMetaItem"><span>Local: <strong>{feedback.local}</strong></span></span>}</div></div><div className="feedbackActions"><button className="btn feedbackOpen" onClick={abrirDetalhes}><ExternalLink size={13}/>Detalhes</button><button className="btn feedbackSuccess" onClick={()=>answer(feedback.id,"realizado")}><Check size={13}/>Realizado</button><button className="btn feedbackMissed" onClick={()=>answer(feedback.id,"faltou")}><X size={13}/>Não compareceu</button></div></section>})()}`;

  page = replaceRequired(
    page,
    bannerBefore,
    bannerAfter,
    "card detalhado de confirmação do resultado"
  );
}

write(pagePath, page);

console.log(
  "Card de resultado pendente enriquecido com agendamento, cliente, horário, calendário, origem, status e local."
);
