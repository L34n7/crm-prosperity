await import("./corrigir-variaveis-chat-calendario-base.mjs");
await import("./aplicar-detalhes-feedback-agenda.mjs");
await import("./ajustar-ordem-disparos-agendados.mjs");
await import("./aplicar-pos-atendimento-disparo-agenda.mjs");
await import("./corrigir-validacao-reagendamento-agenda.mjs");
await import("./corrigir-cancelamento-google-agenda.mjs");
await import("./aplicar-lembretes-individuais-pos-fluxo.mjs");
await import("./aplicar-intervalos-agenda-reabrir-protocolo.mjs");
await import("./aplicar-revisao-telefone-disparos.mjs");
await import("./corrigir-duplicidade-revisao-telefone.mjs");
await import("./corrigir-aplicador-mapeamento-template-lembrete.mjs");
await import("./aplicar-mapeamento-template-lembrete-individual.mjs");
await import("./corrigir-runtime-mapeamento-lembrete-whatsapp.mjs");
await import("./ajustar-selecao-massa-disparos-v3.mjs");
await import("./aplicar-pausa-rate-limit-12h-ui.mjs");
await import("./corrigir-conflitos-disparo-anterior-contador.mjs");
await import("./aplicar-ajuste-final-lembretes-intervalos.mjs");
await import("./corrigir-detector-intervalos-premium.mjs");
await import("./aplicar-lembretes-agendamento-premium-v3.mjs");
await import("./corrigir-select-canal-atual-lembrete-whatsapp.mjs");
await import("./aplicar-estilo-disparos-chat.mjs");

const { readFileSync, writeFileSync } = await import("node:fs");

const chatPagePath = "src/app/(private)/conversas/page.tsx";
let chatPage = readFileSync(chatPagePath, "utf8");

const detectorAnterior = `function mensagemEhDisparo(msg: Mensagem) {
  return msg.tipo_mensagem === "template";
}`;

const detectorAtualizado = `function mensagemEhDisparo(msg: Mensagem) {
  const metadata = getMensagemMetadataDisparo(msg);
  const tipoOriginalMeta = String(
    (msg as Mensagem & { tipo_original_meta?: string | null })
      .tipo_original_meta || ""
  )
    .trim()
    .toLowerCase();
  const tipoOriginalWhatsapp = String(
    metadata.tipo_original_whatsapp || ""
  )
    .trim()
    .toLowerCase();
  const tipoMetadata = String(metadata.tipo || "")
    .trim()
    .toLowerCase();
  const possuiIdentificacaoTemplate = Boolean(
    metadata.template_id || metadata.template_nome
  );

  return (
    msg.tipo_mensagem === "template" ||
    tipoOriginalMeta === "template" ||
    tipoOriginalWhatsapp === "template" ||
    tipoMetadata.includes("disparo_template") ||
    (possuiIdentificacaoTemplate &&
      (msg.origem === "automatica" || msg.origem === "enviada"))
  );
}

function mensagemDisparoTemBotoes(msg: Mensagem) {
  const metadata = getMensagemMetadataDisparo(msg);
  return Array.isArray(metadata.botoes) && metadata.botoes.length > 0;
}`;

if (chatPage.includes(detectorAnterior)) {
  chatPage = chatPage.replace(detectorAnterior, detectorAtualizado);
} else if (!chatPage.includes(detectorAtualizado)) {
  throw new Error(
    "Não foi possível atualizar a identificação dos templates com botões no chat."
  );
}

const renderAnterior = `    if (mensagemEhDisparo(msg)) {`;
const renderAtualizado = `    if (
      mensagemEhDisparo(msg) && !mensagemDisparoTemBotoes(msg)
    ) {`;

if (chatPage.includes(renderAnterior)) {
  chatPage = chatPage.replace(renderAnterior, renderAtualizado);
} else if (!chatPage.includes(renderAtualizado)) {
  throw new Error(
    "Não foi possível preservar os botões ao aplicar o visual de disparo."
  );
}

writeFileSync(chatPagePath, chatPage, "utf8");
console.log(
  "Templates com botões identificados como disparo sem remover as ações interativas."
);
