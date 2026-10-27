"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  FileText,
  Globe2,
  Mail,
  MailPlus,
  MousePointerClick,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import Header from "@/components/Header";
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

export default function EmailMarketingPage() {
  const [aba, setAba] = useState<AbaEmailMarketing>("campanhas");
  const [busca, setBusca] = useState("");
  const [configuracao, setConfiguracao] =
    useState<ConfiguracaoEmailMarketing | null>(null);
  const [metricas, setMetricas] =
    useState<MetricasEmailMarketing>(metricasIniciais);
  const [carregandoConfiguracao, setCarregandoConfiguracao] = useState(true);
  const [erroConfiguracao, setErroConfiguracao] = useState("");
  const [emailTeste, setEmailTeste] = useState("");
  const [enviandoTeste, setEnviandoTeste] = useState(false);
  const [feedbackTeste, setFeedbackTeste] = useState<{
    tipo: "sucesso" | "erro";
    mensagem: string;
  } | null>(null);

  const carregarConfiguracao = useCallback(async () => {
    setCarregandoConfiguracao(true);
    setErroConfiguracao("");

    try {
      const response = await fetch("/api/email-marketing/status", {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || "Não foi possível carregar a configuração de e-mail."
        );
      }

      setConfiguracao(data.configuracao || null);
      setMetricas(data.metricas || metricasIniciais);
    } catch (error) {
      setErroConfiguracao(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a configuração de e-mail."
      );
    } finally {
      setCarregandoConfiguracao(false);
    }
  }, []);

  useEffect(() => {
    void carregarConfiguracao();
  }, [carregarConfiguracao]);

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
      await carregarConfiguracao();
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

  const provedorConfigurado = Boolean(configuracao?.provedor_configurado);
  const remetenteVerificado = configuracao?.status === "verificado";

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
              Use os contatos já cadastrados, prepare campanhas e acompanhe
              entregas, aberturas, cliques e descadastros em um só lugar.
            </p>
          </div>

          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled
              title={
                provedorConfigurado
                  ? "O provedor já está pronto. A criação de campanhas será habilitada na próxima etapa."
                  : "Configure o provedor de envio primeiro"
              }
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

        <section className={styles.metricsGrid}>
          <article className={styles.metricCard}>
            <span className={styles.metricIcon}>
              <Send size={20} />
            </span>
            <div>
              <span>Envios no mês</span>
              <strong>{metricas.enviados}</strong>
              <small>
                {metricas.enviados
                  ? "Mensagens registradas no Resend"
                  : "Nenhum envio registrado"}
              </small>
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
                  ? `${Math.round(
                      (metricas.entregues / Math.max(metricas.enviados, 1)) * 100
                    )}% dos envios`
                  : "Sem entregas registradas"}
              </small>
            </div>
          </article>

          <article className={styles.metricCard}>
            <span className={styles.metricIcon}>
              <BarChart3 size={20} />
            </span>
            <div>
              <span>Taxa de abertura</span>
              <strong>
                {metricas.taxa_abertura === null
                  ? "—"
                  : `${metricas.taxa_abertura}%`}
              </strong>
              <small>
                {metricas.abertos
                  ? `${metricas.abertos} abertura(s) registrada(s)`
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
              <small>
                {metricas.cliques
                  ? "Interações registradas pelo webhook"
                  : "Sem interações registradas"}
              </small>
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
            <div className={styles.panel}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionLabel}>CAMPANHAS</p>
                  <h2>Campanhas de e-mail</h2>
                  <p>
                    Envie para listas e segmentos usando os contatos do CRM.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled
                  title={
                    provedorConfigurado
                      ? "A criação de campanhas será implementada na próxima etapa."
                      : "Configure o provedor de envio primeiro"
                  }
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
              </div>

              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>
                  <Send size={27} />
                </span>
                <h3>Nenhuma campanha criada</h3>
                <p>
                  {provedorConfigurado
                    ? "O provedor já está conectado e validado. O próximo passo é habilitar a criação e o processamento das campanhas."
                    : "Configure o provedor de envio para começar a criar campanhas de e-mail com os contatos do CRM."}
                </p>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setAba("remetentes")}
                >
                  <Settings2 size={17} />
                  {provedorConfigurado ? "Ver configuração" : "Configurar provedor"}
                </button>
              </div>
            </div>
          ) : null}

          {aba === "templates" ? (
            <div className={styles.panel}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.sectionLabel}>TEMPLATES</p>
                  <h2>Modelos de e-mail</h2>
                  <p>
                    Crie modelos reutilizáveis para campanhas e automações.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled
                  title="A criação de templates será habilitada junto com as campanhas."
                >
                  <FileText size={17} />
                  Novo template
                </button>
              </div>

              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>
                  <FileText size={27} />
                </span>
                <h3>Nenhum template criado</h3>
                <p>
                  Os templates poderão usar variáveis do CRM, como nome,
                  e-mail, campanha, origem e outros dados do contato.
                </p>
              </div>
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
                      O provedor é responsável pelo envio e pelos eventos de
                      entrega, abertura, clique, bounce e reclamação.
                    </p>
                  </div>

                  <span
                    className={
                      provedorConfigurado
                        ? styles.statusReady
                        : styles.statusPending
                    }
                  >
                    {carregandoConfiguracao
                      ? "Verificando..."
                      : provedorConfigurado
                        ? "Conectado"
                        : "Não conectado"}
                  </span>
                </div>

                {erroConfiguracao ? (
                  <div className={styles.feedbackError}>{erroConfiguracao}</div>
                ) : null}

                <div className={styles.providerCard}>
                  <div className={styles.providerLogo}>
                    <Mail size={25} />
                  </div>

                  <div className={styles.providerInfo}>
                    <strong>Resend</strong>
                    <span>
                      {provedorConfigurado
                        ? `${configuracao?.remetente_nome || "CRM Prosperity"} <${configuracao?.remetente_email || ""}>`
                        : "Aguardando API Key e remetente verificado."}
                    </span>
                  </div>

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void carregarConfiguracao()}
                    disabled={carregandoConfiguracao}
                  >
                    <RefreshCw size={16} />
                    Atualizar
                  </button>
                </div>

                <form className={styles.testCard} onSubmit={enviarTeste}>
                  <div className={styles.testCardHeader}>
                    <div>
                      <strong>Teste de envio</strong>
                      <span>
                        Envie uma mensagem real pelo domínio configurado para
                        validar a integração ponta a ponta.
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
                      Configuração usada nos testes administrativos deste
                      módulo.
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
                        Recomendado para reforçar reputação e proteção do
                        domínio
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
    </main>
  );
}
