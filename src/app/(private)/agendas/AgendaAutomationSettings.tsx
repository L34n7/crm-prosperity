"use client";

import { Zap } from "lucide-react";
import AgendaTemplateConfiguration, {
  defaultTemplateConfiguration,
  type AgendaCustomVariableOption,
  type AgendaFlowOption,
  type AgendaTemplateConfigurationValue,
  type AgendaTemplateOption,
} from "./AgendaTemplateConfiguration";
import styles from "./AgendaAutomationSettings.module.css";

export type AgendaAutomationType =
  "confirmacao" | "lembrete" | "aviso_responsavel" | "pos_atendimento";
export type AgendaAutomationChannel =
  "whatsapp" | "email" | "sistema" | "fluxo";
export type AgendaAutomationUnit = "minutos" | "horas" | "dias";

export type AgendaAutomationRule = {
  tipo: AgendaAutomationType;
  canal: AgendaAutomationChannel;
  ativo: boolean;
  antecedencia_minutos: number;
  ordem: number;
  integracao_whatsapp_id?: string | null;
  whatsapp_template_id?: string | null;
  fluxo_id?: string | null;
  configuracao_json?: Record<string, unknown>;
};

export type AgendaAutomationCardState = {
  tipo: AgendaAutomationType;
  ativo: boolean;
  quantidade: number;
  unidade: AgendaAutomationUnit;
  canais: AgendaAutomationChannel[];
  integracaoId: string;
  templateId: string;
  fluxoId: string;
  templateConfig: AgendaTemplateConfigurationValue;
};

export type AgendaAutomationOptions = {
  integracoes: Array<{ id: string; nome_conexao: string }>;
  templates: AgendaTemplateOption[];
  fluxos: AgendaFlowOption[];
  variaveis: AgendaCustomVariableOption[];
};

const CARD_INFO: Array<{
  tipo: AgendaAutomationType;
  titulo: string;
  referencia: string;
}> = [
  {
    tipo: "confirmacao",
    titulo: "Confirmação do agendamento",
    referencia: "Antes do início",
  },
  {
    tipo: "lembrete",
    titulo: "Lembrete do agendamento",
    referencia: "Antes do início",
  },
  {
    tipo: "aviso_responsavel",
    titulo: "Aviso ao responsável",
    referencia: "Antes do início",
  },
  {
    tipo: "pos_atendimento",
    titulo: "Pós-atendimento",
    referencia: "Depois do término",
  },
];

function decomposeMinutes(total: number) {
  if (total > 0 && total % 1440 === 0)
    return { quantidade: total / 1440, unidade: "dias" as const };
  if (total > 0 && total % 60 === 0)
    return { quantidade: total / 60, unidade: "horas" as const };
  return { quantidade: total || 0, unidade: "minutos" as const };
}

function emptyTemplateConfig(): AgendaTemplateConfigurationValue {
  return {
    template_variaveis: [],
    template_botoes: [],
    marketing_aceito: false,
  };
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function confirmationTemplateIsCompatible(template?: AgendaTemplateOption) {
  const buttons = (template?.botoes || []).map(normalized);
  return ["confirmar", "cancelar", "reagendar"].every((action) =>
    buttons.some((button) => button.includes(action)),
  );
}

export function automationCardsFromRules(
  rules: AgendaAutomationRule[],
): AgendaAutomationCardState[] {
  return CARD_INFO.map(({ tipo }) => {
    const related = rules.filter((rule) => rule.tipo === tipo);
    const main = related[0];
    const timing = decomposeMinutes(
      main?.antecedencia_minutos ||
        (tipo === "confirmacao" ? 1440 : tipo === "lembrete" ? 120 : 30),
    );
    const whatsapp = related.find((rule) => rule.canal === "whatsapp");
    const flow = related.find((rule) => rule.canal === "fluxo");
    const configuration = whatsapp?.configuracao_json || {};

    return {
      tipo,
      ativo: related.some((rule) => rule.ativo),
      ...timing,
      canais:
        related.length > 0
          ? related.map((rule) => rule.canal)
          : tipo === "aviso_responsavel"
            ? ["sistema"]
            : tipo === "pos_atendimento"
              ? ["fluxo"]
              : ["whatsapp"],
      integracaoId: whatsapp?.integracao_whatsapp_id || "",
      templateId: whatsapp?.whatsapp_template_id || "",
      fluxoId: flow?.fluxo_id || "",
      templateConfig: {
        template_variaveis: Array.isArray(configuration.template_variaveis)
          ? (configuration.template_variaveis as AgendaTemplateConfigurationValue["template_variaveis"])
          : [],
        template_botoes: Array.isArray(configuration.template_botoes)
          ? (configuration.template_botoes as AgendaTemplateConfigurationValue["template_botoes"])
          : [],
        marketing_aceito: configuration.marketing_aceito === true,
      },
    };
  });
}

export function serializeAutomationCards(
  cards: AgendaAutomationCardState[],
): AgendaAutomationRule[] {
  return cards.flatMap((card) => {
    const multiplier =
      card.unidade === "dias" ? 1440 : card.unidade === "horas" ? 60 : 1;
    const minutes = Math.max(0, Math.round(card.quantidade * multiplier));

    return card.canais.map((canal, ordem) => ({
      tipo: card.tipo,
      canal,
      ativo: card.ativo,
      antecedencia_minutos: minutes,
      ordem,
      integracao_whatsapp_id:
        canal === "whatsapp" ? card.integracaoId || null : null,
      whatsapp_template_id:
        canal === "whatsapp" ? card.templateId || null : null,
      fluxo_id: canal === "fluxo" ? card.fluxoId || null : null,
      configuracao_json:
        canal === "whatsapp"
          ? {
              etapa: 4,
              execucao_habilitada: true,
              ...card.templateConfig,
            }
          : { etapa: 4, execucao_habilitada: true },
    }));
  });
}

type Props = {
  options: AgendaAutomationOptions;
  selectedIntegrationIds: string[];
  cards: AgendaAutomationCardState[];
  onChange: (cards: AgendaAutomationCardState[]) => void;
  loading?: boolean;
  error?: string;
};

export default function AgendaAutomationSettings({
  options,
  selectedIntegrationIds,
  cards,
  onChange,
  loading = false,
  error = "",
}: Props) {
  const updateCard = (
    tipo: AgendaAutomationType,
    patch: Partial<AgendaAutomationCardState>,
  ) =>
    onChange(
      cards.map((card) => (card.tipo === tipo ? { ...card, ...patch } : card)),
    );

  const availableIntegrations = options.integracoes.filter((integration) =>
    selectedIntegrationIds.includes(integration.id),
  );
  const availableFlows = options.fluxos.filter(
    (flow) =>
      flow.modo_integracoes !== "selecionadas" ||
      (flow.integracao_whatsapp_ids || []).some((id) =>
        selectedIntegrationIds.includes(id),
      ),
  );

  return (
    <section className={styles.section} aria-label="Automação do calendário">
      <div className={styles.head}>
        <div className={styles.title}>
          <span className={styles.icon} aria-hidden="true">
            <Zap size={19} />
          </span>
          <div>
            <h3>Automação do calendário</h3>
            <p>
              Defina os padrões de confirmação, lembretes, avisos e
              pós-atendimento deste calendário.
            </p>
          </div>
        </div>
        <span className={styles.stage}>Automação ativa</span>
      </div>

      <div className={styles.notice}>
        <strong>Execução automática habilitada. </strong>
        As ações ativas serão planejadas no horário configurado e poderão ser
        acompanhadas e canceladas em <strong>Disparos agendados</strong>.
      </div>

      {loading ? (
        <div className={styles.loading}>Carregando automações...</div>
      ) : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {!loading ? (
        <div className={styles.grid}>
          {CARD_INFO.map((info) => {
            const card = cards.find((item) => item.tipo === info.tipo);
            if (!card) return null;
            const templates = options.templates.filter(
              (template) =>
                !card.integracaoId ||
                template.integracao_whatsapp_id === card.integracaoId,
            );
            const template = options.templates.find(
              (item) => item.id === card.templateId,
            );
            const usesWhatsapp = card.canais.includes("whatsapp");

            const toggleChannel = (channel: AgendaAutomationChannel) => {
              if (card.tipo === "pos_atendimento") {
                updateCard(card.tipo, { canais: [channel] });
                return;
              }
              const canais = card.canais.includes(channel)
                ? card.canais.filter((item) => item !== channel)
                : [...card.canais, channel];
              updateCard(card.tipo, { canais });
            };

            return (
              <article
                className={`${styles.card} ${card.ativo ? styles.active : ""}`}
                key={card.tipo}
              >
                <div className={styles.cardHead}>
                  <strong>{info.titulo}</strong>
                  <label className={styles.switch}>
                    <span>{card.ativo ? "Ativado" : "Desativado"}</span>
                    <input
                      type="checkbox"
                      checked={card.ativo}
                      onChange={(event) =>
                        updateCard(card.tipo, { ativo: event.target.checked })
                      }
                    />
                  </label>
                </div>

                <div
                  className={`${styles.body} ${!card.ativo ? styles.inactive : ""}`}
                >
                  <div className={styles.when}>
                    <label className={styles.field}>
                      <span>Quantidade</span>
                      <input
                        type="number"
                        min="0"
                        max="365"
                        value={card.quantidade}
                        onChange={(event) =>
                          updateCard(card.tipo, {
                            quantidade: Number(event.target.value) || 0,
                          })
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      <span>{info.referencia}</span>
                      <select
                        value={card.unidade}
                        onChange={(event) =>
                          updateCard(card.tipo, {
                            unidade: event.target.value as AgendaAutomationUnit,
                          })
                        }
                      >
                        <option value="minutos">minutos</option>
                        <option value="horas">horas</option>
                        <option value="dias">dias</option>
                      </select>
                    </label>
                  </div>

                  <div className={styles.channels}>
                    {card.tipo === "aviso_responsavel" ? (
                      <>
                        <label className={styles.check}>
                          <input
                            type="checkbox"
                            checked={card.canais.includes("sistema")}
                            onChange={() => toggleChannel("sistema")}
                          />
                          Sistema
                        </label>
                        <label className={styles.check}>
                          <input
                            type="checkbox"
                            checked={card.canais.includes("email")}
                            onChange={() => toggleChannel("email")}
                          />
                          E-mail
                        </label>
                      </>
                    ) : card.tipo === "pos_atendimento" ? (
                      <>
                        <label className={styles.check}>
                          <input
                            type="radio"
                            name="agenda-pos-atendimento-canal"
                            checked={card.canais.includes("fluxo")}
                            onChange={() => toggleChannel("fluxo")}
                          />
                          Iniciar fluxo
                        </label>
                        <label className={styles.check}>
                          <input
                            type="radio"
                            name="agenda-pos-atendimento-canal"
                            checked={usesWhatsapp}
                            onChange={() => toggleChannel("whatsapp")}
                          />
                          WhatsApp
                        </label>
                      </>
                    ) : (
                      <>
                        <label className={styles.check}>
                          <input
                            type="checkbox"
                            checked={usesWhatsapp}
                            onChange={() => toggleChannel("whatsapp")}
                          />
                          WhatsApp
                        </label>
                        <label className={styles.check}>
                          <input
                            type="checkbox"
                            checked={card.canais.includes("email")}
                            onChange={() => toggleChannel("email")}
                          />
                          E-mail
                        </label>
                      </>
                    )}
                  </div>

                  {card.tipo === "pos_atendimento" &&
                  card.canais.includes("fluxo") ? (
                    <>
                      <label className={styles.field}>
                        <span>Fluxo que será iniciado</span>
                        <select
                          value={card.fluxoId}
                          onChange={(event) =>
                            updateCard(card.tipo, {
                              fluxoId: event.target.value,
                            })
                          }
                        >
                          <option value="">Selecione um fluxo</option>
                          {availableFlows.map((flow) => (
                            <option key={flow.id} value={flow.id}>
                              {flow.nome}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className={styles.flowNotice}>
                        O fluxo só inicia com conversa ativa e janela de 24
                        horas da Meta aberta. Para depois desse prazo, use um
                        template.
                      </div>
                    </>
                  ) : null}

                  {usesWhatsapp ? (
                    <>
                      <div className={styles.whatsapp}>
                        <label className={styles.field}>
                          <span>Integração do WhatsApp</span>
                          <select
                            value={card.integracaoId}
                            onChange={(event) =>
                              updateCard(card.tipo, {
                                integracaoId: event.target.value,
                                templateId: "",
                                templateConfig: emptyTemplateConfig(),
                              })
                            }
                          >
                            <option value="">Selecione</option>
                            {availableIntegrations.map((integration) => (
                              <option
                                key={integration.id}
                                value={integration.id}
                              >
                                {integration.nome_conexao}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.field}>
                          <span>Template aprovado</span>
                          <select
                            value={card.templateId}
                            onChange={(event) => {
                              const templateId = event.target.value;
                              const selected = options.templates.find(
                                (item) => item.id === templateId,
                              );
                              updateCard(card.tipo, {
                                templateId,
                                templateConfig: defaultTemplateConfiguration(
                                  selected,
                                  card.tipo === "confirmacao",
                                ),
                              });
                            }}
                          >
                            <option value="">Selecione</option>
                            {templates.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.nome} · {item.idioma} · {item.categoria}
                              </option>
                            ))}
                          </select>
                        </label>
                        <span className={styles.compatibility}>
                          {card.tipo === "confirmacao" && template
                            ? confirmationTemplateIsCompatible(template)
                              ? "Template compatível com os três caminhos planejados."
                              : `Botões encontrados: ${(template.botoes || []).join(", ") || "nenhum"}. A compatibilidade será validada antes da ativação.`
                            : card.tipo === "pos_atendimento" && template
                              ? "Template aprovado e disponível para o disparo de pós-atendimento, inclusive fora da janela de 24 horas."
                              : template
                                ? "Template aprovado e disponível para esta integração."
                                : "Selecione o template e confira variáveis, prévia e botões."}
                        </span>
                      </div>

                      <AgendaTemplateConfiguration
                        template={template}
                        flows={availableFlows}
                        customVariables={options.variaveis}
                        value={card.templateConfig}
                        onChange={(templateConfig) =>
                          updateCard(card.tipo, { templateConfig })
                        }
                        showButtonMappings={card.tipo === "confirmacao"}
                      />
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
