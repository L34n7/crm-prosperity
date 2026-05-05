"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./configurar-ambiente.module.css";

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: any;
  }
}

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
      "Vincule sua conta Meta Business e capture os dados oficiais do WhatsApp.",
    chave: "meta_conectado",
  },
  {
    numero: 2,
    titulo: "Registrar número na Cloud API",
    descricao:
      "Finalize o registro técnico do número para permitir envio e recebimento de mensagens.",
    chave: "numero_registrado",
  },
  {
    numero: 3,
    titulo: "Configurar webhook",
    descricao:
      "Permite que o CRM receba mensagens, status e eventos do WhatsApp em tempo real.",
    chave: "webhook_configurado" as any,
  },
  {
    numero: 4,
    titulo: "Concluir configuração",
    descricao:
      "Verifica os dados finais e ativa a integração do WhatsApp no CRM.",
    chave: "concluido",
  },
];

function obterIndiceEtapaAtual(integracao: IntegracaoWhatsapp | null) {
  if (!integracao) return 0;

  if (integracao.status === "ativa" || integracao.onboarding_etapa === "concluido") {
    return 4;
  }

  if (integracao.webhook_verificado || integracao.app_assigned) {
    return 3;
  }

  if (integracao.phone_registered) {
    return 2;
  }

  if (integracao.waba_id && integracao.phone_number_id) {
    return 1;
  }

  return 0;
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
  

  async function sincronizarDadosMeta(integracaoId: string) {
    const response = await fetch("/api/integracoes-whatsapp/meta-dados", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        integracao_id: integracaoId,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Erro ao sincronizar dados da Meta.");
    }

    return data;
  }

  function carregarFacebookSdk() {
    return new Promise<void>((resolve, reject) => {
      if (window.FB) {
        resolve();
        return;
      }

      window.fbAsyncInit = function () {
        window.FB.init({
          appId: process.env.NEXT_PUBLIC_META_APP_ID,
          cookie: true,
          xfbml: true,
          version: "v25.0",
        });

        resolve();
      };

      const scriptExistente = document.getElementById("facebook-jssdk");

      if (scriptExistente) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/pt_BR/sdk.js";
      script.async = true;
      script.defer = true;
      script.onerror = () =>
        reject(new Error("Não foi possível carregar o SDK do Facebook."));

      document.body.appendChild(script);
    });
  }

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

      let integracaoAtualizada = data.integracao;

      const temToken =
        !!integracaoAtualizada.config_json &&
        typeof integracaoAtualizada.config_json === "object" &&
        !!(integracaoAtualizada.config_json as any).access_token;

      const precisaBuscarDadosMeta =
        temToken &&
        (!integracaoAtualizada.waba_id || !integracaoAtualizada.phone_number_id);

      if (precisaBuscarDadosMeta) {
        try {
          await sincronizarDadosMeta(integracaoAtualizada.id);
        } catch (syncError) {
          console.warn("[CONFIGURAR AMBIENTE] Erro ao sincronizar Meta:", syncError);
        }

        const responseAtualizada = await fetch("/api/integracoes-whatsapp", {
          method: "GET",
          cache: "no-store",
        });

        const dataAtualizada: ApiResponse = await responseAtualizada.json();

        if (
          responseAtualizada.ok &&
          dataAtualizada.ok &&
          dataAtualizada.integracao
        ) {
          integracaoAtualizada = dataAtualizada.integracao;
        }
      }

      setIntegracao(integracaoAtualizada);
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
  
function montarUrlMeta() {
  if (!integracao?.id) {
    throw new Error("Integração ainda não carregada.");
  }

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
  const redirectUri = process.env.NEXT_PUBLIC_META_REDIRECT_URI;

  if (!appId) {
    throw new Error("NEXT_PUBLIC_META_APP_ID não configurado.");
  }

  if (!configId) {
    throw new Error("NEXT_PUBLIC_META_CONFIG_ID não configurado.");
  }

  if (!redirectUri) {
    throw new Error("NEXT_PUBLIC_META_REDIRECT_URI não configurado.");
  }

  const url = new URL("https://www.facebook.com/v25.0/dialog/oauth");

  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", integracao.id);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("override_default_response_type", "true");
  url.searchParams.set("config_id", configId);

  return url.toString();
}


async function iniciarEmbeddedSignup() {
  try {
    if (!integracao?.id) {
      throw new Error("Integração ainda não carregada.");
    }

    const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;

    if (!configId) {
      throw new Error("NEXT_PUBLIC_META_CONFIG_ID não configurado.");
    }

    setConectandoMeta(true);

    await carregarFacebookSdk();

    let dadosEmbeddedSignup: {
      waba_id: string | null;
      phone_number_id: string | null;
      business_portfolio_id: string | null;
      event: string;
      raw: unknown;
    } | null = null;

    const salvarDadosEmbeddedSignup = (data: any) => {
      const wabaId =
        data?.data?.waba_id ||
        data?.data?.whatsapp_business_account_id ||
        null;

      const phoneNumberId =
        data?.data?.phone_number_id ||
        data?.data?.business_phone_number_id ||
        null;

      const businessPortfolioId =
        data?.data?.business_id ||
        data?.data?.business_portfolio_id ||
        null;

      dadosEmbeddedSignup = {
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        business_portfolio_id: businessPortfolioId,
        event: data.event,
        raw: data,
      };

      localStorage.setItem(
        `meta_embedded_signup_${integracao.id}`,
        JSON.stringify(dadosEmbeddedSignup)
      );

      console.log("✅ DADOS META CAPTURADOS E SALVOS:", dadosEmbeddedSignup);
    };

    const onMessage = (event: MessageEvent) => {
      if (
        !event.origin.includes("facebook.com") &&
        !event.origin.includes("meta.com")
      ) {
        return;
      }

      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;

        console.log("[META EVENT RECEBIDO]", data);

        if (data?.type !== "WA_EMBEDDED_SIGNUP") {
          return;
        }

        if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
          salvarDadosEmbeddedSignup(data);
        }

        if (data.event === "CANCEL") {
          console.warn("[META EMBEDDED SIGNUP] Cancelado:", data);
        }

        if (data.event === "ERROR") {
          console.error("[META EMBEDDED SIGNUP] Erro:", data);
        }
      } catch (error) {
        console.warn("[META EMBEDDED SIGNUP] Mensagem ignorada:", error);
      }
    };

    window.addEventListener("message", onMessage);

    window.FB.login(
      function (response: any) {
        if (!response?.authResponse?.code) {
          window.removeEventListener("message", onMessage);
          setConectandoMeta(false);
          alert("O Meta não retornou o código de autorização.");
          return;
        }

        const code = response.authResponse.code;

        setTimeout(() => {
          window.removeEventListener("message", onMessage);
          setConectandoMeta(false);

          const dadosSalvos = localStorage.getItem(
            `meta_embedded_signup_${integracao.id}`
          );

          console.log("[META DADOS ANTES DO REDIRECT]", {
            dadosEmbeddedSignup,
            dadosSalvos,
          });

          window.location.href = `/configuracao-meta-callback?code=${encodeURIComponent(
            code
          )}&state=${encodeURIComponent(integracao.id)}`;
        }, 1500);
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        auth_type: "rerequest",
        extras: {
          sessionInfoVersion: "3",
        },
      }
    );
  } catch (error) {
    setConectandoMeta(false);

    alert(
      error instanceof Error
        ? error.message
        : "Erro ao abrir configuração do Meta."
    );
  }
}


async function handleRegistrarNumero() {
  try {
    if (!integracao?.id) {
      alert("Integração ainda não carregada.");
      return;
    }

    const pin = window.prompt("Digite o PIN de 6 dígitos configurado no WhatsApp:");

    if (!pin) return;

    if (!/^\d{6}$/.test(pin)) {
      alert("O PIN precisa ter exatamente 6 números.");
      return;
    }

    setRecarregando(true);

    const response = await fetch("/api/integracoes-whatsapp/register-number", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        integracao_id: integracao.id,
        pin,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Erro ao registrar número.");
    }

    alert("Número registrado com sucesso.");
    await carregarIntegracao(false);
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "Erro inesperado ao registrar número."
    );
  } finally {
    setRecarregando(false);
  }
}


async function handleConfigurarWebhook() {
  try {
    if (!integracao?.id) {
      alert("Integração não carregada.");
      return;
    }

    const response = await fetch(
      "/api/integracoes-whatsapp/subscribe-webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integracao_id: integracao.id,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Erro ao configurar webhook.");
    }

    alert("Webhook configurado com sucesso.");
    await carregarIntegracao(false);
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "Erro ao configurar webhook."
    );
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

                        {etapa.numero === 1 && (
                          <div className={styles.stepActions}>
                            <button
                              type="button"
                              className={styles.primaryButton}
                              onClick={iniciarEmbeddedSignup}
                              disabled={conectandoMeta}
                            >
                              {conectandoMeta ? "Abrindo Meta..." : "Conectar com Meta"}
                            </button>
                          </div>
                        )}

                        {etapa.numero === 2 && !concluida && (
                          <div className={styles.stepActions}>
                            <button
                              type="button"
                              className={indiceEtapaAtual >= 1 ? styles.primaryButton : styles.disabledButton}
                              onClick={handleRegistrarNumero}
                              disabled={indiceEtapaAtual < 1 || recarregando}
                            >
                              {recarregando ? "Registrando..." : "Registrar número"}
                            </button>
                          </div>
                        )}

                        {etapa.numero === 3 && !concluida && (
                          <div className={styles.stepActions}>
                            <button
                              type="button"
                              className={indiceEtapaAtual >= 2 ? styles.primaryButton : styles.disabledButton}
                              onClick={handleConfigurarWebhook}
                              disabled={indiceEtapaAtual < 2}
                            >
                              Configurar webhook
                            </button>
                          </div>
                        )}

                        {etapa.numero === 4 && !concluida && (
                          <div className={styles.stepActions}>
                            <button
                              type="button"
                              className={styles.disabledButton}
                              disabled
                            >
                              Disponível após configurar o webhook
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