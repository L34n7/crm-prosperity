"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./configurar-ambiente.module.css";
import { t } from "@/i18n";

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
    titulo: "Connect Meta Account",
    descricao:
      "Link your Meta Business account and capture the official WhatsApp Business data.",
    chave: "meta_conectado",
  },
  {
    numero: 2,
    titulo: "Activate WhatsApp Number",
    descricao:
      "Complete the technical registration of the phone number to send and receive messages.",
    chave: "numero_registrado",
  },
  {
    numero: 3,
    titulo: "Configure Webhook",
    descricao:
      "Allow the CRM to receive messages, statuses, and WhatsApp events in real time.",
    chave: "webhook_configurado" as any,
  },
  {
    numero: 4,
    titulo: "Complete Setup",
    descricao:
      "Review the final data and activate the WhatsApp integration in the CRM.",
    chave: "concluido",
  },
];

function obterIndiceEtapaAtual(integracao: IntegracaoWhatsapp | null) {
  if (!integracao) return 0;

  const metaConectado =
    integracao.status !== "desconectada" &&
    !!integracao.waba_id &&
    !!integracao.phone_number_id &&
    !!integracao.business_account_id;

  const numeroRegistrado =
    metaConectado &&
    integracao.phone_registered === true;

  const webhookConfigurado =
    numeroRegistrado &&
    integracao.webhook_verificado === true &&
    integracao.app_assigned === true;

  const concluido =
    webhookConfigurado &&
    integracao.status === "ativa" &&
    integracao.onboarding_etapa === "concluido" &&
    integracao.onboarding_status === "concluido" &&
    !!integracao.setup_completed_at;

  if (concluido) return 4;
  if (webhookConfigurado) return 3;
  if (numeroRegistrado) return 2;
  if (metaConectado) return 1;

  return 0;
}

function formatarStatus(valor?: string | null) {
  if (!valor) return "Not provided";

  const mapa: Record<string, string> = {
    pendente: "Pending",
    ativa: "Active",
    erro: "Error",
    desconectada: "Disconnected",
    inicio: "Start",
    meta_conectado: "Meta Connected",
    numero_registrado: "Phone Number Registered",
    webhook_configurado: "Webhook Configured",
    concluido: "Completed",
  };

  return (
    mapa[valor] ||
    valor
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letra) => letra.toUpperCase())
  );
}

export default function ConfigurarAmbientePage() {
  const [integracao, setIntegracao] = useState<IntegracaoWhatsapp | null>(null);
  const [loading, setLoading] = useState(true);
  const [recarregando, setRecarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [conectandoMeta, setConectandoMeta] = useState(false);
  const [modalPinAberto, setModalPinAberto] = useState(false);
  const [pin, setPin] = useState("");
  const [registrandoNumero, setRegistrandoNumero] = useState(false);
  const [erroWebhook, setErroWebhook] = useState<string | null>(null);
  const [configurandoWebhook, setConfigurandoWebhook] = useState(false);

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
      throw new Error(data.error || "Error syncing Meta data.");
    }

    return data;
  }

  async function finalizarEmbeddedSignup(dadosEmbeddedSignup: any) {
    const response = await fetch("/api/integracoes-whatsapp/embedded-signup/finish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dadosEmbeddedSignup),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Error completing Embedded Signup data.");
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
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      script.onerror = () =>
        reject(new Error("Unable to load the Facebook SDK."));

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
        throw new Error(data.error || "Error loading integration.");
      }

      let integracaoAtualizada = data.integracao;

      console.log("[CONFIGURAR AMBIENTE] Integração recebida da API:", integracaoAtualizada);

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
          : "Unexpected error while loading the integration."
      );
    } finally {
      setLoading(false);
      setRecarregando(false);
    }
  }
  
function montarUrlMeta() {
  if (!integracao?.id) {
    throw new Error("Integration has not loaded yet.");
  }

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
  const redirectUri = process.env.NEXT_PUBLIC_META_REDIRECT_URI;

  if (!appId) {
    throw new Error("NEXT_PUBLIC_META_APP_ID is not configured.");
  }

  if (!configId) {
    throw new Error("NEXT_PUBLIC_META_CONFIG_ID is not configured.");
  }

  if (!redirectUri) {
    throw new Error("NEXT_PUBLIC_META_REDIRECT_URI is not configured.");
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
          alert("Meta did not return the authorization code.");
          return;
        }

        const code = response.authResponse.code;

        setTimeout(async () => {
          try {
            window.removeEventListener("message", onMessage);
            setConectandoMeta(false);

            if (dadosEmbeddedSignup) {
              await finalizarEmbeddedSignup(dadosEmbeddedSignup);
            }

            window.location.href = `/configuracao-meta-callback?code=${encodeURIComponent(
              code
            )}&state=${encodeURIComponent(integracao.id)}`;
          } catch (error) {
            console.error("[EMBEDDED SIGNUP FINISH ERROR]", error);
            alert(
              error instanceof Error
                ? error.message
                : "Error saving Embedded Signup data."
            );
          }
        }, 1500);
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        auth_type: "rerequest",
        scope:
          "business_management,whatsapp_business_management,whatsapp_business_messaging",
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
        : "Error opening Meta setup."
    );
  }
}


async function handleRegistrarNumero(pinInformado?: string) {
  try {
    if (!integracao?.id) {
      alert("Integração ainda não carregada.");
      return;
    }

    if (pinInformado && !/^\d{6}$/.test(pinInformado)) {
      alert("The PIN must contain exactly 6 digits.");
      return;
    }

    setRegistrandoNumero(true);

    const response = await fetch("/api/integracoes-whatsapp/register-number", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        integracao_id: integracao.id,
        ...(pinInformado ? { pin: pinInformado } : {}),
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      if (data?.requires_pin) {
        setModalPinAberto(true);
        return;
      }

      throw new Error(data.error || "Error registering phone number.");
    }

    setModalPinAberto(false);
    setPin("");

    alert("Phone number activated successfully.");
    await carregarIntegracao(false);
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "Unexpected error while activating phone number."
    );
  } finally {
    setRegistrandoNumero(false);
  }
}


async function handleConfirmarPin() {
  await handleRegistrarNumero(pin.trim());
}

async function handleConfigurarWebhook() {
  try {
    if (!integracao?.id) {
      setErroWebhook("Integration not loaded.");
      return;
    }

    setErroWebhook(null);
    setConfigurandoWebhook(true);

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
      const mensagemOriginal =
        data.error || "Error configuring webhook.";

      setErroWebhook(
        `Webhook subscription could not be completed because the app still requires Meta advanced permissions. Required permission: whatsapp_business_management. Original API response: ${mensagemOriginal}`
      );

      return;
    }

    setErroWebhook(null);
    alert("Webhook configured successfully.");
    await carregarIntegracao(false);
  } catch (error) {
    setErroWebhook(
      error instanceof Error
        ? `Webhook subscription could not be completed. Required permission: whatsapp_business_management. Original error: ${error.message}`
        : "Webhook subscription could not be completed. Required permission: whatsapp_business_management."
    );
  } finally {
    setConfigurandoWebhook(false);
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
          <div className={styles.heroBadge}>Initial setup</div>

          <h1 className={styles.title}>Official WhatsApp Environment Setup</h1>

          <p className={styles.subtitle}>
            Connect your CRM to Meta, register your official WhatsApp Business number,
            and complete the activation process.
          </p>
        </header>

        {loading ? (
          <section className={styles.loadingCard}>
            <div className={styles.spinner} />
            <div>
              <h2 className={styles.loadingTitle}>Preparing your setup</h2>
              <p className={styles.loadingText}>
                We are checking whether your company already has an integration created.
              </p>
            </div>
          </section>
        ) : erro ? (
          <section className={styles.errorCard}>
            <h2 className={styles.errorTitle}>Unable to load setup</h2>
            <p className={styles.errorText}>{erro}</p>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => carregarIntegracao(true)}
            >
              Try Again
            </button>
          </section>
        ) : (
          <div className={styles.contentGrid}>
            <section className={styles.mainCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionEyebrow}>Onboarding steps</span>
                  <h2 className={styles.sectionTitle}>Setup Progress</h2>
                </div>

                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => carregarIntegracao(false)}
                  disabled={recarregando}
                >
                  {recarregando ? "Refreshing..." : "Refresh Status"}
                </button>
              </div>

              <div className={styles.progressWrapper}>
                <div className={styles.progressLabelRow}>
                  <span>Current progress</span>
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
                              ? "Completed"
                              : atual
                              ? "Current Step"
                              : "Pending"}
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
                              {conectandoMeta ? "Opening Meta..." : "Connect with Meta"}
                            </button>
                          </div>
                        )}

                        {etapa.numero === 2 && !concluida && (
                          <div className={styles.stepActions}>
                            <button
                              type="button"
                              className={indiceEtapaAtual >= 1 ? styles.primaryButton : styles.disabledButton}
                              onClick={() => handleRegistrarNumero()}
                              disabled={indiceEtapaAtual < 1 || recarregando}
                            >
                              {recarregando ? "Activating..." : "Activate Number"}
                            </button>
                          </div>
                        )}

                        {etapa.numero === 3 && !concluida && (
                          <div className={styles.stepActions}>
                            <button
                              type="button"
                              className={indiceEtapaAtual >= 2 ? styles.primaryButton : styles.disabledButton}
                              onClick={handleConfigurarWebhook}
                              disabled={indiceEtapaAtual < 2 || configurandoWebhook}
                            >
                              {configurandoWebhook ? "Configuring..." : "Configure Webhook"}
                            </button>
                          </div>
                        )}

                        {etapa.numero === 3 && erroWebhook && (
                          <div className={styles.alertError}>
                            <strong>Webhook permission required</strong>
                            <p>{erroWebhook}</p>
                          </div>
                        )}
                        
                        {etapa.numero === 4 && !concluida && (
                          <div className={styles.stepActions}>
                            <button
                              type="button"
                              className={styles.disabledButton}
                              disabled
                            >
                              Available after webhook setup
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
                  <span className={styles.sectionEyebrow}>Technical summary</span>
                  <h2 className={styles.sectionTitle}>Integration Data</h2>
                </div>
              </div>

              <div className={styles.infoList}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Connection name</span>
                  <strong className={styles.infoValue}>
                    {integracao?.nome_conexao || "Not defined"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Integration status</span>
                  <strong className={styles.infoValue}>{statusConexao}</strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Onboarding status</span>
                  <strong className={styles.infoValue}>{statusGeral}</strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Current step</span>
                  <strong className={styles.infoValue}>
                    {formatarStatus(integracao?.onboarding_etapa)}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>WABA ID</span>
                  <strong className={styles.infoValue}>
                    {integracao?.waba_id || "Not defined yet"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Phone Number ID</span>
                  <strong className={styles.infoValue}>
                    {integracao?.phone_number_id || "Not defined yet"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Business Account ID</span>
                  <strong className={styles.infoValue}>
                    {integracao?.business_account_id || "Not defined yet"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Business Portfolio ID</span>
                  <strong className={styles.infoValue}>
                    {integracao?.business_portfolio_id || "Not defined yet"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Verified Name</span>
                  <strong className={styles.infoValue}>
                    {integracao?.verified_name || "Not defined yet"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Phone Number Status</span>
                  <strong className={styles.infoValue}>
                    {integracao?.phone_number_status || "Not defined yet"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Quality Rating</span>
                  <strong className={styles.infoValue}>
                    {integracao?.quality_rating || "Not defined yet"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>App assigned to WABA</span>
                  <strong className={styles.infoValue}>
                    {integracao?.app_assigned ? "Yes" : "No"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Saved number</span>
                  <strong className={styles.infoValue}>
                    {integracao?.numero || "Not defined yet"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Webhook verified</span>
                  <strong className={styles.infoValue}>
                    {integracao?.webhook_verificado ? "Yes" : "No"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Phone number registered</span>
                  <strong className={styles.infoValue}>
                    {integracao?.phone_registered ? "Yes" : "No"}
                  </strong>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Payment method added</span>
                  <strong className={styles.infoValue}>
                    {integracao?.payment_method_added ? "Yes" : "No"}
                  </strong>
                </div>
              </div>

              <div className={styles.permissionsCard}>
                <h3 className={styles.permissionsTitle}>Meta Permissions Status</h3>

                <div className={styles.permissionItem}>
                  <span>✅ whatsapp_business_messaging</span>
                  <strong>Approved</strong>
                </div>

                <div className={styles.permissionItem}>
                  <span>✅ public_profile</span>
                  <strong>Approved</strong>
                </div>

                <div className={styles.permissionItem}>
                  <span>⏳ whatsapp_business_management</span>
                  <strong>Pending approval</strong>
                </div>

                <div className={styles.permissionItem}>
                  <span>⏳ business_management</span>
                  <strong>Pending approval</strong>
                </div>

                <p className={styles.permissionNote}>
                  The CRM requires whatsapp_business_management to complete WABA asset management,
                  webhook subscription, and official WhatsApp Business onboarding.
                </p>
              </div>

              {integracao?.onboarding_erro ? (
                <div className={styles.alertError}>
                  <strong>Last error:</strong>
                  <p>{integracao.onboarding_erro}</p>
                </div>
              ) : (
                <div className={styles.alertInfo}>
                  <strong>Next step:</strong>
                  <p>
                    Click <b>Connect with Meta</b> to start the official setup of your environment.
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>

      {modalPinAberto && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <h2 className={styles.modalTitle}>Two-step verification PIN</h2>

            <p className={styles.modalText}>
              Meta reported that this phone number requires a 6-digit PIN to complete
              the activation in the Cloud API.
            </p>

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              className={styles.modalInput}
              value={pin}
              onChange={(e) => {
                const somenteNumeros = e.target.value.replace(/\D/g, "");
                setPin(somenteNumeros);
              }}
              placeholder="Enter the 6-digit PIN"
            />

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setModalPinAberto(false);
                  setPin("");
                }}
                disabled={registrandoNumero}
              >
                Cancel
              </button>

              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleConfirmarPin}
                disabled={registrandoNumero || pin.length !== 6}
              >
                {registrandoNumero ? "Activating..." : "Confirm PIN"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}