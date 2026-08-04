import fs from "node:fs";

const arquivo = "src/app/(private)/agendas/AgendaTemplateMappingEnhancer.tsx";
const marcador = "AGENDA_INDIVIDUAL_TEMPLATE_MAPPING_V1";
let codigo = fs.readFileSync(arquivo, "utf8");

function substituirObrigatorio(busca, substituicao, descricao) {
  if (!codigo.includes(busca)) {
    throw new Error(`Não foi possível aplicar ${descricao}.`);
  }
  codigo = codigo.replace(busca, substituicao);
}

if (!codigo.includes(marcador)) {
  const fimCss = "\n`;\n\nfunction normalize";
  const indiceFimCss = codigo.indexOf(fimCss);
  if (indiceFimCss < 0) {
    throw new Error("Não foi possível localizar o final dos estilos do mapeamento de templates.");
  }
  const estilosIndividuais = `\n/* ${marcador} */\n.agendaIndividualTemplateBound{min-width:0!important;max-width:100%;overflow:hidden}.agendaIndividualTemplateBound>*{min-width:0;max-width:100%}.agendaIndividualTemplateBound div,.agendaIndividualTemplateBound label,.agendaIndividualTemplateBound .field{min-width:0;max-width:100%}.agendaIndividualTemplateBound select,.agendaIndividualTemplateBound input[type="text"]{width:100%!important;min-width:0!important;max-width:100%!important}.agendaIndividualTemplateBound .agendaTemplateMappingPanel{grid-column:1/-1;width:100%;min-width:0;max-width:100%;overflow:hidden}.agendaIndividualTemplateBound .agendaTemplateVariableRow{grid-template-columns:58px minmax(0,1.2fr) minmax(0,1fr)}.agendaIndividualTemplateBound .agendaTemplatePreview{min-width:0}.agendaIndividualTemplateBound .agendaTemplatePreview pre{max-width:100%;overflow-wrap:anywhere}.agendaIndividualLegacyMarketingAck,.agendaIndividualLegacyHelper{display:none!important}\nbody .a2 .repeat.rem{min-width:0;max-width:100%;overflow:hidden;grid-template-columns:minmax(0,1fr) minmax(0,.72fr) minmax(0,1fr) 30px}body .a2 .repeat.rem>*{min-width:0;max-width:100%}body .a2 .repeat.rem .field,body .a2 .repeat.rem label,body .a2 .repeat.rem div{min-width:0;max-width:100%}body .a2 .repeat.rem select{width:100%!important;min-width:0!important;max-width:100%!important}\n`;
  codigo = codigo.slice(0, indiceFimCss) + estilosIndividuais + codigo.slice(indiceFimCss);

  const ancoraMapas = "    const saved = new Map<string, Record<string, unknown>>();";
  substituirObrigatorio(
    ancoraMapas,
    `${ancoraMapas}\n    const individualConfigs = new WeakMap<HTMLElement, MappingConfig>();`,
    "armazenamento dos mapeamentos individuais"
  );

  const ancoraFetch = "    const originalFetch = window.fetch.bind(window);";
  const helpers = `
    const textoNormalizado = (elemento: Element | null) =>
      normalize(elemento?.textContent || "");

    const selectPorRotulo = (row: HTMLElement, termos: string[]) => {
      const labels = Array.from(row.querySelectorAll<HTMLLabelElement>("label"));
      for (const label of labels) {
        const texto = textoNormalizado(label);
        if (!termos.some((termo) => texto.includes(normalize(termo)))) continue;
        const select = label.querySelector<HTMLSelectElement>("select");
        if (select) return select;
      }
      return null;
    };

    const selectCanalLembrete = (row: HTMLElement) =>
      Array.from(row.querySelectorAll<HTMLSelectElement>("select")).find((select) => {
        const opcoes = Array.from(select.options).map((item) => normalize(item.textContent || ""));
        return opcoes.includes("whatsapp") && opcoes.some((item) => item.includes("e-mail") || item.includes("email"));
      }) || null;

    const checkboxMarketingLegado = (row: HTMLElement) =>
      Array.from(row.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((input) => {
        if (input.dataset.map === "marketing-ack") return false;
        const texto = textoNormalizado(input.closest("label"));
        return texto.includes("marketing") && (texto.includes("confirmo") || texto.includes("ciente"));
      }) || null;

    const esconderElementosLegados = (row: HTMLElement) => {
      const ack = checkboxMarketingLegado(row);
      const labelAck = ack?.closest<HTMLElement>("label");
      if (labelAck) labelAck.classList.add("agendaIndividualLegacyMarketingAck");
      row.querySelectorAll<HTMLElement>("small,p,span").forEach((elemento) => {
        const texto = textoNormalizado(elemento);
        if (texto.includes("variaveis mais comuns do template") || texto.includes("preenchidas automaticamente com nome")) {
          elemento.classList.add("agendaIndividualLegacyHelper");
        }
      });
      return ack;
    };

    const sincronizarConsentimentoLegado = (
      row: HTMLElement,
      consentimento: boolean
    ) => {
      const legado = checkboxMarketingLegado(row);
      if (!legado || legado.checked === consentimento) return;
      window.setTimeout(() => {
        if (legado.isConnected && legado.checked !== consentimento) legado.click();
      }, 0);
    };

    const bindIndividualReminder = async (row: HTMLElement) => {
      if (row.dataset.individualTemplateBound === "true") return;
      const canal = selectCanalLembrete(row);
      if (!canal) return;
      row.dataset.individualTemplateBound = "true";
      row.classList.add("agendaIndividualTemplateBound");
      row.dataset.rule = "lembrete";

      try {
        const loaded = await loadOptions();
        if (disposed || !row.isConnected) return;

        const render = () => {
          if (!row.isConnected) return;
          const whatsapp = normalize(canal.value) === "whatsapp";
          if (!whatsapp) {
            row.querySelector<HTMLElement>(".agendaTemplateMappingPanel")?.remove();
            individualConfigs.delete(row);
            return;
          }

          const integration = selectPorRotulo(row, ["integração do whatsapp", "integracao do whatsapp"]);
          const templateSelect = selectPorRotulo(row, ["template aprovado", "template"]);
          if (!templateSelect) return;

          if (integration) integration.dataset.role = "integration";
          templateSelect.dataset.role = "template";
          const label = templateSelect.closest("label")?.querySelector("span");
          if (label) label.textContent = "Template aprovado";

          const legado = esconderElementosLegados(row);
          const template = loaded.templates.find((item) => item.id === templateSelect.value) || null;
          const atual = individualConfigs.get(row);
          const salvo = atual || (legado?.checked ? { marketing_aceito: true } : null);

          renderPanel({
            card: row,
            template,
            flows: loaded.fluxos,
            variables: Array.isArray((loaded as any).variables)
              ? (loaded as any).variables
              : [],
            saved: salvo,
            onOpenVariables: () => {},
            onChange: (config) => {
              if (config) {
                individualConfigs.set(row, config);
                sincronizarConsentimentoLegado(row, config.marketing_aceito);
              } else {
                individualConfigs.delete(row);
              }
            },
          });
        };

        canal.addEventListener("change", () => window.setTimeout(render, 0));
        row.addEventListener("change", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLSelectElement)) return;
          if (target.dataset.role === "template" || target.dataset.role === "integration") {
            window.setTimeout(render, 0);
          }
        });

        let verificacoes = 0;
        const timer = window.setInterval(() => {
          verificacoes += 1;
          const templateSelect = selectPorRotulo(row, ["template aprovado", "template"]);
          const painel = row.querySelector<HTMLElement>(".agendaTemplateMappingPanel");
          if (normalize(canal.value) === "whatsapp" && (painel?.dataset.templateId || "") !== (templateSelect?.value || "")) {
            render();
          }
          if (verificacoes >= 30 || !row.isConnected) window.clearInterval(timer);
        }, 150);

        render();
      } catch (error) {
        console.error("[AGENDA_TEMPLATE_MAPPING] Erro no lembrete individual:", error);
      }
    };

`;
  substituirObrigatorio(
    ancoraFetch,
    `${helpers}${ancoraFetch}`,
    "vinculação dos lembretes individuais"
  );

  const ancoraRetornoFetch = "      return originalFetch(input, init);";
  const injecaoFetch = `      if (
        method === "POST" &&
        /\\/rest\\/v1\\/rpc\\/agenda_etapa1_salvar_agendamento(?:\\?|$)/.test(url) &&
        typeof init?.body === "string"
      ) {
        try {
          const body = JSON.parse(init.body);
          const lembretes = body?.p_payload?.lembretes;
          if (Array.isArray(lembretes)) {
            const rows = Array.from(
              shell.querySelectorAll<HTMLElement>(".a2 .drawer .repeat.rem")
            );
            body.p_payload.lembretes = lembretes.map(
              (lembrete: Record<string, unknown>, index: number) => {
                if (normalize(lembrete.canal) !== "whatsapp") return lembrete;
                const row = rows[index];
                if (!row) return lembrete;
                const config = individualConfigs.get(row);
                const integration = selectPorRotulo(row, ["integração do whatsapp", "integracao do whatsapp"]);
                const template = selectPorRotulo(row, ["template aprovado", "template"]);
                const metadata = asRecord(lembrete.metadata_json);
                const integracaoId = integration?.value || String(lembrete.integracao_whatsapp_id || metadata.integracao_whatsapp_id || "");
                const templateId = template?.value || String(lembrete.whatsapp_template_id || metadata.whatsapp_template_id || config?.template_id || "");
                const consentimento =
                  config?.marketing_aceito ??
                  checkboxMarketingLegado(row)?.checked ??
                  metadata.marketing_aceito === true;
                const configuracao = config || {
                  template_id: templateId,
                  marketing_aceito: consentimento,
                  template_categoria_snapshot: String(metadata.template_categoria_snapshot || ""),
                  template_variaveis: Array.isArray(metadata.template_variaveis) ? metadata.template_variaveis : [],
                  template_botoes: [],
                };
                return {
                  ...lembrete,
                  integracao_whatsapp_id: integracaoId || null,
                  whatsapp_template_id: templateId || null,
                  marketing_aceito: consentimento,
                  metadata_json: {
                    ...metadata,
                    ...configuracao,
                    integracao_whatsapp_id: integracaoId || null,
                    whatsapp_template_id: templateId || null,
                    marketing_aceito: consentimento,
                    etapa: 4,
                    execucao_habilitada: true,
                  },
                };
              }
            );
            init = { ...init, body: JSON.stringify(body) };
          }
        } catch (error) {
          console.error("[AGENDA_TEMPLATE_MAPPING] Falha ao preparar lembrete individual:", error);
        }
      }
${ancoraRetornoFetch}`;
  substituirObrigatorio(
    ancoraRetornoFetch,
    injecaoFetch,
    "salvamento do mapeamento individual"
  );

  const inicioApply = codigo.indexOf("    const apply = () => {");
  const fimApply = codigo.indexOf("\n    };\n    const schedule = () => {", inicioApply);
  if (inicioApply < 0 || fimApply < 0) {
    throw new Error("Não foi possível localizar a rotina de aplicação do enhancer.");
  }
  const observacaoIndividual = `\n      shell.querySelectorAll<HTMLElement>(".a2 .drawer .repeat.rem").forEach((row) => {\n        void bindIndividualReminder(row);\n      });`;
  codigo = codigo.slice(0, fimApply) + observacaoIndividual + codigo.slice(fimApply);

  fs.writeFileSync(arquivo, codigo, "utf8");
  console.log("Mapeamento completo, prévia e consentimento de Marketing aplicados aos lembretes individuais.");
} else {
  console.log("Mapeamento dos templates dos lembretes individuais já aplicado.");
}
