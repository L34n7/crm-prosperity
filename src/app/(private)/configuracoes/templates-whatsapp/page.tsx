"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import styles from "./templates-whatsapp.module.css";

type IntegracaoWhatsApp = {
  id: string;
  nome_conexao: string;
  numero: string | null;
  status: string | null;
  waba_id: string | null;
};

type TemplateButton = {
  type: string;
  text: string;
};

type TemplateComponent = {
  type: string;
  text?: string;
  format?: string;
  buttons?: TemplateButton[];
  example?: {
    body_text?: string[][];
  };
};

type WhatsAppTemplate = {
  id: string;
  empresa_id: string;
  integracao_whatsapp_id: string;
  waba_id: string;
  meta_template_id: string | null;
  nome: string;
  categoria: string;
  idioma: string;
  status: string;
  quality_rating: string | null;
  rejeicao_motivo: string | null;
  payload: {
    name?: string;
    category?: string;
    language?: string;
    components?: TemplateComponent[];
  } | null;
  resposta_meta: any;
  created_at: string;
  updated_at: string;
};

function formatarData(data: string | null | undefined) {
  if (!data) return "-";

  try {
    return new Date(data).toLocaleString("pt-BR");
  } catch {
    return data;
  }
}

function getStatusLabel(status: string | null | undefined) {
  if (!status) return "Sem status";

  switch (status.toUpperCase()) {
    case "PENDING":
      return "Em análise";
    case "APPROVED":
      return "Aprovado";
    case "REJECTED":
      return "Rejeitado";
    case "PAUSED":
      return "Pausado";
    case "DISABLED":
      return "Desativado";
    case "ARCHIVED":
      return "Arquivado";
    case "ERRO_ENVIO":
      return "Erro no envio";
    default:
      return status;
  }
}

function getStatusClass(status: string | null | undefined) {
  if (!status) return `${styles.badge} ${styles.badgeGray}`;

  switch (status.toUpperCase()) {
    case "PENDING":
      return `${styles.badge} ${styles.badgeYellow}`;
    case "APPROVED":
      return `${styles.badge} ${styles.badgeGreen}`;
    case "REJECTED":
      return `${styles.badge} ${styles.badgeRed}`;
    case "PAUSED":
    case "DISABLED":
    case "ARCHIVED":
      return `${styles.badge} ${styles.badgeGray}`;
    case "ERRO_ENVIO":
      return `${styles.badge} ${styles.badgeRed}`;
    default:
      return `${styles.badge} ${styles.badgeBlue}`;
  }
}

function getComponent(
  payload: WhatsAppTemplate["payload"],
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS"
) {
  return payload?.components?.find((item) => item.type === type) || null;
}

function extrairHeader(payload: WhatsAppTemplate["payload"]) {
  const header = getComponent(payload, "HEADER");
  return header?.text || "";
}

function extrairBody(payload: WhatsAppTemplate["payload"]) {
  const body = getComponent(payload, "BODY");
  return body?.text || "";
}

function extrairFooter(payload: WhatsAppTemplate["payload"]) {
  const footer = getComponent(payload, "FOOTER");
  return footer?.text || "";
}

function extrairQuickReplies(payload: WhatsAppTemplate["payload"]) {
  const buttons = getComponent(payload, "BUTTONS");

  return (
    buttons?.buttons
      ?.filter((button) => button?.type === "QUICK_REPLY" && button?.text)
      .map((button) => button.text || "")
      .filter(Boolean) || []
  );
}

function contarVariaveisTexto(texto: string) {
  const matches = texto.match(/\{\{\d+\}\}/g) || [];
  const numeros = matches
    .map((item) => Number(item.replace(/[{}]/g, "")))
    .filter((n) => !Number.isNaN(n));

  if (numeros.length === 0) return 0;
  return Math.max(...numeros);
}

function formatarStatusIntegracao(status?: string | null) {
  if (!status) return "Sem status";

  switch ((status || "").toLowerCase()) {
    case "ativo":
      return "Ativo";
    case "conectado":
      return "Conectado";
    case "inativo":
      return "Inativo";
    default:
      return status;
  }
}

export default function TemplatesWhatsAppPage() {
  const [integracoes, setIntegracoes] = useState<IntegracaoWhatsApp[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);

  const [loadingIntegracoes, setLoadingIntegracoes] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [filtroIntegracao, setFiltroIntegracao] = useState("");

  const [integracaoId, setIntegracaoId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [language, setLanguage] = useState("pt_BR");
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState(
    "Olá {{1}}, seu atendimento foi iniciado com sucesso. O protocolo gerado foi {{2}}. Guarde esta informação."
  );
  const [bodyExample1, setBodyExample1] = useState("João");
  const [bodyExample2, setBodyExample2] = useState("ABC-123456");
  const [footerText, setFooterText] = useState("Equipe de atendimento");
  const [quickReply1, setQuickReply1] = useState("");
  const [quickReply2, setQuickReply2] = useState("");
  const [quickReply3, setQuickReply3] = useState("");

  async function carregarIntegracoes() {
    try {
      setLoadingIntegracoes(true);
      setErro("");

      const res = await fetch("/api/integracoes-whatsapp", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar integrações.");
      }

      setIntegracoes(Array.isArray(json.data) ? json.data : []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar integrações.");
    } finally {
      setLoadingIntegracoes(false);
    }
  }

  async function carregarTemplates(integracaoIdFiltro?: string) {
    try {
      setLoadingTemplates(true);
      setErro("");

      const query = integracaoIdFiltro
        ? `?integracao_whatsapp_id=${encodeURIComponent(integracaoIdFiltro)}`
        : "";

      const res = await fetch(`/api/whatsapp/templates${query}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar templates.");
      }

      setTemplates(Array.isArray(json.data) ? json.data : []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }

  useEffect(() => {
    carregarIntegracoes();
    carregarTemplates();
  }, []);

  useEffect(() => {
    carregarTemplates(filtroIntegracao);
  }, [filtroIntegracao]);

  const integracaoSelecionada = useMemo(() => {
    return integracoes.find((item) => item.id === integracaoId) || null;
  }, [integracoes, integracaoId]);

  const quickRepliesPreview = [quickReply1, quickReply2, quickReply3]
    .map((item) => item.trim())
    .filter(Boolean);

  const totalVariaveisBody = useMemo(() => contarVariaveisTexto(bodyText), [bodyText]);

  const resumoTemplates = useMemo(() => {
    const total = templates.length;
    const aprovados = templates.filter(
      (item) => item.status?.toUpperCase() === "APPROVED"
    ).length;
    const pendentes = templates.filter(
      (item) => item.status?.toUpperCase() === "PENDING"
    ).length;
    const rejeitados = templates.filter(
      (item) =>
        item.status?.toUpperCase() === "REJECTED" ||
        item.status?.toUpperCase() === "ERRO_ENVIO"
    ).length;

    return { total, aprovados, pendentes, rejeitados };
  }, [templates]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setMensagem("");
    setErro("");

    if (!integracaoId) {
      setErro("Selecione uma integração WhatsApp.");
      return;
    }

    if (!name.trim()) {
      setErro("Informe o nome do template.");
      return;
    }

    if (!bodyText.trim()) {
      setErro("Informe o conteúdo do BODY.");
      return;
    }

    try {
      setSubmitting(true);

      const components: TemplateComponent[] = [];

      if (headerText.trim()) {
        components.push({
          type: "HEADER",
          format: "TEXT",
          text: headerText.trim(),
        });
      }

      const bodyComponent: TemplateComponent = {
        type: "BODY",
        text: bodyText.trim(),
      };

      const exemplos = [bodyExample1.trim(), bodyExample2.trim()].filter(Boolean);

      if (exemplos.length > 0) {
        bodyComponent.example = {
          body_text: [exemplos],
        };
      }

      components.push(bodyComponent);

      if (footerText.trim()) {
        components.push({
          type: "FOOTER",
          text: footerText.trim(),
        });
      }

      if (quickRepliesPreview.length > 0) {
        components.push({
          type: "BUTTONS",
          buttons: quickRepliesPreview.map((text) => ({
            type: "QUICK_REPLY",
            text,
          })),
        });
      }

      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integracao_whatsapp_id: integracaoId,
          name,
          category,
          language,
          components,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        const metaMsg =
          json?.meta?.error?.error_user_msg ||
          json?.meta?.error?.message ||
          json?.error;

        throw new Error(metaMsg || "Erro ao criar template.");
      }

      setMensagem("Template criado com sucesso e enviado para análise do Meta.");

      setName("");
      setHeaderText("");
      setBodyText(
        "Olá {{1}}, seu atendimento foi iniciado com sucesso. O protocolo gerado foi {{2}}. Guarde esta informação."
      );
      setBodyExample1("João");
      setBodyExample2("ABC-123456");
      setFooterText("Equipe de atendimento");
      setQuickReply1("");
      setQuickReply2("");
      setQuickReply3("");

      await carregarTemplates(filtroIntegracao);
    } catch (error: any) {
      setErro(error?.message || "Erro ao criar template.");
    } finally {
      setSubmitting(false);
    }
  }

  async function sincronizarTemplatesMeta() {
    try {
      setMensagem("");
      setErro("");

      if (!filtroIntegracao && !integracaoId) {
        setErro("Selecione uma integração para sincronizar.");
        return;
      }

      const integracaoParaSync = filtroIntegracao || integracaoId;

      setSincronizando(true);

      const res = await fetch("/api/whatsapp/templates/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integracao_whatsapp_id: integracaoParaSync,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao sincronizar templates.");
      }

      setMensagem(
        `Sincronização concluída. Meta: ${json.total_meta}, inseridos: ${json.inseridos}, atualizados: ${json.atualizados}.`
      );

      await carregarTemplates(filtroIntegracao);
    } catch (error: any) {
      setErro(error?.message || "Erro ao sincronizar templates.");
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <>
      <Header
        title="Templates do WhatsApp"
        subtitle="Crie, visualize e acompanhe os templates enviados para aprovação no Meta."
      />

      <div className={styles.pageContent}>
        {(mensagem || erro) && (
          <>
            {mensagem ? <div className={styles.successAlert}>{mensagem}</div> : null}
            {erro ? <div className={styles.errorAlert}>{erro}</div> : null}
          </>
        )}

        <div className={styles.layout}>
          <div className={styles.formCard}>
            <div className={styles.cardHeader}>
              <p className={styles.eyebrow}>Criação de template</p>
              <h2 className={styles.cardTitle}>Novo template</h2>
              <p className={styles.cardSubtitle}>
                Monte o template, revise a prévia e envie para validação do Meta.
              </p>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.topGrid}>
                <div className={styles.field}>
                  <label className={styles.label}>Integração WhatsApp</label>
                  <select
                    value={integracaoId}
                    onChange={(e) => setIntegracaoId(e.target.value)}
                    className={styles.input}
                    required
                  >
                    <option value="">
                      {loadingIntegracoes ? "Carregando..." : "Selecione uma integração"}
                    </option>

                    {integracoes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome_conexao}
                        {item.numero ? ` - ${item.numero}` : ""}
                      </option>
                    ))}
                  </select>

                  {integracaoSelecionada ? (
                    <div className={styles.infoBox}>
                      <div>
                        <strong>Status:</strong>{" "}
                        {formatarStatusIntegracao(integracaoSelecionada.status)}
                      </div>
                      <div>
                        <strong>WABA ID:</strong> {integracaoSelecionada.waba_id || "-"}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Nome do template</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={styles.input}
                    placeholder="ex: aviso_atendimento_iniciado"
                    required
                  />
                  <p className={styles.help}>
                    Use nome simples, sem espaços. O backend normaliza automaticamente.
                  </p>
                </div>
              </div>

              <div className={styles.topGrid}>
                <div className={styles.field}>
                  <label className={styles.label}>Categoria</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as "UTILITY" | "MARKETING")}
                    className={styles.input}
                  >
                    <option value="UTILITY">UTILITY</option>
                    <option value="MARKETING">MARKETING</option>
                  </select>
                  <p className={styles.help}>
                    UTILITY para comunicação operacional. MARKETING para campanhas e divulgação.
                  </p>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Idioma</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className={styles.input}
                  >
                    <option value="pt_BR">Português (Brasil)</option>
                  </select>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Header</label>
                <input
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  className={styles.input}
                  placeholder="Opcional"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Body</label>
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  rows={7}
                  className={styles.textarea}
                  placeholder="Digite o conteúdo principal do template"
                  required
                />
                <p className={styles.help}>
                  Use variáveis como {"{{1}}"} e {"{{2}}"}. Evite deixar variável no início ou no
                  final da frase.
                </p>
              </div>

              <div className={styles.topGrid}>
                <div className={styles.field}>
                  <label className={styles.label}>Exemplo variável 1</label>
                  <input
                    value={bodyExample1}
                    onChange={(e) => setBodyExample1(e.target.value)}
                    className={styles.input}
                    placeholder="Ex: João"
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Exemplo variável 2</label>
                  <input
                    value={bodyExample2}
                    onChange={(e) => setBodyExample2(e.target.value)}
                    className={styles.input}
                    placeholder="Ex: ABC-123456"
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Footer</label>
                <input
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  className={styles.input}
                  placeholder="Opcional"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Quick replies</label>

                <div className={styles.topGrid}>
                  <input
                    value={quickReply1}
                    onChange={(e) => setQuickReply1(e.target.value)}
                    className={styles.input}
                    placeholder="Quick reply 1"
                  />

                  <input
                    value={quickReply2}
                    onChange={(e) => setQuickReply2(e.target.value)}
                    className={styles.input}
                    placeholder="Quick reply 2"
                  />
                </div>

                <input
                  value={quickReply3}
                  onChange={(e) => setQuickReply3(e.target.value)}
                  className={styles.input}
                  placeholder="Quick reply 3"
                />

                <p className={styles.help}>
                  Opcional. Você pode adicionar até 3 respostas rápidas.
                </p>
              </div>

              <div className={styles.previewCard}>
                <div className={styles.previewHeader}>
                  <div>
                    <h3 className={styles.previewTitle}>Prévia do template</h3>
                    <p className={styles.previewSubtitle}>
                      Revise o conteúdo antes de enviar para aprovação.
                    </p>
                  </div>

                  <span className={`${styles.badge} ${styles.badgeBlue}`}>
                    Variáveis detectadas: {totalVariaveisBody}
                  </span>
                </div>

                <div className={styles.previewGrid}>
                  <div className={styles.previewBlock}>
                    <span className={styles.previewLabel}>Header</span>
                    <p className={styles.previewText}>{headerText.trim() || "Não informado"}</p>
                  </div>

                  <div className={styles.previewBlock}>
                    <span className={styles.previewLabel}>Body</span>
                    <p className={styles.previewText}>{bodyText.trim() || "Não informado"}</p>
                  </div>

                  <div className={styles.previewBlock}>
                    <span className={styles.previewLabel}>Footer</span>
                    <p className={styles.previewText}>{footerText.trim() || "Não informado"}</p>
                  </div>

                  <div className={styles.previewBlock}>
                    <span className={styles.previewLabel}>Quick replies</span>

                    {quickRepliesPreview.length > 0 ? (
                      <div className={styles.quickRepliesList}>
                        {quickRepliesPreview.map((item, index) => (
                          <span
                            key={`${item}-${index}`}
                            className={`${styles.badge} ${styles.badgeGray}`}
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.previewText}>Nenhuma quick reply adicionada.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.submitBar}>
                <div className={styles.submitInfo}>
                  <span>
                    <strong>Integração:</strong>{" "}
                    {integracaoSelecionada?.nome_conexao || "Não selecionada"}
                  </span>
                  <span>
                    <strong>Categoria:</strong> {category}
                  </span>
                  <span>
                    <strong>Idioma:</strong> {language}
                  </span>
                </div>

                <div className={styles.actions}>
                  <button type="submit" disabled={submitting} className={styles.primaryButton}>
                    {submitting ? "Enviando..." : "Criar template"}
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className={styles.resultsCard}>
            <div className={styles.cardHeader}>
              <p className={styles.eyebrow}>Templates cadastrados</p>
              <h2 className={styles.cardTitle}>Lista de templates</h2>
              <p className={styles.cardSubtitle}>
                Acompanhe status, conteúdo e sincronize a integração com o Meta.
              </p>
            </div>

            <div className={styles.resultsSummary}>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Total</span>
                <span className={styles.summaryValue}>{resumoTemplates.total}</span>
              </div>

              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Aprovados</span>
                <span className={styles.summaryValue}>{resumoTemplates.aprovados}</span>
              </div>

              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Pendentes / Rejeitados</span>
                <span className={styles.summaryValueSmall}>
                  {resumoTemplates.pendentes} pendentes • {resumoTemplates.rejeitados} com erro/rejeição
                </span>
              </div>
            </div>

            <div className={styles.inlineBlock}>
              <div className={styles.searchRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Filtrar por integração</label>
                  <select
                    value={filtroIntegracao}
                    onChange={(e) => setFiltroIntegracao(e.target.value)}
                    className={styles.input}
                  >
                    <option value="">Todas as integrações</option>
                    {integracoes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome_conexao}
                        {item.numero ? ` - ${item.numero}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    onClick={() => carregarTemplates(filtroIntegracao)}
                    className={styles.secondaryButton}
                  >
                    Atualizar lista
                  </button>

                  <button
                    type="button"
                    onClick={sincronizarTemplatesMeta}
                    className={styles.primaryButton}
                    disabled={sincronizando}
                  >
                    {sincronizando ? "Sincronizando..." : "Sincronizar com Meta"}
                  </button>
                </div>
              </div>
            </div>

            {loadingTemplates ? (
              <div className={styles.emptyState}>Carregando templates...</div>
            ) : templates.length === 0 ? (
              <div className={styles.emptyState}>Nenhum template encontrado.</div>
            ) : (
              <div className={styles.resultsList}>
                {templates.map((template) => {
                  const header = extrairHeader(template.payload);
                  const body = extrairBody(template.payload);
                  const footer = extrairFooter(template.payload);
                  const quickReplies = extrairQuickReplies(template.payload);

                  return (
                    <div key={template.id} className={styles.compactTemplateCard}>
                      <div className={styles.compactTemplateTop}>
                        <div className={styles.compactTemplateMain}>
                          <div className={styles.compactTemplateTitleRow}>
                            <h3 className={styles.compactTemplateTitle}>{template.nome}</h3>
                            <span className={getStatusClass(template.status)}>
                              {getStatusLabel(template.status)}
                            </span>
                          </div>

                          <p className={styles.compactTemplateMeta}>
                            Categoria: {template.categoria} • Idioma: {template.idioma} • Meta ID:{" "}
                            {template.meta_template_id || "-"} • Criado em:{" "}
                            {formatarData(template.created_at)}
                          </p>
                        </div>
                      </div>

                      {header ? (
                        <div className={styles.compactBlock}>
                          <span className={styles.compactLabel}>Header</span>
                          <p className={styles.compactText}>{header}</p>
                        </div>
                      ) : null}

                      <div className={styles.compactBlock}>
                        <span className={styles.compactLabel}>Body</span>
                        <p className={styles.compactText}>{body || "Não informado"}</p>
                      </div>

                      {(footer || quickReplies.length > 0) && (
                        <div className={styles.compactFooterRow}>
                          {footer ? (
                            <div className={styles.compactMiniBlock}>
                              <span className={styles.compactLabel}>Footer</span>
                              <p className={styles.compactText}>{footer}</p>
                            </div>
                          ) : null}

                          {quickReplies.length > 0 ? (
                            <div className={styles.compactMiniBlock}>
                              <span className={styles.compactLabel}>Quick replies</span>
                              <div className={styles.quickRepliesList}>
                                {quickReplies.map((item, index) => (
                                  <span
                                    key={`${item}-${index}`}
                                    className={`${styles.badge} ${styles.badgeGray}`}
                                  >
                                    {item}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}

                      {template.quality_rating ? (
                        <p className={styles.resultText}>
                          <strong>Qualidade:</strong> {template.quality_rating}
                        </p>
                      ) : null}

                      {template.rejeicao_motivo ? (
                        <p className={styles.resultCompactError}>
                          <strong>Motivo da rejeição:</strong> {template.rejeicao_motivo}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}