"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./configurar-ambiente.module.css";

type IntegracaoWhatsapp = {
  id: string;
  empresa_id: string;
  nome_conexao: string;
  numero: string;
  provider: "meta_official";
  status: "pendente" | "ativa" | "erro" | "desconectada";
  business_account_id: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  token_ref: string | null;
  webhook_verificado: boolean;
  ultimo_sync_at: string | null;

  meta_business_id?: string | null;
  business_portfolio_id?: string | null;
  phone_number_display_name?: string | null;
  phone_number_status?: string | null;
  verified_name?: string | null;
  code_verification_status?: string | null;
  quality_rating?: string | null;
  onboarding_etapa?: string | null;
  onboarding_status?: string | null;
  onboarding_erro?: string | null;
  setup_completed_at?: string | null;
  payment_method_added?: boolean;
  phone_registered?: boolean;
  app_assigned?: boolean;
  config_json?: Record<string, unknown> | null;

  created_at?: string;
  updated_at?: string;
};

type ApiResponse = {
  ok: boolean;
  created?: boolean;
  integracao?: IntegracaoWhatsapp;
  error?: string;
};

type Etapa = {
  numero: number;
  titulo: string;
  descricao: string;
  chave:
    | "inicio"
    | "meta_conectado"
    | "waba_criada"
    | "numero_registrado"
    | "pagamento_configurado"
    | "concluido";
};

const ETAPAS: Etapa[] = [
  {
    numero: 1,
    titulo: "Conectar conta Meta",
    descricao:
      "Vincule sua conta Meta Business para iniciar a configuração do WhatsApp oficial.",
    chave: "meta_conectado",
  },
  {
    numero: 2,
    titulo: "Criar ou vincular empresa no Meta",
    descricao:
      "Defina a estrutura da conta WhatsApp Business que será usada pelo CRM.",
    chave: "waba_criada",
  },
  {
    numero: 3,
    titulo: "Cadastrar e registrar o número",
    descricao:
      "Conecte o número oficial do CRM e conclua o registro técnico na Cloud API.",
    chave: "numero_registrado",
  },
  {
    numero: 4,
    titulo: "Adicionar forma de pagamento",
    descricao:
      "Cadastre o pagamento no Meta para habilitar o uso oficial do WhatsApp Business.",
    chave: "pagamento_configurado",
  },
];

function obterIndiceEtapaAtual(integracao: IntegracaoWhatsapp | null) {
  const etapa = integracao?.onboarding_etapa || "inicio";

  switch (etapa) {
    case "meta_conectado":
      return 1;
    case "waba_criada":
      return 2;
    case "registrando_numero":
    case "numero_registrado":
      return 3;
    case "pagamento_configurado":
      return 4;
    case "concluido":
      return 4;
    case "inicio":
    default:
      return 0;
  }
}

function formatarStatus(valor?: string | null) {
  if (!valor) return "Não informado";

  return valor
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letra) => letra.toUpperCase());
}

function abrirPopupCentralizado(url: string, title: string) {
  const largura = 520;
  const altura = 720;
  const left = window.screenX + (window.outerWidth - largura) / 2;
  const top = window.screenY + (window.outerHeight - altura) / 2.5;

  return window.open(
    url,
    title,
    `width=${largura},height=${altura},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
  );
}

export default function ConfigurarAmbientePage() {
  const [integracao, setIntegracao] = useState<IntegracaoWhatsapp | null>(null);
  const [loading, setLoading] = useState(true);
  const [recarregando, setRecarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [conectandoMeta, setConectandoMeta] = useState(false);

  async function carregarIntegracao(mostrarLoadingCompleto = false) {
    try {
      if (mostrarLoadingCompleto) {
        setLoading(true);
      } else {
        setRecarregando(true);
      }

      setErro(null);

      const response = await fetch("/api/integracoes-whatsapp", {
        method: "GET",
        cache: "no-store",
      });

      const data: ApiResponse = await response.json();

      if (!response.ok || !data.ok || !data.integracao) {
        throw new Error(data.error || "Erro ao carregar integração.");
      }

      setIntegracao(data.integracao);
    } catch (error) {
      console.error("[CONFIGURAR AMBIENTE] Erro ao carregar integração:", error);
      setErro(
        error instanceof Error
          ? error.message
          : "Erro inesperado ao carregar a integração."
      );
    } finally {
      setLoading(false);
      setRecarregando(false);
    }
  }

    async function iniciarEmbeddedSignup() {
    const signupUrl = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_URL;

    if (!signupUrl) {
        alert(
        "NEXT_PUBLIC_META_EMBEDDED_SIGNUP_URL não está definida no .env.local."
        );
        return;
    }

    setConectandoMeta(true);

    let popup: Window | null = null;

    try {
        popup = abrirPopupCentralizado(signupUrl, "MetaEmbeddedSignup");

        if (!popup) {
        throw new Error("Não foi possível abrir a janela do Meta.");
        }

        const resultado = await new Promise<any>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
            window.removeEventListener("message", onMessage);
            reject(new Error("Tempo esgotado aguardando retorno do Meta."));
        }, 10 * 60 * 1000);

        function onMessage(event: MessageEvent) {
            const origin = event.origin || "";

            const origemValida =
            origin.includes("facebook.com") || origin.includes("meta.com");

            if (!origemValida) {
            return;
            }

            const payload = event.data;

            if (!payload) {
            return;
            }

            // Mantemos tolerante porque o formato pode variar conforme a configuração.
            const texto =
            typeof payload === "string" ? payload : JSON.stringify(payload);

            const contemWaba =
            texto.includes("waba") || texto.includes("WABA") || texto.includes("phone_number");

            if (!contemWaba) {
            return;
            }

            window.clearTimeout(timeout);
            window.removeEventListener("message", onMessage);
            resolve(payload);
        }

        window.addEventListener("message", onMessage);
        });

        const payloadNormalizado =
        typeof resultado === "string" ? JSON.parse(resultado) : resultado;

        const wabaId =
        payloadNormalizado?.waba_id ||
        payloadNormalizado?.wabaId ||
        payloadNormalizado?.data?.waba_id ||
        payloadNormalizado?.data?.wabaId ||
        null;

        const phoneNumberId =
        payloadNormalizado?.phone_number_id ||
        payloadNormalizado?.phoneNumberId ||
        payloadNormalizado?.data?.phone_number_id ||
        payloadNormalizado?.data?.phoneNumberId ||
        null;

        const businessPortfolioId =
        payloadNormalizado?.business_portfolio_id ||
        payloadNormalizado?.businessPortfolioId ||
        payloadNormalizado?.data?.business_portfolio_id ||
        payloadNormalizado?.data?.businessPortfolioId ||
        null;

        const metaBusinessId =
        payloadNormalizado?.meta_business_id ||
        payloadNormalizado?.business_id ||
        payloadNormalizado?.data?.meta_business_id ||
        payloadNormalizado?.data?.business_id ||
        null;

        const response = await fetch(
        "/api/integracoes-whatsapp/embedded-signup/finish",
        {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            },
            body: JSON.stringify({
            event: "FINISH",
            waba_id: wabaId,
            phone_number_id: phoneNumberId,
            business_portfolio_id: businessPortfolioId,
            meta_business_id: metaBusinessId,
            raw: payloadNormalizado,
            }),
        }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
        throw new Error(
            data.error || "Erro ao salvar retorno do Embedded Signup."
        );
        }

        await carregarIntegracao(false);
    } catch (error) {
        console.error("[CONFIGURAR AMBIENTE] Erro no Embedded Signup:", error);
        alert(
        error instanceof Error
            ? error.message
            : "Erro ao iniciar Embedded Signup."
        );
    } finally {
        setConectandoMeta(false);

        try {
        popup?.close();
        } catch {}
    }
    }

  useEffect(() => {
    carregarIntegracao(true);
  }, []);

  const indiceEtapaAtual = useMemo(
    () => obterIndiceEtapaAtual(integracao),
    [integracao]
  );

  const progressoPercentual = useMemo(() => {
    return (indiceEtapaAtual / ETAPAS.length) * 100;
  }, [indiceEtapaAtual]);

  const statusGeral = formatarStatus(integracao?.onboarding_status);
  const statusConexao = formatarStatus(integracao?.status);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <div className={styles.heroBadge}>Primeira configuração</div>

          <h1 className={styles.title}>Configurar ambiente do WhatsApp oficial</h1>

          <p className={styles.subtitle}>
            Nesta etapa você vai conectar seu ambiente ao Meta, registrar o número
            oficial do CRM e finalizar a ativação da operação.
          </p>
        </header>

        {loading ? (
          <section className={styles.loadingCard}>
            <div className={styles.spinner} />
            <div>
              <h2 className={styles.loadingTitle}>Preparando sua configuração</h2>
              <p className={styles.loadingText}>
                Estamos verificando se sua empresa já possui uma integração criada.
              </p>
            </div>
          </section>
        ) : erro ? (
          <section className={styles.errorCard}>
            <h2 className={styles.errorTitle}>Não foi possível carregar a configuração</h2>
            <p className={styles.errorText}>{erro}</p>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => carregarIntegracao(true)}
            >
              Tentar novamente
            </button>
          </section>
        ) : (
          <div className={styles.contentGrid}>
            <section className={styles.mainCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionEyebrow}>Etapas do onboarding</span>
                  <h2 className={styles.sectionTitle}>Progresso da configuração</h2>
                </div>

                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => carregarIntegracao(false)}
                  disabled={recarregando}
                >
                  {recarregando ? "Atualizando..." : "Atualizar status"}
                </button>
              </div>

              <div className={styles.progressWrapper}>
                <div className={styles.progressLabelRow}>
                  <span>Progresso atual</span>
                  <span>{Math.round(progressoPercentual)}%</span>
                </div>

                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${progressoPercentual}%` }}
                  />
                </div>
              </div>

              <div className={styles.stepsList}>
                {ETAPAS.map((etapa, index) => {
                  const concluida = indiceEtapaAtual >= index + 1;
                  const atual = indiceEtapaAtual === index;

                  return (
                    <article
                      key={etapa.numero}
                      className={`${styles.stepCard} ${
                        concluida ? styles.stepCardDone : ""
                      } ${atual ? styles.stepCardActive : ""}`}
                    >
                      <div className={styles.stepNumber}>
                        {concluida ? "✓" : etapa.numero}
                      </div>

                      <div className={styles.stepBody}>
                        <div className={styles.stepHeader}>
                          <h3 className={styles.stepTitle}>{etapa.titulo}</h3>
                          <span className={styles.stepStatus}>
                            {concluida
                              ? "Concluída"
                              : atual
                              ? "Etapa atual"
                              : "Pendente"}
                          </span>
                        </div>

                        <p className={styles.stepDescription}>{etapa.descricao}</p>

                        {index === 0 && (
                          <div className={styles.stepActions}>
                            <button
                                type="button"
                                className={styles.primaryButton}
                                onClick={async () => {
                                try {
                                    const response = await fetch(
                                    "/api/integracoes-whatsapp/conectar-meta",
                                    {
                                        method: "POST",
                                    }
                                    );

                                    const data = await response.json();

                                    if (!response.ok || !data.ok) {
                                    throw new Error(data.error || "Erro ao conectar Meta");
                                    }

                                    await carregarIntegracao(false);
                                } catch (error) {
                                    alert(
                                    error instanceof Error
                                        ? error.message
                                        : "Erro ao conectar com Meta"
                                    );
                                }
                                }}
                                >
                                Conectar com Meta
                            </button>
                          </div>
                        )}

                        {index > 0 && (
                          <div className={styles.stepActions}>
                            <button
                              type="button"
                              className={styles.disabledButton}
                              disabled
                            >
                              Disponível após concluir a etapa anterior
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className={styles.sideCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionEyebrow}>Resumo técnico</span>
                  <h2 className={styles.sectionTitle}>Dados da integração</h2>
                </div>
              </div>

              <div className={styles.infoList}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Nome da conexão</span>
                  <strong className={styles.infoValue}>
                    {integracao?.nome_conexao || "Não definido"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Status da integração</span>
                  <strong className={styles.infoValue}>{statusConexao}</strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Status do onboarding</span>
                  <strong className={styles.infoValue}>{statusGeral}</strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Etapa atual</span>
                  <strong className={styles.infoValue}>
                    {formatarStatus(integracao?.onboarding_etapa)}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>WABA ID</span>
                  <strong className={styles.infoValueMono}>
                    {integracao?.waba_id || "Ainda não definido"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Phone Number ID</span>
                  <strong className={styles.infoValueMono}>
                    {integracao?.phone_number_id || "Ainda não definido"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Número salvo</span>
                  <strong className={styles.infoValue}>
                    {integracao?.numero || "Ainda não definido"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Webhook verificado</span>
                  <strong className={styles.infoValue}>
                    {integracao?.webhook_verificado ? "Sim" : "Não"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Número registrado</span>
                  <strong className={styles.infoValue}>
                    {integracao?.phone_registered ? "Sim" : "Não"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Pagamento informado</span>
                  <strong className={styles.infoValue}>
                    {integracao?.payment_method_added ? "Sim" : "Não"}
                  </strong>
                </div>
              </div>

              {integracao?.onboarding_erro ? (
                <div className={styles.alertError}>
                  <strong>Último erro:</strong>
                  <p>{integracao.onboarding_erro}</p>
                </div>
              ) : (
                <div className={styles.alertInfo}>
                  <strong>Próximo passo:</strong>
                  <p>
                    Clique em <b>Conectar com Meta</b> para iniciar a configuração
                    oficial do seu ambiente.
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}