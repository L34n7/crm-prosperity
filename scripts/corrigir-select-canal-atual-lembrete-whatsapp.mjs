import fs from "node:fs";

const arquivo =
  "src/app/(private)/agendas/AgendaTemplateMappingEnhancer.tsx";
const marcador = "AGENDA_INDIVIDUAL_TEMPLATE_CURRENT_CHANNEL_V5";
let codigo = fs.readFileSync(arquivo, "utf8");

function substituirObrigatorio(busca, substituicao, descricao) {
  if (!codigo.includes(busca)) {
    throw new Error(`Não foi possível aplicar ${descricao}.`);
  }
  codigo = codigo.replace(busca, substituicao);
}

if (!codigo.includes(marcador)) {
  substituirObrigatorio(
    `    const selectPorRotulo = (row: HTMLElement, termos: string[]) => {\n      const labels = Array.from(row.querySelectorAll<HTMLLabelElement>("label"));\n      for (const label of labels) {\n        const texto = textoNormalizado(label);\n        if (!termos.some((termo) => texto.includes(normalize(termo)))) continue;\n        const select = label.querySelector<HTMLSelectElement>("select");\n        if (select) return select;\n      }\n      return null;\n    };`,
    `    const selectPorRotulo = (row: HTMLElement, termos: string[]) => {\n      const labels = Array.from(row.querySelectorAll<HTMLLabelElement>("label"));\n      for (const label of labels) {\n        const texto = textoNormalizado(label);\n        if (!termos.some((termo) => texto.includes(normalize(termo)))) continue;\n        const campo = label.closest<HTMLElement>(".field") || label.parentElement;\n        const select =\n          label.querySelector<HTMLSelectElement>("select") ||\n          campo?.querySelector<HTMLSelectElement>("select");\n        if (select) return select;\n      }\n      return null;\n    };`,
    "a busca dos selects irmãos dos rótulos de integração e template"
  );

  substituirObrigatorio(
    `        const render = () => {\n          if (!row.isConnected) return;\n          const whatsapp = normalize(canal.value) === "whatsapp";`,
    `        // ${marcador}\n        const render = () => {\n          if (!row.isConnected) return;\n          const canalAtual = selectCanalLembrete(row);\n          const whatsapp = normalize(canalAtual?.value) === "whatsapp";`,
    "a leitura do select de canal atualmente conectado ao card"
  );

  substituirObrigatorio(
    `        row.addEventListener("change", (event) => {\n          const target = event.target;\n          if (!(target instanceof HTMLSelectElement)) return;\n          if (target.dataset.role === "template" || target.dataset.role === "integration") {\n            window.setTimeout(render, 0);\n          }\n        });`,
    `        row.addEventListener("change", (event) => {\n          const target = event.target;\n          if (!(target instanceof HTMLSelectElement)) return;\n          const canalAtual = selectCanalLembrete(row);\n          if (\n            target === canalAtual ||\n            target.dataset.role === "template" ||\n            target.dataset.role === "integration"\n          ) {\n            window.setTimeout(render, 0);\n          }\n        });`,
    "a remontagem ao trocar o select de canal recriado pelo React"
  );

  substituirObrigatorio(
    `          if (normalize(canal.value) === "whatsapp" && (painel?.dataset.templateId || "") !== (templateSelect?.value || "")) {`,
    `          if (normalize(selectCanalLembrete(row)?.value) === "whatsapp" && (painel?.dataset.templateId || "") !== (templateSelect?.value || "")) {`,
    "a verificação periódica do canal atualmente conectado"
  );

  fs.writeFileSync(arquivo, codigo, "utf8");
  console.log(
    "Busca dos campos e canal atual do lembrete WhatsApp vinculados ao painel de variáveis e prévia."
  );
} else {
  console.log("Busca dos campos do lembrete WhatsApp já corrigida.");
}
