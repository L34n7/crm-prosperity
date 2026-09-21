"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const LIMITE_IMAGEM_TEMPLATE_BYTES = 5 * 1024 * 1024;
const MIME_IMAGENS_TEMPLATE = new Set(["image/jpeg", "image/png"]);
const TEMPLATE_LANGUAGE = "pt_BR";

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

function montarPreviewListaTemplate(payload: WhatsAppTemplate["payload"]) {
  const headerComponent = getComponent(payload, "HEADER");
  const headerFormat = String(headerComponent?.format || "").toUpperCase();
  let titulo =
    headerFormat === "TEXT" ? String(headerComponent?.text || "").trim() : "";
  let corpo = extrairBody(payload).trim();

  if (!titulo && headerFormat === "IMAGE") {
    const tituloNoBody = corpo.match(/^\*([^*\n]+)\*\s*(?:\n+|$)/);

    if (tituloNoBody) {
      titulo = tituloNoBody[1].trim();
      corpo = corpo.slice(tituloNoBody[0].length).trim();
    }
  }

  return {
    titulo,
    corpo: corpo || "Conteúdo não informado.",
    rodape: extrairFooter(payload),
    quickReplies: extrairQuickReplies(payload),
  };
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
  const [erroSincronizacao, setErroSincronizacao] = useState("");

  const [filtroIntegracao, setFiltroIntegracao] = useState("");

  const [integracaoId, setIntegracaoId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [headerText, setHeaderText] = useState("");
  const [headerImageEnabled, setHeaderImageEnabled] = useState(false);
  const [headerImage, setHeaderImage] = useState<File | null>(null);
  const [headerImagePreview, setHeaderImagePreview] = useState("");
  const [bodyText, setBodyText] = useState(
    "Olá {{1}}, seu atendimento foi iniciado com sucesso. O protocolo gerado foi {{2}}. Guarde esta informação."
  );
  const [bodyExamples, setBodyExamples] = useState([
    "João",
    "ABC-123456",
    "",
    "",
    "",
    "",
  ]);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
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

  const totalVariaveisBody = useMemo(
    () => contarVariaveisTexto(bodyText),
    [bodyText]
  );
  const quantidadeVariaveisBody = useMemo(() => {
    const numeros = bodyText
      .match(/\{\{\d+\}\}/g)
      ?.map((item) => Number(item.replace(/[{}]/g, "")))
      .filter((numero) => numero >= 1 && numero <= 6) || [];

    return new Set(numeros).size;
  }, [bodyText]);
  const bodyTextPreview = substituirVariaveisTexto(
    bodyText.trim(),
    bodyExamples
  );

  function atualizarExemploBody(index: number, valor: string) {
    setBodyExamples((atual) =>
      atual.map((item, itemIndex) => (itemIndex === index ? valor : item))
    );
  }

  function adicionarVariavelBody() {
    const usados = new Set(
      (bodyText.match(/\{\{\d+\}\}/g) || [])
        .map((item) => Number(item.replace(/[{}]/g, "")))
        .filter((numero) => numero >= 1 && numero <= 6)
    );
    const proxima = [1, 2, 3, 4, 5, 6].find((numero) => !usados.has(numero));

    if (!proxima) {
      setErro("O limite é de 6 variáveis por template.");
      return;
    }

    const token = `{{${proxima}}}`;
    const textarea = bodyTextareaRef.current;
    const inicio = textarea?.selectionStart ?? bodyText.length;
    const fim = textarea?.selectionEnd ?? inicio;
    const antes = bodyText.slice(0, inicio);
    const depois = bodyText.slice(fim);
    const espacoAntes = antes && !/\s$/.test(antes) ? " " : "";
    const espacoDepois = depois && !/^\s/.test(depois) ? " " : "";
    const insercao = `${espacoAntes}${token}${espacoDepois}`;
    const proximoTexto = `${antes}${insercao}${depois}`;
    const novaPosicao = inicio + insercao.length;

    setBodyText(proximoTexto);
    setErro("");

    requestAnimationFrame(() => {
      bodyTextareaRef.current?.focus();
      bodyTextareaRef.current?.setSelectionRange(novaPosicao, novaPosicao);
    });
  }

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

    if (headerText.trim().length > 60) {
      setErro("O cabeçalho deve ter no máximo 60 caracteres.");
      return;
    }

    if (
      headerImageEnabled &&
      headerText.trim() &&
      /\{\{\d+\}\}/.test(headerText)
    ) {
      setErro("Quando houver imagem, o cabeçalho não deve usar variáveis.");
      return;
    }

    if (headerImageEnabled && !headerImage) {
      setErro("Selecione a imagem do template ou desative a opção de imagem.");
      return;
    }

    if (headerImageEnabled && headerImage) {
      if (!MIME_IMAGENS_TEMPLATE.has(headerImage.type)) {
        setErro("A Meta aceita imagem em JPG/JPEG ou PNG.");
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

    if (totalVariaveisBody > 6 || quantidadeVariaveisBody > 6) {
      setErro("Use no máximo 6 variáveis no corpo do template.");
      return;
    }

    const numerosVariaveis = Array.from(
      new Set(
        (bodyText.match(/\{\{\d+\}\}/g) || [])
          .map((item) => Number(item.replace(/[{}]/g, "")))
          .filter((numero) => Number.isFinite(numero))
      )
    ).sort((a, b) => a - b);

    if (
      numerosVariaveis.some(
        (numero, index) => numero !== index + 1 || numero > 6
      )
    ) {
      setErro("Use as variáveis em sequência, de {{1}} até no máximo {{6}}.");
      return;
    }

    const exemplosBody = bodyExamples.map((item) => item.trim());
    const exemplosObrigatorios = exemplosBody.slice(0, totalVariaveisBody);

    if (
      totalVariaveisBody > 0 &&
      exemplosObrigatorios.some((exemplo) => !exemplo.trim())
    ) {
      setErro("Informe os exemplos das variáveis usadas no corpo do template.");
      return;
    }

    const bodyTextFinal =
      headerImageEnabled && headerImage && headerText.trim()
        ? `*${headerText.trim()}*\n\n${bodyText.trim()}`
        : bodyText.trim();

    if (bodyTextFinal.length > 1024) {
      setErro(
        "O corpo do template, incluindo o título abaixo da imagem, deve ter no máximo 1024 caracteres."
      );
      return;
    }

    try {
      setSubmitting(true);

      const components: TemplateComponent[] = [];

      if (headerImageEnabled && headerImage) {
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
      } else if (headerText.trim()) {
        components.push({
          type: "HEADER",
          format: "TEXT",
          text: headerText.trim(),
        });
      }

      const bodyComponent: TemplateComponent = {
        type: "BODY",
        text: bodyTextFinal,
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
          language: TEMPLATE_LANGUAGE,
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
      setHeaderImageEnabled(false);
      setHeaderImage(null);
      setBodyText(
        "Olá {{1}}, seu atendimento foi iniciado com sucesso. O protocolo gerado foi {{2}}. Guarde esta informação."
      );
      setBodyExamples(["João", "ABC-123456", "", "", "", ""]);
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
      setErroSincronizacao("");

      if (!filtroIntegracao && !integracaoId) {
        setErroSincronizacao("Selecione uma integração para sincronizar.");
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
      setErroSincronizacao(
        error?.message || "Erro ao sincronizar templates."
      );
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
                      <div className={styles.field}>
                        <label className={styles.label}>Integração WhatsApp</label>
                        <select
                          value={integracaoId}
                          onChange={(e) => {
                            setIntegracaoId(e.target.value);
                            if (e.target.value) {
                              setErroSincronizacao("");
                            }
                          }}
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
                        <p className={styles.help}>
                          Selecione o número do WhatsApp que será usado para enviar este template nos disparos.
                        </p>
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
                            UTILIDADE para comunicações operacionais. MARKETING para campanhas e promoções. A Meta pode reclassificar o modelo durante a análise.
                          </p>
                        </div>
                      </div>
                      
                      <div className={styles.mediaSection}>
                        <div className={styles.mediaToggleCard}>
                          <div className={styles.mediaToggleCopy}>
                            <span className={styles.mediaEyebrow}>Mídia do template</span>
                            <strong className={styles.mediaToggleTitle}>Adicionar imagem</strong>
                            <span className={styles.mediaToggleSubtitle}>
                              Ative para enviar uma imagem junto ao template.
                            </span>
                          </div>

                          <button
                            type="button"
                            role="switch"
                            aria-checked={headerImageEnabled}
                            className={`${styles.premiumSwitch} ${
                              headerImageEnabled ? styles.premiumSwitchActive : ""
                            }`}
                            onClick={() => {
                              setHeaderImageEnabled((ativo) => {
                                const proximo = !ativo;
                                if (!proximo) {
                                  setHeaderImage(null);
                                }
                                return proximo;
                              });
                              setErro("");
                            }}
                          >
                            <span className={styles.premiumSwitchThumb} />
                          </button>
                        </div>

                        <p className={styles.mediaClassificationInfo}>
                          Templates com imagem costumam ser aprovados como <strong>Marketing</strong> na maioria dos casos. A categoria final depende do conteúdo e da análise da Meta.
                        </p>

                        {headerImageEnabled ? (
                          <div className={styles.imageUploadBox}>
                            <div className={styles.imageUploadHeading}>
                              <div>
                                <strong className={styles.imageUploadTitle}>
                                  Imagem do template
                                </strong>
                                <p className={styles.help}>
                                  JPG/JPEG ou PNG, até 5 MB.
                                </p>
                              </div>
                              {headerImage ? (
                                <span className={styles.imageReadyBadge}>Pronta</span>
                              ) : null}
                            </div>

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
                                  setErro("A Meta aceita imagem em JPG/JPEG ou PNG.");
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

                            {headerImageEnabled && headerImagePreview ? (
                              <img
                                src={headerImagePreview}
                                alt="Prévia da imagem do template"
                                className={styles.imageUploadPreview}
                              />
                            ) : (
                              <div className={styles.imageUploadEmpty}>
                                Nenhuma imagem selecionada.
                              </div>
                            )}

                            {headerImage ? (
                              <span className={styles.imageFileName}>
                                {headerImage.name}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div className={styles.contentSectionCard}>
                        <div className={styles.contentSectionHeader}>
                          <div>
                            <strong>Cabeçalho</strong>
                            <p>Opcional. Uma linha curta de destaque para o template.</p>
                          </div>
                          <span className={styles.contentSectionBadge}>Opcional</span>
                        </div>

                        <div className={styles.field}>
                          <input
                            value={headerText}
                            onChange={(e) => setHeaderText(e.target.value)}
                            className={styles.input}
                            placeholder="Adicione uma pequena linha de texto ao cabeçalho"
                            maxLength={60}
                          />
                          <p className={styles.help}>
                            Máximo de 60 caracteres. Quando houver imagem, o CRM mantém este texto como título visual logo abaixo da mídia.
                          </p>
                        </div>
                      </div>

                      <div className={styles.contentSectionCard}>
                        <div className={styles.contentSectionHeader}>
                          <div>
                            <strong>Corpo</strong>
                            <p>Conteúdo principal exibido na mensagem do WhatsApp.</p>
                          </div>
                        </div>

                        <div className={styles.field}>
                        <div className={styles.fieldLabelRow}>
                          <label className={styles.label}>Corpo</label>
                          <button
                            type="button"
                            className={styles.variableAddButton}
                            onClick={adicionarVariavelBody}
                            disabled={quantidadeVariaveisBody >= 6}
                            title={
                              quantidadeVariaveisBody >= 6
                                ? "Limite de 6 variáveis atingido"
                                : "Adicionar a próxima variável ao corpo"
                            }
                          >
                            + Variável
                            <span>{quantidadeVariaveisBody}/6</span>
                          </button>
                        </div>
                        <textarea
                          ref={bodyTextareaRef}
                          value={bodyText}
                          onChange={(e) => setBodyText(e.target.value)}
                          rows={7}
                          className={styles.textarea}
                          placeholder="Digite o conteúdo principal do template"
                          required
                        />
                        <p className={styles.help}>
                          Use variáveis em sequência de {"{{1}}"} até {"{{6}}"}. O botão + Variável insere a próxima variável na posição do cursor.
                        </p>
                        </div>
                      </div>

                      {totalVariaveisBody > 0 ? (
                        <div className={styles.variableExamplesCard}>
                          <div className={styles.variableExamplesHeader}>
                            <div>
                              <strong>Exemplos das variáveis</strong>
                              <p>
                                A Meta usa estes exemplos na análise do template.
                              </p>
                            </div>
                            <span>{Math.min(totalVariaveisBody, 6)} campo(s)</span>
                          </div>

                          <div className={styles.variableExamplesGrid}>
                            {Array.from(
                              { length: Math.min(totalVariaveisBody, 6) },
                              (_, index) => (
                                <div className={styles.field} key={index}>
                                  <label className={styles.label}>
                                    Exemplo da variável {index + 1}
                                  </label>
                                  <input
                                    value={bodyExamples[index] || ""}
                                    onChange={(e) =>
                                      atualizarExemploBody(index, e.target.value)
                                    }
                                    className={styles.input}
                                    placeholder={
                                      index === 0
                                        ? "Ex.: João"
                                        : index === 1
                                        ? "Ex.: ABC-123456"
                                        : `Exemplo para {{${index + 1}}}`
                                    }
                                  />
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      ) : null}

                      <div className={`${styles.field} ${styles.lockedField}`}>
                        <div className={styles.fieldLabelRow}>
                          <label className={styles.label}>Rodapé</label>
                          <span className={styles.lockedBadge}>Bloqueado</span>
                        </div>
                        <input
                          value={footerText}
                          className={styles.input}
                          disabled
                          aria-label="Rodapé bloqueado"
                        />
                        <p className={styles.help}>
                          Definido automaticamente pelo sistema para garantir o opt-out dos disparos.
                        </p>
                      </div>

                      <div className={`${styles.contentSectionCard} ${styles.responsesField}`}>
                        <div className={styles.contentSectionHeader}>
                          <div>
                            <strong>
                              Botões de respostas{" "}
                              <span className={styles.secondaryLabel}>(Respostas rápidas)</span>
                            </strong>
                            <p>Adicione atalhos para o contato responder com um toque.</p>
                          </div>
                          <span className={styles.contentSectionBadge}>Opcional</span>
                        </div>

                        <div className={styles.field}>
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
                    </div>

                    <aside className={styles.previewSidebar}>
                      <div className={styles.whatsappPreviewCard}>
                        <div className={styles.previewTopLine}>
                          <strong>Prévia WhatsApp</strong>
                        </div>

                        <div className={styles.whatsappPreviewArea}>
                          <div className={styles.whatsappBubble}>
                            {headerImagePreview ? (
                              <img
                                src={headerImagePreview}
                                alt="Imagem do template"
                                className={styles.whatsappPreviewImage}
                              />
                            ) : null}

                            {headerText.trim() ? (
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
                            <span className={styles.previewLabel}>Imagem</span>
                            <p className={styles.previewText}>
                              {headerImageEnabled
                                ? headerImage?.name || "Ativada, aguardando imagem"
                                : "Desativada"}
                            </p>
                          </div>

                          <div className={styles.previewBlock}>
                            <span className={styles.previewLabel}>Cabeçalho</span>
                            <p className={styles.previewText}>
                              {headerText.trim() || "Não informado"}
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
                      <strong>Idioma:</strong> Português (Brasil)
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
                    {erroSincronizacao ? (
                      <div className={styles.integrationErrorAlert}>
                        {erroSincronizacao}
                      </div>
                    ) : null}

                    <label className={styles.label}>Filtrar por integração</label>
                    <select
                      value={filtroIntegracao}
                      onChange={(e) => {
                        setFiltroIntegracao(e.target.value);
                        setPaginaAtual(1);
                        if (e.target.value) {
                          setErroSincronizacao("");
                        }
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
                      const previewLista = montarPreviewListaTemplate(template.payload);
                      const categoriaNormalizada = String(
                        template.categoria || ""
                      ).toUpperCase();

                      return (
                        <div key={template.id} className={styles.compactTemplateCard}>
                          <div className={styles.templateListContent}>
                            <div className={styles.templateListPreview}>
                              <div className={styles.templateListPreviewTitle}>
                                Prévia WhatsApp
                              </div>

                              <div className={styles.whatsappPreviewArea}>
                                <div className={styles.whatsappBubble}>
                                  {headerImageUrl ? (
                                    <img
                                      src={headerImageUrl}
                                      alt={`Imagem do template ${template.nome}`}
                                      className={styles.whatsappPreviewImage}
                                    />
                                  ) : headerFormat === "IMAGE" ? (
                                    <div className={styles.templateImageFallback}>
                                      Imagem vinculada ao template
                                    </div>
                                  ) : null}

                                  {previewLista.titulo ? (
                                    <strong className={styles.whatsappPreviewTitle}>
                                      {previewLista.titulo}
                                    </strong>
                                  ) : null}

                                  <p className={styles.whatsappPreviewText}>
                                    {previewLista.corpo}
                                  </p>

                                  <div className={styles.whatsappPreviewMeta}>
                                    <span className={styles.whatsappPreviewFooter}>
                                      {previewLista.rodape || "Equipe de atendimento"}
                                    </span>
                                    <span className={styles.whatsappPreviewTime}>
                                      {new Date().toLocaleTimeString("pt-BR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </div>

                                  {previewLista.quickReplies.map((texto, index) => (
                                    <div
                                      key={`${texto}-preview-${index}`}
                                      className={styles.whatsappPreviewButton}
                                    >
                                      ↩ {texto}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className={styles.templateListDetails}>
                              <div className={styles.compactTemplateTop}>
                                <div className={styles.compactTemplateMain}>
                                  <div className={styles.compactTemplateTitleRow}>
                                    <div className={styles.templateNameWithCategory}>
                                      <h3 className={styles.compactTemplateTitle}>
                                        {template.nome}
                                      </h3>
                                      <span
                                        className={`${styles.categoryBadge} ${
                                          categoriaNormalizada === "MARKETING"
                                            ? styles.categoryBadgeMarketing
                                            : categoriaNormalizada === "UTILITY"
                                            ? styles.categoryBadgeUtility
                                            : styles.categoryBadgeNeutral
                                        }`}
                                      >
                                        {categoriaNormalizada || "SEM CATEGORIA"}
                                      </span>
                                    </div>

                                    <div className={styles.compactTemplateBadges}>
                                      <span className={getStatusClass(template.status)}>
                                        {getStatusLabel(template.status)}
                                      </span>
                                      <span
                                        className={`${styles.badge} ${
                                          template.opt_out_habilitado
                                            ? styles.badgeGreen
                                            : categoriaNormalizada === "AUTHENTICATION"
                                            ? styles.badgeGray
                                            : styles.badgeYellow
                                        }`}
                                      >
                                        {template.opt_out_habilitado
                                          ? "Opt-out habilitado"
                                          : categoriaNormalizada === "AUTHENTICATION"
                                          ? "Opt-out não aplicável"
                                          : "Sem opt-out"}
                                      </span>
                                    </div>
                                  </div>

                                  <p className={styles.compactTemplateMeta}>
                                    Idioma: {template.idioma} • ID Meta:{" "}
                                    {template.meta_template_id || "-"} • Criado em:{" "}
                                    {formatarData(template.created_at)}
                                  </p>
                                </div>
                              </div>

                              {header || headerFormat === "IMAGE" ? (
                                <div className={styles.compactBlock}>
                                  <span className={styles.compactLabel}>Cabeçalho</span>
                                  {headerImageUrl ? (
                                    <div className={styles.compactMediaReference}>
                                      <span>Imagem vinculada</span>
                                      <span>{header || "Mídia aprovada pela Meta"}</span>
                                    </div>
                                  ) : (
                                    <p className={styles.compactText}>
                                      {header || "Imagem vinculada ao template"}
                                    </p>
                                  )}
                                </div>
                              ) : null}

                              <div className={styles.compactBlock}>
                                <span className={styles.compactLabel}>Corpo</span>
                                <p className={styles.compactText}>
                                  {body || "Não informado"}
                                </p>
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
                                      <span className={styles.compactLabel}>
                                        Botões de respostas
                                      </span>
                                      <div className={styles.quickRepliesList}>
                                        {quickReplies.map((item, index) => (
                                          <span
                                            key={`${item}-detail-${index}`}
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
                                  <strong>Motivo da rejeição:</strong>{" "}
                                  {template.rejeicao_motivo}
                                </p>
                              ) : null}
                            </div>
                          </div>
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
