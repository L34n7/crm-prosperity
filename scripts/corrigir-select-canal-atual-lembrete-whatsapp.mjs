import fs from "node:fs";

const arquivo =
  "src/app/(private)/agendas/AgendaTemplateMappingEnhancer.tsx";
const marcador = "AGENDA_INDIVIDUAL_TEMPLATE_CURRENT_CHANNEL_V6";
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

  substituirObrigatorio(
    `    const bindIndividualReminder = async (row: HTMLElement) => {`,
    `    const ajustarPainelLembreteIndividual = (row: HTMLElement) => {\n      const panel = row.querySelector<HTMLElement>(\n        ".agendaTemplateMappingPanel"\n      );\n      if (!panel) return;\n\n      const consentimento = panel.querySelector<HTMLElement>(\n        ".agendaTemplateMarketingAck"\n      );\n      if (consentimento) {\n        const estilosConsentimento: Record<string, string> = {\n          width: "100%",\n          "min-width": "0",\n          "max-width": "100%",\n          "box-sizing": "border-box",\n          display: "grid",\n          "grid-template-columns": "18px minmax(0, 1fr)",\n          "align-items": "start",\n          "justify-content": "stretch",\n          "justify-items": "stretch",\n          gap: "9px",\n          overflow: "hidden",\n          position: "relative",\n          margin: "0",\n          "text-align": "left",\n        };\n        Object.entries(estilosConsentimento).forEach(([propriedade, valor]) =>\n          consentimento.style.setProperty(propriedade, valor, "important")\n        );\n\n        const checkbox = consentimento.querySelector<HTMLInputElement>(\n          'input[data-map="marketing-ack"]'\n        );\n        if (checkbox) {\n          checkbox.style.setProperty("position", "static", "important");\n          checkbox.style.setProperty("width", "16px", "important");\n          checkbox.style.setProperty("height", "16px", "important");\n          checkbox.style.setProperty("margin", "1px 0 0", "important");\n          checkbox.style.setProperty("transform", "none", "important");\n          checkbox.style.setProperty("justify-self", "start", "important");\n        }\n\n        const textoConsentimento =\n          consentimento.querySelector<HTMLElement>("span");\n        if (textoConsentimento) {\n          const estilosTexto: Record<string, string> = {\n            display: "block",\n            position: "static",\n            width: "auto",\n            "min-width": "0",\n            "max-width": "100%",\n            margin: "0",\n            transform: "none",\n            "white-space": "normal",\n            overflow: "visible",\n            "overflow-wrap": "anywhere",\n            "word-break": "normal",\n            "text-align": "left",\n            "line-height": "1.45",\n            color: "var(--crm-warning-text)",\n          };\n          Object.entries(estilosTexto).forEach(([propriedade, valor]) =>\n            textoConsentimento.style.setProperty(\n              propriedade,\n              valor,\n              "important"\n            )\n          );\n        }\n      }\n\n      const previa = panel.querySelector<HTMLElement>(\n        ".agendaTemplatePreview"\n      );\n      const variaveis = panel.querySelector<HTMLElement>(\n        ".agendaTemplateVariables"\n      );\n      if (previa) {\n        if (consentimento) {\n          consentimento.insertAdjacentElement("afterend", previa);\n        } else if (variaveis) {\n          panel.insertBefore(previa, variaveis);\n        }\n      }\n\n      panel.querySelector<HTMLElement>(".agendaTemplateButtons")?.remove();\n\n      const configuracaoAtual = individualConfigs.get(row);\n      if (configuracaoAtual?.template_botoes.length) {\n        individualConfigs.set(row, {\n          ...configuracaoAtual,\n          template_botoes: [],\n        });\n      }\n\n      row.querySelectorAll<HTMLElement>("small,p,span").forEach((elemento) => {\n        const texto = normalize(elemento.textContent);\n        if (\n          !texto.includes(\n            "as variaveis mais comuns do template serao preenchidas automaticamente"\n          )\n        ) {\n          return;\n        }\n        const removivel = elemento.closest<HTMLElement>("small,p") || elemento;\n        removivel.remove();\n      });\n    };\n\n    const bindIndividualReminder = async (row: HTMLElement) => {`,
    "o ajuste visual dos lembretes individuais"
  );

  const chamadaRenderIndividual = /(\n\s{10}renderPanel\(\{\n\s{12}card: row,[\s\S]*?\n\s{10}\}\);)/;
  if (!chamadaRenderIndividual.test(codigo)) {
    throw new Error(
      "Não foi possível aplicar o ajuste após renderizar o lembrete individual."
    );
  }
  codigo = codigo.replace(
    chamadaRenderIndividual,
    `$1\n          ajustarPainelLembreteIndividual(row);`
  );

  fs.writeFileSync(arquivo, codigo, "utf8");
  console.log(
    "Consentimento, prévia e campos do lembrete WhatsApp ajustados no novo agendamento."
  );
} else {
  console.log("Layout do lembrete WhatsApp no novo agendamento já corrigido.");
}
