"use client";

import { useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  FileText,
  Globe2,
  Mail,
  MailPlus,
  MousePointerClick,
  Search,
  Send,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import Header from "@/components/Header";
import styles from "./email-marketing.module.css";

type AbaEmailMarketing = "campanhas" | "templates" | "remetentes";

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

export default function EmailMarketingPage() {
  const [aba, setAba] = useState<AbaEmailMarketing>("campanhas");
  const [busca, setBusca] = useState("");

  const provedorConfigurado = false;

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
              disabled={!provedorConfigurado}
              title={
                provedorConfigurado
                  ? "Criar nova campanha"
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
              <strong>0</strong>
              <small>Nenhuma campanha enviada</small>
            </div>
          </article>

          <article className={styles.metricCard}>
            <span className={styles.metricIcon}>
              <CheckCircle2 size={20} />
            </span>
            <div>
              <span>Entregues</span>
              <strong>0</strong>
              <small>0% dos envios</small>
            </div>
          </article>

          <article className={styles.metricCard}>
            <span className={styles.metricIcon}>
              <BarChart3 size={20} />
            </span>
            <div>
              <span>Taxa de abertura</span>
              <strong>—</strong>
              <small>Sem dados ainda</small>
            </div>
          </article>

          <article className={styles.metricCard}>
            <span className={styles.metricIcon}>
              <MousePointerClick size={20} />
            </span>
            <div>
              <span>Cliques</span>
              <strong>0</strong>
              <small>Sem interações registradas</small>
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
                  disabled={!provedorConfigurado}
                  title="Configure o provedor de envio primeiro"
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
                  Configure o provedor de envio para começar a criar campanhas
                  de e-mail com os contatos do CRM.
                </p>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setAba("remetentes")}
                >
                  <Settings2 size={17} />
                  Configurar provedor
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
                  disabled={!provedorConfigurado}
                  title="Configure o provedor de envio primeiro"
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
                      O provedor será responsável pelo envio, entregabilidade e
                      eventos de e-mail.
                    </p>
                  </div>

                  <span className={styles.statusPending}>Não conectado</span>
                </div>

                <div className={styles.providerCard}>
                  <div className={styles.providerLogo}>
                    <Mail size={25} />
                  </div>

                  <div className={styles.providerInfo}>
                    <strong>Resend</strong>
                    <span>Integração preparada para a próxima etapa.</span>
                  </div>

                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled
                    title="A conexão com a API será implementada na próxima etapa"
                  >
                    Conectar Resend
                  </button>
                </div>
              </section>

              <section className={styles.panel}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.sectionLabel}>DOMÍNIO DE ENVIO</p>
                    <h2>Autenticação do remetente</h2>
                    <p>
                      Cada empresa deverá validar o próprio domínio antes de
                      realizar campanhas.
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
                      <small>Aguardando configuração</small>
                    </div>
                    <em>Pendente</em>
                  </div>

                  <div className={styles.checkItem}>
                    <span>
                      <ShieldCheck size={18} />
                    </span>
                    <div>
                      <strong>SPF</strong>
                      <small>Autorização do servidor de envio</small>
                    </div>
                    <em>Pendente</em>
                  </div>

                  <div className={styles.checkItem}>
                    <span>
                      <ShieldCheck size={18} />
                    </span>
                    <div>
                      <strong>DKIM</strong>
                      <small>Assinatura e autenticidade das mensagens</small>
                    </div>
                    <em>Pendente</em>
                  </div>

                  <div className={styles.checkItem}>
                    <span>
                      <ShieldCheck size={18} />
                    </span>
                    <div>
                      <strong>DMARC</strong>
                      <small>Política e proteção do domínio</small>
                    </div>
                    <em>Pendente</em>
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
