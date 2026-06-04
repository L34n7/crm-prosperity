"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

type PerfilOnboarding = {
  nomeUsuario: string;
  nomeEmpresa: string;
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
      "Vincule sua conta empresarial da Meta e capture os dados oficiais do WhatsApp Business.",
    chave: "meta_conectado",
  },
  {
    numero: 2,
    titulo: "Ativar número do WhatsApp",
    descricao:
      "Conclua o registro técnico do número para enviar e receber mensagens.",
    chave: "numero_registrado",
  },
  {
    numero: 3,
    titulo: "Configurar Webhook",
    descricao:
      "Permita que o CRM receba mensagens, status e eventos do WhatsApp em tempo real.",
    chave: "webhook_configurado" as any,
  },
  {
    numero: 4,
    titulo: "Concluir configuração",
    descricao:
      "Revise os dados finais e ative a integração do WhatsApp no CRM.",
    chave: "concluido",
  },
];

function obterIndiceEtapaAtual(integracao: IntegracaoWhatsapp | null) {
  if (!integracao) return 0;

  const metaConectado = !!integracao.waba_id && !!integracao.phone_number_id;
  const numeroRegistrado = !!integracao.phone_registered;
  const webhookConfigurado =
    !!integracao.webhook_verificado && !!integracao.app_assigned;

  const concluido =
    integracao.status === "ativa" &&
    integracao.onboarding_etapa === "concluido" &&
    integracao.onboarding_status === "concluido" &&
    numeroRegistrado &&
    webhookConfigurado;

  if (concluido) return 4;
  if (webhookConfigurado) return 3;
  if (numeroRegistrado) return 2;
  if (metaConectado) return 1;

  return 0;
}

function formatarStatus(valor?: string | null) {
  if (!valor) return "Não informado";

  const mapa: Record<string, string> = {
    pendente: "Pendente",
    ativa: "Ativa",
    erro: "Erro",
    desconectada: "Desconectada",
    inicio: "Início",
    meta_conectado: "Meta conectada",
    numero_registrado: "Número registrado",
    webhook_configurado: "Webhook configurado",
    concluido: "Concluído",
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
  const router = useRouter();
  const numeroValido =
    !!integracao?.numero && !integracao.numero.startsWith("pendente_");
    
  const [etapaQuiz, setEtapaQuiz] = useState(0);
  const [perfilOnboarding, setPerfilOnboarding] =
    useState<PerfilOnboarding>({
      nomeUsuario: "usuário",
      nomeEmpresa: "sua empresa",
    });

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
      throw new Error(data.error || "Erro ao concluir os dados do Embedded Signup.");
    }

    return data;
  }

  async function processarMetaCallbackNaPagina({
    code,
    state,
    embeddedSignup,
  }: {
    code: string;
    state: string;
    embeddedSignup: {
      waba_id: string | null;
      phone_number_id: string | null;
      business_portfolio_id: string | null;
      event: string;
      raw: unknown;
    } | null;
  }) {
    const response = await fetch("/api/integracoes-whatsapp/meta-callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        code,
        state,
        waba_id: embeddedSignup?.waba_id || null,
        phone_number_id: embeddedSignup?.phone_number_id || null,
        business_portfolio_id: embeddedSignup?.business_portfolio_id || null,
        embedded_signup: embeddedSignup,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error ||
          data?.meta_response?.error?.message ||
          "Erro ao finalizar conexão com Meta."
      );
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
          : "Erro inesperado ao carregar a integração."
      );
    } finally {
      setLoading(false);
      setRecarregando(false);
    }
  }
  
function montarUrlMeta() {
  if (!integracao?.id) {
    throw new Error("A integração ainda não foi carregada.");
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
          alert("A Meta não retornou o código de autorização.");
          return;
        }

        const code = response.authResponse.code;

        setTimeout(async () => {
          try {
            window.removeEventListener("message", onMessage);

            if (dadosEmbeddedSignup) {
              await finalizarEmbeddedSignup(dadosEmbeddedSignup);
            }

            await processarMetaCallbackNaPagina({
              code,
              state: integracao.id,
              embeddedSignup: dadosEmbeddedSignup,
            });

            if (integracao.id) {
              localStorage.removeItem(`meta_embedded_signup_${integracao.id}`);
            }

            await carregarIntegracao(false);
            setEtapaQuiz(1);
          } catch (error) {
            console.error("[EMBEDDED SIGNUP CALLBACK ERROR]", error);

            setConectandoMeta(false);

            alert(
              error instanceof Error
                ? error.message
                : "Erro ao finalizar conexão com a Meta."
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
        : "Erro ao abrir a configuração da Meta."
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

      throw new Error(data.error || "Erro ao registrar o número de telefone.");
    }

    setModalPinAberto(false);
    setPin("");

    alert("Número ativado com sucesso.");

    try {
      await fetch("/api/integracoes-whatsapp/check-phone", {
        method: "GET",
        cache: "no-store",
      });
    } catch (syncError) {
      console.warn("[CONFIGURAR AMBIENTE] Erro ao sincronizar número:", syncError);
    }

    await carregarIntegracao(false);
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "Erro inesperado ao ativar o número."
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
      setErroWebhook("Integração não carregada.");
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
        data.error || "Erro ao configurar webhook.";

      setErroWebhook(
        `Não foi possível concluir a assinatura do webhook porque o app ainda precisa de permissões avançadas da Meta. Permissão necessária: whatsapp_business_management. Resposta original da API: ${mensagemOriginal}`
      );

      return;
    }

    setErroWebhook(null);
    alert("Webhook configurado com sucesso.");
    await carregarIntegracao(false);
  } catch (error) {
    setErroWebhook(
      error instanceof Error
        ? `Não foi possível concluir a assinatura do webhook. Permissão necessária: whatsapp_business_management. Erro original: ${error.message}`
        : "Não foi possível concluir a assinatura do webhook. Permissão necessária: whatsapp_business_management."
    );
  } finally {
    setConfigurandoWebhook(false);
  }
}


async function handleConcluirConfiguracao() {
  try {
    if (!integracao?.id) {
      alert("Integração ainda não carregada.");
      return;
    }

    const response = await fetch("/api/integracoes-whatsapp/concluir", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        integracao_id: integracao.id,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Erro ao concluir configuração.");
    }

    alert("Configuração concluída com sucesso.");
    await carregarIntegracao(false);
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "Erro inesperado ao concluir configuração."
    );
  }
}

async function carregarPerfilOnboarding() {
  try {
    const response = await fetch("/api/integracoes-whatsapp", {
      method: "GET",
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      return;
    }

    setPerfilOnboarding({
      nomeUsuario:
        data.usuario?.nome ||
        data.usuario?.email?.split("@")?.[0] ||
        "usuário",
      nomeEmpresa:
        data.empresa?.nome ||
        data.empresa?.nome_fantasia ||
        data.empresa?.razao_social ||
        "sua empresa",
    });
  } catch (error) {
    console.warn("[CONFIGURAR AMBIENTE] Erro ao carregar perfil:", error);
  }
}

  useEffect(() => {
    carregarPerfilOnboarding();
    carregarIntegracao(true);
  }, []);

  useEffect(() => {
    function receberCallbackMeta(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;

      if (event.data?.source !== "crm-prosperity-meta-callback") return;

      if (event.data?.ok) {
        carregarIntegracao(false);
        setEtapaQuiz(1);
        return;
      }

      if (event.data?.error) {
        alert(event.data.error);
      }
    }

    window.addEventListener("message", receberCallbackMeta);

    return () => {
      window.removeEventListener("message", receberCallbackMeta);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const metaConectado = !!integracao?.waba_id && !!integracao?.phone_number_id;
  const numeroRegistrado = !!integracao?.phone_registered;
  const webhookConfigurado =
    !!integracao?.webhook_verificado && !!integracao?.app_assigned;

  const ambienteConcluido =
    integracao?.status === "ativa" &&
    integracao?.onboarding_etapa === "concluido" &&
    integracao?.onboarding_status === "concluido" &&
    numeroRegistrado &&
    webhookConfigurado;

  const progressoQuiz = Math.round((etapaQuiz / 3) * 100);

  function avancarEtapaQuiz() {
    setEtapaQuiz((etapaAtual) => Math.min(etapaAtual + 1, 3));
  }

  function voltarEtapaQuiz() {
    setEtapaQuiz((etapaAtual) => Math.max(etapaAtual - 1, 0));
  }
  
  const textoBotaoAtualizarStatus =
  etapaQuiz === 1
    ? "Verificar conexão"
    : etapaQuiz === 2
    ? "Verificar número"
    : etapaQuiz === 3
    ? "Verificar ambiente"
    : "Atualizar status";


  return (
    <main className={styles.page}>
      <div className={styles.container}>

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
          <section className={styles.quizShell}>
            <div className={styles.quizCard}>
              <div className={styles.quizTop}>
                <div>
                  <span className={styles.sectionEyebrow}>
                    Configuração guiada
                  </span>

                  <h2 className={styles.quizTitle}>
                    {etapaQuiz === 0 && "Configuração do ambiente oficial do WhatsApp"}
                    {etapaQuiz === 1 && "Conectar conta Meta"}
                    {etapaQuiz === 2 && "Ativar número do WhatsApp"}
                    {etapaQuiz === 3 && "Finalizar ambiente oficial"}
                  </h2>
                </div>

                {etapaQuiz > 0 && (
                  <button
                    type="button"
                    className={styles.refreshStatusButton}
                    onClick={() => carregarIntegracao(false)}
                    disabled={recarregando}
                  >
                    {recarregando ? "Verificando..." : textoBotaoAtualizarStatus}
                  </button>
                )}
              </div>

              <div className={styles.quizProgress}>
                <div className={styles.progressLabelRow}>
                  <span>
                    {etapaQuiz === 0
                      ? "Introdução"
                      : `Etapa ${etapaQuiz} de 3`}
                  </span>
                  <span>{progressoQuiz}%</span>
                </div>

                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${progressoQuiz}%` }}
                  />
                </div>
              </div>

              {etapaQuiz === 0 && (
                <div className={styles.quizContent}>
                  <div className={styles.quizIcon}>👋</div>

                  <h3 className={styles.quizHeadline}>
                    {perfilOnboarding.nomeUsuario}, seja bem-vindo ao CRM Prosperity. Tudo bem?
                  </h3>

                  <p className={styles.quizText}>
                    Vamos iniciar a configuração do ambiente oficial da{" "}
                    <strong>{perfilOnboarding.nomeEmpresa}</strong>.
                  </p>

                  <p className={styles.quizText}>
                    Em poucos passos, você vai conectar a conta Meta, ativar o
                    número oficial do WhatsApp, configurar o webhook e concluir
                    a ativação do ambiente.
                  </p>

                  <div className={styles.quizActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={avancarEtapaQuiz}
                    >
                      Começar
                    </button>
                  </div>
                </div>
              )}

              {etapaQuiz === 1 && (
                <div className={styles.quizContent}>
                  <div
                    className={`${styles.quizStatusIcon} ${
                      metaConectado ? styles.quizStatusDone : ""
                    }`}
                  >
                    {metaConectado ? "✓" : "1"}
                  </div>

                  <h3 className={styles.quizHeadline}>
                    Conecte sua conta empresarial da Meta
                  </h3>

                  <p className={styles.quizText}>
                    Nesta etapa, o CRM será vinculado à Meta para capturar os
                    dados oficiais do WhatsApp Business, como WABA ID e ID do
                    número.
                  </p>

                  <div
                    className={`${styles.quizInfoBox} ${
                      metaConectado ? styles.quizInfoBoxDone : ""
                    }`}
                  >
                    <div>
                      <span>Status da etapa</span>
                      <strong>
                        {metaConectado ? "Conta Meta conectada" : "Aguardando conexão"}
                      </strong>
                    </div>

                    {metaConectado && <div className={styles.quizCheckIcon}>✓</div>}
                  </div>

                  <div className={styles.quizActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={voltarEtapaQuiz}
                    >
                      Voltar
                    </button>

                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={iniciarEmbeddedSignup}
                      disabled={conectandoMeta}
                    >
                      {conectandoMeta
                        ? "Abrindo Meta..."
                        : metaConectado
                        ? "Reconectar com a Meta"
                        : "Conectar com a Meta"}
                    </button>

                    <button
                      type="button"
                      className={
                        metaConectado
                          ? styles.primaryButton
                          : styles.disabledButton
                      }
                      onClick={avancarEtapaQuiz}
                      disabled={!metaConectado}
                    >
                      Avançar
                    </button>
                  </div>
                </div>
              )}

              {etapaQuiz === 2 && (
                <div className={styles.quizContent}>
                  <div
                    className={`${styles.quizStatusIcon} ${
                      numeroRegistrado ? styles.quizStatusDone : ""
                    }`}
                  >
                    {numeroRegistrado ? "✓" : "2"}
                  </div>

                  <h3 className={styles.quizHeadline}>
                    Ative o número oficial do WhatsApp
                  </h3>

                  <p className={styles.quizText}>
                    Agora vamos concluir o registro técnico do número para que ele possa enviar
                    e receber mensagens pela Cloud API oficial.
                  </p>

                  <div className={styles.pinInfoBox}>
                    <strong>Importante sobre o PIN do WhatsApp</strong>

                    <p>
                      Nesta etapa será cadastrado ou informado o <b>PIN de verificação em duas</b> etapas do número do WhatsApp Business.
                    </p>

                    <p>
                      <b>Guarde esse PIN com segurança</b>. Ele pode ser necessário no futuro em 
                      <b> validações</b>, <b>alterações</b> ou <b>migrações</b> do número na Meta.
                    </p>
                  </div>
                  <div
                    className={`${styles.quizInfoBox} ${
                      numeroValido ? styles.quizInfoBoxDone : ""
                    }`}
                  >
                    <div>
                      <span>Número vinculado</span>
                      <strong>{numeroValido ? integracao?.numero : "Ainda não definido"}</strong>
                    </div>

                    {numeroValido && <div className={styles.quizCheckIcon}>✓</div>}
                  </div>

                  <div
                    className={`${styles.quizInfoBox} ${
                      numeroRegistrado ? styles.quizInfoBoxDone : ""
                    }`}
                  >
                    <div>
                      <span>Status da etapa</span>
                      <strong>
                        {numeroRegistrado ? "Número ativado" : "Aguardando ativação"}
                      </strong>
                    </div>

                    {numeroRegistrado && <div className={styles.quizCheckIcon}>✓</div>}
                  </div>

                  <div className={styles.quizActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={voltarEtapaQuiz}
                    >
                      Voltar
                    </button>

                    <button
                      type="button"
                      className={
                        metaConectado
                          ? styles.primaryButton
                          : styles.disabledButton
                      }
                      onClick={() => setModalPinAberto(true)}
                      disabled={!metaConectado || registrandoNumero}
                    >
                      {registrandoNumero
                        ? "Ativando..."
                        : numeroRegistrado
                        ? "Número já ativado"
                        : "Ativar número"}
                    </button>

                    <button
                      type="button"
                      className={
                        numeroRegistrado
                          ? styles.primaryButton
                          : styles.disabledButton
                      }
                      onClick={avancarEtapaQuiz}
                      disabled={!numeroRegistrado}
                    >
                      Avançar
                    </button>
                  </div>
                </div>
              )}

              {etapaQuiz === 3 && (
                <div className={styles.quizContent}>
                  <div className={styles.quizStatusRow}>
                    <div
                      className={`${styles.quizStatusIcon} ${
                        ambienteConcluido ? styles.quizStatusDone : ""
                      }`}
                    >
                      {ambienteConcluido ? "✓" : "3"}
                    </div>

                    {ambienteConcluido && (
                      <div className={styles.quizStatusTextDone}>
                        Ambiente configurado
                      </div>
                    )}
                  </div>

                  {!ambienteConcluido ? (
                    <>
                      <h3 className={styles.quizHeadline}>
                        Configure o webhook e conclua a ativação
                      </h3>

                      <p className={styles.quizText}>
                        O webhook permite que o CRM receba mensagens, status e
                        eventos do WhatsApp em tempo real. Depois disso, basta
                        concluir a configuração do ambiente.
                      </p>

                      <div className={styles.quizInfoGrid}>
                        <div
                          className={`${styles.quizInfoBox} ${
                            webhookConfigurado ? styles.quizInfoBoxDone : ""
                          }`}
                        >
                          <div>
                            <span>Webhook</span>
                            <strong>{webhookConfigurado ? "Configurado" : "Pendente"}</strong>
                          </div>

                          {webhookConfigurado && <div className={styles.quizCheckIcon}>✓</div>}
                        </div>

                        <div
                          className={`${styles.quizInfoBox} ${
                            ambienteConcluido ? styles.quizInfoBoxDone : ""
                          }`}
                        >
                          <div>
                            <span>Ambiente</span>
                            <strong>{ambienteConcluido ? "Concluído" : "Pendente"}</strong>
                          </div>

                          {ambienteConcluido && <div className={styles.quizCheckIcon}>✓</div>}
                        </div>
                      </div>

                      {erroWebhook && (
                        <div className={styles.alertError}>
                          <strong>Permissão de webhook necessária</strong>
                          <p>{erroWebhook}</p>
                        </div>
                      )}

                      <div className={styles.quizActions}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={voltarEtapaQuiz}
                        >
                          Voltar
                        </button>

                        <button
                          type="button"
                          className={
                            numeroRegistrado
                              ? styles.primaryButton
                              : styles.disabledButton
                          }
                          onClick={handleConfigurarWebhook}
                          disabled={!numeroRegistrado || configurandoWebhook}
                        >
                          {configurandoWebhook
                            ? "Configurando..."
                            : webhookConfigurado
                            ? "Webhook configurado"
                            : "Configurar webhook"}
                        </button>

                        <button
                          type="button"
                          className={
                            webhookConfigurado
                              ? styles.primaryButton
                              : styles.disabledButton
                          }
                          onClick={handleConcluirConfiguracao}
                          disabled={!webhookConfigurado}
                        >
                          Concluir configuração
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className={styles.quizHeadline}>
                        Tudo certo {perfilOnboarding.nomeUsuario}! O ambiente oficial do WhatsApp está ativo.
                      </h3>

                      <p className={styles.quizText}>
                        A integração da{" "}
                        <strong>{perfilOnboarding.nomeEmpresa}</strong> foi
                        concluída com sucesso. Agora você pode personalizar as
                        permissões, políticas e regras internas da empresa.
                      </p>

                      <div className={styles.quizInfoGrid}>
                        <div
                          className={`${styles.quizInfoBox} ${
                            integracao?.status === "ativa" ? styles.quizInfoBoxDone : ""
                          }`}
                        >
                          <div>
                            <span>Status da integração</span>
                            <strong>{statusConexao}</strong>
                          </div>

                          {integracao?.status === "ativa" && (
                            <div className={styles.quizCheckIcon}>✓</div>
                          )}
                        </div>

                        <div
                          className={`${styles.quizInfoBox} ${
                            integracao?.waba_id ? styles.quizInfoBoxDone : ""
                          }`}
                        >
                          <div>
                            <span>WABA ID</span>
                            <strong>{integracao?.waba_id || "Ainda não definido"}</strong>
                          </div>

                          {integracao?.waba_id && <div className={styles.quizCheckIcon}>✓</div>}
                        </div>

                        <div
                          className={`${styles.quizInfoBox} ${
                            integracao?.phone_number_id ? styles.quizInfoBoxDone : ""
                          }`}
                        >
                          <div>
                            <span>ID do número</span>
                            <strong>
                              {integracao?.phone_number_id || "Ainda não definido"}
                            </strong>
                          </div>

                          {integracao?.phone_number_id && (
                            <div className={styles.quizCheckIcon}>✓</div>
                          )}
                        </div>

                        <div
                          className={`${styles.quizInfoBox} ${
                            integracao?.webhook_verificado ? styles.quizInfoBoxDone : ""
                          }`}
                        >
                          <div>
                            <span>Webhook verificado</span>
                            <strong>{integracao?.webhook_verificado ? "Sim" : "Não"}</strong>
                          </div>

                          {integracao?.webhook_verificado && (
                            <div className={styles.quizCheckIcon}>✓</div>
                          )}
                        </div>
                      </div>

                      <p className={styles.quizTextfim}>
                        Deseja personalizar agora as políticas da empresa?
                      </p>

                      <div className={styles.quizActions}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={voltarEtapaQuiz}
                        >
                          Voltar
                        </button>

                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => router.push("/configuracoes/permissoes")}
                        >
                          Avançar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {modalPinAberto && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <h2 className={styles.modalTitle}>PIN de verificação em duas etapas</h2>

            <p className={styles.modalText}>
              Informe o PIN de 6 dígitos configurado na verificação em duas etapas do
              número do WhatsApp Business.
            </p>

            <div className={styles.modalPinInfoBox}>
            <strong>Guarde esse PIN com segurança!</strong>

            <p>
              Esse <b>PIN</b> pode ser <b>solicitado novamente</b> pela <b>Meta</b> em futuras validações,
              alterações ou migrações do número.
            </p>
          </div>

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
              placeholder="Digite o PIN de 6 dígitos"
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
                Cancelar
              </button>

              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleConfirmarPin}
                disabled={registrandoNumero || pin.length !== 6}
              >
                {registrandoNumero ? "Ativando..." : "Confirmar PIN"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
