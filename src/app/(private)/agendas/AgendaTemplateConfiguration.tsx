"use client";

import { useMemo, useState } from "react";
import {
  TEMPLATE_FORMAT_OPTIONS,
  TEMPLATE_SOURCE_OPTIONS,
  customTemplateSource,
  normalizeText,
  templateSourceKind,
  type AgendaTemplateButtonMapping,
  type AgendaTemplateVariableMapping,
} from "@/lib/agendas/template-mapping";
import styles from "./AgendaTemplateConfiguration.module.css";

export type AgendaFlowOption = {
  id: string;
  nome: string;
  status?: string;
  modo_integracoes?: "todas" | "selecionadas";
  integracao_whatsapp_ids?: string[];
};

export type AgendaCustomVariableOption = {
  id: string;
  chave: string;
  valor: string;
  descricao?: string;
};

export type AgendaTemplateOption = {
  id: string;
  nome: string;
  idioma: string;
  categoria: string;
  integracao_whatsapp_id: string;
  corpo?: string;
  variaveis?: number[];
  botoes?: string[];
  botoes_detalhados?: Array<{ indice: number; texto: string }>;
};

export type AgendaTemplateConfigurationValue = {
  template_variaveis: AgendaTemplateVariableMapping[];
  template_botoes: AgendaTemplateButtonMapping[];
  marketing_aceito: boolean;
};

const DEFAULT_SOURCES = [
  "nome_contato",
  "agendamento.inicio_at",
  "agenda.nome",
  "agendamento.local",
  "responsavel.nome",
];

export function defaultTemplateConfiguration(
  template?: AgendaTemplateOption,
  mapButtonActions = false,
): AgendaTemplateConfigurationValue {
  const positions = template?.variaveis || [];
  const buttons =
    template?.botoes_detalhados ||
    (template?.botoes || []).map((texto, indice) => ({ indice, texto }));

  return {
    template_variaveis: positions.map((posicao, index) => ({
      posicao,
      fonte: DEFAULT_SOURCES[index] || "nome_contato",
      formato:
        DEFAULT_SOURCES[index] === "agendamento.inicio_at"
          ? "data_hora_numerica"
          : "texto",
      valor_fixo: null,
      valor_padrao: null,
    })),
    template_botoes: buttons.map((button) => {
      const normalized = normalizeText(button.texto);
      const acao = !mapButtonActions
        ? "ignorar"
        : normalized.includes("confirm")
          ? "confirmar"
          : normalized.includes("cancel")
            ? "cancelar"
            : normalized.includes("reagend")
              ? "reagendar"
              : "ignorar";
      return {
        indice: button.indice,
        texto_snapshot: button.texto,
        acao,
        fluxo_id: null,
      };
    }),
    marketing_aceito: false,
  };
}

type Props = {
  template?: AgendaTemplateOption;
  flows?: AgendaFlowOption[];
  customVariables?: AgendaCustomVariableOption[];
  value: AgendaTemplateConfigurationValue;
  onChange: (value: AgendaTemplateConfigurationValue) => void;
  showButtonMappings?: boolean;
};

export default function AgendaTemplateConfiguration({
  template,
  flows = [],
  customVariables = [],
  value,
  onChange,
  showButtonMappings = false,
}: Props) {
  const [createdVariables, setCreatedVariables] = useState<
    AgendaCustomVariableOption[]
  >([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [variableDraft, setVariableDraft] = useState({
    chave: "",
    valor: "",
    descricao: "",
  });
  const [variableFeedback, setVariableFeedback] = useState("");
  const [variableSaving, setVariableSaving] = useState(false);
  const allCustomVariables = useMemo(() => {
    const variables = [...createdVariables, ...customVariables];
    return variables.filter(
      (item, index) =>
        variables.findIndex((candidate) => candidate.chave === item.chave) ===
        index,
    );
  }, [createdVariables, customVariables]);
  const sourceOptions = useMemo(
    () => [
      ...TEMPLATE_SOURCE_OPTIONS,
      ...allCustomVariables.map((item) => ({
        value: customTemplateSource(item.chave),
        variable: `{{${item.chave}}}`,
        label: item.chave,
        description: item.descricao || "Variável personalizada da empresa.",
        kind: "text" as const,
        category: "Fixa" as const,
      })),
    ],
    [allCustomVariables],
  );

  if (!template) return null;

  const updateVariable = (
    position: number,
    patch: Partial<AgendaTemplateVariableMapping>,
  ) => {
    onChange({
      ...value,
      template_variaveis: value.template_variaveis.map((item) =>
        item.posicao === position ? { ...item, ...patch } : item,
      ),
    });
  };

  const preview = (
    template.corpo || "Prévia indisponível para este template."
  ).replace(/{{\s*(\d+)\s*}}/g, (_match, rawPosition: string) => {
    const mapping = value.template_variaveis.find(
      (item) => item.posicao === Number(rawPosition),
    );
    if (!mapping) return `{{${rawPosition}}}`;
    if (mapping.fonte === "texto_fixo")
      return mapping.valor_fixo || "Texto fixo";
    return (
      sourceOptions.find((option) => option.value === mapping.fonte)?.label ||
      mapping.fonte
    );
  });

  const createVariable = async () => {
    const chave = variableDraft.chave
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!chave || !variableDraft.valor.trim()) {
      setVariableFeedback("Informe o nome e o valor da variável.");
      return;
    }
    try {
      setVariableSaving(true);
      setVariableFeedback("");
      const response = await fetch("/api/variaveis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chave,
          valor: variableDraft.valor.trim(),
          descricao: variableDraft.descricao.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao salvar variável.");
      }
      setCreatedVariables((current) => [
        {
          id: data.variavel?.id || `local-${chave}`,
          chave,
          valor: variableDraft.valor.trim(),
          descricao: variableDraft.descricao.trim(),
        },
        ...current,
      ]);
      setVariableDraft({ chave: "", valor: "", descricao: "" });
      setVariableFeedback("Variável criada com sucesso.");
    } catch (error) {
      setVariableFeedback(
        error instanceof Error ? error.message : "Erro ao salvar variável.",
      );
    } finally {
      setVariableSaving(false);
    }
  };

  return (
    <section className={styles.panel} aria-label="Configuração do template">
      <div className={styles.heading}>
        <div>
          <h4>Mapeamento do template</h4>
          <p>
            Variáveis personalizadas aparecem primeiro. Depois vêm nome e
            número, dados do calendário e variáveis fixas do sistema.
          </p>
        </div>
        <div className={styles.headingActions}>
          <button
            type="button"
            className={styles.createVariableButton}
            onClick={() => setCreateOpen(true)}
          >
            + Criar variável
          </button>
          <span
            className={`${styles.category} ${
              template.categoria.toUpperCase() === "MARKETING"
                ? styles.marketingCategory
                : ""
            }`}
          >
            {template.categoria}
          </span>
        </div>
      </div>

      {template.categoria.toUpperCase() === "MARKETING" ? (
        <label className={styles.marketing}>
          <input
            type="checkbox"
            checked={value.marketing_aceito}
            onChange={(event) =>
              onChange({ ...value, marketing_aceito: event.target.checked })
            }
          />
          <span>
            A Meta classificou este template como Marketing. Estou ciente de que
            o envio seguirá as regras e cobranças dessa categoria.
          </span>
        </label>
      ) : null}

      {(template.variaveis || []).length > 0 ? (
        <div className={styles.section}>
          <h5>Variáveis do corpo</h5>
          {(template.variaveis || []).map((position) => {
            const mapping = value.template_variaveis.find(
              (item) => item.posicao === position,
            ) || {
              posicao: position,
              fonte: "nome_contato",
              formato: "texto",
            };
            const kind = templateSourceKind(mapping.fonte);
            const formats = TEMPLATE_FORMAT_OPTIONS.filter((item) =>
              item.kinds.includes(kind as never),
            );

            return (
              <div className={styles.mappingRow} key={position}>
                <span className={styles.token}>{`{{${position}}}`}</span>
                <label className={styles.field}>
                  <span>Informação do CRM</span>
                  <select
                    value={mapping.fonte}
                    onChange={(event) => {
                      const fonte = event.target.value;
                      const sourceKind = templateSourceKind(fonte);
                      updateVariable(position, {
                        fonte,
                        formato:
                          sourceKind === "datetime"
                            ? "data_hora_numerica"
                            : "texto",
                        valor_fixo: fonte === "texto_fixo" ? "" : null,
                      });
                    }}
                  >
                    {sourceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.variable} · {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Formato</span>
                  <select
                    value={mapping.formato}
                    onChange={(event) =>
                      updateVariable(position, { formato: event.target.value })
                    }
                  >
                    {formats.map((format) => (
                      <option key={format.value} value={format.value}>
                        {format.label}
                      </option>
                    ))}
                  </select>
                </label>
                {mapping.fonte === "texto_fixo" ? (
                  <label className={`${styles.field} ${styles.fixed}`}>
                    <span>Texto fixo</span>
                    <input
                      value={mapping.valor_fixo || ""}
                      onChange={(event) =>
                        updateVariable(position, {
                          valor_fixo: event.target.value,
                        })
                      }
                    />
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {showButtonMappings && value.template_botoes.length > 0 ? (
        <div className={styles.section}>
          <h5>Ações dos botões</h5>
          {value.template_botoes.map((button) => (
            <div className={styles.buttonRow} key={button.indice}>
              <div className={styles.buttonLabel}>{button.texto_snapshot}</div>
              <label className={styles.field}>
                <span>Ação no CRM</span>
                <select
                  value={button.acao}
                  onChange={(event) => {
                    const acao = event.target
                      .value as AgendaTemplateButtonMapping["acao"];
                    onChange({
                      ...value,
                      template_botoes: value.template_botoes.map((item) =>
                        item.indice === button.indice
                          ? {
                              ...item,
                              acao,
                              fluxo_id:
                                acao === "ignorar" ? null : item.fluxo_id,
                            }
                          : item,
                      ),
                    });
                  }}
                >
                  <option value="ignorar">Sem ação</option>
                  <option value="confirmar">Confirmar agendamento</option>
                  <option value="cancelar">Iniciar cancelamento</option>
                  <option value="reagendar">Iniciar reagendamento</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Fluxo associado</span>
                <select
                  value={button.fluxo_id || ""}
                  disabled={button.acao === "ignorar"}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      template_botoes: value.template_botoes.map((item) =>
                        item.indice === button.indice
                          ? { ...item, fluxo_id: event.target.value || null }
                          : item,
                      ),
                    })
                  }
                >
                  <option value="">Selecione</option>
                  {flows.map((flow) => (
                    <option key={flow.id} value={flow.id}>
                      {flow.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.preview}>
        <div className={styles.previewHead}>Prévia no WhatsApp</div>
        <div className={styles.previewArea}>
          <pre className={styles.bubble}>{preview}</pre>
        </div>
      </div>

      {createOpen ? (
        <div
          className={styles.variableBackdrop}
          onMouseDown={(event) =>
            event.target === event.currentTarget && setCreateOpen(false)
          }
        >
          <div className={styles.variableModal} role="dialog" aria-modal="true">
            <div className={styles.variableModalHead}>
              <div>
                <h3>Criar variável</h3>
                <p>Cadastre um valor global para reutilizar nos templates.</p>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)}>
                ×
              </button>
            </div>
            <div className={styles.variableModalBody}>
              <label>
                <span>Nome da variável</span>
                <input
                  value={variableDraft.chave}
                  placeholder="ex.: nome_empresa"
                  onChange={(event) =>
                    setVariableDraft({
                      ...variableDraft,
                      chave: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                <span>Valor</span>
                <input
                  value={variableDraft.valor}
                  onChange={(event) =>
                    setVariableDraft({
                      ...variableDraft,
                      valor: event.target.value,
                    })
                  }
                />
              </label>
              <label className={styles.variableFullField}>
                <span>Descrição</span>
                <input
                  value={variableDraft.descricao}
                  onChange={(event) =>
                    setVariableDraft({
                      ...variableDraft,
                      descricao: event.target.value,
                    })
                  }
                />
              </label>
              {variableFeedback ? (
                <div className={styles.variableFeedback}>
                  {variableFeedback}
                </div>
              ) : null}
              <div className={styles.variableActions}>
                <button type="button" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.variablePrimary}
                  disabled={variableSaving}
                  onClick={() => void createVariable()}
                >
                  {variableSaving ? "Salvando..." : "Salvar variável"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
