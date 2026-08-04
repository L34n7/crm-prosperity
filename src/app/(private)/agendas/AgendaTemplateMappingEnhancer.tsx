"use client";

import { useEffect } from "react";
import {
  TEMPLATE_FORMAT_OPTIONS,
  TEMPLATE_SOURCE_OPTIONS,
  asRecord,
  resolveMappedValue,
  suggestButtonAction,
  suggestVariableMapping,
  type AgendaTemplateButtonMapping,
  type AgendaTemplateVariableMapping,
} from "@/lib/agendas/template-mapping";

const STYLE_ID = "agenda-template-mapping-enhancer";

type RichTemplate = {
  id: string;
  nome: string;
  idioma: string;
  categoria: string;
  integracao_whatsapp_id: string;
  corpo: string;
  variaveis: number[];
  botoes_detalhados: Array<{ indice: number; texto: string }>;
};
type Flow = { id: string; nome: string; status: string };
type Options = { templates: RichTemplate[]; fluxos: Flow[] };
type MappingConfig = {
  template_id: string;
  marketing_aceito: boolean;
  template_categoria_snapshot: string;
  template_variaveis: AgendaTemplateVariableMapping[];
  template_botoes: AgendaTemplateButtonMapping[];
};

const CSS = `
.agendaTemplateMappingPanel{grid-column:1/-1;margin-top:4px;padding:12px;border:1px solid var(--crm-border);border-radius:14px;background:var(--crm-surface-soft);display:grid;gap:11px}.agendaTemplateMappingHead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.agendaTemplateMappingHead strong{font-size:12px;color:var(--crm-text-strong)}.agendaTemplateMappingHead p{margin:3px 0 0;color:var(--crm-text-muted);font-size:10px;line-height:1.45}.agendaTemplateCategory{padding:4px 8px;border:1px solid var(--crm-success-border);border-radius:999px;background:var(--crm-success-bg);color:var(--crm-success-text);font-size:9px;font-weight:900}.agendaTemplateCategory.marketing{border-color:var(--crm-warning-border);background:var(--crm-warning-bg);color:var(--crm-warning-text)}
.agendaTemplateMappingTitle{margin:0;color:var(--crm-text-strong);font-size:11px;font-weight:900}.agendaTemplateVariables,.agendaTemplateButtons{display:grid;gap:8px}.agendaTemplateVariableRow{display:grid;grid-template-columns:58px minmax(150px,1.2fr) minmax(135px,1fr);gap:7px;align-items:end}.agendaTemplateButtonRow{display:grid;grid-template-columns:minmax(130px,1fr) minmax(130px,.9fr) minmax(150px,1.1fr);gap:7px;align-items:end}.agendaTemplateToken{height:35px;padding:0 8px;border:1px solid var(--crm-primary-border);border-radius:10px;background:var(--crm-primary-soft);color:var(--crm-primary-text);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900}.agendaTemplateMappingPanel label{display:grid;gap:4px}.agendaTemplateMappingPanel label>span{color:var(--crm-text-muted);font-size:9px;font-weight:850}.agendaTemplateMappingPanel select,.agendaTemplateMappingPanel input[type="text"]{width:100%;height:35px;padding:0 8px;border:1px solid var(--crm-border-strong);border-radius:10px;background:var(--crm-surface);color:var(--crm-text-strong);font:inherit;font-size:10px}.agendaTemplateFixed{grid-column:2/-1}.agendaTemplateMarketingAck{padding:9px 10px;border:1px solid var(--crm-warning-border);border-radius:10px;background:var(--crm-warning-bg);color:var(--crm-warning-text);display:flex!important;grid-template-columns:auto 1fr!important;align-items:flex-start;gap:8px!important;font-size:9.5px;line-height:1.45}.agendaTemplateMarketingAck input{margin-top:2px;accent-color:var(--crm-warning-text)}
.agendaTemplatePreview{padding:11px;border:1px solid var(--crm-border);border-radius:12px;background:var(--crm-surface)}.agendaTemplatePreview span{display:block;margin-bottom:6px;color:var(--crm-text-muted);font-size:9px;font-weight:900;text-transform:uppercase}.agendaTemplatePreview pre{margin:0;color:var(--crm-text);font:inherit;font-size:10.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.agendaTemplateMappingEmpty{padding:8px;color:var(--crm-text-muted);font-size:10px}.agendaTemplateButtonText{height:35px;padding:0 9px;border:1px solid var(--crm-border);border-radius:10px;background:var(--crm-surface);color:var(--crm-text-strong);display:flex;align-items:center;font-size:10px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:760px){.agendaTemplateVariableRow,.agendaTemplateButtonRow{grid-template-columns:1fr}.agendaTemplateToken{justify-content:flex-start}.agendaTemplateFixed{grid-column:auto}}
`;

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sourceKind(source: string) {
  return TEMPLATE_SOURCE_OPTIONS.find((item) => item.value === source)?.kind || "text";
}

function formatOptions(source: string, selected: string) {
  const kind = sourceKind(source);
  return TEMPLATE_FORMAT_OPTIONS.filter((item) =>
    (item.kinds as readonly string[]).includes(kind)
  )
    .map(
      (item) =>
        `<option value="${item.value}" ${item.value === selected ? "selected" : ""}>${escapeHtml(item.label)}</option>`
    )
    .join("");
}

function sourceOptions(selected: string) {
  return TEMPLATE_SOURCE_OPTIONS.map(
    (item) =>
      `<option value="${item.value}" ${item.value === selected ? "selected" : ""}>${escapeHtml(item.label)}</option>`
  ).join("");
}

function flowOptions(flows: Flow[], selected?: string | null) {
  return [
    '<option value="">Selecione o fluxo</option>',
    ...flows.map(
      (flow) =>
        `<option value="${flow.id}" ${flow.id === selected ? "selected" : ""}>${escapeHtml(flow.nome)}${flow.status !== "ativo" ? ` · ${escapeHtml(flow.status)}` : ""}</option>`
    ),
  ].join("");
}

function actionOptions(selected: string) {
  const entries = [
    ["confirmar", "Confirmar agendamento"],
    ["cancelar", "Iniciar cancelamento"],
    ["reagendar", "Iniciar reagendamento"],
    ["ignorar", "Sem ação"],
  ];
  return entries
    .map(
      ([value, label]) =>
        `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`
    )
    .join("");
}

function sampleContext() {
  return {
    appointment: {
      titulo: "Consulta de avaliação",
      nome_cliente: "Maria Silva",
      telefone_cliente: "31 99999-0000",
      email_cliente: "maria@exemplo.com",
      inicio_at: "2026-08-02T17:30:00.000Z",
      fim_at: "2026-08-02T18:30:00.000Z",
      local: "Unidade Centro",
      link_reuniao: "https://meet.google.com/exemplo",
      observacoes: "Chegar com 10 minutos de antecedência",
    },
    agenda: { nome: "Agenda de consultas", timezone: "America/Sao_Paulo" },
    contact: { nome: "Maria Silva", telefone: "31 99999-0000", email: "maria@exemplo.com" },
    responsible: { nome: "Dra. Ana", email: "ana@exemplo.com", telefone: "31 98888-0000" },
  };
}

function readPanel(card: HTMLElement, template: RichTemplate): MappingConfig {
  const variables = Array.from(
    card.querySelectorAll<HTMLElement>(".agendaTemplateVariableRow")
  ).map((row) => ({
    posicao: Number(row.dataset.position),
    fonte: row.querySelector<HTMLSelectElement>('[data-map="source"]')?.value || "",
    formato: row.querySelector<HTMLSelectElement>('[data-map="format"]')?.value || "texto",
    valor_fixo: row.querySelector<HTMLInputElement>('[data-map="fixed"]')?.value || null,
    valor_padrao: row.querySelector<HTMLInputElement>('[data-map="fallback"]')?.value || null,
  }));
  const buttons = Array.from(
    card.querySelectorAll<HTMLElement>(".agendaTemplateButtonRow")
  ).map((row) => ({
    indice: Number(row.dataset.index),
    texto_snapshot: row.dataset.text || "",
    acao: (row.querySelector<HTMLSelectElement>('[data-map="action"]')?.value || "ignorar") as AgendaTemplateButtonMapping["acao"],
    fluxo_id: row.querySelector<HTMLSelectElement>('[data-map="flow"]')?.value || null,
  }));
  return {
    template_id: template.id,
    marketing_aceito:
      card.querySelector<HTMLInputElement>('[data-map="marketing-ack"]')?.checked === true,
    template_categoria_snapshot: template.categoria,
    template_variaveis: variables,
    template_botoes: buttons,
  };
}

function preview(card: HTMLElement, template: RichTemplate) {
  const output = card.querySelector<HTMLElement>(".agendaTemplatePreview pre");
  if (!output) return;
  const config = readPanel(card, template);
  const mappings = new Map(config.template_variaveis.map((item) => [item.posicao, item]));
  output.textContent = String(template.corpo || "").replace(
    /\{\{\s*(\d+)\s*\}\}/g,
    (_match, value) => {
      const mapping = mappings.get(Number(value));
      return mapping ? resolveMappedValue(sampleContext(), mapping) : `{{${value}}}`;
    }
  );
}

function renderPanel(params: {
  card: HTMLElement;
  template: RichTemplate | null;
  flows: Flow[];
  saved?: Record<string, unknown> | null;
  onChange: (config: MappingConfig | null) => void;
}) {
  const { card, template, flows, onChange } = params;
  let panel = card.querySelector<HTMLElement>(".agendaTemplateMappingPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "agendaTemplateMappingPanel";
    const compatibility = card.querySelector<HTMLElement>('[data-role="compatibility"]');
    (compatibility?.parentElement || card.querySelector(".agendaAutomationBody") || card).appendChild(panel);
  }
  if (!template) {
    panel.dataset.templateId = "";
    panel.innerHTML = '<div class="agendaTemplateMappingEmpty">Selecione um template para mapear as variáveis e os botões.</div>';
    onChange(null);
    return;
  }

  const saved = asRecord(params.saved);
  const savedVariables = Array.isArray(saved.template_variaveis)
    ? (saved.template_variaveis as AgendaTemplateVariableMapping[])
    : [];
  const savedButtons = Array.isArray(saved.template_botoes)
    ? (saved.template_botoes as AgendaTemplateButtonMapping[])
    : [];
  const variables = template.variaveis.map(
    (position) =>
      savedVariables.find((item) => Number(item.posicao) === position) ||
      suggestVariableMapping(position)
  );
  const buttons = (template.botoes_detalhados || []).map((button) => {
    const current = savedButtons.find((item) => Number(item.indice) === button.indice);
    return (
      current || {
        indice: button.indice,
        texto_snapshot: button.texto,
        acao: suggestButtonAction(button.texto),
        fluxo_id: null,
      }
    );
  });
  const marketing = normalize(template.categoria) === "marketing";
  panel.dataset.templateId = template.id;
  panel.innerHTML = `
    <div class="agendaTemplateMappingHead"><div><strong>Mapeamento do template</strong><p>Os valores são resolvidos para cada agendamento no momento do envio.</p></div><span class="agendaTemplateCategory ${marketing ? "marketing" : ""}">${escapeHtml(template.categoria)}</span></div>
    ${
      marketing
        ? `<label class="agendaTemplateMarketingAck"><input type="checkbox" data-map="marketing-ack" ${saved.marketing_aceito === true ? "checked" : ""}/><span>A Meta classificou este template como Marketing. Estou ciente de que o envio seguirá as regras e cobranças dessa categoria.</span></label>`
        : ""
    }
    <div class="agendaTemplateVariables"><h4 class="agendaTemplateMappingTitle">Variáveis do corpo</h4>${
      variables.length
        ? variables
            .map(
              (mapping) => `<div class="agendaTemplateVariableRow" data-position="${mapping.posicao}"><div class="agendaTemplateToken">{{${mapping.posicao}}}</div><label><span>Informação do CRM</span><select data-map="source">${sourceOptions(mapping.fonte)}</select></label><label><span>Formato</span><select data-map="format">${formatOptions(mapping.fonte, mapping.formato)}</select></label><label class="agendaTemplateFixed" data-fixed-wrap style="${mapping.fonte === "texto_fixo" ? "" : "display:none"}"><span>Texto fixo</span><input type="text" data-map="fixed" value="${escapeHtml(mapping.valor_fixo || "")}"/></label></div>`
            )
            .join("")
        : '<div class="agendaTemplateMappingEmpty">Este template não possui variáveis no corpo.</div>'
    }</div>
    ${
      card.dataset.rule === "confirmacao"
        ? `<div class="agendaTemplateButtons"><h4 class="agendaTemplateMappingTitle">Ações dos botões</h4>${
            buttons.length
              ? buttons
                  .map(
                    (mapping) => `<div class="agendaTemplateButtonRow" data-index="${mapping.indice}" data-text="${escapeHtml(mapping.texto_snapshot || template.botoes_detalhados.find((item) => item.indice === mapping.indice)?.texto || "")}"><div><span style="display:block;margin-bottom:4px;color:var(--crm-text-muted);font-size:9px;font-weight:850">Botão do template</span><div class="agendaTemplateButtonText">${escapeHtml(template.botoes_detalhados.find((item) => item.indice === mapping.indice)?.texto || mapping.texto_snapshot)}</div></div><label><span>Ação no CRM</span><select data-map="action">${actionOptions(mapping.acao)}</select></label><label><span>Fluxo após a ação</span><select data-map="flow">${flowOptions(flows, mapping.fluxo_id)}</select></label></div>`
                  )
                  .join("")
              : '<div class="agendaTemplateMappingEmpty">O template não possui botões de resposta rápida.</div>'
          }</div>`
        : ""
    }
    <div class="agendaTemplatePreview"><span>Prévia com dados de exemplo</span><pre></pre></div>`;

  const refresh = () => {
    preview(card, template);
    onChange(readPanel(card, template));
  };
  panel.querySelectorAll<HTMLSelectElement>('[data-map="source"]').forEach((select) => {
    select.addEventListener("change", () => {
      const row = select.closest<HTMLElement>(".agendaTemplateVariableRow");
      const format = row?.querySelector<HTMLSelectElement>('[data-map="format"]');
      const fixedWrap = row?.querySelector<HTMLElement>("[data-fixed-wrap]");
      if (format) {
        const defaultFormat = sourceKind(select.value) === "datetime" ? "data_numerica" : "texto";
        format.innerHTML = formatOptions(select.value, defaultFormat);
      }
      if (fixedWrap) fixedWrap.style.display = select.value === "texto_fixo" ? "" : "none";
      refresh();
    });
  });
  panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select").forEach((input) => {
    if (input.dataset.map === "source") return;
    input.addEventListener("input", refresh);
    input.addEventListener("change", refresh);
  });
  refresh();
}

export default function AgendaTemplateMappingEnhancer() {
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".agendaTemplateShell");
    if (!shell) return;
    let disposed = false;
    let frame = 0;
    let options: Options | null = null;
    let optionsPromise: Promise<Options> | null = null;
    const latest = new Map<string, MappingConfig>();
    const saved = new Map<string, Record<string, unknown>>();

    let style = document.getElementById(STYLE_ID);
    const ownsStyle = !style;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const loadOptions = () => {
      if (options) return Promise.resolve(options);
      if (!optionsPromise) {
        optionsPromise = fetch("/api/agendas/automacoes/opcoes", { cache: "no-store" })
          .then(async (response) => {
            const data = await response.json();
            if (!response.ok || !data?.ok) throw new Error(data?.error || "Erro ao carregar templates.");
            options = { templates: data.templates || [], fluxos: data.fluxos || [] };
            return options;
          })
          .finally(() => {
            optionsPromise = null;
          });
      }
      return optionsPromise;
    };

    const selectedAgendaId = () =>
      shell.querySelector<HTMLSelectElement>(".a2 .head select.select")?.value || "";

    const bindSection = async (section: HTMLElement) => {
      if (section.dataset.mappingBound === "true") return;
      section.dataset.mappingBound = "true";
      try {
        const loaded = await loadOptions();
        if (disposed || !section.isConnected) return;
        const agendaId = section.dataset.mode === "edit" ? selectedAgendaId() : "";
        if (agendaId) {
          const response = await fetch(`/api/agendas/${encodeURIComponent(agendaId)}/automacoes`, {
            cache: "no-store",
          });
          const data = await response.json();
          if (response.ok && data?.ok) {
            for (const rule of data.regras || []) {
              if (rule.canal === "whatsapp") {
                saved.set(String(rule.tipo), asRecord(rule.configuracao_json));
              }
            }
          }
        }

        for (const type of ["confirmacao", "lembrete"]) {
          const card = section.querySelector<HTMLElement>(`[data-rule="${type}"]`);
          if (!card) continue;
          const templateSelect = card.querySelector<HTMLSelectElement>('[data-role="template"]');
          const label = templateSelect?.closest("label")?.querySelector("span");
          if (label) label.textContent = "Template aprovado";
          const render = (reset = false) => {
            const template = loaded.templates.find((item) => item.id === templateSelect?.value) || null;
            const savedConfig = reset ? null : latest.get(type) || saved.get(type) || null;
            renderPanel({
              card,
              template,
              flows: loaded.fluxos,
              saved: savedConfig,
              onChange: (config) => {
                if (config) latest.set(type, config);
                else latest.delete(type);
              },
            });
          };
          templateSelect?.addEventListener("change", () => render(true));
          let checks = 0;
          const timer = window.setInterval(() => {
            checks += 1;
            const panel = card.querySelector<HTMLElement>(".agendaTemplateMappingPanel");
            if ((panel?.dataset.templateId || "") !== (templateSelect?.value || "")) {
              render(false);
            }
            if (checks >= 20 || !section.isConnected) window.clearInterval(timer);
          }, 150);
          render(false);
        }
      } catch (error) {
        console.error("[AGENDA_TEMPLATE_MAPPING] Erro:", error);
      }
    };

    const originalFetch = window.fetch.bind(window);
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (
        method === "PUT" &&
        /\/api\/agendas\/[^/]+\/automacoes(?:\?|$)/.test(url) &&
        typeof init?.body === "string"
      ) {
        try {
          const body = JSON.parse(init.body);
          if (Array.isArray(body?.regras)) {
            body.regras = body.regras.map((rule: Record<string, unknown>) => {
              if (rule.canal !== "whatsapp") return rule;
              const config = latest.get(String(rule.tipo));
              if (!config) return rule;
              return {
                ...rule,
                configuracao_json: {
                  ...asRecord(rule.configuracao_json),
                  ...config,
                  etapa: 4,
                  execucao_habilitada: true,
                },
              };
            });
            init = { ...init, body: JSON.stringify(body) };
          }
        } catch (error) {
          console.error("[AGENDA_TEMPLATE_MAPPING] Falha ao preparar salvamento:", error);
        }
      }
      return originalFetch(input, init);
    };
    window.fetch = wrappedFetch;

    const apply = () => {
      frame = 0;
      if (disposed) return;
      shell.querySelectorAll<HTMLElement>(".agendaAutomationSection").forEach((section) => {
        void bindSection(section);
      });
    };
    const schedule = () => {
      if (!frame && !disposed) frame = window.requestAnimationFrame(apply);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(shell, { childList: true, subtree: true });
    apply();

    return () => {
      disposed = true;
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
      if (ownsStyle) style?.remove();
    };
  }, []);

  return null;
}
