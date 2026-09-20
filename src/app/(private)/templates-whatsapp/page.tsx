"use client";

import { useEffect, useMemo, useState } from "react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import { useHeaderUser } from "@/components/header-user-context";
import styles from "./templates-whatsapp.module.css";
import { obterFooterOptOut } from "@/lib/whatsapp/opt-out-policy";

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
    header_handle?: string[];
  };
};

type HeaderType = "NONE" | "TEXT" | "IMAGE";

const LIMITE_IMAGEM_TEMPLATE_BYTES = 5 * 1024 * 1024;
const MIME_IMAGENS_TEMPLATE = new Set(["image/jpeg", "image/png"]);

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
  opt_out_habilitado: boolean;
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

function formatarCategoriaMeta(categoria: string | null | undefined) {
  switch (String(categoria || "").toUpperCase()) {
    case "UTILITY":
      return "Utilidade";
    case "MARKETING":
      return "Marketing";
    case "AUTHENTICATION":
      return "Autenticação";
    default:
      return categoria || "-";
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

function normalizarStatus(status: string | null | undefined) {
  return String(status || "")
    .trim()
    .toUpperCase();
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

function substituirVariaveisTexto(texto: string, exemplos: string[]) {
  return texto.replace(/\{\{(\d+)\}\}/g, (match: string, numero: string) => {
    const valor = exemplos[Number(numero) - 1]?.trim();
    return valor || match;
  });
}

function formatarStatusIntegracao(status?: string | null) {
  if (!status) return "Sem status";

  switch ((status || "").toLowerCase()) {
    case "ativo":
      return "Ativa";
    case "conectado":
      return "Conectada";
    case "inativo":
      return "Inativa";
    default:
      return status;
  }
}

export default function TemplatesWhatsAppPage() {
  const headerUser = useHeaderUser();
  const podeCriarTemplate = headerUser.permissoes.includes(
    "whatsapp_templates.criar"
  );
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
  const [headerType, setHeaderType] = useState<HeaderType>("NONE");
  const [headerText, setHeaderText] = useState("");
  const [headerImage, setHeaderImage] = useState<File | null>(null);
  const [headerImagePreview, setHeaderImagePreview] = useState("");
  const [bodyText, setBodyText] = useState(
    "Olá {{1}}, seu atendimento foi iniciado com sucesso. O protocolo gerado foi {{2}}. Guarde esta informação."
  );
  const [bodyExample1, setBodyExample1] = useState("João");
  const [bodyExample2, setBodyExample2] = useState("ABC-123456");
  const [bodyExample3, setBodyExample3] = useState("10:00");
  const [footerText, setFooterText] = useState(
    obterFooterOptOut("UTILITY") || ""
  );
  const [quickReply1, setQuickReply1] = useState("");
  const [quickReply2, setQuickReply2] = useState("");
  const [quickReply3, setQuickReply3] = useState("");

  const [paginaAtual, setPaginaAtual] = useState(1);
  const ITENS_POR_PAGINA = 7;
    
  const [filtroStatus, setFiltroStatus] = useState<
    "todos" | "approved" | "pending" | "rejected"
  >("todos");

  useEffect(() => {
    setFooterText(obterFooterOptOut(category) || "");
  }, [category]);

  useEffect(() => {
    if (!headerImage) {
      setHeaderImagePreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(headerImage);
    setHeaderImagePreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [headerImage]);

  async function carregarIntegracoes() {
    try {
      setLoadingIntegracoes(true);
      setErro("");

      const res = await fetch("/api/integracoes-whatsapp/listar", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar integrações.");
      }

      const listaIntegracoes: IntegracaoWhatsApp[] = Array.isArray(json.data)
        ? json.data
        : [];

      setIntegracoes(listaIntegracoes);

      setIntegracaoId((integracaoAtual) => {
        if (listaIntegracoes.length === 1) {
          return listaIntegracoes[0].id;
        }

        return listaIntegracoes.some((item) => item.id === integracaoAtual)
          ? integracaoAtual
          : "";
      });

      setFiltroIntegracao((filtroAtual) => {
        if (listaIntegracoes.length === 1) {
          return listaIntegracoes[0].id;
        }

        return listaIntegracoes.some((item) => item.id === filtroAtual)
          ? filtroAtual
          : "";
      });
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

  const selectIntegracaoBloqueado =
    loadingIntegracoes || integracoes.length <= 1;

  const quickRepliesPreview = [quickReply1, quickReply2, quickReply3]
    .map((item) => item.trim())
    .filter(Boolean);

  const totalVariaveisBody = useMemo(() => contarVariaveisTexto(bodyText), [bodyText]);
  const exemplosBodyPreview = [bodyExample1, bodyExample2, bodyExample3];
  const bodyTextPreview = substituirVariaveisTexto(bodyText.trim(), exemplosBodyPreview);

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
  
  const templatesFiltradosPorStatus = useMemo(() => {
    if (filtroStatus === "todos") return templates;

    return templates.filter((template) => {
      const status = template.status?.toUpperCase();

      if (filtroStatus === "approved") {
        return status === "APPROVED";
      }

      if (filtroStatus === "pending") {
        return status === "PENDING";
      }

      if (filtroStatus === "rejected") {
        return status === "REJECTED" || status === "ERRO_ENVIO";
      }

      return true;
    });
  }, [templates, filtroStatus]);
  

  const totalPaginasTemplates = Math.ceil(
    templatesFiltradosPorStatus.length / ITENS_POR_PAGINA
  );

  const templatesPaginados = templatesFiltradosPorStatus.slice(
    (paginaAtual - 1) * ITENS_POR_PAGINA,
    paginaAtual * ITENS_POR_PAGINA
  );
  
  
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setMensagem("");
    setErro("");

    if (!podeCriarTemplate) {
      setErro("Você não tem permissão para criar templates.");
      return;
    }

    if (!integracaoId) {
      setErro("Selecione uma integração WhatsApp.");
      return;
    }

    if (!name.trim()) {
      setErro("Informe o nome do template.");
      return;
    }

    if (headerType === "TEXT" && headerText.trim().length > 60) {
      setErro("O cabeçalho de texto deve ter no máximo 60 caracteres.");
      return;
    }

    if (headerType === "IMAGE") {
      if (!headerImage) {
        setErro("Selecione a imagem que será usada no cabeçalho do template.");
        return;
      }

      if (!MIME_IMAGENS_TEMPLATE.has(headerImage.type)) {
        setErro("A Meta aceita imagem de cabeçalho em JPG/JPEG ou PNG.");
        return;
      }

      if (headerImage.size > LIMITE_IMAGEM_TEMPLATE_BYTES) {
        setErro("A imagem do template deve ter no máximo 5 MB.");
        return;
      }
    }

    if (!bodyText.trim()) {
      setErro("Informe o conteúdo do BODY.");
      return;
    }

    if (totalVariaveisBody > 3) {
      setErro("Use no máximo 3 variáveis no corpo do template.");
      return;
    }

    const exemplosBody = [bodyExample1.trim(), bodyExample2.trim(), bodyExample3.trim()];
    const exemplosObrigatorios = exemplosBody.slice(0, totalVariaveisBody);

    if (
      totalVariaveisBody > 0 &&
      exemplosObrigatorios.some((exemplo) => !exemplo.trim())
    ) {
      setErro("Informe os exemplos das variáveis usadas no corpo do template.");
      return;
    }

    try {
      setSubmitting(true);

      const components: TemplateComponent[] = [];

      if (headerType === "IMAGE" && headerImage) {
        const mediaFormData = new FormData();
        mediaFormData.append("integracao_whatsapp_id", integracaoId);
        mediaFormData.append("file", headerImage, headerImage.name);

        const mediaRes = await fetch("/api/whatsapp/templates/media", {
          method: "POST",
          body: mediaFormData,
        });
        const mediaJson = await mediaRes.json();

        if (!mediaRes.ok || !mediaJson.ok || !mediaJson.handle) {
          const metaMsg =
            mediaJson?.meta?.error?.error_user_msg ||
            mediaJson?.meta?.error?.message ||
            mediaJson?.error;
          throw new Error(
            metaMsg || "Não foi possível enviar a imagem do template para a Meta."
          );
        }

        components.push({
          type: "HEADER",
          format: "IMAGE",
          example: {
            header_handle: [String(mediaJson.handle)],
          },
        });
      } else if (headerType === "TEXT" && headerText.trim()) {
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

      const exemplos = exemplosBody.slice(0, totalVariaveisBody).filter(Boolean);

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
      setHeaderType("NONE");
      setHeaderText("");
      setHeaderImage(null);
      setBodyText(
        "Olá {{1}}, seu atendimento foi iniciado com sucesso. O protocolo gerado foi {{2}}. Guarde esta informação."
      );
      setBodyExample1("João");
      setBodyExample2("ABC-123456");
      setBodyExample3("10:00");
      setFooterText(obterFooterOptOut(category) || "");
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
        title="Templates WhatsApp"
        subtitle="Crie, visualize e acompanhe templates enviados para aprovação da Meta."
      />

      <div className={styles.pageContent}>
        <div className={styles.layout}>
          <div className={styles.formCard}>
            <div className={styles.cardHeader}>
              <p className={styles.eyebrow}>Criação de template</p>
              <h2 className={styles.cardTitle}>Novo template</h2>
              <p className={styles.cardSubtitle}>
                Monte o template, revise a prévia e envie para validação da Meta.
              </p>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              <fieldset
                disabled={!podeCriarTemplate}
                className={styles.creatorFieldset}
              >
              <div className={styles.creatorGrid}>
                  <div className={styles.formFields}>
                      <div className={styles.topGrid}>
                        <div className={styles.field}>
                          <label className={styles.label}>Integração WhatsApp</label>
                          <select
                            value={integracaoId}
                            onChange={(e) => setIntegracaoId(e.target.value)}
                            className={styles.input}
                            disabled={selectIntegracaoBloqueado}
                            required
                          >
                            <option value="">
                              {loadingIntegracoes ? "Carregando..." : "Selecione uma integração"}
                            </option>

                            {integracoes.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.nome_conexao}
                                {item.numero ? ` ${item.numero}` : ""}
                              </option>
                            ))}
                          </select>
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

                      <div className={styles.topGrid}>
                        <div className={styles.field}>
                          <label className={styles.label}>Nome do template</label>
                          <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={styles.input}
                            placeholder="Ex.: notificacao_atendimento_iniciado"
                            required
                          />
                          <p className={styles.help}>
                            Use um nome simples, sem espaços. O backend normaliza automaticamente.
                          </p>
                        </div>
                        
                        <div className={styles.field}>
                          <label className={styles.label}>Categoria</label>
                          <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value as "UTILITY" | "MARKETING")}
                            className={styles.input}
                          >
                            <option value="UTILITY">UTILIDADE</option>
                            <option value="MARKETING">MARKETING</option>
                          </select>
                          <p className={styles.help}>
                            UTILIDADE para comunicações operacionais. MARKETING para campanhas e promoções.
                          </p>
                        </div>
                      </div>
                      
                      <div className={styles.field}>
                        <label className={styles.label}>Cabeçalho</label>
                        <select
                          value={headerType}
                          onChange={(e) => {
                            const nextType = e.target.value as HeaderType;
                            setHeaderType(nextType);

                            if (nextType !== "TEXT") {
                              setHeaderText("");
                            }

                            if (nextType !== "IMAGE") {
                              setHeaderImage(null);
                            }
                          }}
                          className={styles.input}
                        >
                          <option value="NONE">Sem cabeçalho</option>
                          <option value="TEXT">Texto</option>
                          <option value="IMAGE">Imagem</option>
                        </select>
                        <p className={styles.help}>
                          O tipo do cabeçalho faz parte da estrutura analisada e aprovada pela Meta.
                        </p>
                      </div>

                      {headerType === "TEXT" ? (
                        <div className={styles.field}>
                          <label className={styles.label}>Texto do cabeçalho</label>
                          <input
                            value={headerText}
                            onChange={(e) => setHeaderText(e.target.value)}
                            className={styles.input}
                            placeholder="Opcional"
                            maxLength={60}
                          />
                          <p className={styles.help}>Máximo de 60 caracteres.</p>
                        </div>
                      ) : null}

                      {headerType === "IMAGE" ? (
                        <div className={styles.field}>
                          <label className={styles.label}>Imagem do cabeçalho</label>
                          <div className={styles.imageUploadBox}>
                            <input
                              type="file"
                              accept="image/jpeg,image/png"
                              className={styles.fileInput}
                              onChange={(e) => {
                                setErro("");
                                const file = e.target.files?.[0] || null;

                                if (!file) {
                                  setHeaderImage(null);
                                  return;
                                }

                                if (!MIME_IMAGENS_TEMPLATE.has(file.type)) {
                                  setHeaderImage(null);
                                  e.currentTarget.value = "";
                                  setErro("A Meta aceita imagem de cabeçalho em JPG/JPEG ou PNG.");
                                  return;
                                }

                                if (file.size > LIMITE_IMAGEM_TEMPLATE_BYTES) {
                                  setHeaderImage(null);
                                  e.currentTarget.value = "";
                                  setErro("A imagem do template deve ter no máximo 5 MB.");
                                  return;
                                }

                                setHeaderImage(file);
                              }}
                            />

                            {headerImagePreview ? (
                              <img
                                src={headerImagePreview}
                                alt="Prévia da imagem do cabeçalho"
                                className={styles.imageUploadPreview}
                              />
                            ) : null}

                            <div>
                              <strong className={styles.imageUploadTitle}>
                                {headerImage?.name || "Selecione uma imagem"}
                              </strong>
                              <p className={styles.help}>
                                JPG/JPEG ou PNG, até 5 MB. A imagem é enviada à Meta como mídia de exemplo para análise do template.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className={styles.field}>
                        <label className={styles.label}>Corpo</label>
                        <textarea
                          value={bodyText}
                          onChange={(e) => setBodyText(e.target.value)}
                          rows={7}
                          className={styles.textarea}
                          placeholder="Digite o conteúdo principal do template"
                          required
                        />
                        <p className={styles.help}>
                          Use variáveis como {"{{1}}"}, {"{{2}}"} e {"{{3}}"}. Evite deixar variáveis no início ou no fim da frase.
                        </p>
                      </div>

                      {totalVariaveisBody > 0 ? (
                        <div className={styles.topGrid}>
                          <div className={styles.field}>
                            <label className={styles.label}>Exemplo da variável 1</label>
                            <input
                              value={bodyExample1}
                              onChange={(e) => setBodyExample1(e.target.value)}
                              className={styles.input}
                              placeholder="Ex.: João"
                            />
                          </div>

                          {totalVariaveisBody >= 2 ? (
                            <div className={styles.field}>
                              <label className={styles.label}>Exemplo da variável 2</label>
                              <input
                                value={bodyExample2}
                                onChange={(e) => setBodyExample2(e.target.value)}
                                className={styles.input}
                                placeholder="Ex: ABC-123456"
                              />
                            </div>
                          ) : null}

                          {totalVariaveisBody >= 3 ? (
                            <div className={styles.field}>
                              <label className={styles.label}>Exemplo da variável 3</label>
                              <input
                                value={bodyExample3}
                                onChange={(e) => setBodyExample3(e.target.value)}
                                className={styles.input}
                                placeholder="Ex.: 10:00"
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className={styles.field}>
                        <label className={styles.label}>Rodapé</label>
                        <input
                          value={footerText}
                          className={styles.input}
                          readOnly
                        />
                        <p className={styles.help}>
                          Rodapé obrigatório para permitir o opt-out automático
                          de disparos.
                        </p>
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label}>Respostas rápidas</label>

                        <div className={styles.topGrid}>
                          <input
                            value={quickReply1}
                            onChange={(e) => setQuickReply1(e.target.value)}
                            className={styles.input}
                            placeholder="Resposta rápida 1"
                          />

                          <input
                            value={quickReply2}
                            onChange={(e) => setQuickReply2(e.target.value)}
                            className={styles.input}
                            placeholder="Resposta rápida 2"
                          />
                        </div>

                        <input
                          value={quickReply3}
                          onChange={(e) => setQuickReply3(e.target.value)}
                          className={styles.input}
                          placeholder="Resposta rápida 3"
                        />

                        <p className={styles.help}>
                            Opcional. Você pode adicionar até 3 respostas rápidas.
                        </p>
                      </div>
                    </div>

                    <aside className={styles.previewSidebar}>
                      <div className={styles.whatsappPreviewCard}>
                        <div className={styles.previewTopLine}>
                          <strong>Prévia WhatsApp</strong>
                        </div>

                        <div className={styles.whatsappPreviewArea}>
                          <div className={styles.whatsappBubble}>
                            {headerType === "IMAGE" && headerImagePreview ? (
                              <img
                                src={headerImagePreview}
                                alt="Imagem do cabeçalho"
                                className={styles.whatsappPreviewImage}
                              />
                            ) : headerType === "TEXT" && headerText.trim() ? (
                              <strong className={styles.whatsappPreviewTitle}>
                                {headerText.trim()}
                              </strong>
                            ) : null}

                            <p className={styles.whatsappPreviewText}>
                              {bodyTextPreview || "Digite o corpo do template para visualizar a mensagem do WhatsApp."}
                            </p>

                            <div className={styles.whatsappPreviewMeta}>
                              <span className={styles.whatsappPreviewFooter}>
                                {footerText.trim() || "Equipe de atendimento"}
                              </span>

                              <span className={styles.whatsappPreviewTime}>
                                {new Date().toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>

                            {quickRepliesPreview.map((texto, index) => (
                              <div key={`${texto}-${index}`} className={styles.whatsappPreviewButton}>
                                ↩ {texto}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className={styles.previewCard}>
                        <div className={styles.previewHeader}>
                          <div>
                            <h3 className={styles.previewTitle}>Estrutura do template</h3>
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
                            <span className={styles.previewLabel}>Cabeçalho</span>
                            <p className={styles.previewText}>
                              {headerType === "IMAGE"
                                ? headerImage
                                  ? `Imagem: ${headerImage.name}`
                                  : "Imagem não selecionada"
                                : headerType === "TEXT"
                                ? headerText.trim() || "Texto não informado"
                                : "Sem cabeçalho"}
                            </p>
                          </div>

                          <div className={styles.previewBlock}>
                            <span className={styles.previewLabel}>Corpo</span>
                            <p className={styles.previewText}>{bodyText.trim() || "Não informado"}</p>
                          </div>

                          <div className={styles.previewBlock}>
                            <span className={styles.previewLabel}>Rodapé</span>
                            <p className={styles.previewText}>{footerText.trim() || "Não informado"}</p>
                          </div>

                          <div className={styles.previewBlock}>
                            <span className={styles.previewLabel}>Respostas rápidas</span>

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
                              <p className={styles.previewText}>Nenhuma resposta rápida adicionada.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </aside>
                </div>

                <div className={styles.submitBar}>
                  <div className={styles.submitInfo}>
                    <span>
                      <strong>Integração:</strong>{" "}
                      {integracaoSelecionada?.nome_conexao || "Não selecionada"}
                    </span>
                    <span>
                      <strong>Categoria:</strong> {formatarCategoriaMeta(category)}
                    </span>
                    <span>
                      <strong>Idioma:</strong> {language}
                    </span>
                  </div>

                  {(mensagem || erro) && (
                    <>
                      {mensagem ? (
                        <FeedbackToast
                          success={mensagem}
                          onSuccessDismiss={() => setMensagem("")}
                        />
                      ) : null}
                      {erro ? <div className={styles.errorAlert}>{erro}</div> : null}
                    </>
                  )}
                    
                  <div className={styles.actions}>
                    <button type="submit" disabled={submitting} className={styles.primaryButton}>
                      {submitting ? "Enviando..." : "Criar template"}
                    </button>
                  </div>
                </div>
              </fieldset>
            </form>
          </div>

          <div className={styles.resultsCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderContent}>
                  <div>
                    <p className={styles.eyebrow}>Templates cadastrados</p>
                    <h2 className={styles.cardTitle}>Lista de templates</h2>
                    <p className={styles.cardSubtitle}>
                      Acompanhe status, conteúdo e sincronize a conexão com a Meta.
                    </p>
                  </div>

                  <a
                    href="https://business.facebook.com/latest/whatsapp_manager/message_templates"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.metaPaymentButton}
                  >
                    Ver templates na Meta
                  </a>
                </div>
              </div>

              <div className={styles.resultsSummary}>
                <button
                  type="button"
                  className={`${styles.summaryCard} ${
                    filtroStatus === "todos" ? styles.summaryCardActive : ""
                  }`}
                  onClick={() => setFiltroStatus("todos")}
                >
                  <span className={styles.summaryLabel}>Total</span>
                  <span className={styles.summaryValue}>{resumoTemplates.total}</span>
                </button>

                <button
                  type="button"
                  className={`${styles.summaryCard} ${
                    filtroStatus === "approved" ? styles.summaryCardActive : ""
                  }`}
                  onClick={() => setFiltroStatus("approved")}
                >
                  <span className={styles.summaryLabel}>Aprovados</span>
                  <span className={styles.summaryValue}>{resumoTemplates.aprovados}</span>
                </button>

                <button
                  type="button"
                  className={`${styles.summaryCard} ${
                    filtroStatus === "pending" ? styles.summaryCardActive : ""
                  }`}
                  onClick={() => setFiltroStatus("pending")}
                >
                  <span className={styles.summaryLabel}>Pendentes</span>
                  <span className={styles.summaryValue}>{resumoTemplates.pendentes}</span>
                </button>

                <button
                  type="button"
                  className={`${styles.summaryCard} ${
                    filtroStatus === "rejected" ? styles.summaryCardActive : ""
                  }`}
                  onClick={() => setFiltroStatus("rejected")}
                >
                  <span className={styles.summaryLabel}>Rejeitados</span>
                  <span className={styles.summaryValue}>{resumoTemplates.rejeitados}</span>
                </button>
              </div>

              <div className={styles.inlineBlock}>
                <div className={styles.searchRow}>
                  <div className={styles.field}>
                    <label className={styles.label}>Filtrar por integração</label>
                    <select
                      value={filtroIntegracao}
                      onChange={(e) => {
                        setFiltroIntegracao(e.target.value);
                        setPaginaAtual(1);
                      }}
                      className={styles.input}
                      disabled={selectIntegracaoBloqueado}
                    >
                      <option value="">Todas as integrações</option>
                      {integracoes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome_conexao}
                          {item.numero ? ` ${item.numero}` : ""}
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
                      {sincronizando ? "Sincronizando..." : "Sincronizar com a Meta"}
                    </button>
                  </div>
                </div>
              </div>

                {loadingTemplates ? (
                  <div className={styles.emptyState}>Carregando templates...</div>
                ) : templatesFiltradosPorStatus.length === 0 ? (
                  <div className={styles.emptyState}>Nenhum template encontrado.</div>
                ) : (
                  <div className={styles.resultsList}>
                    {templatesPaginados.map((template) => {
                      const headerComponent = getComponent(template.payload, "HEADER");
                      const header = extrairHeader(template.payload);
                      const headerFormat = String(
                        headerComponent?.format || (header ? "TEXT" : "")
                      ).toUpperCase();
                      const headerImageUrl =
                        headerFormat === "IMAGE"
                          ? (headerComponent?.example?.header_handle || [])
                              .map((item) => String(item || "").trim())
                              .find((item) => /^https?:\/\//i.test(item)) || ""
                          : "";
                      const body = extrairBody(template.payload);
                      const footer = extrairFooter(template.payload);
                      const quickReplies = extrairQuickReplies(template.payload);

                      return (
                        <div key={template.id} className={styles.compactTemplateCard}>
                          <div className={styles.compactTemplateTop}>
                            <div className={styles.compactTemplateMain}>
                              <div className={styles.compactTemplateTitleRow}>
                                <h3 className={styles.compactTemplateTitle}>{template.nome}</h3>
                                <div className={styles.compactTemplateBadges}>
                                  <span className={getStatusClass(template.status)}>
                                    {getStatusLabel(template.status)}
                                  </span>
                                  <span
                                    className={`${styles.badge} ${
                                      template.opt_out_habilitado
                                        ? styles.badgeGreen
                                        : String(template.categoria).toUpperCase() ===
                                          "AUTHENTICATION"
                                        ? styles.badgeGray
                                        : styles.badgeYellow
                                    }`}
                                  >
                                    {template.opt_out_habilitado
                                      ? "Opt-out habilitado"
                                      : String(template.categoria).toUpperCase() ===
                                        "AUTHENTICATION"
                                      ? "Opt-out não aplicável"
                                      : "Sem opt-out"}
                                  </span>
                                </div>
                              </div>

                              <p className={styles.compactTemplateMeta}>
                                Categoria: {formatarCategoriaMeta(template.categoria)} • Idioma: {template.idioma} • ID Meta:{" "}
                                {template.meta_template_id || "-"} • Criado em:{" "}
                                {formatarData(template.created_at)}
                              </p>
                            </div>
                          </div>

                          {header || headerFormat === "IMAGE" ? (
                            <div className={styles.compactBlock}>
                              <span className={styles.compactLabel}>Cabeçalho</span>
                              {headerImageUrl ? (
                                <img
                                  src={headerImageUrl}
                                  alt={`Cabeçalho do template ${template.nome}`}
                                  className={styles.compactHeaderImage}
                                />
                              ) : (
                                <p className={styles.compactText}>
                                  {header || "Imagem vinculada ao template"}
                                </p>
                              )}
                            </div>
                          ) : null}

                          <div className={styles.compactBlock}>
                            <span className={styles.compactLabel}>Corpo</span>
                            <p className={styles.compactText}>{body || "Não informado"}</p>
                          </div>

                          {(footer || quickReplies.length > 0) && (
                            <div className={styles.compactFooterRow}>
                              {footer ? (
                                <div className={styles.compactMiniBlock}>
                                  <span className={styles.compactLabel}>Rodapé</span>
                                  <p className={styles.compactText}>{footer}</p>
                                </div>
                              ) : null}

                              {quickReplies.length > 0 ? (
                                <div className={styles.compactMiniBlock}>
                                  <span className={styles.compactLabel}>Respostas rápidas</span>
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
            {totalPaginasTemplates > 1 && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.paginationButton}
                  disabled={paginaAtual === 1}
                  onClick={() => setPaginaAtual((prev) => Math.max(prev - 1, 1))}
                >
                  Anterior
                </button>

                <span className={styles.paginationInfo}>
                  Página {paginaAtual} de {totalPaginasTemplates}
                </span>

                <button
                  type="button"
                  className={styles.paginationButton}
                  disabled={paginaAtual >= totalPaginasTemplates}
                  onClick={() =>
                    setPaginaAtual((prev) => Math.min(prev + 1, totalPaginasTemplates))
                  }
                >
                  Próxima
                </button>
              </div>
            )}
        </div>
      </div>
    </>
  );
}
