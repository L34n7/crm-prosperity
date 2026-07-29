import { readFile, writeFile } from "node:fs/promises";

const pagePath = "src/app/(private)/agendas/page.tsx";
const automationEnhancerPath =
  "src/app/(private)/agendas/AgendaAutomationEnhancer.tsx";
const automationEnginePath =
  "src/lib/automacoes/process-automation-engine.ts";

function replaceOnce(source, oldValue, newValue, label) {
  const occurrences = source.split(oldValue).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: esperado 1 trecho, encontrado ${occurrences}`);
  }
  return source.replace(oldValue, newValue);
}

let page = await readFile(pagePath, "utf8");

const cssAnchor =
  '.modal .dhead,.modal .body,.modal .foot{padding:13px 15px}';

if (!page.includes("agendaTimeUnitControl")) {
  const agendaTimeCss =
    '.agendaTimeUnitControl{display:grid;grid-template-columns:minmax(0,1fr) 108px;gap:7px;align-items:center}.agendaTimeUnitControl input,.agendaTimeUnitControl select{width:100%!important}.agendaTimeUnitControl select{height:38px;border:1px solid #d8e0ea;border-radius:8px;padding:0 8px;background:#fff;color:#263348;font-weight:700}.agendaTemplateShell .a2 .drawer .foot>div:first-child{display:flex!important;align-items:center!important;gap:10px!important;flex-wrap:nowrap!important}.eventFooterAction{width:160px!important;min-width:160px!important;flex:0 0 160px!important;justify-content:center!important;white-space:nowrap!important}.agendaTemplateShell .a2 .drawer .agendaGoogleDrawerTools{display:inline-flex!important;align-items:center!important;gap:0!important;flex-wrap:nowrap!important;margin:0!important}.agendaTemplateShell .a2 .drawer .agendaGoogleEventOpen{width:160px!important;min-width:160px!important;flex:0 0 160px!important;justify-content:center!important;white-space:nowrap!important}@media(max-width:760px){.agendaTimeUnitControl{grid-template-columns:minmax(0,1fr) 98px}.agendaTemplateShell .a2 .drawer .foot>div:first-child{width:100%;gap:8px!important}.eventFooterAction,.agendaTemplateShell .a2 .drawer .agendaGoogleEventOpen{width:auto!important;min-width:0!important;flex:1 1 0!important}}';
  page = replaceOnce(page, cssAnchor, `${cssAnchor}${agendaTimeCss}`, "estilos das unidades e ações do agendamento");
}

if (!page.includes("cancelConfirmBg")) {
  const cancelCss =
    '.cancelConfirmBg{z-index:1300;backdrop-filter:blur(3px)}.confirmModal{width:min(440px,94vw);background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 24px 70px #0f172a40;overflow:hidden}.confirmBody{padding:22px 22px 18px}.confirmIcon{width:46px;height:46px;border-radius:14px;background:#fff1f2;color:#c32640;display:grid;place-items:center;margin-bottom:14px}.confirmBody h2{margin:0;font-size:20px;color:#172033}.confirmBody p{margin:8px 0 0;color:#667085;font-size:13px;line-height:1.55}.confirmSummary{display:flex;align-items:center;gap:10px;margin-top:16px;padding:12px;border:1px solid #e5eaf1;border-radius:11px;background:#f8fafc;color:#405066}.confirmSummary div{display:grid;gap:2px}.confirmSummary b{font-size:12px}.confirmSummary span{font-size:11px;color:#748095}.confirmActions{display:flex;justify-content:flex-end;gap:10px;padding:14px 18px;background:#f8fafc;border-top:1px solid #e5eaf1}.confirmDanger{background:#fff!important;border-color:#f2a8b3!important;color:#b4233b!important}.confirmDanger:hover:not(:disabled){background:#c32640!important;border-color:#c32640!important;color:#fff!important;box-shadow:0 7px 18px #c3264030}';
  page = replaceOnce(page, cssAnchor, `${cssAnchor}${cancelCss}`, "estilos do modal de cancelamento");
}

if (!page.includes("agendaSideBadge-agendado")) {
  const sideBadgeCss =
    '.agendaSideBadge{border:1px solid transparent;font-weight:850;line-height:1.15}.agendaSideBadge-agendado{background:var(--crm-success-bg)!important;border-color:var(--crm-success-border)!important;color:var(--crm-success-text)!important}.agendaSideBadge-cancelado{background:var(--crm-danger-bg)!important;border-color:var(--crm-danger-border)!important;color:var(--crm-danger-text)!important}.agendaSideBadge-google{background:var(--crm-warning-bg)!important;border-color:var(--crm-warning-border)!important;color:var(--crm-warning-text)!important}';
  page = replaceOnce(
    page,
    cssAnchor,
    `${cssAnchor}${sideBadgeCss}`,
    "cores dos badges laterais da agenda"
  );
  page = replaceOnce(
    page,
    '<span className={`pill ${["confirmado","realizado"].includes(a.status)?"on":""}`}>{labels[a.status]}</span>',
    '<span className={`pill agendaSideBadge agendaSideBadge-${a.status} ${["confirmado","realizado"].includes(a.status)?"on":""}`}>{labels[a.status]}</span>',
    "badge de status do painel lateral"
  );
  page = replaceOnce(
    page,
    '<span className="pill">Google</span>',
    '<span className="pill agendaSideBadge agendaSideBadge-google">Google</span>',
    "badge do Google no painel lateral"
  );
}

const stateAnchor =
  ' const [filter,setFilter]=useState({q:"",status:"todos",tipo:"todos",resp:"todos",origem:"todos"}),[open,setOpen]=useState(false),[form,setForm]=useState<Form>(()=>blank(key(new Date()))),[contact,setContact]=useState<Contato|null>(null),[cq,setCq]=useState(""),[contacts,setContacts]=useState<Contato[]>([]);';
if (!page.includes("cancelConfirm,setCancelConfirm")) {
  page = replaceOnce(page, stateAnchor, `${stateAnchor}\n const [cancelConfirm,setCancelConfirm]=useState(false);`, "estado do modal de cancelamento");
}

const configStateAnchor =
  ' const [config,setConfig]=useState(false),[configNew,setConfigNew]=useState(false),[af,setAf]=useState({nome:"",descricao:"",duracao_minutos:"60",intervalo_minutos:"30",antecedencia_minutos:"120",janela_dias:"14",status:"ativo"}),[disp,setDisp]=useState<Disp[]>(dias.map((_,i)=>({dia_semana:i,hora_inicio:"09:00",hora_fim:"18:00",ativo:i>0&&i<6})));';
if (!page.includes("unidadeDuracaoAgenda")) {
  page = replaceOnce(page, configStateAnchor, `${configStateAnchor}\n const [unidadeDuracaoAgenda,setUnidadeDuracaoAgenda]=useState<"minutos"|"horas">("minutos"),[unidadeIntervaloAgenda,setUnidadeIntervaloAgenda]=useState<"minutos"|"horas">("minutos"),[unidadeAntecedenciaAgenda,setUnidadeAntecedenciaAgenda]=useState<"minutos"|"horas">("minutos");`, "estados das unidades de tempo");
}

const refreshAnchor =
  ' const refresh=async()=>{if(!agendaId)return;try{setBusy(true);';
if (!page.includes("ajustarInicioComDuracaoAgenda")) {
  page = replaceOnce(page, refreshAnchor, ` const ajustarInicioComDuracaoAgenda=(inicioAt:string)=>{setForm(atual=>{const duracaoMinutos=Math.max(1,Number(agenda?.duracao_minutos||60));const inicio=new Date(inicioAt);if(Number.isNaN(inicio.getTime()))return{...atual,inicio_at:inicioAt};const fim=new Date(inicio.getTime()+duracaoMinutos*60*1000);return{...atual,inicio_at:inicioAt,fim_at:local(fim.toISOString())}})};\n${refreshAnchor}`, "ajuste automático do horário final");
  page = replaceOnce(page, '<input type="datetime-local" value={form.inicio_at} onChange={e=>setForm({...form,inicio_at:e.target.value})}/>', '<input type="datetime-local" value={form.inicio_at} onChange={e=>ajustarInicioComDuracaoAgenda(e.target.value)}/>', "campo de início do agendamento");
}

if (!page.includes("valorTempoAgenda")) {
  const timeHelpers = ` const valorTempoAgenda=(valorMinutos:string,unidade:"minutos"|"horas")=>{if(valorMinutos==="")return"";const minutos=Number(valorMinutos);if(!Number.isFinite(minutos))return valorMinutos;if(unidade==="minutos")return String(minutos);const horas=minutos/60;return String(Number(horas.toFixed(2)))};\n const atualizarTempoAgenda=(campo:"duracao_minutos"|"intervalo_minutos"|"antecedencia_minutos",valor:string,unidade:"minutos"|"horas")=>{setAf(atual=>({...atual,[campo]:valor===""?"":String(Math.max(0,Number(valor)||0)*(unidade==="horas"?60:1))}))};\n`;
  page = replaceOnce(page, refreshAnchor, `${timeHelpers}${refreshAnchor}`, "conversão das unidades de tempo");
}

const openConfigAnchor = ' const openConfig=async(isNew:boolean)=>{setConfigNew(isNew);';
if (!page.includes('setUnidadeDuracaoAgenda("minutos")')) {
  page = replaceOnce(page, openConfigAnchor, ' const openConfig=async(isNew:boolean)=>{setConfigNew(isNew);setUnidadeDuracaoAgenda("minutos");setUnidadeIntervaloAgenda("minutos");setUnidadeAntecedenciaAgenda("minutos");', "reinício das unidades ao abrir a configuração");
}

if (!page.includes('className="agendaTimeUnitControl"')) {
  const durationAnchor = '<div className="field"><label>Duração padrão</label><input type="number" value={af.duracao_minutos} onChange={e=>setAf({...af,duracao_minutos:e.target.value})}/></div>';
  const durationBlock = '<div className="field"><label>Duração padrão</label><div className="agendaTimeUnitControl"><input type="number" min={unidadeDuracaoAgenda==="horas"?"0.25":"1"} step={unidadeDuracaoAgenda==="horas"?"0.25":"1"} value={valorTempoAgenda(af.duracao_minutos,unidadeDuracaoAgenda)} onChange={e=>atualizarTempoAgenda("duracao_minutos",e.target.value,unidadeDuracaoAgenda)}/><select value={unidadeDuracaoAgenda} onChange={e=>setUnidadeDuracaoAgenda(e.target.value as "minutos"|"horas")} aria-label="Unidade da duração padrão"><option value="minutos">minutos</option><option value="horas">horas</option></select></div></div>';
  page = replaceOnce(page, durationAnchor, durationBlock, "unidade da duração padrão");
  const intervalAnchor = '<div className="field"><label>Intervalo</label><input type="number" value={af.intervalo_minutos} onChange={e=>setAf({...af,intervalo_minutos:e.target.value})}/></div>';
  const intervalBlock = '<div className="field"><label>Intervalo</label><div className="agendaTimeUnitControl"><input type="number" min="0" step={unidadeIntervaloAgenda==="horas"?"0.25":"1"} value={valorTempoAgenda(af.intervalo_minutos,unidadeIntervaloAgenda)} onChange={e=>atualizarTempoAgenda("intervalo_minutos",e.target.value,unidadeIntervaloAgenda)}/><select value={unidadeIntervaloAgenda} onChange={e=>setUnidadeIntervaloAgenda(e.target.value as "minutos"|"horas")} aria-label="Unidade do intervalo"><option value="minutos">minutos</option><option value="horas">horas</option></select></div></div>';
  page = replaceOnce(page, intervalAnchor, intervalBlock, "unidade do intervalo");
  const leadAnchor = '<div className="field"><label>Antecedência mínima</label><input type="number" value={af.antecedencia_minutos} onChange={e=>setAf({...af,antecedencia_minutos:e.target.value})}/></div>';
  const leadBlock = '<div className="field"><label>Antecedência mínima</label><div className="agendaTimeUnitControl"><input type="number" min="0" step={unidadeAntecedenciaAgenda==="horas"?"0.25":"1"} value={valorTempoAgenda(af.antecedencia_minutos,unidadeAntecedenciaAgenda)} onChange={e=>atualizarTempoAgenda("antecedencia_minutos",e.target.value,unidadeAntecedenciaAgenda)}/><select value={unidadeAntecedenciaAgenda} onChange={e=>setUnidadeAntecedenciaAgenda(e.target.value as "minutos"|"horas")} aria-label="Unidade da antecedência mínima"><option value="minutos">minutos</option><option value="horas">horas</option></select></div></div>';
  page = replaceOnce(page, leadAnchor, leadBlock, "unidade da antecedência mínima");
}

const cancelButtonAnchor = '<button className="btn danger" onClick={()=>confirm("Cancelar este agendamento?")&&save("cancelado")}><X size={15}/>Cancelar evento</button>';
if (page.includes(cancelButtonAnchor)) {
  page = replaceOnce(page, cancelButtonAnchor, '<button className="btn danger eventFooterAction" onClick={()=>setCancelConfirm(true)}><X size={15}/>Cancelar evento</button>', "abertura do modal de cancelamento");
}

const configAnchor = ' {config&&<div className="modalbg">';
if (!page.includes('cancelConfirm&&<div className="modalbg cancelConfirmBg"')) {
  const confirmModal = ` {cancelConfirm&&<div className="modalbg cancelConfirmBg" onMouseDown={e=>e.target===e.currentTarget&&!busy&&setCancelConfirm(false)}><div className="confirmModal" role="dialog" aria-modal="true" aria-labelledby="cancel-event-title"><div className="confirmBody"><div className="confirmIcon"><X size={22}/></div><h2 id="cancel-event-title">Cancelar evento?</h2><p>O agendamento <strong>{form.titulo||"selecionado"}</strong> será marcado como cancelado. Esta ação ficará registrada no histórico.</p><div className="confirmSummary"><CalendarDays size={18}/><div><b>{dt(iso(form.inicio_at))}</b><span>{form.nome_cliente||contact?.nome||"Cliente não informado"}</span></div></div></div><div className="confirmActions"><button className="btn" onClick={()=>setCancelConfirm(false)} disabled={busy}>Voltar</button><button className="btn confirmDanger" onClick={()=>{setCancelConfirm(false);void save("cancelado")}} disabled={busy}>{busy?<RefreshCw className="spin" size={15}/>:<X size={15}/>}Cancelar evento</button></div></div></div>}\n${configAnchor}`;
  page = replaceOnce(page, configAnchor, confirmModal, "modal de confirmação");
}

await writeFile(pagePath, page, "utf8");

let automationEnhancer = await readFile(automationEnhancerPath, "utf8");
if (!automationEnhancer.includes('availability.insertAdjacentElement("afterend", section)')) {
  automationEnhancer = replaceOnce(automationEnhancer, `      const form = modal.querySelector<HTMLElement>(".body > .form");\n      if (!form) return;`, `      const body = modal.querySelector<HTMLElement>(".body");\n      const form = modal.querySelector<HTMLElement>(".body > .form");\n      if (!body || !form) return;`, "corpo do modal de automação");
  automationEnhancer = replaceOnce(automationEnhancer, '      let section = form.querySelector<HTMLElement>(".agendaAutomationSection");', '      let section = modal.querySelector<HTMLElement>(".agendaAutomationSection");', "busca da seção de automação");
  automationEnhancer = replaceOnce(automationEnhancer, `      const google = form.querySelector<HTMLElement>(".agendaGoogleConfigCard, .agendaGoogleCreateOption");\n      if (google) google.insertAdjacentElement("afterend", section);\n      else form.appendChild(section);`, `      const availability = modal.querySelector<HTMLElement>(".availability");\n      if (availability) availability.insertAdjacentElement("afterend", section);\n      else body.appendChild(section);`, "posição final da automação da agenda");
  await writeFile(automationEnhancerPath, automationEnhancer, "utf8");
}

let automationEngine = await readFile(automationEnginePath, "utf8");
if (!automationEngine.includes("permitirFallbackSempreAposValidacao")) {
  automationEngine = replaceOnce(
    automationEngine,
    `async function seguirParaProximoNo(params: {
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  fluxoId: string;
  noAtualId: string;
  mensagemTexto?: string;
  numeroDestino: string;
  runtimeCache?: FluxoRuntimeCache;
}) {
  const {
    empresaId,
    conversaId,
    execucaoId,
    fluxoId,
    noAtualId,
    mensagemTexto,
    numeroDestino,
    runtimeCache,
  } = params;`,
    `async function seguirParaProximoNo(params: {
  empresaId: string;
  conversaId: string;
  execucaoId: string;
  fluxoId: string;
  noAtualId: string;
  mensagemTexto?: string;
  numeroDestino: string;
  runtimeCache?: FluxoRuntimeCache;
  permitirFallbackSempreAposValidacao?: boolean;
}) {
  const {
    empresaId,
    conversaId,
    execucaoId,
    fluxoId,
    noAtualId,
    mensagemTexto,
    numeroDestino,
    runtimeCache,
    permitirFallbackSempreAposValidacao = false,
  } = params;`,
    "configuração do fallback após validação interna"
  );

  automationEngine = replaceOnce(
    automationEngine,
    `      }
    }

    if (!conexaoEscolhida) {
      const { data: execucaoAtual } = await supabaseAdmin`,
    `      }
    }

    if (
      !conexaoEscolhida &&
      permitirFallbackSempreAposValidacao &&
      conexoesSempre.length > 0
    ) {
      conexaoEscolhida = conexoesSempre[0];
    }

    if (!conexaoEscolhida) {
      const { data: execucaoAtual } = await supabaseAdmin`,
    "fallback sempre para resposta já validada pelo bloco"
  );

  automationEngine = replaceOnce(automationEngine, `          mensagemTexto: "encontrado",\n          numeroDestino,\n          runtimeCache,\n        });`, `          mensagemTexto: "encontrado",\n          numeroDestino,\n          runtimeCache,\n          permitirFallbackSempreAposValidacao: true,\n        });`, "continuação após escolher agendamento");
  automationEngine = replaceOnce(automationEngine, `          mensagemTexto: "slot_escolhido",\n          numeroDestino,\n          runtimeCache,\n        });`, `          mensagemTexto: "slot_escolhido",\n          numeroDestino,\n          runtimeCache,\n          permitirFallbackSempreAposValidacao: true,\n        });`, "continuação após escolher horário");

  await writeFile(automationEnginePath, automationEngine, "utf8");
}

console.log("Configurações da agenda e seleção de agendamentos ajustadas.");
