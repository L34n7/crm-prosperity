import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function patchRuntimeStatus() {
  const relativePath = "src/app/(private)/agendas/AgendaAutomationRuntimeStatus.tsx";
  let content = read(relativePath);

  const singleColumnRule =
    ".agendaAutomationGrid{grid-template-columns:minmax(0,1fr)!important}.agendaAutomationCard{min-width:0!important}";

  if (!content.includes(singleColumnRule)) {
    content = content.replace(
      "@media(max-width:760px)",
      `${singleColumnRule}\n@media(max-width:760px)`
    );
  }

  if (!content.includes("CRM_CALENDAR_TERMINOLOGY_V1")) {
    const terminologyCode = `
const CRM_CALENDAR_TERMINOLOGY_V1 = true;
const CALENDAR_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\bNova agenda\\b/g, "Novo calendário"],
  [/\\bnova agenda\\b/g, "novo calendário"],
  [/\\bConfigurar agenda\\b/g, "Configurar calendário"],
  [/\\bconfigurar agenda\\b/g, "configurar calendário"],
  [/\\bCriar agenda\\b/g, "Criar calendário"],
  [/\\bcriar agenda\\b/g, "criar calendário"],
  [/\\bEditar agenda\\b/g, "Editar calendário"],
  [/\\beditar agenda\\b/g, "editar calendário"],
  [/\\bAgenda arquivada\\b/g, "Calendário arquivado"],
  [/\\bagenda arquivada\\b/g, "calendário arquivado"],
  [/\\bAgenda selecionada\\b/g, "Calendário selecionado"],
  [/\\bagenda selecionada\\b/g, "calendário selecionado"],
  [/\\bAgenda ativa\\b/g, "Calendário ativo"],
  [/\\bagenda ativa\\b/g, "calendário ativo"],
  [/\\bAgenda fixa\\b/g, "Calendário fixo"],
  [/\\bagenda fixa\\b/g, "calendário fixo"],
  [/\\bAgenda vinculada\\b/g, "Calendário vinculado"],
  [/\\bagenda vinculada\\b/g, "calendário vinculado"],
  [/\\bEsta agenda\\b/g, "Este calendário"],
  [/\\besta agenda\\b/g, "este calendário"],
  [/\\bUma agenda\\b/g, "Um calendário"],
  [/\\buma agenda\\b/g, "um calendário"],
  [/\\bDa agenda\\b/g, "Do calendário"],
  [/\\bda agenda\\b/g, "do calendário"],
  [/\\bNa agenda\\b/g, "No calendário"],
  [/\\bna agenda\\b/g, "no calendário"],
  [/\\bÀ agenda\\b/g, "Ao calendário"],
  [/\\bà agenda\\b/g, "ao calendário"],
  [/\\bPela agenda\\b/g, "Pelo calendário"],
  [/\\bpela agenda\\b/g, "pelo calendário"],
  [/\\bA agenda\\b/g, "O calendário"],
  [/\\ba agenda\\b/g, "o calendário"],
  [/\\bAgendas\\b/g, "Calendários"],
  [/\\bagendas\\b/g, "calendários"],
  [/\\bAgenda\\b/g, "Calendário"],
  [/\\bagenda\\b/g, "calendário"],
];

function replaceAgendaWithCalendar(value: string) {
  return CALENDAR_TEXT_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value
  );
}

function updateCalendarAttributes(element: HTMLElement) {
  for (const attribute of ["aria-label", "title", "placeholder"]) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const next = replaceAgendaWithCalendar(current);
    if (next !== current) element.setAttribute(attribute, next);
  }
}

function applyCalendarTerminology(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    const textNode = root as Text;
    const current = textNode.nodeValue || "";
    const next = replaceAgendaWithCalendar(current);
    if (next !== current) textNode.nodeValue = next;
    return;
  }

  if (!(root instanceof HTMLElement)) return;
  updateCalendarAttributes(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const current = textNode.nodeValue || "";
    const next = replaceAgendaWithCalendar(current);
    if (next !== current) textNode.nodeValue = next;
    node = walker.nextNode();
  }

  root
    .querySelectorAll<HTMLElement>("[aria-label],[title],[placeholder]")
    .forEach(updateCalendarAttributes);
}
`;

    content = content.replace(
      "export default function AgendaAutomationRuntimeStatus() {",
      `${terminologyCode}\nexport default function AgendaAutomationRuntimeStatus() {`
    );
  }

  if (!content.includes("applyCalendarTerminology(document.body);")) {
    content = content.replace(
      'document.querySelectorAll<HTMLElement>(".agendaAutomationSection").forEach(applyRuntimeStatus);',
      'document.querySelectorAll<HTMLElement>(".agendaAutomationSection").forEach(applyRuntimeStatus);\n    applyCalendarTerminology(document.body);'
    );
  }

  const oldObserver = /const observer = new MutationObserver\(\(mutations\) => \{\s*for \(const mutation of mutations\) mutation\.addedNodes\.forEach\(applyFromAddedNode\);\s*\}\);/;
  if (oldObserver.test(content)) {
    content = content.replace(
      oldObserver,
      `const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          applyFromAddedNode(node);
          applyCalendarTerminology(node);
        });
      }
    });`
    );
  }

  write(relativePath, content);
  console.log("Terminologia de calendário e cards em coluna única aplicados.");
}

function patchTemplatePreview() {
  const relativePath = "src/app/(private)/agendas/AgendaTemplateMappingEnhancer.tsx";
  let content = read(relativePath);

  const oldCss = `.agendaTemplatePreview{padding:11px;border:1px solid var(--crm-border);border-radius:12px;background:var(--crm-surface)}.agendaTemplatePreview span{display:block;margin-bottom:6px;color:var(--crm-text-muted);font-size:9px;font-weight:900;text-transform:uppercase}.agendaTemplatePreview pre{margin:0;color:var(--crm-text);font:inherit;font-size:10.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}`;
  const newCss = `.agendaTemplatePreview{padding:0;border:1px solid var(--crm-border);border-radius:18px;background:var(--crm-surface);overflow:hidden}.agendaTemplatePreviewHeader{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid var(--crm-border);background:var(--crm-surface-soft)}.agendaTemplatePreviewHeader span{color:var(--crm-text-strong);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.agendaTemplatePreviewHeader small{color:var(--crm-text-muted);font-size:9px;font-weight:700}.agendaTemplatePreviewArea{padding:16px;background:radial-gradient(circle at 20% 20%,var(--crm-ui-private-surface-rgb-15-23-42-0-04) 0 2px,transparent 2px),var(--crm-ui-private-surface-hex-efe7dd);background-size:18px 18px}.agendaTemplatePreviewBubble{width:min(100%,420px);position:relative;padding:12px 12px 8px;border-radius:0 14px 14px 14px;background:var(--crm-surface);box-shadow:0 8px 22px var(--crm-ui-private-shadow-rgb-15-23-42-0-12)}.agendaTemplatePreviewBubble:before{content:\"\";position:absolute;top:0;left:-9px;border-top:9px solid var(--crm-surface);border-left:9px solid transparent}.agendaTemplatePreviewBubble pre{margin:0;color:var(--crm-text-strong);font:inherit;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.agendaTemplatePreviewMeta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;color:var(--crm-text-muted);font-size:8.5px}.agendaTemplatePreviewMeta span{font-weight:700}.agendaTemplatePreviewMeta time{white-space:nowrap;font-weight:800}`;

  if (!content.includes("agendaTemplatePreviewArea")) {
    if (!content.includes(oldCss)) {
      throw new Error("Não foi possível localizar o CSS antigo da prévia da agenda.");
    }
    content = content.replace(oldCss, newCss);
  }

  const oldMarkup = '<div class="agendaTemplatePreview"><span>Prévia com dados de exemplo</span><pre></pre></div>';
  const newMarkup = '<div class="agendaTemplatePreview"><div class="agendaTemplatePreviewHeader"><span>Prévia da mensagem</span><small>Dados de exemplo</small></div><div class="agendaTemplatePreviewArea"><div class="agendaTemplatePreviewBubble"><pre></pre><div class="agendaTemplatePreviewMeta"><span>Automação do calendário</span><time>14:30 ✓✓</time></div></div></div></div>';

  if (!content.includes('class="agendaTemplatePreviewArea"')) {
    if (!content.includes(oldMarkup)) {
      throw new Error("Não foi possível localizar a estrutura antiga da prévia da agenda.");
    }
    content = content.replace(oldMarkup, newMarkup);
  }

  write(relativePath, content);
  console.log("Prévia da automação alinhada ao designer da tela de disparos.");
}

function replaceDatabaseTableReferences(directory) {
  let changedFiles = 0;
  const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

  function walk(currentDirectory) {
    for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true })) {
      const absolutePath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!extensions.has(path.extname(entry.name))) continue;

      const current = fs.readFileSync(absolutePath, "utf8");
      const next = current.replace(/(["'])agenda_calendarios\1/g, (_match, quote) => {
        return `${quote}calendarios${quote}`;
      });
      if (next === current) continue;
      fs.writeFileSync(absolutePath, next, "utf8");
      changedFiles += 1;
    }
  }

  walk(path.join(root, directory));
  console.log(`Referências da tabela atualizadas em ${changedFiles} arquivo(s).`);
}

patchRuntimeStatus();
patchTemplatePreview();
replaceDatabaseTableReferences("src");
