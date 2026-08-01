import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const relativePath = "src/app/(private)/fluxos/page.tsx";
const absolutePath = path.join(root, relativePath);
let content = fs.readFileSync(absolutePath, "utf8");

const marker = "CRM_SYSTEM_CALENDAR_FLOW_ACTIVATION_VALIDATION_V1";

if (!content.includes(marker)) {
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
  fs.writeFileSync(absolutePath, content, "utf8");
}

console.log(
  "Validação de ativação ajustada para calendários resolvidos pelo contexto do agendamento."
);
