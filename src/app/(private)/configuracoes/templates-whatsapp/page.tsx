"use client";

import { useEffect, useMemo, useState } from "react";
import "./templates-whatsapp.css";

type IntegracaoWhatsApp = {
  id: string;
  nome_conexao: string;
  numero: string | null;
  status: string | null;
  waba_id: string | null;
};

type TemplateComponent = {
  type: string;
  text?: string;
  format?: string;
  buttons?: Array<{
    type: string;
    text: string;
  }>;
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
  if (!status) return "tw-badge tw-badge-gray";

  switch (status.toUpperCase()) {
    case "PENDING":
      return "tw-badge tw-badge-yellow";
    case "APPROVED":
      return "tw-badge tw-badge-green";
    case "REJECTED":
      return "tw-badge tw-badge-red";
    case "PAUSED":
    case "DISABLED":
    case "ARCHIVED":
      return "tw-badge tw-badge-gray";
    default:
      return "tw-badge tw-badge-blue";
  }
}

function extrairBody(payload: WhatsAppTemplate["payload"]) {
  const body = payload?.components?.find((item) => item.type === "BODY");
  return body?.text || "-";
}

function extrairFooter(payload: WhatsAppTemplate["payload"]) {
  const footer = payload?.components?.find((item) => item.type === "FOOTER");
  return footer?.text || "-";
}

export default function TemplatesWhatsAppPage() {
  const [integracoes, setIntegracoes] = useState<IntegracaoWhatsApp[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);

  const [loadingIntegracoes, setLoadingIntegracoes] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
  const [sincronizando, setSincronizando] = useState(false);

  async function carregarIntegracoes() {
    try {
      setLoadingIntegracoes(true);

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

      const quickReplies = [quickReply1, quickReply2, quickReply3]
        .map((item) => item.trim())
        .filter(Boolean);

      if (quickReplies.length > 0) {
        components.push({
          type: "BUTTONS",
          buttons: quickReplies.map((text) => ({
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
    <div className="tw-page">
      <div className="tw-header-card">
        <div>
          <h1 className="tw-title">Templates do WhatsApp</h1>
          <p className="tw-subtitle">
            Crie, visualize e acompanhe os templates enviados para aprovação no Meta.
          </p>
        </div>

        <button
          type="button"
          onClick={() => carregarTemplates(filtroIntegracao)}
          className="tw-button tw-button-secondary"
        >
          Atualizar lista
        </button>

        <button
            type="button"
            onClick={sincronizarTemplatesMeta}
            className="tw-button tw-button-primary"
            disabled={sincronizando}
          >
            {sincronizando ? "Sincronizando..." : "Sincronizar com Meta"}
          </button>
          
      </div>

      <div className="tw-layout">
        <div className="tw-card">
          <div className="tw-card-header">
            <h2 className="tw-card-title">Novo template</h2>
            <p className="tw-card-subtitle">
              Monte o template e envie para validação do Meta.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="tw-form">
            <div className="tw-field">
              <label className="tw-label">Integração WhatsApp</label>
              <select
                value={integracaoId}
                onChange={(e) => setIntegracaoId(e.target.value)}
                className="tw-input"
                required
              >
                <option value="">
                  {loadingIntegracoes ? "Carregando..." : "Selecione uma integração"}
                </option>
                {integracoes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome_conexao} {item.numero ? `- ${item.numero}` : ""}
                  </option>
                ))}
              </select>

              {integracaoSelecionada ? (
                <div className="tw-info-box">
                  <div>
                    <strong>Status:</strong> {integracaoSelecionada.status || "-"}
                  </div>
                  <div>
                    <strong>WABA ID:</strong> {integracaoSelecionada.waba_id || "-"}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="tw-field">
              <label className="tw-label">Nome do template</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="tw-input"
                placeholder="ex: aviso_atendimento_iniciado"
                required
              />
              <p className="tw-help">
                Use nome simples, sem espaços. O backend já normaliza automaticamente.
              </p>
            </div>

            <div className="tw-grid-2">
              <div className="tw-field">
                <label className="tw-label">Categoria</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as "UTILITY" | "MARKETING")}
                  className="tw-input"
                >
                  <option value="UTILITY">UTILITY</option>
                  <option value="MARKETING">MARKETING</option>
                </select>
              </div>

              <div className="tw-field">
                <label className="tw-label">Idioma</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="tw-input"
                >
                  <option value="pt_BR">Português (Brasil)</option>
                </select>
              </div>
            </div>

            <div className="tw-field">
              <label className="tw-label">Header</label>
              <input
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                className="tw-input"
                placeholder="Opcional"
              />
            </div>

            <div className="tw-field">
              <label className="tw-label">Body</label>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={6}
                className="tw-textarea"
                placeholder="Digite o conteúdo principal do template"
                required
              />
              <p className="tw-help">
                Evite deixar variável no começo ou no final. Exemplo:
                <code className="tw-inline-code">{' {{1}} '}</code>
                deve ficar com texto antes e depois.
              </p>
            </div>

            <div className="tw-grid-2">
              <div className="tw-field">
                <label className="tw-label">Exemplo variável 1</label>
                <input
                  value={bodyExample1}
                  onChange={(e) => setBodyExample1(e.target.value)}
                  className="tw-input"
                  placeholder="Ex: João"
                />
              </div>

              <div className="tw-field">
                <label className="tw-label">Exemplo variável 2</label>
                <input
                  value={bodyExample2}
                  onChange={(e) => setBodyExample2(e.target.value)}
                  className="tw-input"
                  placeholder="Ex: ABC-123456"
                />
              </div>
            </div>

            <div className="tw-field">
              <label className="tw-label">Footer</label>
              <input
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                className="tw-input"
                placeholder="Opcional"
              />
            </div>

            <div className="tw-card-muted">
              <div className="tw-card-muted-header">
                <h3 className="tw-card-muted-title">Quick replies</h3>
                <p className="tw-card-muted-subtitle">
                  Opcional. Você pode adicionar até 3 respostas rápidas.
                </p>
              </div>

              <div className="tw-stack">
                <input
                  value={quickReply1}
                  onChange={(e) => setQuickReply1(e.target.value)}
                  className="tw-input"
                  placeholder="Quick reply 1"
                />

                <input
                  value={quickReply2}
                  onChange={(e) => setQuickReply2(e.target.value)}
                  className="tw-input"
                  placeholder="Quick reply 2"
                />

                <input
                  value={quickReply3}
                  onChange={(e) => setQuickReply3(e.target.value)}
                  className="tw-input"
                  placeholder="Quick reply 3"
                />
              </div>
            </div>

            {mensagem ? <div className="tw-alert tw-alert-success">{mensagem}</div> : null}
            {erro ? <div className="tw-alert tw-alert-error">{erro}</div> : null}

            <button
              type="submit"
              disabled={submitting}
              className="tw-button tw-button-primary tw-button-full"
            >
              {submitting ? "Enviando..." : "Criar template"}
            </button>
          </form>
        </div>

        <div className="tw-card">
          <div className="tw-list-header">
            <div>
              <h2 className="tw-card-title">Templates cadastrados</h2>
              <p className="tw-card-subtitle">
                Acompanhe o status dos templates enviados ao Meta.
              </p>
            </div>

            <div className="tw-filter-box">
              <label className="tw-label">Filtrar por integração</label>
              <select
                value={filtroIntegracao}
                onChange={(e) => setFiltroIntegracao(e.target.value)}
                className="tw-input"
              >
                <option value="">Todas as integrações</option>
                {integracoes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome_conexao}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loadingTemplates ? (
            <div className="tw-empty-state">Carregando templates...</div>
          ) : templates.length === 0 ? (
            <div className="tw-empty-state">Nenhum template encontrado.</div>
          ) : (
            <div className="tw-template-list">
              {templates.map((template) => (
                <div key={template.id} className="tw-template-card">
                  <div className="tw-template-top">
                    <div>
                      <div className="tw-template-title-row">
                        <h3 className="tw-template-title">{template.nome}</h3>
                        <span className={getStatusClass(template.status)}>
                          {getStatusLabel(template.status)}
                        </span>
                      </div>

                      <div className="tw-meta-row">
                        <span>
                          <strong>Categoria:</strong> {template.categoria}
                        </span>
                        <span>
                          <strong>Idioma:</strong> {template.idioma}
                        </span>
                        <span>
                          <strong>Meta ID:</strong> {template.meta_template_id || "-"}
                        </span>
                        <span>
                          <strong>Criado em:</strong> {formatarData(template.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="tw-template-grid">
                    <div className="tw-template-box">
                      <div className="tw-template-box-label">Body</div>
                      <p className="tw-template-box-text">{extrairBody(template.payload)}</p>
                    </div>

                    <div className="tw-template-box">
                      <div className="tw-template-box-label">Footer</div>
                      <p className="tw-template-box-text">{extrairFooter(template.payload)}</p>
                    </div>
                  </div>

                  {template.quality_rating ? (
                    <div className="tw-alert tw-alert-info">
                      <strong>Qualidade:</strong> {template.quality_rating}
                    </div>
                  ) : null}

                  {template.rejeicao_motivo ? (
                    <div className="tw-alert tw-alert-error">
                      <strong>Motivo da rejeição:</strong> {template.rejeicao_motivo}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}