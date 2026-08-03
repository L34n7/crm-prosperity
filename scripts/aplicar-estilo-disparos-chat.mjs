import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const marker = "CRM_DISPARO_CHAT_PRESENTATION_V1";

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

const pagePath = "src/app/(private)/conversas/page.tsx";
let page = read(pagePath);

if (!page.includes(marker)) {
  const statusAnchor = `function getStatusEnvioLabel(status: Mensagem["status_envio"]) {`;
  const helpers = `// ${marker}\nfunction getMensagemMetadataDisparo(msg: Mensagem) {\n  return (msg.metadata_json || {}) as Record<string, unknown>;\n}\n\nfunction mensagemEhDisparo(msg: Mensagem) {\n  return msg.tipo_mensagem === "template";\n}\n\nfunction getModoDisparo(msg: Mensagem) {\n  const metadata = getMensagemMetadataDisparo(msg);\n  const tipo = String(metadata.tipo || "").trim().toLowerCase();\n  const origem = String(metadata.origem || "").trim().toLowerCase();\n  const disparoTipo = String(metadata.disparo_tipo || "")\n    .trim()\n    .toLowerCase();\n\n  const manual =\n    disparoTipo === "manual" ||\n    tipo.includes("individual") ||\n    origem.includes("individual") ||\n    (msg.remetente_tipo === "usuario" && msg.origem === "enviada");\n\n  return manual ? "manual" : "agendado";\n}\n\nfunction formatarNomeTemplateDisparo(valor: unknown) {\n  const texto = String(valor || "")\n    .replace(/[_-]+/g, " ")\n    .replace(/\\s+/g, " ")\n    .trim();\n\n  if (!texto) return "Disparo";\n\n  return texto\n    .split(" ")\n    .map((parte) =>\n      parte ? parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase() : parte\n    )\n    .join(" ");\n}\n\nfunction obterApresentacaoDisparo(msg: Mensagem) {\n  const metadata = getMensagemMetadataDisparo(msg);\n  const texto = String(msg.conteudo || "").trim();\n  const blocos = texto\n    .split(/\\n\\s*\\n/)\n    .map((bloco) => bloco.trim())\n    .filter(Boolean);\n  const primeiroBloco = blocos[0] || "";\n  const primeiroBlocoPareceTitulo =\n    blocos.length > 1 &&\n    primeiroBloco.length <= 90 &&\n    !/[.!?]$/.test(primeiroBloco);\n\n  const titulo = primeiroBlocoPareceTitulo\n    ? primeiroBloco\n    : formatarNomeTemplateDisparo(metadata.template_nome);\n  const conteudo = primeiroBlocoPareceTitulo\n    ? blocos.slice(1).join("\\n\\n")\n    : texto;\n\n  return { titulo, conteudo };\n}\n\n${statusAnchor}`;

  page = replaceRequired(
    page,
    statusAnchor,
    helpers,
    "identificação e apresentação dos disparos no chat"
  );

  const renderAnchor = `  function renderizarConteudoMensagem(msg: Mensagem) {\n    const url = montarUrlMidiaMensagem(msg);`;
  const renderReplacement = `  function renderizarConteudoMensagem(msg: Mensagem) {\n    if (mensagemEhDisparo(msg)) {\n      const disparo = obterApresentacaoDisparo(msg);\n\n      return (\n        <div className={styles.disparoMessageContent}>\n          <strong className={styles.disparoMessageTitle}>\n            <TextoComEmoji texto={disparo.titulo} />\n          </strong>\n\n          {disparo.conteudo ? (\n            <p className={styles.messageText}>\n              <TextoComEmoji texto={disparo.conteudo} />\n            </p>\n          ) : null}\n        </div>\n      );\n    }\n\n    const url = montarUrlMidiaMensagem(msg);`;

  page = replaceRequired(
    page,
    renderAnchor,
    renderReplacement,
    "título em negrito e conteúdo próprio dos disparos"
  );

  const flagsBefore = `                                const isConteudoIndisponivel = msg.tipo_mensagem === "unsupported";\n                                const isOutgoing =\n                                  msg.origem === "enviada" && !isConteudoIndisponivel;\n                                const isAutomatic = msg.origem === "automatica";`;
  const flagsAfter = `                                const isConteudoIndisponivel = msg.tipo_mensagem === "unsupported";\n                                const isDisparo = mensagemEhDisparo(msg);\n                                const disparoModo = getModoDisparo(msg);\n                                const isOutgoing =\n                                  !isDisparo &&\n                                  msg.origem === "enviada" &&\n                                  !isConteudoIndisponivel;\n                                const isAutomatic =\n                                  !isDisparo && msg.origem === "automatica";`;

  page = replaceRequired(
    page,
    flagsBefore,
    flagsAfter,
    "classificação visual de mensagens de disparo"
  );

  const bubbleBefore = `                                          isOutgoing\n                                            ? styles.messageBubbleOutgoing\n                                            : isAutomatic\n                                            ? styles.messageBubbleAutomatic\n                                            : styles.messageBubbleIncoming`;
  const bubbleAfter = `                                          isDisparo\n                                            ? styles.messageBubbleDisparo\n                                            : isOutgoing\n                                            ? styles.messageBubbleOutgoing\n                                            : isAutomatic\n                                            ? styles.messageBubbleAutomatic\n                                            : styles.messageBubbleIncoming`;

  page = replaceRequired(
    page,
    bubbleBefore,
    bubbleAfter,
    "cor exclusiva da bolha de disparo"
  );

  page = replaceRequired(
    page,
    `                                        {!isOutgoing &&\n                                          (msg.remetente_tipo === "bot" || msg.remetente_tipo === "ia") && (`,
    `                                        {(isDisparo ||\n                                          (!isOutgoing &&\n                                            (msg.remetente_tipo === "bot" ||\n                                              msg.remetente_tipo === "ia"))) && (`,
    "cabeçalho próprio das mensagens de disparo"
  );

  page = replaceRequired(
    page,
    `                                              <span className={styles.senderLabel}>\n                                                {getRemetenteLabel(msg.remetente_tipo)}\n                                              </span>`,
    `                                              <span\n                                                className={[\n                                                  styles.senderLabel,\n                                                  isDisparo ? styles.disparoSenderLabel : "",\n                                                ]\n                                                  .filter(Boolean)\n                                                  .join(" ")}\n                                              >\n                                                {isDisparo\n                                                  ? "Disparo"\n                                                  : getRemetenteLabel(msg.remetente_tipo)}\n                                              </span>`,
    "badge Disparo no lugar de Bot"
  );

  page = replaceRequired(
    page,
    `                                              {isAutomatic && (\n                                                <span className={styles.automaticBadge}>automática</span>\n                                              )}`,
    `                                              {isDisparo ? (\n                                                <span className={styles.disparoModeBadge}>\n                                                  {disparoModo}\n                                                </span>\n                                              ) : isAutomatic ? (\n                                                <span className={styles.automaticBadge}>automática</span>\n                                              ) : null}`,
    "badge manual ou agendado do disparo"
  );
}

write(pagePath, page);

const cssPath = "src/app/(private)/conversas/conversas.module.css";
let css = read(cssPath);

if (!css.includes(marker)) {
  css += `\n\n/* ${marker} */\n.messageBubbleDisparo {\n  background: color-mix(\n    in srgb,\n    var(--crm-primary-soft) 82%,\n    var(--crm-surface)\n  );\n  color: var(--crm-text-strong);\n  border: 1px solid color-mix(\n    in srgb,\n    var(--crm-primary-strong) 28%,\n    var(--crm-border)\n  );\n  border-top-left-radius: 4px;\n  box-shadow:\n    inset 3px 0 0 var(--crm-primary-strong),\n    0 1px 1px var(--crm-ui-private-shadow-rgb-0-0-0-0-08);\n}\n\n.disparoSenderLabel {\n  color: var(--crm-primary-strong);\n  font-weight: 800;\n}\n\n.disparoModeBadge {\n  display: inline-flex;\n  align-items: center;\n  padding: 2px 7px;\n  border-radius: 999px;\n  background: color-mix(\n    in srgb,\n    var(--crm-primary-strong) 14%,\n    var(--crm-surface)\n  );\n  color: var(--crm-primary-strong);\n  border: 1px solid color-mix(\n    in srgb,\n    var(--crm-primary-strong) 24%,\n    transparent\n  );\n  font-size: 10px;\n  font-weight: 800;\n  text-transform: lowercase;\n}\n\n.disparoMessageContent {\n  display: grid;\n  gap: 8px;\n}\n\n.disparoMessageTitle {\n  display: block;\n  margin: 0;\n  color: var(--crm-text-strong);\n  font-size: 14px;\n  font-weight: 800;\n  line-height: 1.45;\n}\n\n.disparoMessageContent .messageText {\n  margin: 0;\n}\n`;
}

write(cssPath, css);

const agendaRuntimePath = "src/lib/agendas/automation-runtime-whatsapp.ts";
let agendaRuntime = read(agendaRuntimePath);

if (!agendaRuntime.includes(`disparo_tipo: "agendado"`)) {
  agendaRuntime = replaceRequired(
    agendaRuntime,
    `    metadata_json: {\n      agenda_automacao: true,\n      agenda_automacao_execucao_id: context.job.id,`,
    `    metadata_json: {\n      tipo: "disparo_template_agendado",\n      disparo_tipo: "agendado",\n      agenda_automacao: true,\n      agenda_automacao_execucao_id: context.job.id,`,
    "metadados de disparo agendado"
  );
}

write(agendaRuntimePath, agendaRuntime);

const manualRoutePath = "src/app/api/whatsapp/disparo-individual/route.ts";
let manualRoute = read(manualRoutePath);

if (!manualRoute.includes(`disparo_tipo: "manual"`)) {
  manualRoute = replaceRequired(
    manualRoute,
    `      metadata_json: {\n        tipo: "disparo_template_individual",\n        template_id: template.id,`,
    `      metadata_json: {\n        tipo: "disparo_template_individual",\n        disparo_tipo: "manual",\n        template_id: template.id,`,
    "metadados de disparo manual"
  );
}

write(manualRoutePath, manualRoute);

console.log(
  "Mensagens de disparo destacadas no chat com badges manual/agendado e título em negrito."
);
