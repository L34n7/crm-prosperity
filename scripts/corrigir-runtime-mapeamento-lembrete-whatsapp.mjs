import fs from "node:fs";

const arquivo =
  "src/app/(private)/agendas/AgendaTemplateMappingEnhancer.tsx";
const marcador = "AGENDA_INDIVIDUAL_TEMPLATE_MAPPING_REACTIVE_V2";
let codigo = fs.readFileSync(arquivo, "utf8");

function substituirObrigatorio(busca, substituicao, descricao) {
  if (!codigo.includes(busca)) {
    throw new Error(`Não foi possível aplicar ${descricao}.`);
  }
  codigo = codigo.replace(busca, substituicao);
}

if (!codigo.includes(marcador)) {
  substituirObrigatorio(
    "    const individualConfigs = new WeakMap<HTMLElement, MappingConfig>();",
    `    // ${marcador}\n    const individualConfigs = new WeakMap<HTMLElement, MappingConfig>();\n    const individualRenderers = new WeakMap<HTMLElement, () => void>();`,
    "o registro dos renderizadores dos lembretes"
  );

  substituirObrigatorio(
    `    const bindIndividualReminder = async (row: HTMLElement) => {\n      if (row.dataset.individualTemplateBound === "true") return;\n      const canal = selectCanalLembrete(row);`,
    `    const bindIndividualReminder = async (row: HTMLElement) => {\n      const canal = selectCanalLembrete(row);\n      if (row.dataset.individualTemplateBound === "true") {\n        const renderExistente = individualRenderers.get(row);\n        const templateSelect = selectPorRotulo(row, ["template aprovado", "template"]);\n        const painel = row.querySelector<HTMLElement>(".agendaTemplateMappingPanel");\n        const precisaRenderizar =\n          normalize(canal?.value) === "whatsapp"\n            ? !painel ||\n              (painel.dataset.templateId || "") !==\n                (templateSelect?.value || "")\n            : Boolean(painel);\n        if (precisaRenderizar) renderExistente?.();\n        return;\n      }`,
    "a remontagem reativa do painel de templates"
  );

  substituirObrigatorio(
    `        canal.addEventListener("change", () => window.setTimeout(render, 0));`,
    `        individualRenderers.set(row, render);\n        canal.addEventListener("change", () => window.setTimeout(render, 0));`,
    "o registro do renderizador do lembrete"
  );

  substituirObrigatorio(
    `            const rows = Array.from(\n              shell.querySelectorAll<HTMLElement>(".a2 .drawer .repeat.rem")\n            );`,
    `            const rows = Array.from(\n              shell.querySelectorAll<HTMLElement>(".a2 .drawer .repeat.rem")\n            ).filter((row) => Boolean(selectCanalLembrete(row)));`,
    "a seleção exclusiva dos cards de lembrete no salvamento"
  );

  substituirObrigatorio(
    `            flows: loaded.fluxos,\n            variables: Array.isArray((loaded as any).variables)\n              ? (loaded as any).variables\n              : [],\n            saved: salvo,\n            onOpenVariables: () => {},`,
    `            flows: loaded.fluxos.filter((flow) => flow.status === "ativo"),\n            variables: Array.isArray(loaded.variaveis)\n              ? loaded.variaveis\n              : [],\n            saved: salvo,\n            onOpenVariables: openVariableModal,`,
    "as mesmas variáveis e ações disponíveis na configuração da agenda"
  );

  codigo = codigo.replaceAll(
    "accent-color:var(--crm-primary-strong)",
    "accent-color:var(--crm-warning-text)"
  );

  fs.writeFileSync(arquivo, codigo, "utf8");
  console.log(
    "Mapeamento, prévia e consentimento dos lembretes WhatsApp tornados reativos."
  );
} else {
  console.log("Runtime reativo dos lembretes WhatsApp já aplicado.");
}
