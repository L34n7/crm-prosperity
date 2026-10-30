"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  FileText,
  Globe2,
  Mail,
  MailPlus,
  MousePointerClick,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import Header from "@/components/Header";
import CampanhaModal, {
  type EmailListaAudiencia,
  type EmailRemetenteItem,
} from "./CampanhaModal";
import TemplateModal, { type EmailTemplateItem } from "./TemplateModal";
import CampanhaDetalhesModal from "./CampanhaDetalhesModal";
import styles from "./email-marketing.module.css";

type AbaEmailMarketing = "campanhas" | "templates" | "remetentes";

type ConfiguracaoEmailMarketing = {
  provedor: string;
  provedor_configurado: boolean;
  api_key_configurada: boolean;
  webhook_configurado: boolean;
  dominio: string | null;
  remetente_nome: string | null;
  remetente_email: string | null;
  status: string;
  spf: "verificado" | "pendente";
  dkim: "verificado" | "pendente";
  dmarc: "recomendado";
};

type MetricasEmailMarketing = {
  enviados: number;
  entregues: number;
  abertos: number;
  cliques: number;
  taxa_abertura: number | null;
};

type CampanhaItem = {
  id: string;
  nome: string;
  assunto: string;
  status: string;
  audiencia_json: Record<string, unknown> | null;
  agendada_para: string | null;
  iniciada_em: string | null;
  finalizada_em: string | null;
  total_destinatarios: number;
  total_enviados: number;
  total_entregues: number;
  total_abertos: number;
  total_cliques: number;
  total_bounces: number;
  total_reclamacoes: number;
  total_descadastros: number;
  erro: string | null;
  created_at: string;
  updated_at: string;
  email_remetentes:
    | { nome?: string; email?: string }
    | Array<{ nome?: string; email?: string }>
    | null;
  email_templates:
    | { nome?: string }
    | Array<{ nome?: string }>
    | null;
};

const abas: Array<{
  id: AbaEmailMarketing;
  label: string;
  descricao: string;
  icon: typeof Mail;
}> = [
  {
    id: "campanhas",
    label: "Campanhas",
    descricao: "Crie e acompanhe seus envios",
    icon: Send,
  },
  {
    id: "templates",
    label: "Templates",
    descricao: "Modelos reutilizáveis de e-mail",
    icon: FileText,
  },
  {
    id: "remetentes",
    label: "Remetentes",
    descricao: "Domínio, autenticação e provedor",
    icon: Globe2,
  },
];

const metricasIniciais: MetricasEmailMarketing = {
  enviados: 0,
  entregues: 0,
  abertos: 0,
  cliques: 0,
  taxa_abertura: null,
};

function relacaoUnica<T>(valor: T | T[] | null | undefined): T | null {
  return Array.isArray(valor) ? valor[0] || null : valor || null;
}

function dataHora(valor: string | null) {
  if (!valor) return "—";

  const data = new Date(valor);

  if (!Number.isFinite(data.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    rascunho: "Rascunho",
    agendada: "Agendada",
    processando: "Enviando",
    enviada: "Enviada",
    pausada: "Pausada",
    cancelada: "Cancelada",
    falha: "Falha",
  };

  return labels[status] || status;
}

function statusClass(status: string) {
  if (status === "enviada") return styles.statusSuccess;
  if (status === "processando") return styles.statusProcessing;
  if (status === "falha" || status === "cancelada") return styles.statusError;
  return styles.statusPending;
}

export default function EmailMarketingPage() {
  const [aba, setAba] = useState<AbaEmailMarketing>("campanhas");
  const [busca, setBusca] = useState("");
  const [configuracao, setConfiguracao] =
    useState<ConfiguracaoEmailMarketing | null>(null);
  const [metricas, setMetricas] =
    useState<MetricasEmailMarketing>(metricasIniciais);
  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const [remetentes, setRemetentes] = useState<EmailRemetenteItem[]>([]);
  const [campanhas, setCampanhas] = useState<CampanhaItem[]>([]);
  const [listas, setListas] = useState<EmailListaAudiencia[]>([]);
  const [totalContatosComEmail, setTotalContatosComEmail] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erroConfiguracao, setErroConfiguracao] = useState("");
  const [templateModal, setTemplateModal] = useState(false);
  const [templateEditando, setTemplateEditando] =
    useState<EmailTemplateItem | null>(null);
  const [campanhaModal, setCampanhaModal] = useState(false);
  const [campanhaDetalhes, setCampanhaDetalhes] = useState<CampanhaItem | null>(null);
  const [emailTeste, setEmailTeste] = useState("");
  const [enviandoTeste, setEnviandoTeste] = useState(false);
  const [feedbackTeste, setFeedbackTeste] = useState<{
    tipo: "sucesso" | "erro";
    mensagem: string;
  } | null>(null);
  const [remetenteEditando, setRemetenteEditando] =
    useState<EmailRemetenteItem | null>(null);
  const [remetenteNome, setRemetenteNome] = useState("");
  const [remetenteEmail, setRemetenteEmail] = useState("");
  const [salvandoRemetente, setSalvandoRemetente] = useState(false);
  const [feedbackRemetente, setFeedbackRemetente] = useState("");

  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    setErroConfiguracao("");

    try {
      const [statusRes, templatesRes, remetentesRes, campanhasRes, audienciaRes] =
        await Promise.all([
          fetch("/api/email-marketing/status", { cache: "no-store" }),
          fetch("/api/email-marketing/templates", { cache: "no-store" }),
          fetch("/api/email-marketing/remetentes", { cache: "no-store" }),
          fetch("/api/email-marketing/campanhas", { cache: "no-store" }),
          fetch("/api/email-marketing/audiencia?limite=1", {
            cache: "no-store",
          }),
        ]);

      const [statusData, templatesData, remetentesData, campanhasData, audienciaData] =
        await Promise.all([
          statusRes.json(),
          templatesRes.json(),
          remetentesRes.json(),
          campanhasRes.json(),
          audienciaRes.json(),
        ]);

      const respostas = [
        [statusRes, statusData],
        [templatesRes, templatesData],
        [remetentesRes, remetentesData],
        [campanhasRes, campanhasData],
        [audienciaRes, audienciaData],
      ] as const;

      const falha = respostas.find(
        ([response, data]) => !response.ok || !data?.ok
      );

      if (falha) {
        throw new Error(
          falha[1]?.error || "Não foi possível carregar o E-mail Marketing."
        );
      }

      setConfiguracao(statusData.configuracao || null);
      setMetricas(statusData.metricas || metricasIniciais);
      setTemplates(templatesData.templates || []);
      setRemetentes(remetentesData.remetentes || []);
      setCampanhas(campanhasData.campanhas || []);
      setListas(audienciaData.listas || []);
      setTotalContatosComEmail(
        Number(audienciaData.total_contatos_com_email || 0)
      );
    } catch (error) {
      setErroConfiguracao(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o E-mail Marketing."
      );
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  const campanhaEmAndamento = campanhas.some((item) =>
    ["agendada", "processando"].includes(item.status)
  );

  useEffect(() => {
    if (!campanhaEmAndamento) return;

    const interval = window.setInterval(() => {
      void carregarDados(true);
    }, 8000);

    return () => window.clearInterval(interval);
  }, [campanhaEmAndamento, carregarDados]);

  const provedorConfigurado = Boolean(configuracao?.provedor_configurado);
  const remetenteVerificado = configuracao?.status === "verificado";

  const campanhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) return campanhas;

    return campanhas.filter(
      (item) =>
        item.nome.toLowerCase().includes(termo) ||
        item.assunto.toLowerCase().includes(termo) ||
        statusLabel(item.status).toLowerCase().includes(termo)
    );
  }, [busca, campanhas]);

  function abrirNovaCampanha() {
    if (!provedorConfigurado) {
      setAba("remetentes");
      return;
    }

    if (!templates.length) {
      setAba("templates");
      setTemplateEditando(null);
      setTemplateModal(true);
      return;
    }

    setCampanhaModal(true);
  }

  async function enviarTeste(event: FormEvent) {
    event.preventDefault();
    setFeedbackTeste(null);

    const email = emailTeste.trim().toLowerCase();

    if (!email) {
      setFeedbackTeste({
        tipo: "erro",
        mensagem: "Informe o e-mail que receberá o teste.",
      });
      return;
    }

    setEnviandoTeste(true);

    try {
      const response = await fetch("/api/email-marketing/teste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Não foi possível enviar o teste.");
      }

      setFeedbackTeste({
        tipo: "sucesso",
        mensagem: data.message || "E-mail de teste enviado com sucesso.",
      });
      await carregarDados(true);
    } catch (error) {
      setFeedbackTeste({
        tipo: "erro",
        mensagem:
          error instanceof Error
            ? error.message
            : "Não foi possível enviar o teste.",
      });
    } finally {
      setEnviandoTeste(false);
    }
  }

  function editarRemetente(item: EmailRemetenteItem) {
    setRemetenteEditando(item);
    setRemetenteNome(item.nome);
    setRemetenteEmail(item.email);
    setFeedbackRemetente("");
  }

  async function salvarRemetente(event: FormEvent) {
    event.preventDefault();

    if (!remetenteEditando) return;

    setSalvandoRemetente(true);
    setFeedbackRemetente("");

    try {
      const response = await fetch("/api/email-marketing/remetentes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: remetenteEditando.id,
          nome: remetenteNome.trim(),
          email: remetenteEmail.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Não foi possível salvar o remetente.");
      }

      setFeedbackRemetente("Remetente atualizado com sucesso.");
      setRemetenteEditando(null);
      await carregarDados(true);
    } catch (error) {
      setFeedbackRemetente(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o remetente."
      );
    } finally {
      setSalvandoRemetente(false);
    }
  }

  return (
    <main className={styles.page}>
      <Header
        title="E-mail Marketing"
        subtitle="Crie campanhas, organize templates e acompanhe a performance dos seus envios."
      />

      <div className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.heroIcon}>
            <Mail size={25} strokeWidth={2.1} />
          </div>

          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>NOVO CANAL</p>
            <h1>Campanhas de e-mail integradas ao seu CRM</h1>
            <p>
              Use contatos e listas já cadastrados, envie agora ou agende e
              acompanhe entrega, abertura, cliques e descadastros.
            </p>
          </div>

          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={abrirNovaCampanha}
              disabled={carregando}
            >
              <MailPlus size={18} />
              Nova campanha
            </button>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setAba("remetentes")}
            >
              <Settings2 size={18} />
              Configurar envio
            </button>
          </div>
        </section>

        {erroConfiguracao ? (
          <div className={styles.feedbackError}>{erroConfiguracao}</div>
        ) : null}

        <section className={styles.metricsGrid}>
          <article className={styles.metricCard}>
            <span className={styles.metricIcon}>
              <Send size={20} />
            </span>
            <div>
              <span>Envios no mês</span>
              <strong>{metricas.enviados}</strong>
              <small>Mensagens aceitas pelo provedor</small>
            </div>
          </article>

          <article className={styles.metricCard}>
            <span className={styles.metricIcon}>
              <CheckCircle2 size={20} />
            </span>
            <div>
              <span>Entregues</span>
              <strong>{metricas.entregues}</strong>
              <small>
                {metricas.enviados
                  ? Math.round(
                      (metricas.entregues / Math.max(metricas.enviados, 1)) * 100
                    ) + "% dos envios"
                  : "Sem entregas registradas"}
              </small>
            </div>
          </article>

          <article className={styles.metricCard}>
            <span className={styles.metricIcon}>
              <BarChart3 size={20} />
            </span>
            <div>
              <span>Taxa de abertura estimada</span>
              <strong>
                {metricas.taxa_abertura === null
                  ? "—"
                  : metricas.taxa_abertura + "%"}
              </strong>
              <small>
                {metricas.abertos
                  ? metricas.abertos + " abertura(s)"
                  : "Sem dados ainda"}
              </small>
            </div>
          </article>

          <article className={styles.metricCard}>
            <span className={styles.metricIcon}>
              <MousePointerClick size={20} />
            </span>
            <div>
              <span>Cliques</span>
              <strong>{metricas.cliques}</strong>
              <small>Cliques em links rastreados (exceto descadastro)</small>
            </div>
          </article>
        </section>

        <section className={styles.workspace}>
          <div className={styles.tabs} role="tablist" aria-label="E-mail Marketing">
            {abas.map((item) => {
              const Icon = item.icon;
              const ativa = aba === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  className={ativa ? styles.tabActive : styles.tab}
                  onClick={() => setAba(item.id)}
                >
                  <Icon size={18} strokeWidth={2.1} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.descricao}</small>
                  </span>
                </button>
              );
            })}
          </div>

          {aba === "campanhas" ? (
            <div className={styles.panel} aria-busy={carregando && campanhas.length === 0}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionLabel}>CAMPANHAS</p>
                  <h2>Campanhas de e-mail</h2>
                  <p>
                    Envie para todos os contatos com e-mail, listas ou contatos
                    selecionados.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={abrirNovaCampanha}
                  disabled={carregando}
                >
                  <MailPlus size={17} />
                  Criar campanha
                </button>
              </div>

              <div className={styles.toolbar}>
                <label className={styles.searchBox}>
                  <Search size={18} />
                  <input
                    value={busca}
                    onChange={(event) => setBusca(event.target.value)}
                    placeholder="Buscar campanha"
                    aria-label="Buscar campanha"
                  />
                </label>

                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void carregarDados()}
                  disabled={carregando}
                >
                  <RefreshCw size={16} />
                  Atualizar
                </button>
              </div>

              {carregando && campanhas.length === 0 ? (
                <div className={styles.campaignLoading} role="status" aria-live="polite">
                  <div className={styles.campaignLoadingHeading}>
                    <RefreshCw size={21} className={styles.campaignLoadingSpinner} aria-hidden="true" />
                    <div>
                      <strong>Carregando campanhas...</strong>
                      <p>Consultando suas campanhas e os resultados dos envios.</p>
                    </div>
                  </div>
                  <div className={styles.campaignSkeletonList} aria-hidden="true">
                    {[0, 1, 2].map((indice) => (
                      <div className={styles.campaignSkeletonRow} key={indice}>
                        <span className={styles.campaignSkeletonName} />
                        <span className={styles.campaignSkeletonStatus} />
                        <span className={styles.campaignSkeletonDetail} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : campanhasFiltradas.length ? (
                <div className={styles.campaignCardsGrid}>
                  {campanhasFiltradas.map((campanha) => (
                    <button
                      type="button"
                      key={campanha.id}
                      className={styles.campaignOverviewCard}
                      onClick={() => setCampanhaDetalhes(campanha)}
                      title={`Ver destinatários e resultados de ${campanha.nome}`}
                    >
                      <div className={styles.campaignOverviewHeader}>
                        <div>
                          <strong className={styles.campaignOverviewTitle}>{campanha.nome}</strong>
                          <span className={styles.campaignOverviewSubject}>{campanha.assunto}</span>
                        </div>
                        <span className={statusClass(campanha.status)}>
                          {statusLabel(campanha.status)}
                        </span>
                      </div>

                      <div className={styles.campaignOverviewMetrics}>
                        <div><small>Destinatários</small><strong>{campanha.total_destinatarios}</strong></div>
                        <div><small>Enviados</small><strong>{campanha.total_enviados}</strong></div>
                        <div><small>Entregues</small><strong>{campanha.total_entregues}</strong></div>
                        <div><small>Abertos (estim.)</small><strong>{campanha.total_abertos}</strong></div>
                        <div><small>Cliques</small><strong>{campanha.total_cliques}</strong></div>
                      </div>

                      <div className={styles.campaignOverviewFooter}>
                        <div>
                          <span>Envio: <strong>{dataHora(campanha.agendada_para)}</strong></span>
                          <span
                            className={styles.campaignOverviewSender}
                            title={relacaoUnica(campanha.email_remetentes)?.email || ""}
                          >
                            {relacaoUnica(campanha.email_remetentes)?.email || "Sem remetente"}
                          </span>
                          {campanha.erro ? (
                            <span className={styles.campaignOverviewError}>{campanha.erro}</span>
                          ) : null}
                        </div>
                        <span className={styles.campaignOverviewAction}>
                          Ver detalhes <ChevronRight size={15} aria-hidden="true" />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : erroConfiguracao ? (
                <div className={styles.campaignLoadFailure} role="alert">
                  <strong>Não foi possível carregar as campanhas.</strong>
                  <p>Suas campanhas não foram excluídas. Verifique a conexão e tente novamente.</p>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void carregarDados()}
                    disabled={carregando}
                  >
                    <RefreshCw size={16} />
                    Tentar novamente
                  </button>
                </div>
              ) : campanhas.length > 0 ? (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>
                    <Search size={27} />
                  </span>
                  <h3>Nenhuma campanha encontrada</h3>
                  <p>Não há campanhas correspondentes à busca. Os demais registros continuam disponíveis.</p>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setBusca("")}
                  >
                    Limpar busca
                  </button>
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>
                    <Send size={27} />
                  </span>
                  <h3>Nenhuma campanha criada</h3>
                  <p>
                    Crie um template e depois escolha os contatos que receberão
                    sua primeira campanha.
                  </p>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={abrirNovaCampanha}
                  >
                    <MailPlus size={17} />
                    Criar primeira campanha
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {aba === "templates" ? (
            <div className={styles.panel}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionLabel}>TEMPLATES</p>
                  <h2>Modelos de e-mail</h2>
                  <p>
                    Crie conteúdo reutilizável com variáveis dos contatos do
                    CRM.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => {
                    setTemplateEditando(null);
                    setTemplateModal(true);
                  }}
                >
                  <FileText size={17} />
                  Novo template
                </button>
              </div>

              {templates.length ? (
                <div className={styles.templateGrid}>
                  {templates.map((template) => (
                    <article className={styles.templateCard} key={template.id}>
                      <div className={styles.templateCardPreview} aria-label={"Miniatura do template " + template.nome}>
                        <iframe
                          title={"Prévia do template " + template.nome}
                          sandbox=""
                          loading="lazy"
                          tabIndex={-1}
                          srcDoc={template.html}
                        />
                      </div>
                      <div className={styles.templateCardDetails}>
                        <div className={styles.templateCardIcon}><FileText size={19} /></div>
                        <div className={styles.templateCardBody}>
                          <strong>{template.nome}</strong>
                          <span>{template.assunto}</span>
                          <small>Atualizado em {dataHora(template.updated_at)}</small>
                        </div>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => {
                            setTemplateEditando(template);
                            setTemplateModal(true);
                          }}
                          aria-label={"Editar " + template.nome}
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>
                    <FileText size={27} />
                  </span>
                  <h3>Nenhum template criado</h3>
                  <p>
                    Comece criando o conteúdo que será usado na sua primeira
                    campanha.
                  </p>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => {
                      setTemplateEditando(null);
                      setTemplateModal(true);
                    }}
                  >
                    <FileText size={17} />
                    Criar template
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {aba === "remetentes" ? (
            <div className={styles.settingsGrid}>
              <section className={styles.panel}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.sectionLabel}>PROVEDOR DE ENVIO</p>
                    <h2>Resend</h2>
                    <p>
                      A integração está vinculada ao domínio verificado usado
                      durante os testes administrativos.
                    </p>
                  </div>

                  <span
                    className={
                      provedorConfigurado
                        ? styles.statusReady
                        : styles.statusPending
                    }
                  >
                    {carregando
                      ? "Verificando..."
                      : provedorConfigurado
                        ? "Conectado"
                        : "Não conectado"}
                  </span>
                </div>

                <div className={styles.providerCard}>
                  <div className={styles.providerLogo}>
                    <Mail size={25} />
                  </div>

                  <div className={styles.providerInfo}>
                    <strong>Resend</strong>
                    <span>
                      {provedorConfigurado
                        ? (configuracao?.remetente_nome || "CRM Prosperity") +
                          " <" +
                          (configuracao?.remetente_email || "") +
                          ">"
                        : "Aguardando configuração."}
                    </span>
                  </div>

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void carregarDados()}
                    disabled={carregando}
                  >
                    <RefreshCw size={16} />
                    Atualizar
                  </button>
                </div>

                <div className={styles.senderList}>
                  {remetentes.map((item) => (
                    <div className={styles.senderRow} key={item.id}>
                      <div>
                        <strong>{item.nome}</strong>
                        <span>{item.email}</span>
                        <small>{item.dominio}</small>
                      </div>
                      <span
                        className={
                          item.status === "verificado"
                            ? styles.statusReady
                            : styles.statusPending
                        }
                      >
                        {item.status === "verificado"
                          ? "Verificado"
                          : "Pendente"}
                      </span>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => editarRemetente(item)}
                      >
                        <Pencil size={15} />
                        Editar
                      </button>
                    </div>
                  ))}
                </div>

                {remetenteEditando ? (
                  <form className={styles.senderForm} onSubmit={salvarRemetente}>
                    <div className={styles.formGridTwo}>
                      <label className={styles.field}>
                        <span>Nome exibido</span>
                        <input
                          value={remetenteNome}
                          onChange={(event) =>
                            setRemetenteNome(event.target.value)
                          }
                          placeholder="CRM Prosperity"
                        />
                      </label>
                      <label className={styles.field}>
                        <span>E-mail remetente</span>
                        <input
                          type="email"
                          value={remetenteEmail}
                          onChange={(event) =>
                            setRemetenteEmail(event.target.value)
                          }
                          placeholder="marketing@email.crmprosperity.com"
                        />
                      </label>
                    </div>
                    <small>
                      O endereço precisa permanecer dentro do domínio verificado
                      {remetenteEditando.dominio
                        ? " " + remetenteEditando.dominio + "."
                        : "."}
                    </small>
                    <div className={styles.inlineActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => setRemetenteEditando(null)}
                        disabled={salvandoRemetente}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className={styles.primaryButton}
                        disabled={salvandoRemetente}
                      >
                        {salvandoRemetente ? "Salvando..." : "Salvar remetente"}
                      </button>
                    </div>
                  </form>
                ) : null}

                {feedbackRemetente ? (
                  <div className={styles.feedbackSuccess}>
                    {feedbackRemetente}
                  </div>
                ) : null}

                <form className={styles.testCard} onSubmit={enviarTeste}>
                  <div className={styles.testCardHeader}>
                    <div>
                      <strong>Teste de envio</strong>
                      <span>
                        Envie uma mensagem real pelo domínio configurado.
                      </span>
                    </div>
                    <span
                      className={
                        configuracao?.webhook_configurado
                          ? styles.statusReady
                          : styles.statusPending
                      }
                    >
                      Webhook{" "}
                      {configuracao?.webhook_configurado ? "ativo" : "pendente"}
                    </span>
                  </div>

                  <div className={styles.testForm}>
                    <input
                      type="email"
                      value={emailTeste}
                      onChange={(event) => setEmailTeste(event.target.value)}
                      placeholder="seuemail@dominio.com"
                      aria-label="E-mail para teste"
                      disabled={!provedorConfigurado || enviandoTeste}
                      required
                    />
                    <button
                      type="submit"
                      className={styles.primaryButton}
                      disabled={!provedorConfigurado || enviandoTeste}
                    >
                      <Send size={16} />
                      {enviandoTeste ? "Enviando..." : "Enviar teste"}
                    </button>
                  </div>

                  {feedbackTeste ? (
                    <div
                      className={
                        feedbackTeste.tipo === "sucesso"
                          ? styles.feedbackSuccess
                          : styles.feedbackError
                      }
                    >
                      {feedbackTeste.mensagem}
                    </div>
                  ) : null}
                </form>
              </section>

              <section className={styles.panel}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.sectionLabel}>DOMÍNIO DE ENVIO</p>
                    <h2>Autenticação do remetente</h2>
                    <p>
                      O domínio atual já está validado. Novos domínios serão
                      habilitados quando o módulo for liberado para clientes.
                    </p>
                  </div>
                </div>

                <div className={styles.checkList}>
                  <div className={styles.checkItem}>
                    <span>
                      <Globe2 size={18} />
                    </span>
                    <div>
                      <strong>Domínio de envio</strong>
                      <small>
                        {configuracao?.dominio || "Aguardando configuração"}
                      </small>
                    </div>
                    <em>{remetenteVerificado ? "Verificado" : "Pendente"}</em>
                  </div>

                  <div className={styles.checkItem}>
                    <span>
                      <ShieldCheck size={18} />
                    </span>
                    <div>
                      <strong>SPF</strong>
                      <small>Autorização do servidor de envio</small>
                    </div>
                    <em>
                      {configuracao?.spf === "verificado"
                        ? "Verificado"
                        : "Pendente"}
                    </em>
                  </div>

                  <div className={styles.checkItem}>
                    <span>
                      <ShieldCheck size={18} />
                    </span>
                    <div>
                      <strong>DKIM</strong>
                      <small>Assinatura e autenticidade das mensagens</small>
                    </div>
                    <em>
                      {configuracao?.dkim === "verificado"
                        ? "Verificado"
                        : "Pendente"}
                    </em>
                  </div>

                  <div className={styles.checkItem}>
                    <span>
                      <ShieldCheck size={18} />
                    </span>
                    <div>
                      <strong>DMARC</strong>
                      <small>
                        Recomendado para reforçar reputação e proteção.
                      </small>
                    </div>
                    <em>Recomendado</em>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </section>
      </div>

      {templateModal ? (
        <TemplateModal
          template={templateEditando}
          templates={templates}
          onClose={() => {
            setTemplateModal(false);
            setTemplateEditando(null);
          }}
          onSaved={() => carregarDados(true)}
        />
      ) : null}

      {campanhaDetalhes ? (
        <CampanhaDetalhesModal
          campanha={campanhaDetalhes}
          onClose={() => setCampanhaDetalhes(null)}
        />
      ) : null}

      {campanhaModal ? (
        <CampanhaModal
          templates={templates}
          remetentes={remetentes}
          listas={listas}
          totalContatosComEmail={totalContatosComEmail}
          onClose={() => setCampanhaModal(false)}
          onCreated={() => carregarDados(true)}
        />
      ) : null}
    </main>
  );
}
