"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./configurar-ambiente.module.css";
import { t } from "@/i18n";
import FeedbackToast from "@/components/FeedbackToast";
import { montarWhatsappUrl } from "@/lib/contatos/sistema";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { AlertTriangle, ChevronDown, Moon, Sun, X } from "lucide-react";

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: any;
  }
}

type IntegracaoWhatsapp = {
  id: string;
  empresa_id: string;
  posicao?: number | null;
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
  modo_integracao?: "cloud_api" | "coexistence";
  modo_integracao_escolhido_em?: string | null;
  coex_status?: string | null;
  is_on_biz_app?: boolean | null;
  platform_type?: string | null;
  coex_sync_started_at?: string | null;
  coex_sync_completed_at?: string | null;
  tem_token?: boolean;
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

type CoexSyncJob = {
  tipo: "contacts" | "history";
  status:
    | "pendente"
    | "solicitado"
    | "processando"
    | "concluido"
    | "recusado_usuario"
    | "erro";
  request_id?: string | null;
  progresso?: number | null;
  processamento_progresso?: number | null;
  itens_recebidos?: number | null;
  itens_processados?: number | null;
  itens_ignorados?: number | null;
  itens_com_erro?: number | null;
  erro_codigo?: string | null;
  erro_mensagem?: string | null;
  metadata_json?: Record<string, unknown> | null;
  solicitado_em?: string | null;
  concluido_em?: string | null;
  updated_at?: string | null;
};

type CoexActivationResponse = ApiResponse & {
  operational?: boolean;
  sync?: {
    jobs?: CoexSyncJob[];
    warnings?: string[];
  };
};

type PerfilOnboarding = {
  nomeUsuario: string;
  nomeEmpresa: string;
};

type Nicho = {
  id: string;
  codigo: string;
  nome: string;
  grupo: "comercial" | "saude";
  rotulo_cadastro_singular: string;
  rotulo_cadastro_plural: string;
};

type TemaVisual = "light" | "dark";

type NovaIntegracaoPendenteStorage = {
  integracao_id?: string;
  posicao?: number | null;
  wabas_anteriores?: string[];
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

const AJUDA_WHATSAPP_MENSAGEM =
  "Olá! Preciso de ajuda com a configuração do ambiente oficial do WhatsApp no CRM Prosperity.";

const AJUDA_WHATSAPP_URL = montarWhatsappUrl(AJUDA_WHATSAPP_MENSAGEM);

const AJUDA_PERMISSOES_META_MENSAGEM =
  "Olá! Estou na etapa de permissões da conexão com a Meta no onboarding do CRM Prosperity e preciso de ajuda para concluir corretamente.";

const AJUDA_PERMISSOES_META_URL = montarWhatsappUrl(
  AJUDA_PERMISSOES_META_MENSAGEM
);

const THEME_STORAGE_KEY = "crm-theme";
const NOVA_INTEGRACAO_STORAGE_KEY = "crm_nova_integracao_whatsapp_pendente";

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

function getCoexSyncPresentation(job?: CoexSyncJob) {
  if (!job) {
    return {
      label: "Aguardando solicitação",
      detail: "A importação será preparada após a ativação do número.",
      tone: "pending" as const,
    };
  }

  const progress = Math.max(
    0,
    Math.min(
      100,
      Number(job.processamento_progresso ?? job.progresso ?? 0)
    )
  );

  if (job.status === "concluido") {
    return {
      label: "Importação concluída",
      detail:
        job.tipo === "history" && Number(job.itens_recebidos || 0) > 0
          ? `${Number(job.itens_processados || 0)} de ${Number(
              job.itens_recebidos || 0
            )} itens processados.`
          : "Os dados disponibilizados pela Meta foram recebidos.",
      tone: "done" as const,
    };
  }

  if (job.status === "recusado_usuario") {
    return {
      label: "Não compartilhado",
      detail:
        "O compartilhamento dos dados anteriores não foi autorizado no WhatsApp Business.",
      tone: "warning" as const,
    };
  }

  if (job.status === "erro") {
    return {
      label: "Importação indisponível",
      detail:
        job.erro_mensagem ||
        "A Meta não disponibilizou esta importação. A conexão ao vivo continua funcionando.",
      tone: "warning" as const,
    };
  }

  if (job.status === "processando") {
    return {
      label: `Importando${progress ? ` — ${progress}%` : ""}`,
      detail:
        "Os dados recebidos da Meta estão sendo processados em segundo plano.",
      tone: "pending" as const,
    };
  }

  return {
    label:
      job.status === "solicitado"
        ? "Solicitado à Meta"
        : "Preparando importação",
    detail:
      "A conexão já está ativa enquanto aguardamos o envio dos dados anteriores.",
    tone: "pending" as const,
  };
}

function CoexistenceSyncPanel({
  jobs,
  loaded,
  preparing,
  onPrepareMissing,
}: {
  jobs: CoexSyncJob[];
  loaded: boolean;
  preparing: boolean;
  onPrepareMissing: () => void;
}) {
  const contacts = jobs.find((job) => job.tipo === "contacts");
  const history = jobs.find((job) => job.tipo === "history");
  const items = [
    { key: "contacts", title: "Contatos", job: contacts },
    { key: "history", title: "Conversas anteriores", job: history },
  ];
  const hasWarning = jobs.some((job) =>
    ["erro", "recusado_usuario"].includes(job.status)
  );
  const hasMissingJob = loaded && (!contacts || !history);

  return (
    <section className={styles.coexSyncPanel}>
      <div className={styles.coexSyncHeader}>
        <div>
          <strong>Importação inicial</strong>
          <p>Este processo não bloqueia mensagens novas no CRM.</p>
        </div>
        <span className={styles.coexLiveBadge}>Conexão ao vivo ativa</span>
      </div>

      <div className={styles.coexSyncGrid}>
        {items.map((item) => {
          const presentation = getCoexSyncPresentation(item.job);

          return (
            <div
              key={item.key}
              className={`${styles.coexSyncCard} ${
                presentation.tone === "done"
                  ? styles.coexSyncCardDone
                  : presentation.tone === "warning"
                    ? styles.coexSyncCardWarning
                    : styles.coexSyncCardPending
              }`}
            >
              <span>{item.title}</span>
              <strong>{presentation.label}</strong>
              <p>{presentation.detail}</p>
            </div>
          );
        })}
      </div>

      {hasWarning && (
        <div className={styles.coexSyncNotice}>
          A falha acima afeta somente a importação de dados anteriores. O
          número permanece conectado para enviar e receber mensagens novas.
        </div>
      )}

      {hasMissingJob && (
        <div className={styles.coexSyncRecovery}>
          <p>
            Existe uma importação que ainda não foi preparada para este
            onboarding.
          </p>
          <button
            type="button"
            onClick={onPrepareMissing}
            disabled={preparing}
          >
            {preparing ? "Preparando..." : "Preparar importação pendente"}
          </button>
        </div>
      )}
    </section>
  );
}

function obterIndiceEtapaAtual(integracao: IntegracaoWhatsapp | null) {
  if (!integracao) return 0;

  const metaConectado = !!integracao.waba_id && !!integracao.phone_number_id;
  const numeroRegistrado =
    integracao.modo_integracao === "coexistence"
      ? integracao.is_on_biz_app === true &&
        String(integracao.platform_type || "").toUpperCase() ===
          "CLOUD_API" &&
        String(integracao.coex_status || "") === "ativo"
      : !!integracao.phone_registered;
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
  const [coexSyncJobs, setCoexSyncJobs] = useState<CoexSyncJob[]>([]);
  const [coexSyncCarregado, setCoexSyncCarregado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recarregando, setRecarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [conectandoMeta, setConectandoMeta] = useState(false);
  const [modalPinAberto, setModalPinAberto] = useState(false);
  const [pin, setPin] = useState("");
  const [registrandoNumero, setRegistrandoNumero] = useState(false);
  const [erroWebhook, setErroWebhook] = useState<string | null>(null);
  const [configurandoWebhook, setConfigurandoWebhook] = useState(false);
  const [selecionandoModo, setSelecionandoModo] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const integracaoIdParam = searchParams.get("integracao_id") || "";
  const fluxoNovoNumeroParam =
    searchParams.get("fluxo") === "novo-numero";
  const numeroValido =
    !!integracao?.numero && !integracao.numero.startsWith("pendente_");
  const [toastSucesso, setToastSucesso] = useState("");
  const [toastErro, setToastErro] = useState("");
  const [erroPin, setErroPin] = useState("");
  const [modalNovaIntegracaoAberto, setModalNovaIntegracaoAberto] =
    useState(false);
  const [novaIntegracaoWabaDiferente, setNovaIntegracaoWabaDiferente] =
    useState(false);

  const [etapaQuiz, setEtapaQuiz] = useState(0);
  const [nichos, setNichos] = useState<Nicho[]>([]);
  const [nichoSelecionadoId, setNichoSelecionadoId] = useState("");
  const [carregandoNichos, setCarregandoNichos] = useState(true);
  const [salvandoNicho, setSalvandoNicho] = useState(false);
  const [erroNicho, setErroNicho] = useState("");
  const [guiaMetaAberto, setGuiaMetaAberto] = useState(false);
  const [guiaMetaFechandoRapido, setGuiaMetaFechandoRapido] = useState(false);
  const [cuidadosMetaAbertos, setCuidadosMetaAbertos] = useState(false);
  const [perfilOnboarding, setPerfilOnboarding] =
    useState<PerfilOnboarding>({
      nomeUsuario: "usuário",
      nomeEmpresa: "sua empresa",
    });

  const [menuContaAberto, setMenuContaAberto] = useState(false);
  const [temaVisual, setTemaVisual] = useState<TemaVisual>("light");
  const onboardingMenuRef = useRef<HTMLDivElement | null>(null);
  const coexSyncPollingAtivo = coexSyncJobs.some((job) =>
    ["pendente", "solicitado", "processando"].includes(job.status)
  );

  const carregarSincronizacaoCoex = useCallback(
    async (integracaoId: string) => {
      try {
        const params = new URLSearchParams({
          integracao_id: integracaoId,
        });
        const response = await fetch(
          `/api/integracoes-whatsapp/status?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );
        const data = await response.json();

        if (!response.ok || !data.ok) return;
        setCoexSyncJobs(
          Array.isArray(data.coex_sync) ? data.coex_sync : []
        );
        setCoexSyncCarregado(true);
      } catch (error) {
        console.warn(
          "[CONFIGURAR AMBIENTE] Erro ao carregar sincronização Coex:",
          error
        );
      }
    },
    []
  );


  function recolherGuiaMeta() {
    setGuiaMetaFechandoRapido(false);
    setGuiaMetaAberto(false);
  }

  function fecharGuiaMetaRapido() {
    setGuiaMetaFechandoRapido(true);
    setGuiaMetaAberto(false);

    window.setTimeout(() => {
      setGuiaMetaFechandoRapido(false);
    }, 220);
  }

  function abrirGuiaMeta() {
    setGuiaMetaFechandoRapido(false);
    setGuiaMetaAberto(true);
  }

  function mostrarSucessoToast(mensagem: string) {
    setToastErro("");
    setToastSucesso(mensagem);
  }

  function mostrarErroToast(mensagem: string) {
    setToastSucesso("");
    setToastErro(mensagem);
  }

  function abrirAvisoNovaIntegracaoSeNecessario(
    integracaoConcluida: IntegracaoWhatsapp | null | undefined
  ) {
    if (!integracaoConcluida?.id || typeof window === "undefined") return;

    const bruto = window.localStorage.getItem(NOVA_INTEGRACAO_STORAGE_KEY);
    if (!bruto) return;

    try {
      const dados = JSON.parse(bruto) as NovaIntegracaoPendenteStorage;

      if (dados.integracao_id !== integracaoConcluida.id) return;

      const wabasAnteriores = new Set(
        (dados.wabas_anteriores || [])
          .map((wabaId) => String(wabaId || "").trim())
          .filter(Boolean)
      );
      const wabaAtual = String(integracaoConcluida.waba_id || "").trim();

      setNovaIntegracaoWabaDiferente(
        Boolean(wabaAtual && wabasAnteriores.size > 0 && !wabasAnteriores.has(wabaAtual))
      );
      setModalNovaIntegracaoAberto(true);
      window.localStorage.removeItem(NOVA_INTEGRACAO_STORAGE_KEY);
    } catch {
      window.localStorage.removeItem(NOVA_INTEGRACAO_STORAGE_KEY);
    }
  }

  function aplicarTemaVisual(tema: TemaVisual) {
    document.documentElement.dataset.theme = tema;
    document.documentElement.style.colorScheme = tema;
    window.localStorage.setItem(THEME_STORAGE_KEY, tema);
    setTemaVisual(tema);
  }

  function alternarTemaVisual() {
    aplicarTemaVisual(temaVisual === "dark" ? "light" : "dark");
  }

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

    const data = (await response.json()) as ApiResponse;

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
      body: JSON.stringify({
        ...dadosEmbeddedSignup,
        integracao_id: integracao?.id || integracaoIdParam || null,
      }),
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

      const params = new URLSearchParams();

      if (integracaoIdParam) {
        params.set("integracao_id", integracaoIdParam);
      }

      const urlIntegracao = `/api/integracoes-whatsapp${
        params.toString() ? `?${params}` : ""
      }`;

      let response = await fetch(urlIntegracao, {
        method: "GET",
        cache: "no-store",
      });

      let data: ApiResponse = await response.json();

      const conflitoDeCriacaoConcorrente =
        !response.ok &&
        String(data.error || "").includes(
          "integracoes_whatsapp_numero_key"
        );

      if (conflitoDeCriacaoConcorrente) {
        response = await fetch(urlIntegracao, {
          method: "GET",
          cache: "no-store",
        });
        data = await response.json();
      }

      if (!response.ok || !data.ok || !data.integracao) {
        throw new Error(data.error || "Erro ao carregar integração.");
      }

      let integracaoAtualizada = data.integracao;

      console.log("[CONFIGURAR AMBIENTE] Integração recebida da API:", integracaoAtualizada);

      const temToken = integracaoAtualizada.tem_token === true;

      const precisaBuscarDadosMeta =
        temToken &&
        (!integracaoAtualizada.waba_id || !integracaoAtualizada.phone_number_id);

      if (precisaBuscarDadosMeta) {
        try {
          await sincronizarDadosMeta(integracaoAtualizada.id);
        } catch (syncError) {
          console.warn("[CONFIGURAR AMBIENTE] Erro ao sincronizar Meta:", syncError);
        }

        const responseAtualizada = await fetch(urlIntegracao, {
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

      if (
        fluxoNovoNumeroParam ||
        Number(integracaoAtualizada.posicao || 1) > 1
      ) {
        const indiceAtual = obterIndiceEtapaAtual(integracaoAtualizada);
        const etapaSugerida = Math.min(
          4,
          Math.max(2, indiceAtual + 1)
        );

        setEtapaQuiz((etapaAtual) =>
          Math.max(etapaAtual, etapaSugerida)
        );
      }

      setIntegracao(integracaoAtualizada);
      if (integracaoAtualizada.modo_integracao === "coexistence") {
        setCoexSyncCarregado(false);
        await carregarSincronizacaoCoex(integracaoAtualizada.id);
      } else {
        setCoexSyncJobs([]);
        setCoexSyncCarregado(false);
      }
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

  async function selecionarModoIntegracao(
    modo: "cloud_api" | "coexistence"
  ) {
    if (!integracao?.id || selecionandoModo) return;

    try {
      setSelecionandoModo(true);
      const response = await fetch("/api/integracoes-whatsapp", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integracao_id: integracao.id,
          modo_integracao: modo,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok || !data.integracao) {
        throw new Error(
          data.error || "Não foi possível salvar o modo de integração."
        );
      }

      setIntegracao(data.integracao);
      setCoexSyncJobs([]);
      setCoexSyncCarregado(false);
      mostrarSucessoToast(
        modo === "coexistence"
          ? "Modo WhatsApp Business + CRM selecionado."
          : "Modo Cloud API exclusiva selecionado."
      );
    } catch (error) {
      mostrarErroToast(
        error instanceof Error
          ? error.message
          : "Erro ao selecionar o modo de integração."
      );
    } finally {
      setSelecionandoModo(false);
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

    if (!integracao.modo_integracao_escolhido_em) {
      throw new Error(
        "Escolha como deseja usar o WhatsApp antes de conectar com a Meta."
      );
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

    const aguardarDadosEmbeddedSignup = async () => {
      const inicio = Date.now();

      while (!dadosEmbeddedSignup && Date.now() - inicio < 8000) {
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }

      return dadosEmbeddedSignup;
    };

    const onMessage = (event: MessageEvent) => {
      let eventHostname = "";
      try {
        eventHostname = new URL(event.origin).hostname.toLowerCase();
      } catch {
        return;
      }

      const origemMetaValida =
        eventHostname === "facebook.com" ||
        eventHostname.endsWith(".facebook.com") ||
        eventHostname === "meta.com" ||
        eventHostname.endsWith(".meta.com");

      if (!origemMetaValida) {
        return;
      }

      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;

        console.log("[META EVENT RECEBIDO]", data);

        if (data?.type !== "WA_EMBEDDED_SIGNUP") {
          return;
        }

        if (
          data.event === "FINISH" ||
          data.event === "FINISH_ONLY_WABA" ||
          data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
        ) {
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
          mostrarErroToast("A Meta não retornou o código de autorização.");
          return;
        }

        const code = response.authResponse.code;

        setTimeout(async () => {
          try {
            if (integracao.modo_integracao === "coexistence") {
              await aguardarDadosEmbeddedSignup();
            }
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
            setEtapaQuiz(2);
            mostrarSucessoToast("Conta Meta conectada com sucesso.");
          } catch (error) {
            console.error("[EMBEDDED SIGNUP CALLBACK ERROR]", error);

            mostrarErroToast(
              error instanceof Error
                ? error.message
                : "Erro ao finalizar conexão com a Meta."
            );
          } finally {
            setConectandoMeta(false);
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
          ...(integracao.modo_integracao === "coexistence"
            ? {
                version: "v3",
                setup: {},
                featureType:
                  "whatsapp_business_app_onboarding",
              }
            : {
                sessionInfoVersion: "3",
              }),
        },
      }
    );
  } catch (error) {
    setConectandoMeta(false);

    mostrarErroToast(
      error instanceof Error
        ? error.message
        : "Erro ao abrir a configuração da Meta."
    );
  }
}


async function handleRegistrarNumero(pinInformado?: string) {
  setErroPin("");
  try {
    if (!integracao?.id) {
      mostrarErroToast("Integração ainda não carregada.");
      return;
    }

    if (pinInformado && !/^\d{6}$/.test(pinInformado)) {
      const mensagem = "O PIN deve conter exatamente 6 dígitos.";

      setErroPin(mensagem);
      mostrarErroToast(mensagem);
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
      const mensagemMeta =
        data?.meta_response?.error?.message ||
        data?.meta_response?.error?.error_data?.details ||
        "";

      const erroParecePinIncorreto =
        data?.pin_incorreto === true ||
        String(data?.meta_response?.error?.code) === "133005" ||
        mensagemMeta.toLowerCase().includes("pin mismatch") ||
        mensagemMeta.toLowerCase().includes("pin incorreto") ||
        mensagemMeta.toLowerCase().includes("incompatibilidade de pin");

      const erroMuitasTentativas =
        data?.muitas_tentativas === true ||
        String(data?.meta_response?.error?.code) === "133016" ||
        mensagemMeta.toLowerCase().includes("too many attempts") ||
        mensagemMeta.toLowerCase().includes("muitas tentativas") ||
        mensagemMeta.toLowerCase().includes("limite de volume");

      const mensagemErro = erroParecePinIncorreto
        ? "PIN incorreto. Verifique o PIN de verificação em duas etapas e tente novamente."
        : erroMuitasTentativas
        ? "Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente com este número."
        : data?.error || "Erro ao registrar o número de telefone.";

      setErroPin(mensagemErro);
      mostrarErroToast(mensagemErro);
      setModalPinAberto(true);

      return;
    }

    setModalPinAberto(false);
    setPin("");
    setErroPin("");

    mostrarSucessoToast("Número ativado com sucesso.");

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
    const mensagemErro =
      error instanceof Error
        ? error.message
        : "Erro inesperado ao ativar o número.";

    setErroPin(mensagemErro);
    mostrarErroToast(mensagemErro);

    if (pinInformado) {
      setModalPinAberto(true);
    }
  } finally {
    setRegistrandoNumero(false);
  }
}

async function handleAtivarCoexistencia() {
  try {
    if (!integracao?.id) {
      mostrarErroToast("Integração ainda não carregada.");
      return;
    }

    setRegistrandoNumero(true);
    const response = await fetch(
      "/api/integracoes-whatsapp/coexistence/activate",
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
    const data = (await response.json()) as CoexActivationResponse;

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error ||
          "Não foi possível ativar o uso simultâneo do WhatsApp."
      );
    }

    if (data.integracao) {
      setIntegracao(data.integracao);
    }

    if (Array.isArray(data.sync?.jobs)) {
      setCoexSyncJobs(data.sync.jobs);
      setCoexSyncCarregado(true);
    }

    const possuiAvisos = Boolean(data.sync?.warnings?.length);
    mostrarSucessoToast(
      possuiAvisos
        ? "Coexistência ativada. As mensagens novas estão disponíveis; confira o status da importação inicial."
        : "Coexistência ativada. Contatos e histórico foram solicitados à Meta."
    );
    await carregarIntegracao(false);
    // Mantém o usuário nesta etapa para que ele veja os avisos e o status
    // individual das importações antes de avançar manualmente.
    setEtapaQuiz(3);
  } catch (error) {
    mostrarErroToast(
      error instanceof Error
        ? error.message
        : "Erro ao ativar a Coexistência."
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
      const mensagemOriginal = data.error || "Erro ao configurar webhook.";

      const mensagemErro = `Não foi possível concluir a assinatura do webhook porque o app ainda precisa de permissões avançadas da Meta. Permissão necessária: whatsapp_business_management. Resposta original da API: ${mensagemOriginal}`;

      setErroWebhook(mensagemErro);
      mostrarErroToast("Não foi possível configurar o webhook.");

      return;
    }

    setErroWebhook(null);
    mostrarSucessoToast("Webhook configurado com sucesso.");
    await carregarIntegracao(false);
  } catch (error) {
    const mensagemErro =
      error instanceof Error
        ? `Não foi possível concluir a assinatura do webhook. Permissão necessária: whatsapp_business_management. Erro original: ${error.message}`
        : "Não foi possível concluir a assinatura do webhook. Permissão necessária: whatsapp_business_management.";

    setErroWebhook(mensagemErro);
    mostrarErroToast("Não foi possível configurar o webhook.");
  } finally {
    setConfigurandoWebhook(false);
  }
}


async function handleConcluirConfiguracao() {
  try {
    if (!integracao?.id) {
      mostrarErroToast("Integração ainda não carregada.");
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

    if (data.integracao) {
      setIntegracao(data.integracao);
    }

    abrirAvisoNovaIntegracaoSeNecessario(data.integracao || integracao);

    window.sessionStorage.setItem("crm_ambiente_configurado", "true");
    window.dispatchEvent(new Event("crm_ambiente_configurado"));

    mostrarSucessoToast("Configuração concluída com sucesso.");
    await carregarIntegracao(false);
  } catch (error) {
    mostrarErroToast(
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

async function carregarNichos() {
  try {
    setCarregandoNichos(true);
    setErroNicho("");

    const response = await fetch("/api/configuracoes/nicho", {
      method: "GET",
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Erro ao carregar os segmentos.");
    }

    setNichos(data.nichos || []);
  } catch (error) {
    setErroNicho(
      error instanceof Error
        ? error.message
        : "Erro ao carregar os segmentos."
    );
  } finally {
    setCarregandoNichos(false);
  }
}

async function salvarNichoEAvancar() {
  if (!nichoSelecionadoId) return;

  try {
    setSalvandoNicho(true);
    setErroNicho("");

    const response = await fetch("/api/configuracoes/nicho", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nicho_id: nichoSelecionadoId }),
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Erro ao salvar o segmento.");
    }

    mostrarSucessoToast("Segmento configurado com sucesso.");
    setEtapaQuiz(2);
    router.refresh();
  } catch (error) {
    const mensagem =
      error instanceof Error
        ? error.message
        : "Erro ao salvar o segmento.";

    setErroNicho(mensagem);
    mostrarErroToast(mensagem);
  } finally {
    setSalvandoNicho(false);
  }
}

  useEffect(() => {
    carregarPerfilOnboarding();
    carregarNichos();
    carregarIntegracao(true);
  }, []);

  useEffect(() => {
    if (
      !integracao?.id ||
      integracao.modo_integracao !== "coexistence" ||
      !coexSyncPollingAtivo
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void carregarSincronizacaoCoex(integracao.id);
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    carregarSincronizacaoCoex,
    coexSyncPollingAtivo,
    integracao?.id,
    integracao?.modo_integracao,
  ]);

  useEffect(() => {
    function receberCallbackMeta(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;

      if (event.data?.source !== "crm-prosperity-meta-callback") return;

      if (event.data?.ok) {
        carregarIntegracao(false);
        setEtapaQuiz(2);
        return;
      }

      if (event.data?.error) {
        mostrarErroToast(event.data.error);
      }
    }

    window.addEventListener("message", receberCallbackMeta);

    return () => {
      window.removeEventListener("message", receberCallbackMeta);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toastSucesso && !toastErro) return;

    const timeout = window.setTimeout(() => {
      setToastSucesso("");
      setToastErro("");
    }, 8000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [toastSucesso, toastErro]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    if (etapaQuiz === 2) {
      timeout = setTimeout(() => {
        setGuiaMetaAberto(true);
      }, 250);
    } else {
      setGuiaMetaAberto(false);
      setCuidadosMetaAbertos(false);
    }

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [etapaQuiz]);

  useEffect(() => {
    const temaAtual =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";

    setTemaVisual(temaAtual);
  }, []);

  useEffect(() => {
    function fecharMenuAoClicarFora(event: MouseEvent) {
      const target = event.target as Node;

      if (
        onboardingMenuRef.current &&
        !onboardingMenuRef.current.contains(target)
      ) {
        setMenuContaAberto(false);
      }
    }

    document.addEventListener("mousedown", fecharMenuAoClicarFora);

    return () => {
      document.removeEventListener("mousedown", fecharMenuAoClicarFora);
    };
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
  const modoCoexistencia =
    integracao?.modo_integracao === "coexistence";
  const fluxoNumeroAdicional =
    fluxoNovoNumeroParam || Number(integracao?.posicao || 1) > 1;
  const modoIntegracaoEscolhido =
    !!integracao?.modo_integracao_escolhido_em;
  const numeroRegistrado = modoCoexistencia
    ? integracao?.is_on_biz_app === true &&
      String(integracao?.platform_type || "").toUpperCase() ===
        "CLOUD_API" &&
      String(integracao?.coex_status || "") === "ativo"
    : !!integracao?.phone_registered;
  const webhookConfigurado =
    !!integracao?.webhook_verificado && !!integracao?.app_assigned;

  const ambienteConcluido =
    integracao?.status === "ativa" &&
    integracao?.onboarding_etapa === "concluido" &&
    integracao?.onboarding_status === "concluido" &&
    numeroRegistrado &&
    webhookConfigurado;

  const totalEtapasQuiz = fluxoNumeroAdicional ? 3 : 4;
  const etapaVisualQuiz = fluxoNumeroAdicional
    ? Math.max(1, etapaQuiz - 1)
    : etapaQuiz;
  const progressoQuiz = Math.round(
    (etapaVisualQuiz / totalEtapasQuiz) * 100
  );

  function avancarEtapaQuiz() {
    setEtapaQuiz((etapaAtual) => Math.min(etapaAtual + 1, 4));
  }

  function voltarEtapaQuiz() {
    if (fluxoNumeroAdicional && etapaQuiz <= 2) {
      router.push("/configuracoes/whatsapp/perfil");
      return;
    }

    setEtapaQuiz((etapaAtual) =>
      Math.max(etapaAtual - 1, fluxoNumeroAdicional ? 2 : 0)
    );
  }
  
  const textoBotaoAtualizarStatus =
  etapaQuiz === 2
    ? "Verificar conexão"
    : etapaQuiz === 3
    ? "Verificar número"
    : etapaQuiz === 4
    ? fluxoNumeroAdicional
      ? "Verificar webhook"
      : "Verificar ambiente"
    : "Atualizar status";

  const nomeConta = perfilOnboarding.nomeUsuario || "Usuário";
  const letraConta = nomeConta.trim().charAt(0).toUpperCase() || "U";

  const temaEscuroAtivo = temaVisual === "dark";
  const temaBotaoLabel = temaEscuroAtivo ? "Tema claro" : "Tema escuro";
  const temaBotaoStatus = temaEscuroAtivo ? "Escuro" : "Claro";

return (
  <main className={styles.page}>
    <FeedbackToast
      success={toastSucesso}
      error={toastErro}
      onSuccessDismiss={() => setToastSucesso("")}
      onErrorDismiss={() => setToastErro("")}
    />

    <div className={styles.onboardingTopActions} ref={onboardingMenuRef}>
      <div className={styles.onboardingAccountMenu}>
        <button
          type="button"
          className={styles.onboardingAvatarButton}
          onClick={() => setMenuContaAberto((aberto) => !aberto)}
          aria-expanded={menuContaAberto}
          aria-label="Abrir menu da conta"
        >
          <span className={styles.onboardingAvatar}>{letraConta}</span>
          <span className={styles.onboardingAccountName}>{nomeConta}</span>
          <span className={styles.onboardingChevron}>
            {menuContaAberto ? "▴" : "▾"}
          </span>
        </button>

        {menuContaAberto && (
          <div className={styles.onboardingDropdown}>
            <Link
              href="/perfil"
              className={styles.onboardingDropdownItem}
              onClick={() => setMenuContaAberto(false)}
            >
              Meu perfil
            </Link>

            <a
              href={AJUDA_WHATSAPP_URL}
              className={styles.onboardingDropdownItem}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuContaAberto(false)}
            >
              Ajuda
            </a>

            <button
              type="button"
              className={`${styles.onboardingDropdownItem} ${styles.onboardingThemeButton}`}
              onClick={alternarTemaVisual}
              aria-pressed={temaEscuroAtivo}
            >
              <span className={styles.onboardingThemeMain}>
                <span className={styles.onboardingThemeIcon}>
                  {temaEscuroAtivo ? (
                    <Sun size={16} strokeWidth={2.2} />
                  ) : (
                    <Moon size={16} strokeWidth={2.2} />
                  )}
                </span>

                <span>{temaBotaoLabel}</span>
              </span>

              <span className={styles.onboardingThemeBadge}>
                {temaBotaoStatus}
              </span>
            </button>

            <div className={styles.onboardingDropdownDivider} />

            <div className={styles.onboardingLogout}>
              <LogoutButton />
            </div>
          </div>
        )}
      </div>
    </div>

    <div className={styles.container}>

        {loading ? (
          <section className={styles.loadingCard}>
            <div className={styles.spinner} />
            <div>
              <h2 className={styles.loadingTitle}>
                {fluxoNovoNumeroParam
                  ? "Preparando o novo número"
                  : "Preparando sua configuração"}
              </h2>
              <p className={styles.loadingText}>
                {fluxoNovoNumeroParam
                  ? "Estamos carregando a nova integração sem alterar as configurações gerais da empresa."
                  : "Estamos verificando se sua empresa já possui uma integração criada."}
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
                    {fluxoNumeroAdicional
                      ? "Adicionar número"
                      : "Configuração guiada"}
                  </span>

                  <h2 className={styles.quizTitle}>
                    {etapaQuiz === 0 &&
                      "Configuração do ambiente oficial do WhatsApp"}
                    {etapaQuiz === 1 && "Segmento da empresa"}
                    {etapaQuiz === 2 &&
                      (fluxoNumeroAdicional
                        ? "Conectar novo número do WhatsApp"
                        : "Conectar conta Meta")}
                    {etapaQuiz === 3 &&
                      (fluxoNumeroAdicional
                        ? "Ativar novo número do WhatsApp"
                        : modoCoexistencia
                        ? "Ativar WhatsApp Business + CRM"
                        : "Ativar número do WhatsApp")}
                    {etapaQuiz === 4 &&
                      (fluxoNumeroAdicional
                        ? "Finalizar novo número"
                        : "Finalizar ambiente oficial")}
                  </h2>
                </div>

                {etapaQuiz > 1 && (
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
                      : `Etapa ${etapaVisualQuiz} de ${totalEtapasQuiz}`}
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

              {!fluxoNumeroAdicional && etapaQuiz === 0 && (
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
                    Em poucos passos, você vai selecionar o segmento da empresa,
                    conectar a conta Meta, ativar o número oficial do WhatsApp e
                    concluir a configuração do ambiente.
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

              {!fluxoNumeroAdicional && etapaQuiz === 1 && (
                <div className={styles.quizContent}>
                  <div className={styles.quizStatusIcon}>1</div>

                  <h3 className={styles.quizHeadline}>
                    Qual é o segmento de atuação da sua empresa?
                  </h3>

                  <p className={styles.quizText}>
                    O sistema será configurado com os recursos mais adequados
                    para esse segmento.
                  </p>

                  <div className={styles.nichoSelectField}>
                    <label htmlFor="nicho-onboarding">Segmento de atuação</label>
                    <select
                      id="nicho-onboarding"
                      value={nichoSelecionadoId}
                      onChange={(event) => {
                        setNichoSelecionadoId(event.target.value);
                        setErroNicho("");
                      }}
                      disabled={carregandoNichos || salvandoNicho}
                    >
                      <option value="">
                        {carregandoNichos
                          ? "Carregando segmentos..."
                          : "Selecionar segmento"}
                      </option>
                      {nichos.map((nicho) => (
                        <option key={nicho.id} value={nicho.id}>
                          {nicho.nome}
                        </option>
                      ))}
                    </select>

                    {erroNicho && (
                      <p className={styles.nichoSelectError}>{erroNicho}</p>
                    )}
                  </div>

                  <div className={styles.quizActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={voltarEtapaQuiz}
                      disabled={salvandoNicho}
                    >
                      Voltar
                    </button>

                    <button
                      type="button"
                      className={
                        nichoSelecionadoId
                          ? styles.primaryButton
                          : styles.disabledButton
                      }
                      onClick={salvarNichoEAvancar}
                      disabled={
                        !nichoSelecionadoId ||
                        carregandoNichos ||
                        salvandoNicho
                      }
                    >
                      {salvandoNicho ? "Salvando..." : "Avançar"}
                    </button>
                  </div>
                </div>
              )}

              {etapaQuiz === 2 && (
                <div className={styles.quizContent}>
                  <div className={styles.quizStepHeadingRow}>
                    <div
                      className={`${styles.quizStatusIcon} ${
                        metaConectado ? styles.quizStatusDone : ""
                      }`}
                    >
                      {metaConectado ? "✓" : etapaVisualQuiz}
                    </div>

                    <h3 className={styles.quizHeadline}>
                      {fluxoNumeroAdicional
                        ? "Conecte a conta Meta do novo número"
                        : "Conecte sua conta empresarial da Meta"}
                    </h3>
                  </div>

                  <p className={styles.quizText}>
                    {fluxoNumeroAdicional
                      ? "O segmento e as configurações gerais da empresa serão mantidos. Agora escolha como o novo número será usado e conecte a conta Meta responsável por ele."
                      : "Nesta etapa, vamos conectar o CRM à sua conta Meta para configurar o WhatsApp Business da sua empresa com segurança. Os dados técnicos da integração serão identificados automaticamente."}
                  </p>

                  <div className={styles.integrationModeGrid}>
                    <button
                      type="button"
                      className={`${styles.integrationModeCard} ${
                        modoIntegracaoEscolhido && !modoCoexistencia
                          ? styles.integrationModeCardSelected
                          : ""
                      }`}
                      onClick={() =>
                        selecionarModoIntegracao("cloud_api")
                      }
                      disabled={metaConectado || selecionandoModo}
                    >
                      <h1>Cloud API</h1>
                      <strong>Conectar somente no CRM</strong>
                      <span>
                        Para número novo ou operação somente pelo CRM.
                        O número não continuará ativo no aplicativo Whatsapp.                        .
                      </span>
                    </button>

                    <button
                      type="button"
                      className={`${styles.integrationModeCard} ${
                        modoIntegracaoEscolhido && modoCoexistencia
                          ? styles.integrationModeCardSelected
                          : ""
                      }`}
                      onClick={() =>
                        selecionarModoIntegracao("coexistence")
                      }
                      disabled={metaConectado || selecionandoModo}
                    >
                      <h1>Coexistência</h1>
                      <strong>Conectar no CRM e no app WhatsApp</strong>
                      <span>
                        Para quem já usa o número no aplicativo WhatsApp Business e quer 
                        continuar usando no celular, junto com o CRM.
                      </span>
                    </button>
                  </div>

                  {modoIntegracaoEscolhido && modoCoexistencia && (
                    <div className={styles.pinInfoBox}>
                      <strong>Pré-requisitos da Coexistência</strong>
                      <p>
                        O número continuará disponível no WhatsApp Business App e 
                        também será conectado ao CRM. A Meta verificará se o número é 
                        elegível.
                      </p>
                    </div>
                  )}

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

                    {!guiaMetaAberto && (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => setGuiaMetaAberto(true)}
                      >
                        Ver guia de conexão
                      </button>
                    )}

                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={iniciarEmbeddedSignup}
                      disabled={
                        conectandoMeta ||
                        selecionandoModo ||
                        !modoIntegracaoEscolhido
                      }
                    >
                      {conectandoMeta
                        ? "Abrindo Meta..."
                        : metaConectado
                        ? "Reconectar com a Meta"
                        : modoCoexistencia
                        ? "Conectar WhatsApp Business"
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

              {etapaQuiz === 3 && (
                <div className={styles.quizContent}>
                  <div
                    className={`${styles.quizStatusIcon} ${
                      numeroRegistrado ? styles.quizStatusDone : ""
                    }`}
                  >
                    {numeroRegistrado ? "✓" : etapaVisualQuiz}
                  </div>

                  <h3 className={styles.quizHeadline}>
                    {modoCoexistencia
                      ? "Confirme o uso simultâneo do número"
                      : "Ative o número oficial do WhatsApp"}
                  </h3>

                  <p className={styles.quizText}>
                    {modoCoexistencia
                      ? "Vamos validar o vínculo com o WhatsApp Business App, configurar o webhook e solicitar uma única vez a importação dos dados anteriores. Essa importação não bloqueia mensagens novas."
                      : "Agora vamos concluir o registro técnico do número para que ele possa enviar e receber mensagens pela Cloud API oficial."}
                  </p>

                  {!modoCoexistencia && (
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
                  )}
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
                        {numeroRegistrado
                          ? modoCoexistencia
                            ? "Coexistência ativa"
                            : "Número ativado"
                          : "Aguardando ativação"}
                      </strong>
                    </div>

                    {numeroRegistrado && <div className={styles.quizCheckIcon}>✓</div>}
                  </div>

                  {modoCoexistencia && numeroRegistrado && (
                    <CoexistenceSyncPanel
                      jobs={coexSyncJobs}
                      loaded={coexSyncCarregado}
                      preparing={registrandoNumero}
                      onPrepareMissing={() => {
                        void handleAtivarCoexistencia();
                      }}
                    />
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
                        metaConectado
                          ? styles.primaryButton
                          : styles.disabledButton
                      }
                      onClick={() => {
                        if (modoCoexistencia) {
                          void handleAtivarCoexistencia();
                          return;
                        }

                        setErroPin("");
                        setModalPinAberto(true);
                      }}
                      disabled={
                        !metaConectado ||
                        registrandoNumero ||
                        numeroRegistrado
                      }
                    >
                      {registrandoNumero
                        ? "Ativando..."
                        : numeroRegistrado
                        ? "Número já ativado"
                        : modoCoexistencia
                        ? "Ativar Coexistência"
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

              {etapaQuiz === 4 && (
                <div className={styles.quizContent}>
                  <div className={styles.quizStatusRow}>
                    <div
                      className={`${styles.quizStatusIcon} ${
                        ambienteConcluido ? styles.quizStatusDone : ""
                      }`}
                    >
                      {ambienteConcluido ? "✓" : etapaVisualQuiz}
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
                        {modoCoexistencia
                          ? "Revise a conexão e conclua a ativação"
                          : fluxoNumeroAdicional
                          ? "Configure o webhook e finalize o novo número"
                          : "Configure o webhook e conclua a ativação"}
                      </h3>

                      <p className={styles.quizText}>
                        {modoCoexistencia
                          ? "A conexão ao vivo e o webhook já estão configurados. A importação de contatos e conversas anteriores continuará separadamente, sem impedir a conclusão."
                          : fluxoNumeroAdicional
                          ? "O webhook permite que o CRM receba as mensagens e os eventos deste número em tempo real. Essa configuração não altera o segmento nem as preferências gerais da empresa."
                          : "O webhook permite que o CRM receba mensagens, status e eventos do WhatsApp em tempo real. Depois disso, basta concluir a configuração do ambiente."}
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
                            <span>
                              {fluxoNumeroAdicional
                                ? "Nova integração"
                                : "Ambiente"}
                            </span>
                            <strong>{ambienteConcluido ? "Concluído" : "Pendente"}</strong>
                          </div>

                          {ambienteConcluido && <div className={styles.quizCheckIcon}>✓</div>}
                        </div>
                      </div>

                      {modoCoexistencia && (
                        <CoexistenceSyncPanel
                          jobs={coexSyncJobs}
                          loaded={coexSyncCarregado}
                          preparing={registrandoNumero}
                          onPrepareMissing={() => {
                            void handleAtivarCoexistencia();
                          }}
                        />
                      )}

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
                          disabled={
                            !numeroRegistrado ||
                            configurandoWebhook ||
                            webhookConfigurado
                          }
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
                          {fluxoNumeroAdicional
                            ? "Concluir novo número"
                            : "Concluir configuração"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className={styles.quizHeadline}>
                        {fluxoNumeroAdicional
                          ? `Tudo certo ${perfilOnboarding.nomeUsuario}! O novo número está conectado.`
                          : `Tudo certo ${perfilOnboarding.nomeUsuario}! O ambiente oficial do WhatsApp está ativo.`}
                      </h3>

                      <p className={styles.quizText}>
                        {fluxoNumeroAdicional ? (
                          <>
                            A nova integração foi adicionada à{" "}
                            <strong>{perfilOnboarding.nomeEmpresa}</strong> sem
                            alterar o segmento ou as configurações gerais já
                            existentes.
                          </>
                        ) : (
                          <>
                            A integração da{" "}
                            <strong>{perfilOnboarding.nomeEmpresa}</strong> foi
                            concluída com sucesso. Agora você pode personalizar
                            as permissões, políticas e regras internas da
                            empresa.
                          </>
                        )}
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

                      {modoCoexistencia && (
                        <CoexistenceSyncPanel
                          jobs={coexSyncJobs}
                          loaded={coexSyncCarregado}
                          preparing={registrandoNumero}
                          onPrepareMissing={() => {
                            void handleAtivarCoexistencia();
                          }}
                        />
                      )}

                      <p className={styles.quizTextfim}>
                        {fluxoNumeroAdicional
                          ? "Você já pode gerenciar o novo número junto com as demais integrações."
                          : "Deseja personalizar agora as políticas da empresa?"}
                      </p>

                      <div className={styles.quizActions}>
                        {!fluxoNumeroAdicional && (
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={voltarEtapaQuiz}
                          >
                            Voltar
                          </button>
                        )}

                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() =>
                            router.push(
                              fluxoNumeroAdicional
                                ? "/configuracoes/whatsapp/perfil"
                                : "/configuracoes/permissoes"
                            )
                          }
                        >
                          {fluxoNumeroAdicional
                            ? "Gerenciar números"
                            : "Avançar"}
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

      {modalNovaIntegracaoAberto && (
        <div
          className={styles.modalOverlay}
          onClick={() => setModalNovaIntegracaoAberto(false)}
        >
          <div
            className={`${styles.modalCard} ${styles.novaIntegracaoModal}`}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-nova-integracao"
          >
            <div className={styles.novaIntegracaoHeader}>
              <div>
                <span>WhatsApp conectado</span>
                <h2 id="titulo-nova-integracao">Novo número cadastrado</h2>
                <p>
                  O ambiente agora pode receber conversas e executar fluxos por
                  mais de uma integração.
                </p>
              </div>

              <button
                type="button"
                className={styles.novaIntegracaoClose}
                onClick={() => setModalNovaIntegracaoAberto(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.novaIntegracaoGrid}>
              <div>
                <strong>Conversas omnichannel</strong>
                <p>
                  As conversas dos números liberados aparecem juntas, mantendo a
                  identificação visual por integração.
                </p>
              </div>

              <div>
                <strong>Fluxos continuam ativos</strong>
                <p>
                  Fluxos configurados para todas as integrações seguem
                  funcionando também para o novo número.
                </p>
              </div>

              <div className={novaIntegracaoWabaDiferente ? styles.novaIntegracaoWarning : ""}>
                <strong>Templates por WABA</strong>
                <p>
                  {novaIntegracaoWabaDiferente
                    ? "A nova WABA precisa de templates próprios nos blocos Agendar disparo."
                    : "Se futuramente usar outra WABA, revise templates dos blocos Agendar disparo."}
                </p>
              </div>
            </div>

            <div className={styles.novaIntegracaoActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setModalNovaIntegracaoAberto(false)}
              >
                Entendi
              </button>

              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => router.push("/fluxos")}
              >
                Revisar fluxos
              </button>
            </div>
          </div>
        </div>
      )}

      <aside
        className={`${styles.metaGuideDrawer} ${
          guiaMetaAberto ? styles.metaGuideDrawerOpen : ""
        } ${guiaMetaFechandoRapido ? styles.metaGuideDrawerFastClose : ""}`}
        aria-hidden={!guiaMetaAberto}
        aria-label="Guia de conexão Meta"
      >

      <button
        type="button"
        className={styles.metaGuideEdgeButton}
        onClick={recolherGuiaMeta}
        aria-label="Recolher guia de ajuda"
        title="Recolher guia"
      >
        ›
      </button>
        
        <div className={styles.metaGuideScroll}>
          <div className={styles.metaGuideHeader}>
            <div>
              <span className={styles.metaGuideEyebrow}>Orientações</span>
              <h2>Guia de conexão Meta</h2>
            </div>

            <button
              type="button"
              className={styles.metaGuideClose}
              onClick={fecharGuiaMetaRapido}
              aria-label="Fechar guia rapidamente"
            >
              ×
            </button>
          </div>

          <p className={styles.metaGuideIntro}>
            Acompanhe este guia enquanto conclui a conexão na janela da Meta.
          </p>

          <ol className={styles.metaGuideSteps}>
            <li className={styles.metaGuideStep}>
              <span className={styles.metaGuideStepNumber}>1</span>
              <div>
                <strong>Avance na Meta</strong>
                <p>Clique em Continuar e siga as etapas exibidas.</p>
              </div>
            </li>

            <li className={styles.metaGuideStep}>
              <span className={styles.metaGuideStepNumber}>2</span>
              <div>
                <strong>Ativos de negócio</strong>
                <p>
                  Selecione o portfólio empresarial e a conta do WhatsApp
                  Business corretos.
                </p>
              </div>
            </li>

            <li className={styles.metaGuideStep}>
              <span className={styles.metaGuideStepNumber}>3</span>
              <div>
                <strong>Dados da empresa</strong>
                <p>Confira nome, categoria, site, país e fuso horário.</p>
              </div>
            </li>

            <li
              className={`${styles.metaGuideStep} ${styles.metaGuideStepAlert}`}
            >
              <span className={styles.metaGuideAlertIcon}>
                <AlertTriangle size={18} strokeWidth={2.4} />
              </span>
              <div>
                <strong>4. Número do WhatsApp</strong>
                <p>
                  Escolha <b>Adicionar um novo número</b> para usar o WhatsApp no
                  CRM.
                </p>
                <p className={styles.metaGuideImportant}>
                  <b>Importante:</b> o número não pode estar ativo no aplicativo
                  WhatsApp/WhatsApp Business nem conectado a outro CRM.
                </p>
              </div>
            </li>
          </ol>

          <div className={styles.metaGuideCare}>
              <div className={styles.metaGuideCareContent}>
                <h3>Cuidados antes de validar</h3>
                <p>Antes de solicitar o código, confira:</p>
                <ul>
                  <li>DDI e DDD do telefone.</li>
                  <li>Se o número recebe SMS ou ligação.</li>
                  <li>Se o número não está em uso no WhatsApp.</li>
                  <li>Se o número não está conectado a outro CRM.</li>
                </ul>
                <p>
                  A Meta limita as tentativas de envio do código por SMS.
                  Solicitações repetidas podem bloquear temporariamente novos
                  envios, podendo levar horas para liberar.
                </p>
                <strong>
                  Solicite o código apenas quando tiver certeza de que está tudo
                  correto.
                </strong>
              </div>
          </div>

          <a
            href={AJUDA_PERMISSOES_META_URL}
            className={styles.metaGuideWhatsappButton}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className={styles.metaGuideWhatsappIcon}>?</span>

            <div>
              <strong>Precisa de ajuda nessa etapa?</strong>
              <p>Fale com o suporte para revisar as permissões da Meta.</p>
            </div>
          </a>
        </div>
      </aside>

      {etapaQuiz === 2 && !guiaMetaAberto && (
        <button
          type="button"
          className={styles.metaGuideCollapsedBadge}
          onClick={abrirGuiaMeta}
          aria-label="Abrir guia de ajuda"
        >
          <span>Ajuda</span>
          <strong>‹</strong>
        </button>
      )}

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
                setErroPin("");

                const somenteNumeros = e.target.value.replace(/\D/g, "").slice(0, 6);
                setPin(somenteNumeros);
              }}
              placeholder="Digite o PIN de 6 dígitos"
            />

            {erroPin && (
              <div className={styles.modalPinError}>
                {erroPin}
              </div>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setModalPinAberto(false);
                  setPin("");
                  setErroPin("");
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
