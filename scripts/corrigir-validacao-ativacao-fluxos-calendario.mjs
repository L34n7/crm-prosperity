import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const relativePath = "src/app/(private)/fluxos/page.tsx";
const absolutePath = path.join(root, relativePath);
let content = fs.readFileSync(absolutePath, "utf8");
let alterado = false;

const markerCalendario = "CRM_SYSTEM_CALENDAR_FLOW_ACTIVATION_VALIDATION_V1";

if (!content.includes(markerCalendario)) {
  const current = `    if (
      tipoNo === "agenda_escolher_horario" &&
      !String(config.agenda_id || "").trim()
    ) {
      return \`O bloco "\${node.data?.titulo}" precisa ter uma agenda.\`;
    }`;

  const replacement = `    // CRM_SYSTEM_CALENDAR_FLOW_ACTIVATION_VALIDATION_V1
    if (
      tipoNo === "agenda_escolher_horario" &&
      !String(config.agenda_id || "").trim() &&
      config.usar_agenda_contexto !== true &&
      config.usar_agenda_contexto !== "true"
    ) {
      return \`O bloco "\${node.data?.titulo}" precisa ter um calendário.\`;
    }`;

  if (!content.includes(current)) {
    throw new Error(
      "Não foi possível localizar a validação do bloco Escolher horário."
    );
  }

  content = content.replace(current, replacement);
  alterado = true;
}

const markerFilaGeral = "CRM_GENERAL_QUEUE_ACTIVATION_VALIDATION_V1";

if (!content.includes(markerFilaGeral)) {
  const current = `        String(config.acao_excesso_tentativas || "transferir_atendimento") ===
          "transferir_atendimento" &&
        !String(config.setor_excesso_tentativas || "").trim()`;

  const replacement = `        String(config.acao_excesso_tentativas || "transferir_atendimento") ===
          "transferir_atendimento" &&
        // CRM_GENERAL_QUEUE_ACTIVATION_VALIDATION_V1
        String(config.escopo_fila_excesso_tentativas || "setor").trim() !==
          "geral" &&
        !String(config.setor_excesso_tentativas || "").trim()`;

  if (!content.includes(current)) {
    throw new Error(
      "Não foi possível localizar a validação do setor por excesso de tentativas."
    );
  }

  content = content.replace(current, replacement);
  alterado = true;
}

const markerTransferenciaFilaGeral =
  "CRM_GENERAL_QUEUE_TRANSFER_NODE_ACTIVATION_VALIDATION_V1";

if (!content.includes(markerTransferenciaFilaGeral)) {
  const current = `    if (
        tipoNo === "transferir_setor" &&
        !String(config.setor_id || "").trim()
      ) {
        return \`O bloco "\${node.data?.titulo}" precisa ter um setor destino.\`;
      }`;

  const replacement = `    if (
        tipoNo === "transferir_setor" &&
        // CRM_GENERAL_QUEUE_TRANSFER_NODE_ACTIVATION_VALIDATION_V1
        String(config.escopo_fila || "setor").trim() !== "geral" &&
        !String(config.setor_id || "").trim()
      ) {
        return \`O bloco "\${node.data?.titulo}" precisa ter um setor destino.\`;
      }`;

  if (!content.includes(current)) {
    throw new Error(
      "Não foi possível localizar a validação do bloco Transferir setor."
    );
  }

  content = content.replace(current, replacement);
  alterado = true;
}

if (alterado) {
  fs.writeFileSync(absolutePath, content, "utf8");
}

console.log(
  "Validações de ativação ajustadas para calendário automático e filas gerais."
);
