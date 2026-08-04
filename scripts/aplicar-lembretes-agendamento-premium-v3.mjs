import fs from "node:fs";

const marker = "CRM_AGENDA_REMINDERS_PREMIUM_RULES_V3";
const pagePath = "src/app/(private)/agendas/page.tsx";
const mappingPath =
  "src/app/(private)/agendas/AgendaTemplateMappingEnhancer.tsx";
const premiumPath =
  "src/app/(private)/agendas/AgendaPremiumRuntimeEnhancer.tsx";

function replaceRequired(source, search, replacement, description) {
  if (!source.includes(search)) {
    throw new Error(`Não foi possível aplicar ${description}.`);
  }
  return source.replace(search, replacement);
}

let page = fs.readFileSync(pagePath, "utf8");

if (!page.includes(marker)) {
  page = replaceRequired(
    page,
    'participantes:[],vinculos:[],lembretes:[{canal:"sistema",antecedencia_minutos:60,destinatario_tipo:"responsavel",ativo:true}],confirmacao_status:',
    'participantes:[],vinculos:[],lembretes:[],confirmacao_status:',
    "a abertura de novos agendamentos sem lembrete automático"
  );

  const currentChannel = `<select value={r.canal} onChange={e=>setForm({...form,lembretes:form.lembretes.map((x,n)=>n===i?{...x,canal:e.target.value,metadata_json:e.target.value==="whatsapp"?(x.metadata_json||{}):x.metadata_json}:x)})}><option value="sistema">Sistema</option><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option></select>`;
  const restrictedChannel = `<select value={r.canal} onChange={e=>{const canal=e.target.value;setForm({...form,lembretes:form.lembretes.map((x,n)=>n===i?{...x,canal,metadata_json:canal==="whatsapp"?(x.metadata_json||{}):x.metadata_json}:x)})}}>{r.destinatario_tipo==="responsavel"?<><option value="sistema">Sistema</option><option value="email">E-mail</option></>:<><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option></>}</select>`;
  page = replaceRequired(
    page,
    currentChannel,
    restrictedChannel,
    "as opções de canal por destinatário"
  );

  const currentRecipient = `<select value={r.destinatario_tipo} onChange={e=>setForm({...form,lembretes:form.lembretes.map((x,n)=>n===i?{...x,destinatario_tipo:e.target.value}:x)})}><option value="responsavel">Responsável</option><option value="cliente">Cliente</option><option value="participantes">Participantes</option></select>`;
  const normalizedRecipient = `<select value={r.destinatario_tipo} onChange={e=>{const destinatario_tipo=e.target.value;setForm({...form,lembretes:form.lembretes.map((x,n)=>{if(n!==i)return x;const canal=destinatario_tipo==="responsavel"?(x.canal==="whatsapp"?"sistema":x.canal):(x.canal==="sistema"?"email":x.canal);return{...x,destinatario_tipo,canal,metadata_json:canal==="whatsapp"?(x.metadata_json||{}):x.metadata_json}})})}}><option value="responsavel">Responsável</option><option value="cliente">Cliente</option><option value="participantes">Participantes</option></select>`;
  page = replaceRequired(
    page,
    currentRecipient,
    normalizedRecipient,
    "a normalização do canal ao trocar o destinatário"
  );

  page = replaceRequired(
    page,
    `<small>Crie avisos extras somente para este compromisso. Eles serão processados e exibidos junto das automações em Disparos agendados.</small>{form.lembretes.map`,
    `<small>Crie avisos extras somente para este compromisso. Eles serão processados e exibidos junto das automações em Disparos agendados.</small>{form.lembretes.length===0&&<div className="empty">Nenhum lembrete adicional. Clique em Lembrete para configurar um envio.</div>}{form.lembretes.map`,
    "o estado vazio dos lembretes"
  );

  page = replaceRequired(
    page,
    `<div className="field" style={{marginTop:8}}><label>Status da confirmação</label><select value={form.confirmacao_status} onChange={e=>setForm({...form,confirmacao_status:e.target.value})}><option value="pendente">Pendente</option><option value="confirmado">Confirmado</option><option value="recusado">Recusado</option><option value="dispensado">Não solicitar</option></select></div>`,
    "",
    "a remoção do status manual de confirmação"
  );

  page = replaceRequired(
    page,
    "const blank=",
    `// ${marker}\nconst blank=`,
    "o marcador das regras premium"
  );

  fs.writeFileSync(pagePath, page, "utf8");
}

let mapping = fs.readFileSync(mappingPath, "utf8");
mapping = mapping
  .replaceAll('.a2 .drawer .repeat.rem', '.a2 .drawer .repeat')
  .replaceAll(
    "body .a2 .repeat.rem",
    "body .a2 .repeat.agendaIndividualTemplateBound"
  )
  .replaceAll("(loaded as any).variables", "loaded.variables");
fs.writeFileSync(mappingPath, mapping, "utf8");

let premium = fs.readFileSync(premiumPath, "utf8");
premium = premium
  .replaceAll(".repeat.rem.agendaReminderCard", ".repeat.agendaReminderCard")
  .replaceAll('querySelectorAll<HTMLElement>(".repeat.rem")', 'querySelectorAll<HTMLElement>(".repeat")');

const premiumCardMarker = "CRM_AGENDA_INTERVAL_CARD_PREMIUM_V4";
if (!premium.includes(premiumCardMarker)) {
  const responsiveAnchor = "\n@media(max-width:760px){";
  premium = replaceRequired(
    premium,
    responsiveAnchor,
    `
/* ${premiumCardMarker} */
body .a2 .agendaPremiumDayCard{
  position:relative!important;
  padding:14px!important;
  border-color:color-mix(in srgb,var(--crm-primary-border) 72%,var(--crm-border))!important;
  border-radius:18px!important;
  background:radial-gradient(circle at 94% 0,color-mix(in srgb,var(--crm-primary-soft) 72%,transparent),transparent 34%),linear-gradient(145deg,var(--crm-surface),color-mix(in srgb,var(--crm-surface-soft) 72%,var(--crm-surface)))!important;
  box-shadow:0 14px 32px color-mix(in srgb,var(--crm-primary-strong) 8%,transparent),inset 0 1px 0 color-mix(in srgb,var(--crm-text-inverse) 72%,transparent)!important;
}
body .a2 .agendaPremiumDayCard:before{
  content:"";
  position:absolute;
  inset:0 16px auto;
  height:3px;
  border-radius:0 0 999px 999px;
  background:linear-gradient(90deg,var(--crm-primary-strong),var(--crm-success-strong));
}
body .a2 .agendaPremiumDayCard .av{padding-top:7px!important}
body .a2 .repeat.agendaReminderCard{
  position:relative!important;
  border-color:color-mix(in srgb,var(--crm-primary-border) 62%,var(--crm-border))!important;
  background:linear-gradient(145deg,var(--crm-surface),color-mix(in srgb,var(--crm-primary-soft) 20%,var(--crm-surface)))!important;
  box-shadow:0 10px 24px color-mix(in srgb,var(--crm-primary-strong) 7%,transparent)!important;
}
${responsiveAnchor}`,
    "o acabamento premium dos cards de intervalo e lembrete"
  );
}
fs.writeFileSync(premiumPath, premium, "utf8");

console.log(
  "Cards premium, mapeamento de templates e regras de canais dos lembretes aplicados."
);
