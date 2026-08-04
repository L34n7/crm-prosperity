"use client";

import { useEffect } from "react";
import {
  TEMPLATE_FORMAT_OPTIONS,
  TEMPLATE_SOURCE_OPTIONS,
  asRecord,
  canonicalTemplateSource,
  customTemplateSource,
  normalizeTemplateVariableKey,
  normalizeVariableMappings,
  resolveMappedValue,
  suggestButtonAction,
  suggestVariableMapping,
  templateCustomVariableKey,
  templateSourceKind,
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
type CustomVariable = {
  id: string;
  chave: string;
  valor: string;
  descricao?: string | null;
  escopo?: string | null;
  ativo?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};
type Options = {
  templates: RichTemplate[];
  fluxos: Flow[];
  variaveis: CustomVariable[];
};
type MappingConfig = {
  template_id: string;
  marketing_aceito: boolean;
  template_categoria_snapshot: string;
  template_variaveis: AgendaTemplateVariableMapping[];
  template_botoes: AgendaTemplateButtonMapping[];
};
type PickerOption = {
  value: string;
  variable: string;
  label: string;
  description: string;
  category: "Personalizada" | "Nome e número" | "Agenda" | "Fixa";
  kind: "text" | "datetime" | "fixed";
  custom?: boolean;
};

const CSS = `
.agendaTemplateMappingPanel{grid-column:1/-1;margin-top:4px;padding:13px;border:1px solid var(--crm-border);border-radius:14px;background:var(--crm-surface-soft);display:grid;gap:12px}.agendaTemplateMappingHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.agendaTemplateMappingHead strong{font-size:12px;color:var(--crm-text-strong)}.agendaTemplateMappingHead p{margin:3px 0 0;color:var(--crm-text-muted);font-size:10px;line-height:1.45}.agendaTemplateMappingHeadActions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}.agendaTemplateCategory{padding:4px 8px;border:1px solid var(--crm-success-border);border-radius:999px;background:var(--crm-success-bg);color:var(--crm-success-text);font-size:9px;font-weight:900}.agendaTemplateCategory.marketing{border-color:var(--crm-warning-border);background:var(--crm-warning-bg);color:var(--crm-warning-text)}.agendaTemplateVariableCreate{height:30px;padding:0 10px;border:1px solid var(--crm-primary-border);border-radius:9px;background:var(--crm-primary-soft);color:var(--crm-primary-text);font:inherit;font-size:9.5px;font-weight:900;cursor:pointer}.agendaTemplateVariableCreate:hover{border-color:var(--crm-primary-strong)}
.agendaTemplateMappingTitle{margin:0;color:var(--crm-text-strong);font-size:11px;font-weight:900}.agendaTemplateVariables,.agendaTemplateButtons{display:grid;gap:8px}.agendaTemplateVariableRow{display:grid;grid-template-columns:58px minmax(190px,1.35fr) minmax(135px,.8fr);gap:7px;align-items:end}.agendaTemplateButtonRow{display:grid;grid-template-columns:minmax(130px,1fr) minmax(130px,.9fr) minmax(150px,1.1fr);gap:7px;align-items:end}.agendaTemplateToken{height:45px;padding:0 8px;border:1px solid var(--crm-primary-border);border-radius:10px;background:var(--crm-primary-soft);color:var(--crm-primary-text);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900}.agendaTemplateMappingPanel label{display:grid;gap:4px}.agendaTemplateMappingPanel label>span,.agendaTemplateFieldLabel{color:var(--crm-text-muted);font-size:9px;font-weight:850}.agendaTemplateMappingPanel select,.agendaTemplateMappingPanel input[type="text"]{width:100%;height:39px;padding:0 9px;border:1px solid var(--crm-border-strong);border-radius:10px;background:var(--crm-surface);color:var(--crm-text-strong);font:inherit;font-size:10px}.agendaTemplateFixed{grid-column:2/-1}.agendaTemplateMarketingAck{padding:9px 10px;border:1px solid var(--crm-warning-border);border-radius:10px;background:var(--crm-warning-bg);color:var(--crm-warning-text);display:flex!important;grid-template-columns:auto 1fr!important;align-items:flex-start;gap:8px!important;font-size:9.5px;line-height:1.45}.agendaTemplateMarketingAck input{margin-top:2px;accent-color:var(--crm-warning-text)}
.agendaTemplateSourceField{display:grid;gap:4px;min-width:0}.agendaVariablePicker{position:relative;min-width:0}.agendaVariablePickerTrigger{width:100%;min-height:45px;padding:6px 34px 6px 10px;border:1px solid var(--crm-border-strong);border-radius:10px;background:var(--crm-surface);color:var(--crm-text-strong);font:inherit;text-align:left;cursor:pointer;position:relative;display:block}.agendaVariablePickerTrigger:hover,.agendaVariablePickerTrigger[aria-expanded="true"]{border-color:var(--crm-primary-strong);box-shadow:var(--crm-focus-ring)}.agendaVariablePickerTrigger strong{display:block;color:var(--crm-text-strong);font-size:10.5px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.agendaVariablePickerTrigger small{display:block;margin-top:3px;color:var(--crm-text-muted);font-size:8.8px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.agendaVariablePickerChevron{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:13px;color:var(--crm-text-muted)}.agendaVariablePickerMenu{position:absolute;z-index:80;top:calc(100% + 6px);left:0;width:min(390px,82vw);max-height:330px;padding:8px;border:1px solid var(--crm-border-strong);border-radius:12px;background:var(--crm-surface);box-shadow:0 18px 45px color-mix(in srgb,var(--crm-text-strong) 20%,transparent);overflow:hidden}.agendaVariablePickerMenu[hidden]{display:none}.agendaVariablePickerSearch{width:100%;height:36px!important;margin-bottom:7px;padding:0 10px!important;border:1px solid var(--crm-border-strong)!important;border-radius:9px!important;background:var(--crm-surface-soft)!important;color:var(--crm-text-strong)!important;font:inherit!important;font-size:10px!important}.agendaVariablePickerOptions{max-height:270px;overflow-y:auto;display:grid;gap:3px;padding-right:2px}.agendaVariablePickerGroup{padding:8px 7px 3px;color:var(--crm-text-soft);font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.agendaVariablePickerOption{width:100%;padding:8px 9px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--crm-text);font:inherit;text-align:left;cursor:pointer;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}.agendaVariablePickerOption:hover,.agendaVariablePickerOption.isSelected{border-color:var(--crm-primary-border);background:var(--crm-primary-soft)}.agendaVariablePickerOption strong{display:block;color:var(--crm-text-strong);font-size:10px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.agendaVariablePickerOption small{display:block;margin-top:3px;color:var(--crm-text-muted);font-size:8.6px;line-height:1.35}.agendaVariablePickerBadge{align-self:start;padding:3px 6px;border:1px solid var(--crm-border);border-radius:999px;background:var(--crm-surface-soft);color:var(--crm-text-muted);font-size:7.5px;font-weight:900;white-space:nowrap}.agendaVariablePickerEmpty{display:none;padding:12px;color:var(--crm-text-muted);font-size:9px;text-align:center}.agendaVariablePickerEmpty.show{display:block}
.agendaTemplatePreview{padding:0;border:1px solid var(--crm-border);border-radius:18px;background:var(--crm-surface);overflow:hidden}.agendaTemplatePreviewHeader{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid var(--crm-border);background:var(--crm-surface-soft)}.agendaTemplatePreviewHeader span{color:var(--crm-text-strong);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.agendaTemplatePreviewHeader small{color:var(--crm-text-muted);font-size:9px;font-weight:700}.agendaTemplatePreviewArea{padding:16px;background:radial-gradient(circle at 20% 20%,var(--crm-ui-private-surface-rgb-15-23-42-0-04) 0 2px,transparent 2px),var(--crm-ui-private-surface-hex-efe7dd);background-size:18px 18px}.agendaTemplatePreviewBubble{width:min(100%,420px);position:relative;padding:12px 12px 8px;border-radius:0 14px 14px 14px;background:var(--crm-surface);box-shadow:0 8px 22px var(--crm-ui-private-shadow-rgb-15-23-42-0-12)}.agendaTemplatePreviewBubble:before{content:"";position:absolute;top:0;left:-9px;border-top:9px solid var(--crm-surface);border-left:9px solid transparent}.agendaTemplatePreviewBubble pre{margin:0;color:var(--crm-text-strong);font:inherit;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.agendaTemplatePreviewMeta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;color:var(--crm-text-muted);font-size:8.5px}.agendaTemplatePreviewMeta span{font-weight:700}.agendaTemplatePreviewMeta time{white-space:nowrap;font-weight:800}.agendaTemplateMappingEmpty{padding:8px;color:var(--crm-text-muted);font-size:10px}.agendaTemplateButtonText{height:39px;padding:0 9px;border:1px solid var(--crm-border);border-radius:10px;background:var(--crm-surface);color:var(--crm-text-strong);display:flex;align-items:center;font-size:10px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.agendaVariableModalBackdrop{position:fixed;z-index:10020;inset:0;padding:18px;background:color-mix(in srgb,var(--crm-text-strong) 42%,transparent);display:flex;align-items:center;justify-content:center}.agendaVariableModalBackdrop[hidden]{display:none}.agendaVariableModal{width:min(720px,96vw);max-height:min(760px,92vh);border:1px solid var(--crm-border-strong);border-radius:20px;background:var(--crm-surface);box-shadow:0 24px 70px color-mix(in srgb,var(--crm-text-strong) 30%,transparent);display:flex;flex-direction:column;overflow:hidden}.agendaVariableModalHead{padding:16px 18px;border-bottom:1px solid var(--crm-border);background:var(--crm-surface-soft);display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.agendaVariableModalHead h3{margin:0;color:var(--crm-text-strong);font-size:17px}.agendaVariableModalHead p{margin:4px 0 0;color:var(--crm-text-muted);font-size:10.5px;line-height:1.45}.agendaVariableModalClose{width:34px;height:34px;border:1px solid var(--crm-border);border-radius:10px;background:var(--crm-surface);color:var(--crm-text-strong);font:inherit;font-size:18px;cursor:pointer}.agendaVariableModalBody{padding:15px 18px 18px;overflow-y:auto;display:grid;gap:15px}.agendaVariableModalSection{padding:13px;border:1px solid var(--crm-border);border-radius:15px;background:var(--crm-surface-soft);display:grid;gap:10px}.agendaVariableModalSection h4{margin:0;color:var(--crm-text-strong);font-size:12px}.agendaVariableForm{display:grid;grid-template-columns:1fr 1fr;gap:9px}.agendaVariableForm label{display:grid;gap:5px}.agendaVariableForm label.full{grid-column:1/-1}.agendaVariableForm span{color:var(--crm-text-muted);font-size:9px;font-weight:850}.agendaVariableForm input{width:100%;height:39px;padding:0 10px;border:1px solid var(--crm-border-strong);border-radius:10px;background:var(--crm-surface);color:var(--crm-text-strong);font:inherit;font-size:10.5px}.agendaVariablePreview{padding:9px 10px;border:1px dashed var(--crm-primary-border);border-radius:10px;background:var(--crm-primary-soft);color:var(--crm-primary-text);font-size:9.5px}.agendaVariableModalActions{display:flex;align-items:center;justify-content:flex-end;gap:8px}.agendaVariablePrimary,.agendaVariableSecondary,.agendaVariableDanger{min-height:36px;padding:0 12px;border-radius:10px;font:inherit;font-size:10px;font-weight:900;cursor:pointer}.agendaVariablePrimary{border:1px solid var(--crm-primary-strong);background:var(--crm-primary-strong);color:var(--crm-text-inverse)}.agendaVariableSecondary{border:1px solid var(--crm-border-strong);background:var(--crm-surface);color:var(--crm-text-strong)}.agendaVariableDanger{border:1px solid var(--crm-danger-border);background:var(--crm-danger-bg);color:var(--crm-danger-text)}.agendaVariableFeedback{display:none;padding:9px 10px;border-radius:10px;font-size:9.5px;line-height:1.4}.agendaVariableFeedback.show{display:block}.agendaVariableFeedback.error{border:1px solid var(--crm-danger-border);background:var(--crm-danger-bg);color:var(--crm-danger-text)}.agendaVariableFeedback.success{border:1px solid var(--crm-success-border);background:var(--crm-success-bg);color:var(--crm-success-text)}.agendaVariableList{display:grid;gap:7px}.agendaVariableListItem{padding:10px;border:1px solid var(--crm-border);border-radius:11px;background:var(--crm-surface);display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.agendaVariableListItem strong{display:block;color:var(--crm-text-strong);font-size:10.5px}.agendaVariableListItem p{margin:4px 0 0;color:var(--crm-text-muted);font-size:9px;line-height:1.4}.agendaVariableListItem small{display:block;margin-top:4px;color:var(--crm-text-soft);font-size:8.5px;overflow-wrap:anywhere}.agendaVariableListEmpty{padding:10px;color:var(--crm-text-muted);font-size:9.5px;text-align:center}.agendaVariableFixedList{display:grid;grid-template-columns:1fr 1fr;gap:7px}.agendaVariableFixedItem{padding:9px;border:1px solid var(--crm-border);border-radius:10px;background:var(--crm-surface)}.agendaVariableFixedItem strong{display:block;color:var(--crm-text-strong);font-size:9.5px}.agendaVariableFixedItem small{display:block;margin-top:3px;color:var(--crm-text-muted);font-size:8.5px;line-height:1.35}
@media(max-width:760px){.agendaTemplateMappingHead{flex-direction:column}.agendaTemplateMappingHeadActions{justify-content:flex-start}.agendaTemplateVariableRow,.agendaTemplateButtonRow{grid-template-columns:1fr}.agendaTemplateToken{justify-content:flex-start}.agendaTemplateFixed{grid-column:auto}.agendaVariablePickerMenu{width:100%}.agendaVariableForm,.agendaVariableFixedList{grid-template-columns:1fr}.agendaVariableModalBackdrop{padding:8px}.agendaVariableModal{max-height:96vh}}
/* AGENDA_INDIVIDUAL_TEMPLATE_MAPPING_V1 */
.agendaIndividualTemplateBound{min-width:0!important;max-width:100%;overflow:hidden}.agendaIndividualTemplateBound>*{min-width:0;max-width:100%}.agendaIndividualTemplateBound div,.agendaIndividualTemplateBound label,.agendaIndividualTemplateBound .field{min-width:0;max-width:100%}.agendaIndividualTemplateBound select,.agendaIndividualTemplateBound input[type="text"]{width:100%!important;min-width:0!important;max-width:100%!important}.agendaIndividualTemplateBound .agendaTemplateMappingPanel{grid-column:1/-1;width:100%;min-width:0;max-width:100%;overflow:hidden}.agendaIndividualTemplateBound .agendaTemplateVariableRow{grid-template-columns:58px minmax(0,1.2fr) minmax(0,1fr)}.agendaIndividualTemplateBound .agendaTemplatePreview{min-width:0}.agendaIndividualTemplateBound .agendaTemplatePreview pre{max-width:100%;overflow-wrap:anywhere}.agendaIndividualLegacyMarketingAck,.agendaIndividualLegacyHelper{display:none!important}
body .a2 .repeat.agendaIndividualTemplateBound{min-width:0;max-width:100%;overflow:hidden;grid-template-columns:minmax(0,1fr) minmax(0,.72fr) minmax(0,1fr) 30px}body .a2 .repeat.agendaIndividualTemplateBound>*{min-width:0;max-width:100%}body .a2 .repeat.agendaIndividualTemplateBound .field,body .a2 .repeat.agendaIndividualTemplateBound label,body .a2 .repeat.agendaIndividualTemplateBound div{min-width:0;max-width:100%}body .a2 .repeat.agendaIndividualTemplateBound select{width:100%!important;min-width:0!important;max-width:100%!important}

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

function sortVariables(variables: CustomVariable[]) {
  return [...variables]
    .filter((item) => item.ativo !== false && normalizeTemplateVariableKey(item.chave))
    .sort((a, b) => {
      const aTime = new Date(a.created_at || a.updated_at || 0).getTime();
      const bTime = new Date(b.created_at || b.updated_at || 0).getTime();
      if (aTime !== bTime) return bTime - aTime;
      return String(a.chave).localeCompare(String(b.chave), "pt-BR");
    });
}

function pickerOptions(variables: CustomVariable[]): PickerOption[] {
  const custom = sortVariables(variables).map((item) => {
    const key = normalizeTemplateVariableKey(item.chave);
    return {
      value: customTemplateSource(key),
      variable: `{{${key}}}`,
      label: key,
      description:
        String(item.descricao || "").trim() ||
        "Variável personalizada cadastrada pela empresa.",
      category: "Personalizada" as const,
      kind: "text" as const,
      custom: true,
    };
  });
  const fixed = TEMPLATE_SOURCE_OPTIONS.map((item) => ({
    value: item.value,
    variable: item.variable,
    label: item.label,
    description: item.description,
    category: item.category,
    kind: item.kind,
  }));
  return [...custom, ...fixed];
}

function optionForSource(options: PickerOption[], source: string): PickerOption {
  const canonical = canonicalTemplateSource(source);
  const found = options.find((item) => item.value === canonical);
  if (found) return found;
  if (canonical === "contato.primeiro_nome") {
    return {
      value: canonical,
      variable: "Primeiro nome do contato",
      label: "Primeiro nome do contato",
      description: "Mapeamento antigo preservado para compatibilidade.",
      category: "Fixa",
      kind: "text",
    };
  }
  const customKey = templateCustomVariableKey(canonical);
  if (customKey) {
    return {
      value: canonical,
      variable: `{{${customKey}}}`,
      label: customKey,
      description: "Variável personalizada indisponível ou removida.",
      category: "Personalizada",
      kind: "text",
      custom: true,
    };
  }
  return options[0] || {
    value: "nome_contato",
    variable: "{{nome_contato}}",
    label: "Nome salvo no contato",
    description: "Nome salvo no cadastro do contato.",
    category: "Nome e número",
    kind: "text",
  };
}

function formatOptions(source: string, selected: string) {
  const kind = templateSourceKind(source);
  return TEMPLATE_FORMAT_OPTIONS.filter((item) =>
    (item.kinds as readonly string[]).includes(kind)
  )
    .map(
      (item) =>
        `<option value="${item.value}" ${item.value === selected ? "selected" : ""}>${escapeHtml(item.label)}</option>`
    )
    .join("");
}

function flowOptions(flows: Flow[], selected?: string | null) {
  return [
    '<option value="">Selecione o fluxo</option>',
    ...flows
      .filter((flow) => flow.status === "ativo")
      .map(
        (flow) =>
          `<option value="${flow.id}" ${flow.id === selected ? "selected" : ""}>${escapeHtml(flow.nome)}</option>`
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

function pickerMenuHtml(options: PickerOption[], selected: string) {
  let lastCategory = "";
  return options
    .map((item) => {
      const group =
        item.category !== lastCategory
          ? `<div class="agendaVariablePickerGroup" data-picker-group="${escapeHtml(item.category)}">${escapeHtml(item.category)}</div>`
          : "";
      lastCategory = item.category;
      return `${group}<button type="button" class="agendaVariablePickerOption ${item.value === selected ? "isSelected" : ""}" data-picker-option data-value="${escapeHtml(item.value)}" data-search="${escapeHtml(`${item.variable} ${item.label} ${item.description} ${item.category}`.toLowerCase())}"><span><strong>${escapeHtml(item.variable)}</strong><small>${escapeHtml(item.description)}</small></span><span class="agendaVariablePickerBadge">${escapeHtml(item.category)}</span></button>`;
    })
    .join("");
}

function pickerHtml(source: string, options: PickerOption[]) {
  const selected = optionForSource(options, source);
  return `<div class="agendaVariablePicker" data-source-picker><input type="hidden" data-map="source" value="${escapeHtml(selected.value)}"/><button type="button" class="agendaVariablePickerTrigger" data-picker-trigger aria-expanded="false"><strong data-picker-title>${escapeHtml(selected.variable)}</strong><small data-picker-description>${escapeHtml(selected.description)}</small><span class="agendaVariablePickerChevron">⌄</span></button><div class="agendaVariablePickerMenu" data-picker-menu hidden><input type="search" class="agendaVariablePickerSearch" data-picker-search placeholder="Buscar variável" autocomplete="off"/><div class="agendaVariablePickerOptions">${pickerMenuHtml(options, selected.value)}</div><div class="agendaVariablePickerEmpty" data-picker-empty>Nenhuma variável encontrada.</div></div></div>`;
}

function sampleContext(variables: CustomVariable[]) {
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
    contact: {
      nome: "Maria Silva",
      whatsapp_profile_name: "Maria",
      telefone: "31 99999-0000",
      email: "maria@exemplo.com",
      origem: "Instagram",
      campanha: "Avaliação inicial",
      status_lead: "Qualificado",
      classificacao: "qualificado",
    },
    responsible: {
      nome: "Dra. Ana",
      email: "ana@exemplo.com",
      telefone: "31 98888-0000",
    },
    variables: Object.fromEntries(
      sortVariables(variables).map((item) => [
        normalizeTemplateVariableKey(item.chave),
        String(item.valor || ""),
      ])
    ),
    protocols: {
      protocolo_atual: "AT-2026-000145",
      ultimo_protocolo: "AT-2026-000121",
    },
  };
}

function readPanel(card: HTMLElement, template: RichTemplate): MappingConfig {
  const variables = Array.from(
    card.querySelectorAll<HTMLElement>(".agendaTemplateVariableRow")
  ).map((row) => ({
    posicao: Number(row.dataset.position),
    fonte:
      row.querySelector<HTMLInputElement>('[data-map="source"]')?.value || "",
    formato:
      row.querySelector<HTMLSelectElement>('[data-map="format"]')?.value ||
      "texto",
    valor_fixo:
      row.querySelector<HTMLInputElement>('[data-map="fixed"]')?.value || null,
    valor_padrao:
      row.querySelector<HTMLInputElement>('[data-map="fallback"]')?.value || null,
  }));
  const buttons = Array.from(
    card.querySelectorAll<HTMLElement>(".agendaTemplateButtonRow")
  ).map((row) => ({
    indice: Number(row.dataset.index),
    texto_snapshot: row.dataset.text || "",
    acao: (row.querySelector<HTMLSelectElement>('[data-map="action"]')?.value ||
      "ignorar") as AgendaTemplateButtonMapping["acao"],
    fluxo_id:
      row.querySelector<HTMLSelectElement>('[data-map="flow"]')?.value || null,
  }));
  return {
    template_id: template.id,
    marketing_aceito:
      card.querySelector<HTMLInputElement>('[data-map="marketing-ack"]')
        ?.checked === true,
    template_categoria_snapshot: template.categoria,
    template_variaveis: variables,
    template_botoes: buttons,
  };
}

function preview(
  card: HTMLElement,
  template: RichTemplate,
  variables: CustomVariable[]
) {
  const output = card.querySelector<HTMLElement>(".agendaTemplatePreview pre");
  if (!output) return;
  const config = readPanel(card, template);
  const mappings = new Map(
    config.template_variaveis.map((item) => [item.posicao, item])
  );
  output.textContent = String(template.corpo || "").replace(
    /\{\{\s*(\d+)\s*\}\}/g,
    (_match, value) => {
      const mapping = mappings.get(Number(value));
      return mapping
        ? resolveMappedValue(sampleContext(variables), mapping)
        : `{{${value}}}`;
    }
  );
}

function closeAllPickers(except?: HTMLElement | null) {
  document
    .querySelectorAll<HTMLElement>(".agendaVariablePicker")
    .forEach((picker) => {
      if (except && picker === except) return;
      const menu = picker.querySelector<HTMLElement>("[data-picker-menu]");
      const trigger = picker.querySelector<HTMLElement>("[data-picker-trigger]");
      if (menu) menu.hidden = true;
      trigger?.setAttribute("aria-expanded", "false");
    });
}

function bindPickers(
  panel: HTMLElement,
  onSourceChange: (row: HTMLElement, source: string) => void
) {
  panel.querySelectorAll<HTMLElement>("[data-source-picker]").forEach((picker) => {
    const hidden = picker.querySelector<HTMLInputElement>('[data-map="source"]');
    const trigger = picker.querySelector<HTMLButtonElement>("[data-picker-trigger]");
    const menu = picker.querySelector<HTMLElement>("[data-picker-menu]");
    const search = picker.querySelector<HTMLInputElement>("[data-picker-search]");
    const title = picker.querySelector<HTMLElement>("[data-picker-title]");
    const description = picker.querySelector<HTMLElement>(
      "[data-picker-description]"
    );
    const empty = picker.querySelector<HTMLElement>("[data-picker-empty]");
    if (!hidden || !trigger || !menu || !search) return;

    trigger.addEventListener("click", () => {
      const opening = menu.hidden;
      closeAllPickers(opening ? picker : null);
      menu.hidden = !opening;
      trigger.setAttribute("aria-expanded", String(opening));
      if (opening) {
        search.value = "";
        picker
          .querySelectorAll<HTMLElement>("[data-picker-option],[data-picker-group]")
          .forEach((item) => (item.style.display = ""));
        empty?.classList.remove("show");
        window.setTimeout(() => search.focus(), 0);
      }
    });

    search.addEventListener("input", () => {
      const term = normalize(search.value);
      let visible = 0;
      picker
        .querySelectorAll<HTMLButtonElement>("[data-picker-option]")
        .forEach((item) => {
          const matches = !term || normalize(item.dataset.search).includes(term);
          item.style.display = matches ? "" : "none";
          if (matches) visible += 1;
        });
      picker
        .querySelectorAll<HTMLElement>("[data-picker-group]")
        .forEach((group) => (group.style.display = term ? "none" : ""));
      empty?.classList.toggle("show", visible === 0);
    });

    picker
      .querySelectorAll<HTMLButtonElement>("[data-picker-option]")
      .forEach((item) => {
        item.addEventListener("click", () => {
          const source = String(item.dataset.value || "");
          const optionTitle = item.querySelector("strong")?.textContent || source;
          const optionDescription = item.querySelector("small")?.textContent || "";
          hidden.value = source;
          if (title) title.textContent = optionTitle;
          if (description) description.textContent = optionDescription;
          picker
            .querySelectorAll<HTMLElement>("[data-picker-option]")
            .forEach((button) =>
              button.classList.toggle(
                "isSelected",
                button.getAttribute("data-value") === source
              )
            );
          menu.hidden = true;
          trigger.setAttribute("aria-expanded", "false");
          const row = picker.closest<HTMLElement>(".agendaTemplateVariableRow");
          if (row) onSourceChange(row, source);
        });
      });
  });
}

function renderPanel(params: {
  card: HTMLElement;
  template: RichTemplate | null;
  flows: Flow[];
  variables: CustomVariable[];
  saved?: Record<string, unknown> | null;
  onChange: (config: MappingConfig | null) => void;
  onOpenVariables: () => void;
}) {
  const { card, template, flows, variables, onChange, onOpenVariables } = params;
  let panel = card.querySelector<HTMLElement>(".agendaTemplateMappingPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "agendaTemplateMappingPanel";
    const compatibility = card.querySelector<HTMLElement>(
      '[data-role="compatibility"]'
    );
    (
      compatibility?.parentElement ||
      card.querySelector(".agendaAutomationBody") ||
      card
    ).appendChild(panel);
  }
  if (!template) {
    panel.dataset.templateId = "";
    panel.innerHTML =
      '<div class="agendaTemplateMappingEmpty">Selecione um template para mapear as variáveis e os botões.</div>';
    onChange(null);
    return;
  }

  const saved = asRecord(params.saved);
  const savedVariables = normalizeVariableMappings(saved.template_variaveis);
  const savedButtons = Array.isArray(saved.template_botoes)
    ? (saved.template_botoes as AgendaTemplateButtonMapping[])
    : [];
  const mappings = template.variaveis.map(
    (position) =>
      savedVariables.find((item) => Number(item.posicao) === position) ||
      suggestVariableMapping(position)
  );
  const buttons = (template.botoes_detalhados || []).map((button) => {
    const current = savedButtons.find(
      (item) => Number(item.indice) === button.indice
    );
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
  const sources = pickerOptions(variables);
  panel.dataset.templateId = template.id;
  panel.innerHTML = `
    <div class="agendaTemplateMappingHead"><div><strong>Mapeamento do template</strong><p>Variáveis personalizadas aparecem primeiro. Depois vêm nome e número, dados da agenda e variáveis fixas do sistema.</p></div><div class="agendaTemplateMappingHeadActions"><button type="button" class="agendaTemplateVariableCreate" data-open-variable-modal>+ Criar variável</button><span class="agendaTemplateCategory ${marketing ? "marketing" : ""}">${escapeHtml(template.categoria)}</span></div></div>
    ${
      marketing
        ? `<label class="agendaTemplateMarketingAck"><input type="checkbox" data-map="marketing-ack" ${saved.marketing_aceito === true ? "checked" : ""}/><span>A Meta classificou este template como Marketing. Estou ciente de que o envio seguirá as regras e cobranças dessa categoria.</span></label>`
        : ""
    }
    <div class="agendaTemplateVariables"><h4 class="agendaTemplateMappingTitle">Variáveis do corpo</h4>${
      mappings.length
        ? mappings
            .map(
              (mapping) => `<div class="agendaTemplateVariableRow" data-position="${mapping.posicao}"><div class="agendaTemplateToken">{{${mapping.posicao}}}</div><div class="agendaTemplateSourceField"><span class="agendaTemplateFieldLabel">Informação do CRM</span>${pickerHtml(mapping.fonte, sources)}</div><label><span>Formato</span><select data-map="format">${formatOptions(mapping.fonte, mapping.formato)}</select></label><label class="agendaTemplateFixed" data-fixed-wrap style="${canonicalTemplateSource(mapping.fonte) === "texto_fixo" ? "" : "display:none"}"><span>Texto fixo</span><input type="text" data-map="fixed" value="${escapeHtml(mapping.valor_fixo || "")}"/></label></div>`
            )
            .join("")
        : '<div class="agendaTemplateMappingEmpty">Este template não possui variáveis no corpo.</div>'
    }</div>
    ${
      ["confirmacao", "lembrete"].includes(String(card.dataset.rule || "")) // CRM_CALENDAR_EMAIL_REMINDER_BUTTONS_PRIORITY_V1
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
    <div class="agendaTemplatePreview"><div class="agendaTemplatePreviewHeader"><span>Prévia da mensagem</span><small>Dados de exemplo</small></div><div class="agendaTemplatePreviewArea"><div class="agendaTemplatePreviewBubble"><pre></pre><div class="agendaTemplatePreviewMeta"><span>Automação do calendário</span><time>14:30 ✓✓</time></div></div></div></div>`;

  const refresh = () => {
    preview(card, template, variables);
    onChange(readPanel(card, template));
  };

  panel
    .querySelector<HTMLButtonElement>("[data-open-variable-modal]")
    ?.addEventListener("click", onOpenVariables);

  bindPickers(panel, (row, source) => {
    const format = row.querySelector<HTMLSelectElement>('[data-map="format"]');
    const fixedWrap = row.querySelector<HTMLElement>("[data-fixed-wrap]");
    if (format) {
      const defaultFormat =
        templateSourceKind(source) === "datetime" ? "data_numerica" : "texto";
      format.innerHTML = formatOptions(source, defaultFormat);
    }
    if (fixedWrap) {
      fixedWrap.style.display = source === "texto_fixo" ? "" : "none";
    }
    refresh();
  });

  panel
    .querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select")
    .forEach((input) => {
      if (input.dataset.map === "source") return;
      input.addEventListener("input", refresh);
      input.addEventListener("change", refresh);
    });
  refresh();
}

function fixedVariablesHtml() {
  return TEMPLATE_SOURCE_OPTIONS.filter(
    (item) =>
      item.category === "Nome e número" ||
      (item.category === "Fixa" && item.value !== "texto_fixo")
  )
    .map(
      (item) =>
        `<div class="agendaVariableFixedItem"><strong>${escapeHtml(item.variable)}</strong><small>${escapeHtml(item.description)}</small></div>`
    )
    .join("");
}

function createVariableModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "agendaVariableModalBackdrop";
  backdrop.hidden = true;
  backdrop.innerHTML = `<div class="agendaVariableModal" role="dialog" aria-modal="true" aria-labelledby="agenda-variable-modal-title"><div class="agendaVariableModalHead"><div><h3 id="agenda-variable-modal-title">Criar variáveis</h3><p>Cadastre valores globais da empresa para reutilizar nos templates e disparos.</p></div><button type="button" class="agendaVariableModalClose" data-variable-close aria-label="Fechar">×</button></div><div class="agendaVariableModalBody"><section class="agendaVariableModalSection"><h4>Nova variável personalizada</h4><div class="agendaVariableForm"><label><span>Nome da variável</span><input type="text" data-variable-key placeholder="ex.: nome_empresa" autocomplete="off"/></label><label><span>Valor</span><input type="text" data-variable-value placeholder="Valor utilizado no envio"/></label><label class="full"><span>Descrição</span><input type="text" data-variable-description placeholder="Explique de forma simples o que a variável representa"/></label></div><div class="agendaVariablePreview" data-variable-preview>A variável será usada assim: <strong>{{nome_variavel}}</strong></div><div class="agendaVariableFeedback" data-variable-feedback></div><div class="agendaVariableModalActions"><button type="button" class="agendaVariablePrimary" data-variable-save>Salvar variável</button></div></section><section class="agendaVariableModalSection"><h4>Variáveis cadastradas</h4><div class="agendaVariableList" data-variable-list></div></section><section class="agendaVariableModalSection"><h4>Variáveis fixas do sistema</h4><div class="agendaVariableFixedList">${fixedVariablesHtml()}</div></section></div></div>`;
  document.body.appendChild(backdrop);
  return backdrop;
}

function renderVariableList(modal: HTMLElement, variables: CustomVariable[]) {
  const list = modal.querySelector<HTMLElement>("[data-variable-list]");
  if (!list) return;
  const sorted = sortVariables(variables);
  list.innerHTML = sorted.length
    ? sorted
        .map(
          (item) => `<div class="agendaVariableListItem"><div><strong>{{${escapeHtml(normalizeTemplateVariableKey(item.chave))}}}</strong><p>${escapeHtml(item.descricao || "Variável personalizada cadastrada pela empresa.")}</p><small>Valor atual: ${escapeHtml(item.valor || "-")}</small></div><button type="button" class="agendaVariableDanger" data-variable-delete="${escapeHtml(item.id)}">Excluir</button></div>`
        )
        .join("")
    : '<div class="agendaVariableListEmpty">Nenhuma variável personalizada cadastrada.</div>';
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
    // AGENDA_INDIVIDUAL_TEMPLATE_MAPPING_REACTIVE_V3
    const individualConfigs = new WeakMap<HTMLElement, MappingConfig>();
    const individualRenderers = new WeakMap<HTMLElement, () => void>();
    const individualBindings = new WeakSet<HTMLElement>();
    const renderers = new Set<() => void>();

    let style = document.getElementById(STYLE_ID);
    const ownsStyle = !style;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const variableModal = createVariableModal();
    const keyInput = variableModal.querySelector<HTMLInputElement>(
      "[data-variable-key]"
    );
    const valueInput = variableModal.querySelector<HTMLInputElement>(
      "[data-variable-value]"
    );
    const descriptionInput = variableModal.querySelector<HTMLInputElement>(
      "[data-variable-description]"
    );
    const previewElement = variableModal.querySelector<HTMLElement>(
      "[data-variable-preview]"
    );
    const feedback = variableModal.querySelector<HTMLElement>(
      "[data-variable-feedback]"
    );
    const saveButton = variableModal.querySelector<HTMLButtonElement>(
      "[data-variable-save]"
    );

    const setFeedback = (message: string, kind: "error" | "success" = "error") => {
      if (!feedback) return;
      feedback.textContent = message;
      feedback.className = `agendaVariableFeedback ${message ? "show" : ""} ${kind}`;
    };

    const updateVariablePreview = () => {
      if (!previewElement) return;
      const key = normalizeTemplateVariableKey(keyInput?.value || "") || "nome_variavel";
      previewElement.innerHTML = `A variável será usada assim: <strong>{{${escapeHtml(key)}}}</strong>`;
    };

    const loadOptions = () => {
      if (options) return Promise.resolve(options);
      if (!optionsPromise) {
        optionsPromise = fetch("/api/agendas/automacoes/opcoes", {
          cache: "no-store",
        })
          .then(async (response) => {
            const data = await response.json();
            if (!response.ok || !data?.ok) {
              throw new Error(data?.error || "Erro ao carregar templates.");
            }
            options = {
              templates: data.templates || [],
              fluxos: (data.fluxos || []).filter(
                (flow: Flow) => flow.status === "ativo"
              ),
              variaveis: sortVariables(data.variaveis || []),
            };
            return options;
          })
          .finally(() => {
            optionsPromise = null;
          });
      }
      return optionsPromise;
    };

    const refreshVariables = async () => {
      const response = await fetch("/api/variaveis", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao carregar variáveis.");
      }
      const variables = sortVariables(data.variaveis || []);
      const loaded = await loadOptions();
      loaded.variaveis = variables;
      options = loaded;
      renderVariableList(variableModal, variables);
      renderers.forEach((render) => render());
      return variables;
    };

    const openVariableModal = async () => {
      variableModal.hidden = false;
      setFeedback("");
      try {
        const loaded = await loadOptions();
        renderVariableList(variableModal, loaded.variaveis);
        await refreshVariables();
      } catch (error) {
        setFeedback(
          error instanceof Error ? error.message : "Erro ao carregar variáveis."
        );
      }
      window.setTimeout(() => keyInput?.focus(), 0);
    };

    const closeVariableModal = () => {
      variableModal.hidden = true;
      setFeedback("");
    };

    variableModal
      .querySelectorAll<HTMLElement>("[data-variable-close]")
      .forEach((button) => button.addEventListener("click", closeVariableModal));
    variableModal.addEventListener("pointerdown", (event) => {
      if (event.target === variableModal) closeVariableModal();
    });
    keyInput?.addEventListener("input", updateVariablePreview);
    updateVariablePreview();

    saveButton?.addEventListener("click", async () => {
      const key = normalizeTemplateVariableKey(keyInput?.value || "");
      const value = String(valueInput?.value || "").trim();
      const description = String(descriptionInput?.value || "").trim();
      if (!key) {
        setFeedback("Informe o nome da variável.");
        return;
      }
      if (!value) {
        setFeedback("Informe o valor da variável.");
        return;
      }
      try {
        saveButton.disabled = true;
        setFeedback("");
        const response = await fetch("/api/variaveis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chave: key, valor: value, descricao: description }),
        });
        const data = await response.json();
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || "Erro ao salvar variável.");
        }
        if (keyInput) keyInput.value = "";
        if (valueInput) valueInput.value = "";
        if (descriptionInput) descriptionInput.value = "";
        updateVariablePreview();
        await refreshVariables();
        setFeedback("Variável salva e adicionada ao topo da lista.", "success");
      } catch (error) {
        setFeedback(
          error instanceof Error ? error.message : "Erro ao salvar variável."
        );
      } finally {
        saveButton.disabled = false;
      }
    });

    variableModal.addEventListener("click", async (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-variable-delete]"
      );
      if (!button) return;
      const id = String(button.dataset.variableDelete || "");
      if (!id) return;
      try {
        button.disabled = true;
        setFeedback("");
        const response = await fetch("/api/variaveis", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const data = await response.json();
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || "Erro ao remover variável.");
        }
        await refreshVariables();
        setFeedback("Variável removida com sucesso.", "success");
      } catch (error) {
        button.disabled = false;
        setFeedback(
          error instanceof Error ? error.message : "Erro ao remover variável."
        );
      }
    });

    const selectedAgendaId = () =>
      shell.querySelector<HTMLSelectElement>(".a2 .head select.select")?.value ||
      "";

    const bindSection = async (section: HTMLElement) => {
      if (section.dataset.mappingBound === "true") return;
      section.dataset.mappingBound = "true";
      try {
        const loaded = await loadOptions();
        if (disposed || !section.isConnected) return;
        const agendaId = section.dataset.mode === "edit" ? selectedAgendaId() : "";
        if (agendaId) {
          const response = await fetch(
            `/api/agendas/${encodeURIComponent(agendaId)}/automacoes`,
            { cache: "no-store" }
          );
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
          const card = section.querySelector<HTMLElement>(
            `[data-rule="${type}"]`
          );
          if (!card) continue;
          const templateSelect = card.querySelector<HTMLSelectElement>(
            '[data-role="template"]'
          );
          const label = templateSelect?.closest("label")?.querySelector("span");
          if (label) label.textContent = "Template aprovado";
          const render = (reset = false) => {
            if (!card.isConnected) return;
            const template =
              loaded.templates.find((item) => item.id === templateSelect?.value) ||
              null;
            const savedConfig = reset
              ? null
              : latest.get(type) || saved.get(type) || null;
            renderPanel({
              card,
              template,
              flows: loaded.fluxos.filter((flow) => flow.status === "ativo"),
              variables: loaded.variaveis,
              saved: savedConfig,
              onOpenVariables: openVariableModal,
              onChange: (config) => {
                if (config) latest.set(type, config);
                else latest.delete(type);
              },
            });
          };
          const rerender = () => render(false);
          renderers.add(rerender);
          templateSelect?.addEventListener("change", () => render(true));
          let checks = 0;
          const timer = window.setInterval(() => {
            checks += 1;
            const panel = card.querySelector<HTMLElement>(
              ".agendaTemplateMappingPanel"
            );
            if ((panel?.dataset.templateId || "") !== (templateSelect?.value || "")) {
              render(false);
            }
            if (checks >= 20 || !section.isConnected) {
              window.clearInterval(timer);
              if (!section.isConnected) renderers.delete(rerender);
            }
          }, 150);
          render(false);
        }
      } catch (error) {
        console.error("[AGENDA_TEMPLATE_MAPPING] Erro:", error);
      }
    };


    const textoNormalizado = (elemento: Element | null) =>
      normalize(elemento?.textContent || "");

    const selectPorRotulo = (row: HTMLElement, termos: string[]) => {
      const labels = Array.from(row.querySelectorAll<HTMLLabelElement>("label"));
      for (const label of labels) {
        const texto = textoNormalizado(label);
        if (!termos.some((termo) => texto.includes(normalize(termo)))) continue;
        const campo = label.closest<HTMLElement>(".field") || label.parentElement;
        const select =
          label.querySelector<HTMLSelectElement>("select") ||
          campo?.querySelector<HTMLSelectElement>("select");
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

    const ajustarPainelLembreteIndividual = (row: HTMLElement) => {
      const panel = row.querySelector<HTMLElement>(
        ".agendaTemplateMappingPanel"
      );
      if (!panel) return;

      const consentimento = panel.querySelector<HTMLElement>(
        ".agendaTemplateMarketingAck"
      );
      if (consentimento) {
        const estilosConsentimento: Record<string, string> = {
          width: "100%",
          "min-width": "0",
          "max-width": "100%",
          "box-sizing": "border-box",
          display: "grid",
          "grid-template-columns": "18px minmax(0, 1fr)",
          "align-items": "start",
          "justify-content": "stretch",
          "justify-items": "stretch",
          gap: "9px",
          overflow: "hidden",
          position: "relative",
          margin: "0",
          "text-align": "left",
        };
        Object.entries(estilosConsentimento).forEach(([propriedade, valor]) =>
          consentimento.style.setProperty(propriedade, valor, "important")
        );

        const checkbox = consentimento.querySelector<HTMLInputElement>(
          'input[data-map="marketing-ack"]'
        );
        if (checkbox) {
          checkbox.style.setProperty("position", "static", "important");
          checkbox.style.setProperty("width", "16px", "important");
          checkbox.style.setProperty("height", "16px", "important");
          checkbox.style.setProperty("margin", "1px 0 0", "important");
          checkbox.style.setProperty("transform", "none", "important");
          checkbox.style.setProperty("justify-self", "start", "important");
        }

        const textoConsentimento =
          consentimento.querySelector<HTMLElement>("span");
        if (textoConsentimento) {
          const estilosTexto: Record<string, string> = {
            display: "block",
            position: "static",
            width: "auto",
            "min-width": "0",
            "max-width": "100%",
            margin: "0",
            transform: "none",
            "white-space": "normal",
            overflow: "visible",
            "overflow-wrap": "anywhere",
            "word-break": "normal",
            "text-align": "left",
            "line-height": "1.45",
            color: "var(--crm-warning-text)",
          };
          Object.entries(estilosTexto).forEach(([propriedade, valor]) =>
            textoConsentimento.style.setProperty(
              propriedade,
              valor,
              "important"
            )
          );
        }
      }

      const previa = panel.querySelector<HTMLElement>(
        ".agendaTemplatePreview"
      );
      const variaveis = panel.querySelector<HTMLElement>(
        ".agendaTemplateVariables"
      );
      if (previa) {
        if (consentimento) {
          consentimento.insertAdjacentElement("afterend", previa);
        } else if (variaveis) {
          panel.insertBefore(previa, variaveis);
        }
      }

      panel.querySelector<HTMLElement>(".agendaTemplateButtons")?.remove();

      const configuracaoAtual = individualConfigs.get(row);
      if (configuracaoAtual?.template_botoes.length) {
        individualConfigs.set(row, {
          ...configuracaoAtual,
          template_botoes: [],
        });
      }

      row.querySelectorAll<HTMLElement>("small,p,span").forEach((elemento) => {
        const texto = normalize(elemento.textContent);
        if (
          !texto.includes(
            "as variaveis mais comuns do template serao preenchidas automaticamente"
          )
        ) {
          return;
        }
        const removivel = elemento.closest<HTMLElement>("small,p") || elemento;
        removivel.remove();
      });
    };

    const bindIndividualReminder = async (row: HTMLElement) => {
      const canal = selectCanalLembrete(row);
      if (!canal) return;
      if (row.dataset.individualTemplateBound === "true") {
        const renderExistente = individualRenderers.get(row);
        const templateSelect = selectPorRotulo(row, ["template aprovado", "template"]);
        const painel = row.querySelector<HTMLElement>(".agendaTemplateMappingPanel");
        if (!renderExistente) {
          if (painel) return;
          delete row.dataset.individualTemplateBound;
          row.classList.remove("agendaIndividualTemplateBound");
        } else {
          const precisaRenderizar =
            normalize(canal.value) === "whatsapp"
              ? !painel ||
                (painel.dataset.templateId || "") !==
                  (templateSelect?.value || "")
              : Boolean(painel);
          if (precisaRenderizar) renderExistente();
          return;
        }
      }
      if (individualBindings.has(row)) return;
      individualBindings.add(row);
      try {
        const loaded = await loadOptions();
        if (disposed || !row.isConnected) return;

        // AGENDA_INDIVIDUAL_TEMPLATE_CURRENT_CHANNEL_V6
        const render = () => {
          if (!row.isConnected) return;
          const canalAtual = selectCanalLembrete(row);
          const whatsapp = normalize(canalAtual?.value) === "whatsapp";
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
            flows: loaded.fluxos.filter((flow) => flow.status === "ativo"),
            variables: Array.isArray(loaded.variaveis)
              ? loaded.variaveis
              : [],
            saved: salvo,
            onOpenVariables: openVariableModal,
            onChange: (config) => {
              if (config) {
                individualConfigs.set(row, config);
                sincronizarConsentimentoLegado(row, config.marketing_aceito);
              } else {
                individualConfigs.delete(row);
              }
            },
          });
          ajustarPainelLembreteIndividual(row);
        };

        row.dataset.individualTemplateBound = "true";
        row.classList.add("agendaIndividualTemplateBound");
        row.dataset.rule = "lembrete";
        individualRenderers.set(row, render);
        canal.addEventListener("change", () => window.setTimeout(render, 0));
        row.addEventListener("change", (event) => {
          const target = event.target;
          if (!(target instanceof HTMLSelectElement)) return;
          const canalAtual = selectCanalLembrete(row);
          if (
            target === canalAtual ||
            target.dataset.role === "template" ||
            target.dataset.role === "integration"
          ) {
            window.setTimeout(render, 0);
          }
        });

        let verificacoes = 0;
        const timer = window.setInterval(() => {
          verificacoes += 1;
          const templateSelect = selectPorRotulo(row, ["template aprovado", "template"]);
          const painel = row.querySelector<HTMLElement>(".agendaTemplateMappingPanel");
          if (normalize(selectCanalLembrete(row)?.value) === "whatsapp" && (painel?.dataset.templateId || "") !== (templateSelect?.value || "")) {
            render();
          }
          if (verificacoes >= 30 || !row.isConnected) window.clearInterval(timer);
        }, 150);

        render();
      } catch (error) {
        delete row.dataset.individualTemplateBound;
        row.classList.remove("agendaIndividualTemplateBound");
        console.error("[AGENDA_TEMPLATE_MAPPING] Erro no lembrete individual:", error);
      } finally {
        individualBindings.delete(row);
      }
    };

    const originalFetch = window.fetch.bind(window);
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = String(
        init?.method || (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
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
          console.error(
            "[AGENDA_TEMPLATE_MAPPING] Falha ao preparar salvamento:",
            error
          );
        }
      }
      if (
        method === "POST" &&
        /\/rest\/v1\/rpc\/agenda_etapa1_salvar_agendamento(?:\?|$)/.test(url) &&
        typeof init?.body === "string"
      ) {
        try {
          const body = JSON.parse(init.body);
          const lembretes = body?.p_payload?.lembretes;
          if (Array.isArray(lembretes)) {
            const rows = Array.from(
              shell.querySelectorAll<HTMLElement>(".a2 .drawer .repeat")
            ).filter((row) => Boolean(selectCanalLembrete(row)));
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
      return originalFetch(input, init);
    };
    window.fetch = wrappedFetch;

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      document
        .querySelectorAll<HTMLElement>(".agendaVariablePicker")
        .forEach((picker) => {
          if (!picker.contains(target)) {
            const menu = picker.querySelector<HTMLElement>("[data-picker-menu]");
            const trigger = picker.querySelector<HTMLElement>(
              "[data-picker-trigger]"
            );
            if (menu) menu.hidden = true;
            trigger?.setAttribute("aria-expanded", "false");
          }
        });
    };
    document.addEventListener("pointerdown", closeOnOutside);

    const apply = () => {
      frame = 0;
      if (disposed) return;
      shell
        .querySelectorAll<HTMLElement>(".agendaAutomationSection")
        .forEach((section) => {
          void bindSection(section);
        });
      shell.querySelectorAll<HTMLElement>(".a2 .drawer .repeat").forEach((row) => {
        void bindIndividualReminder(row);
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
      document.removeEventListener("pointerdown", closeOnOutside);
      if (frame) window.cancelAnimationFrame(frame);
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
      variableModal.remove();
      closeAllPickers();
      if (ownsStyle) style?.remove();
    };
  }, []);

  return null;
}
