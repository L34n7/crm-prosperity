import { readFileSync, writeFileSync } from "node:fs";

function replaceRequired(source, search, replacement, description) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) {
    throw new Error(`Não foi possível aplicar ${description}.`);
  }
  return source.replace(search, replacement);
}

const agendaMarker = "CRM_AGENDA_SAVE_FEEDBACK_AND_MODAL_TYPOGRAPHY_V1";
const agendaPagePath = "src/app/(private)/agendas/page.tsx";
let agendaPage = readFileSync(agendaPagePath, "utf8");

if (!agendaPage.includes(agendaMarker)) {
  const feedbackOrigin = `const feedbackOriginLabel=(value?:string|null)=>{const origem=String(value||"").toLowerCase();if(origem==="automacao")return"Automação";if(origem==="api")return"API";if(origem==="google")return"Google";return"Manual"};`;
  const feedbackOriginWithError = `// ${agendaMarker}
${feedbackOrigin}
const mensagemErroSalvarAgendamento=(valor:unknown)=>{const mensagem=String(valor||"").trim();const normalizada=mensagem.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase();if(["conflit","sobrepos","ocupad","ja existe","duplicate","exclusion","overlap"].some(item=>normalizada.includes(item)))return"Já existe um agendamento nesse horário. Escolha outro horário e tente novamente.";return mensagem||"Não foi possível salvar o agendamento. Revise os dados e tente novamente."};`;
  agendaPage = replaceRequired(
    agendaPage,
    feedbackOrigin,
    feedbackOriginWithError,
    "a mensagem amigável de erro do agendamento"
  );

  agendaPage = replaceRequired(
    agendaPage,
    `,[err,setErr]=useState(""),[ok,setOk]=useState("");`,
    `,[err,setErr]=useState(""),[ok,setOk]=useState(""),[eventSaveError,setEventSaveError]=useState("");`,
    "o estado de erro próximo ao botão Salvar"
  );

  agendaPage = replaceRequired(
    agendaPage,
    `const newAg=(d=day)=>{if(!agenda)return;setForm(blank(d,agenda.duracao_minutos,userId));setContact(null);setOpen(true)};`,
    `const newAg=(d=day)=>{if(!agenda)return;setEventSaveError("");setForm(blank(d,agenda.duracao_minutos,userId));setContact(null);setOpen(true)};`,
    "a limpeza do erro ao abrir um novo agendamento"
  );

  agendaPage = replaceRequired(
    agendaPage,
    `const edit=(a:Ag)=>{setForm(toForm(a));setContact(a.contato);setOpen(true)};`,
    `const edit=(a:Ag)=>{setEventSaveError("");setForm(toForm(a));setContact(a.contato);setOpen(true)};`,
    "a limpeza do erro ao editar um agendamento"
  );

  agendaPage = replaceRequired(
    agendaPage,
    `const save=async(status?:string)=>{if(!agendaId)return;try{setBusy(true);setErr("");`,
    `const save=async(status?:string)=>{if(!agendaId){const mensagem="Não foi possível identificar a agenda selecionada.";setEventSaveError(mensagem);setErr(mensagem);return}try{setBusy(true);setErr("");setEventSaveError("");`,
    "a validação visível antes de salvar o agendamento"
  );

  agendaPage = replaceRequired(
    agendaPage,
    `solicitarAtualizacaoFeedbackAgendasHeader()}catch(e:any){setErr(e.message)}finally{setBusy(false)}};`,
    `solicitarAtualizacaoFeedbackAgendasHeader()}catch(e:any){const mensagem=mensagemErroSalvarAgendamento(e?.message);setEventSaveError(mensagem);setErr(mensagem)}finally{setBusy(false)}};`,
    "o tratamento visível de qualquer falha ao salvar"
  );

  const eventFooter = `<div className="mini"><button className="btn" onClick={()=>setOpen(false)}>Fechar</button><button className="btn primary" onClick={()=>save()} disabled={busy}>{busy?<RefreshCw className="spin" size={15}/>:<Check size={15}/>}Salvar</button></div>`;
  const eventFooterWithError = `<div className="eventSaveFeedback">{eventSaveError&&<div className="eventSaveError" role="alert">{eventSaveError}</div>}<div className="mini"><button className="btn" onClick={()=>setOpen(false)}>Fechar</button><button className="btn primary" onClick={()=>save()} disabled={busy}>{busy?<RefreshCw className="spin" size={15}/>:<Check size={15}/>}Salvar</button></div></div>`;
  agendaPage = replaceRequired(
    agendaPage,
    eventFooter,
    eventFooterWithError,
    "a mensagem de erro ao lado do botão Salvar"
  );

  agendaPage = replaceRequired(
    agendaPage,
    `.availabilityHint{margin:4px 0 10px;color:var(--crm-text-muted);font-size:10px;line-height:1.45}`,
    `.availabilityHint{margin:6px 0 13px;color:var(--crm-text-muted);font-size:13px;line-height:1.6;font-weight:650}`,
    "a tipografia da descrição da disponibilidade semanal"
  );

  agendaPage = replaceRequired(
    agendaPage,
    `<h3 style={{fontSize:13,marginTop:16}}>Disponibilidade semanal</h3>`,
    `<h3 style={{fontSize:17,marginTop:20,lineHeight:1.35,fontWeight:900}}>Disponibilidade semanal</h3>`,
    "a tipografia do título Disponibilidade semanal"
  );

  agendaPage = replaceRequired(
    agendaPage,
    `.spin{animation:sp .8s linear infinite}`,
    `.eventSaveFeedback{display:grid;justify-items:end;gap:7px;max-width:min(540px,72vw)}.eventSaveError{max-width:100%;padding:8px 10px;border:1px solid var(--crm-danger-border);border-radius:9px;background:var(--crm-danger-bg);color:var(--crm-danger-text);font-size:12px;font-weight:800;line-height:1.45;text-align:right;overflow-wrap:anywhere}.spin{animation:sp .8s linear infinite}`,
    "o estilo da mensagem de erro do salvamento"
  );

  agendaPage = replaceRequired(
    agendaPage,
    `@media(max-width:760px){.remWhatsapp{grid-template-columns:1fr}`,
    `@media(max-width:760px){.eventSaveFeedback{width:100%;max-width:none;justify-items:stretch}.eventSaveError{text-align:left}.remWhatsapp{grid-template-columns:1fr}`,
    "a adaptação mobile do erro do salvamento"
  );

  writeFileSync(agendaPagePath, agendaPage, "utf8");
}

const sidebarPath = "src/components/Sidebar.tsx";
let sidebar = readFileSync(sidebarPath, "utf8");
sidebar = replaceRequired(
  sidebar,
  `{ label: "Agendas", href: "/agendas", icon: CalendarCheck },`,
  `{ label: "Agenda", href: "/agendas", icon: CalendarCheck },`,
  "o nome Agenda no menu principal"
);
writeFileSync(sidebarPath, sidebar, "utf8");

const terminologyPath =
  "src/app/(private)/agendas/AgendaAutomationRuntimeStatus.tsx";
let terminology = readFileSync(terminologyPath, "utf8");
const terminologyMarker = "CRM_AGENDA_MENU_TERMINOLOGY_EXCEPTION_V1";
if (!terminology.includes(terminologyMarker)) {
  terminology = replaceRequired(
    terminology,
    `function updateCalendarAttributes(element: HTMLElement) {`,
    `// ${terminologyMarker}
function shouldIgnoreCalendarTerminology(node: Node) {
  const element = node instanceof HTMLElement ? node : node.parentElement;
  return Boolean(element?.closest('a[href="/agendas"]'));
}

function updateCalendarAttributes(element: HTMLElement) {
  if (shouldIgnoreCalendarTerminology(element)) return;`,
    "a proteção do nome Agenda no menu"
  );

  terminology = replaceRequired(
    terminology,
    `  if (root.nodeType === Node.TEXT_NODE) {
    const textNode = root as Text;
    const current = textNode.nodeValue || "";`,
    `  if (root.nodeType === Node.TEXT_NODE) {
    const textNode = root as Text;
    if (shouldIgnoreCalendarTerminology(textNode)) return;
    const current = textNode.nodeValue || "";`,
    "a proteção dos textos do menu"
  );

  terminology = replaceRequired(
    terminology,
    `  if (!(root instanceof HTMLElement)) return;
  updateCalendarAttributes(root);`,
    `  if (!(root instanceof HTMLElement)) return;
  if (shouldIgnoreCalendarTerminology(root)) return;
  updateCalendarAttributes(root);`,
    "a proteção do link da Agenda"
  );

  terminology = replaceRequired(
    terminology,
    `    const textNode = node as Text;
    const current = textNode.nodeValue || "";
    const next = replaceAgendaWithCalendar(current);
    if (next !== current) textNode.nodeValue = next;`,
    `    const textNode = node as Text;
    if (!shouldIgnoreCalendarTerminology(textNode)) {
      const current = textNode.nodeValue || "";
      const next = replaceAgendaWithCalendar(current);
      if (next !== current) textNode.nodeValue = next;
    }`,
    "a exceção do menu durante a varredura de terminologia"
  );

  writeFileSync(terminologyPath, terminology, "utf8");
}

const premiumBasePath =
  "src/app/(private)/agendas/AgendaPremiumRuntimeEnhancerBase.tsx";
let premiumBase = readFileSync(premiumBasePath, "utf8");
const typographyMarker = "CRM_AGENDA_MANAGEMENT_TYPOGRAPHY_V1";
if (!premiumBase.includes(typographyMarker)) {
  const typographyDecorator = `// ${typographyMarker}
function decorateCalendarManagementModal(root: ParentNode) {
  root
    .querySelectorAll<HTMLElement>(".agendaTemplateShell .a2 .modalbg .modal")
    .forEach((modal) => {
      const title = normalize(modal.querySelector(".dhead h2")?.textContent);
      const isCalendarManagement = [
        "configurar agenda",
        "configurar calendario",
        "gerenciar agenda",
        "gerenciar calendario",
        "nova agenda",
        "novo calendario",
      ].some((value) => title.includes(value));
      if (!isCalendarManagement) return;

      modal
        .querySelectorAll<HTMLElement>("h3,h4,strong,p,span,small,div")
        .forEach((element) => {
          const rawText = ownText(element).replace(/\\s+/g, " ").trim();
          if (!rawText) return;
          const text = normalize(rawText);

          if (text.includes("bidirecional ativa")) {
            element.remove();
            return;
          }

          if (text.startsWith("importante sobre o fluxo automatico")) {
            element.style.setProperty("font-size", "14.5px", "important");
            element.style.setProperty("line-height", "1.5", "important");
            element.style.setProperty("font-weight", "900", "important");
            element.parentElement
              ?.querySelectorAll<HTMLElement>("p,small,span")
              .forEach((child) => {
                if (normalize(ownText(child)).includes("bidirecional ativa")) return;
                child.style.setProperty("font-size", "13px", "important");
                child.style.setProperty("line-height", "1.6", "important");
              });
            return;
          }

          if (
            text.includes("vincule somente este calendario") ||
            text.includes("vincule somente esta agenda")
          ) {
            element.style.setProperty("font-size", "13.5px", "important");
            element.style.setProperty("line-height", "1.6", "important");
            return;
          }

          if (text === "disponibilidade semanal") {
            element.style.setProperty("font-size", "17px", "important");
            element.style.setProperty("line-height", "1.35", "important");
            element.style.setProperty("font-weight", "900", "important");
            return;
          }

          if (text.startsWith("defina o inicio e o fim de cada dia")) {
            element.style.setProperty("font-size", "13px", "important");
            element.style.setProperty("line-height", "1.6", "important");
            return;
          }

          if (
            /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(rawText) &&
            !element.closest("label")
          ) {
            element.style.setProperty("font-size", "14px", "important");
            element.style.setProperty("line-height", "1.45", "important");
            element.style.setProperty("font-weight", "800", "important");
          }
        });
    });
}

function clearOldDecorations()`;

  premiumBase = replaceRequired(
    premiumBase,
    `function clearOldDecorations()`,
    typographyDecorator,
    "a tipografia do modal Gerenciar calendário"
  );

  premiumBase = replaceRequired(
    premiumBase,
    `      decorateIntervals(document);`,
    `      decorateIntervals(document);
      decorateCalendarManagementModal(document);`,
    "a aplicação contínua da tipografia do modal"
  );

  writeFileSync(premiumBasePath, premiumBase, "utf8");
}

console.log(
  "Feedback de salvamento, menu Agenda e tipografia do gerenciamento de calendário aplicados."
);
