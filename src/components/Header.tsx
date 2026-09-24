"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Moon,
  Smartphone,
  Sparkles,
  Sun,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import PaymentGatewayModal from "@/components/PaymentGatewayModal";
import { useHeaderUser } from "@/components/header-user-context";
import { useHeaderSummary } from "@/components/header-summary-context";
import { montarWhatsappUrl } from "@/lib/contatos/sistema";
import styles from "./Header.module.css";
import { createPortal } from "react-dom";

type HeaderProps = {
  title: string;
  subtitle?: string;
  profileName?: string;
  creditLabel?: string;
  avatarUrl?: string;
  mobileBackHref?: string;
  mobileBackLabel?: string;
};

type Notificacao = {
  id: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  conversa_id: string | null;
  created_at: string;
  metadata_json?: Record<string, unknown>;
};

type SaldoTokensIa = {
  limite_mensal: number | null;
  tokens_usados: number;
  tokens_restantes: number | null;
  saldo_mensal_restante: number | null;
  saldo_avulso_restante: number;
  periodo_inicio?: string;
};

type PlanoRenovacaoSlug = "basico" | "essencial";

type PlanoRenovacao =
  | {
      tipo: "checkout";
      slug: PlanoRenovacaoSlug;
      nome: string;
      badge: string;
      descricao: string;
      precoOriginal?: string;
      preco: string;
      observacao: string;
      recursos: string[];
    }
  | {
      tipo: "cotacao";
      nome: string;
      badge: string;
      descricao: string;
      preco: string;
      observacao: string;
      recursos: string[];
    };

type PlanoCheckout = Extract<PlanoRenovacao, { tipo: "checkout" }>;
type TemaVisual = "light" | "dark";

type AssinaturaResumo = {
  subscription: {
    id: string | null;
    status: string;
    billing_model: string;
    current_period_start: string | null;
    current_period_end: string | null;
    next_due_at: string | null;
    base_amount_cents: number;
    current_amount_cents: number;
    next_amount_cents: number;
    paid_ahead: boolean;
    paid_ahead_starts_at: string | null;
    paid_until: string | null;
    is_free: boolean;
  };
  plan: {
    id: string;
    name: string;
    slug: string | null;
    price_cents: number;
    catalog_price_cents: number;
    users_limit: number | null;
    tokens_limit: number | null;
    whatsapp_included: number;
    is_free: boolean;
  };
  addons: {
    whatsapp: Array<{
      code: "whatsapp_number";
      index: number;
      unit_amount_cents: number;
      integration: {
        id: string;
        nome: string;
        numero: string | null;
        status: string | null;
        posicao: number | null;
        configured: boolean;
      } | null;
      cancellation: {
        id: string;
        effective_at: string | null;
      } | null;
    }>;
    others: Array<{
      code: string;
      description: string;
      quantity: number;
      unit_amount_cents: number;
      total_amount_cents: number;
    }>;
  };
  pending: {
    whatsapp_cancellations: number;
    plan_change: {
      plan_id: string;
      plan_name: string;
      plan_slug: string;
      plan_price_cents: number;
      effective_at: string | null;
      target_amount_cents: number;
    } | null;
  };
};

const AJUDA_WHATSAPP_MENSAGEM =
  "Olá! Preciso de ajuda com o CRM Prosperity. Pode me auxiliar?";

const AJUDA_WHATSAPP_URL = montarWhatsappUrl(AJUDA_WHATSAPP_MENSAGEM);

const THEME_STORAGE_KEY = "crm-theme";

const PLANOS_RENOVACAO: PlanoRenovacao[] = [
  {
    tipo: "checkout",
    slug: "basico",
    nome: "Básico",
    badge: "Comum",
    descricao:
      "Para começar com atendimento automatizado, organização profissional e IA integrada.",
    precoOriginal: "R$ 197/mês",
    preco: "R$ 137/mês",
    observacao: "2 usuários e 100 mil tokens de IA.",
    recursos: [
      "API Oficial do WhatsApp inclusa",
      "Atendimento automatizado com IA",
      "Respostas inteligentes em tempo real",
      "Disparo de mensagens em massa",
      "Fila de atendimento dinâmica",
      "Relatórios operacionais",
    ],
  },
  {
    tipo: "checkout",
    slug: "essencial",
    nome: "Essencial IA PRO",
    badge: "Mais indicado",
    descricao:
      "Para equipes que precisam de mais automação, IA e volume para escalar vendas e atendimento.",
    precoOriginal: "R$ 367/mês",
    preco: "R$ 267/mês",
    observacao: "6 usuários, 400 mil tokens de IA e 2 números de WhatsApp.",
    recursos: [
      "2 números na API Oficial do WhatsApp",
      "Atendimento automatizado avançado",
      "IA treinável para responder clientes",
      "Disparo inteligente de mensagens",
      "Segmentação avançada de contatos",
      "Distribuição automática na fila",
      "Relatórios completos de performance",
    ],
  },
  {
    tipo: "cotacao",
    nome: "Profissional Enterprise",
    badge: "Cotação",
    descricao:
      "Estrutura para operações maiores que precisam de performance, escala e automações sob medida.",
    preco: "Sob cotação",
    observacao: "Usuários, tokens e números ajustados ao seu volume.",
    recursos: [
      "Usuários sob medida",
      "Tokens de IA sob medida",
      "Múltiplos números oficiais",
      "IA personalizada para sua empresa",
      "Automações avançadas",
      "Suporte estratégico prioritário",
    ],
  },
];

export default function Header({
  title,
  subtitle,
  profileName,
  avatarUrl,
  mobileBackHref,
  mobileBackLabel = "Voltar",
}: HeaderProps) {
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [notificacoesOpen, setNotificacoesOpen] = useState(false);
  const [modalNotificacoesOpen, setModalNotificacoesOpen] = useState(false);
  const [paginaNotificacoes, setPaginaNotificacoes] = useState(1);
  const [alertaTokensOpen, setAlertaTokensOpen] = useState(false);
  const [modalPlanosOpen, setModalPlanosOpen] = useState(false);
  const [planoPagamentoSelecionado, setPlanoPagamentoSelecionado] =
    useState<PlanoCheckout | null>(null);
  const [assinaturaResumo, setAssinaturaResumo] =
    useState<AssinaturaResumo | null>(null);
  const [carregandoAssinaturaResumo, setCarregandoAssinaturaResumo] =
    useState(false);
  const [erroAssinaturaResumo, setErroAssinaturaResumo] = useState("");
  const [confirmandoCancelamentoAddonId, setConfirmandoCancelamentoAddonId] =
    useState<string | null>(null);
  const [cancelandoAddonId, setCancelandoAddonId] = useState<string | null>(null);
  const [abrindoCheckoutAddon, setAbrindoCheckoutAddon] = useState(false);
  const [feedbackAgendaPopup, setFeedbackAgendaPopup] =
    useState<Notificacao | null>(null);
  const [temaVisual, setTemaVisual] = useState<TemaVisual>("light");
  const [mounted, setMounted] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const notificacoesRef = useRef<HTMLDivElement | null>(null);

  const headerUser = useHeaderUser();
  const {
    notificacoes,
    notificacoesNaoLidas: naoLidas,
    saldoTokensIa,
    marcarNotificacaoLidaLocal,
    marcarTodasNotificacoesLidasLocal,
  } = useHeaderSummary();
  const podeExibirSaldoTokensIa = headerUser.permissoes.includes(
    "ia.tokens.exibir_header"
  );
  const podeAcessarExtratoTokensIa = headerUser.permissoes.includes(
    "ia.tokens.visualizar_extrato"
  );
  const assinaturaEmAberto =
    headerUser.assinatura !== null && headerUser.assinatura.status !== "ativa";

  const nomeFinal = profileName || headerUser.profileName || "Usuário";
  const avatarFinal = avatarUrl || headerUser.avatarUrl || "";
  const letraAvatar = nomeFinal?.trim()?.charAt(0)?.toUpperCase() || "U";

  const LIMITE_NOTIFICACOES_POR_PAGINA = 60;
  const INTERVALO_LEMBRETE_TOKENS_MS = 30 * 60 * 1000;
  const LIMITE_ALERTA_TOKENS_AMARELO = 0.2;
  const LIMITE_ALERTA_TOKENS_VERMELHO = 0.1;

  const notificacoesMenu = notificacoes.slice(0, LIMITE_NOTIFICACOES_POR_PAGINA);

  const totalPaginasNotificacoes = Math.max(
    1,
    Math.ceil(notificacoes.length / LIMITE_NOTIFICACOES_POR_PAGINA)
  );

  const inicioPaginaNotificacoes =
    (paginaNotificacoes - 1) * LIMITE_NOTIFICACOES_POR_PAGINA;

  const notificacoesPaginaModal = notificacoes.slice(
    inicioPaginaNotificacoes,
    inicioPaginaNotificacoes + LIMITE_NOTIFICACOES_POR_PAGINA
  );

  const temMaisDeSessentaNotificacoes =
    notificacoes.length > LIMITE_NOTIFICACOES_POR_PAGINA;

  function aplicarTemaVisual(tema: TemaVisual) {
    document.documentElement.dataset.theme = tema;
    document.documentElement.style.colorScheme = tema;
    window.localStorage.setItem(THEME_STORAGE_KEY, tema);
    setTemaVisual(tema);
  }

  function alternarTemaVisual() {
    aplicarTemaVisual(temaVisual === "dark" ? "light" : "dark");
  }
  function formatarTokens(valor: number | null) {
    if (valor === null) return "Ilimitado";

    const formatarCompacto = (numero: number) =>
      new Intl.NumberFormat("pt-BR", {
        maximumFractionDigits: 1,
      }).format(Math.floor(numero * 10) / 10);

    if (valor >= 1_000_000) {
      return `${formatarCompacto(valor / 1_000_000)} mi`;
    }

    if (valor >= 1_000) {
      return `${formatarCompacto(valor / 1_000)} mil`;
    }

    return String(valor);
  }

  function formatarMoedaCentavos(valor: number | null | undefined) {
    const centavos = Number(valor || 0);
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    }).format(centavos / 100);
  }

  function formatarQuantidadeCompacta(valor: number | null | undefined) {
    if (valor === null || valor === undefined) return null;
    return new Intl.NumberFormat("pt-BR", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(valor);
  }

  function formatarDataAssinatura(valor: string | null | undefined) {
    if (!valor) return "-";

    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return "-";

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(data);
  }

  function formatarStatusAssinatura(status: string) {
    if (status === "bloqueada") return "Bloqueado";
    if (status === "vencida") return "Vencido";
    return "Ativo";
  }

  function normalizarIdentificadorPlano(valor: string | null | undefined) {
    const texto = (valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

    if (!texto) return "";
    if (texto.includes("basic") || texto.includes("basico")) return "basico";
    if (texto.includes("essencial")) return "essencial";
    if (texto.includes("enterprise") || texto.includes("profissional")) {
      return "enterprise";
    }

    return texto;
  }

  function planoEhAtual(plano: PlanoRenovacao) {
    const planoAtual =
      normalizarIdentificadorPlano(headerUser.assinatura?.plano_slug) ||
      normalizarIdentificadorPlano(headerUser.assinatura?.plano_nome);

    if (!planoAtual) return false;

    const planoOpcao =
      plano.tipo === "checkout"
        ? normalizarIdentificadorPlano(plano.slug)
        : normalizarIdentificadorPlano(plano.nome);

    return planoAtual === planoOpcao;
  }

  function getPlanoActionLabel(
    plano: PlanoRenovacao,
    planoAtual: boolean
  ) {
    if (plano.tipo === "cotacao") return "Solicitar cotação";
    if (planoAtual) return "Renovar plano";
    return "Contratar plano";
  }

  function saldoTokensEmAlerta(saldo: SaldoTokensIa | null) {
    if (!saldo?.limite_mensal || saldo.tokens_restantes === null) return false;
    return (
      saldo.tokens_restantes <
      saldo.limite_mensal * LIMITE_ALERTA_TOKENS_AMARELO
    );
  }

  function saldoTokensCritico(saldo: SaldoTokensIa | null) {
    if (!saldo?.limite_mensal || saldo.tokens_restantes === null) return false;
    return (
      saldo.tokens_restantes <
      saldo.limite_mensal * LIMITE_ALERTA_TOKENS_VERMELHO
    );
  }

  function saldoTokensZerado(saldo: SaldoTokensIa | null) {
    return (
      !!saldo &&
      saldo.limite_mensal !== null &&
      Number(saldo.tokens_restantes ?? 0) <= 0
    );
  }

  function fecharAlertaTokens() {
    if (saldoTokensIa?.periodo_inicio) {
      const chaveBase = `tokens-low-warning:${saldoTokensIa.periodo_inicio}`;

      window.sessionStorage.setItem(
        `${chaveBase}:lastPromptAt`,
        String(Date.now())
      );
      window.sessionStorage.setItem(
        `${chaveBase}:lastRemaining`,
        String(Number(saldoTokensIa.tokens_restantes ?? 0))
      );
    }

    setAlertaTokensOpen(false);
  }

  async function marcarTodasNotificacoesComoLidas() {
    const notificacoesNaoLidas = notificacoes.filter(
      (notificacao) => !notificacao.lida
    );

    if (notificacoesNaoLidas.length === 0) return;

    try {
      await fetch("/api/notificacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: notificacoesNaoLidas.map((notificacao) => notificacao.id),
        }),
      });

      marcarTodasNotificacoesLidasLocal();
    } catch {
      // silencioso para não quebrar o header
    }
  }

  async function abrirNotificacao(notificacao: Notificacao) {
    try {
      if (!notificacao.lida) {
        await fetch("/api/notificacoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: notificacao.id }),
        });

        marcarNotificacaoLidaLocal(notificacao.id);
      }

      setNotificacoesOpen(false);
      setModalNotificacoesOpen(false);
      setFeedbackAgendaPopup(null);
      const href =
        typeof notificacao.metadata_json?.href === "string" &&
        notificacao.metadata_json.href.startsWith("/")
          ? notificacao.metadata_json.href
          : null;

      if (href) {
        router.push(href);
      } else if (notificacao.conversa_id) {
        router.push(`/conversas?id=${notificacao.conversa_id}`);
      }
    } catch {
      setNotificacoesOpen(false);
      setModalNotificacoesOpen(false);

      setFeedbackAgendaPopup(null);
      const href =
        typeof notificacao.metadata_json?.href === "string" &&
        notificacao.metadata_json.href.startsWith("/")
          ? notificacao.metadata_json.href
          : null;

      if (href) {
        router.push(href);
      } else if (notificacao.conversa_id) {
        router.push(`/conversas?id=${notificacao.conversa_id}`);
      }
    }
  }

  function fecharFeedbackAgendaPopup() {
    if (feedbackAgendaPopup) {
      window.sessionStorage.setItem(
        `crm:feedback-agenda-popup:${feedbackAgendaPopup.id}`,
        "dismissed"
      );
    }

    setFeedbackAgendaPopup(null);
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || feedbackAgendaPopup) return;

    const pendente = notificacoes.find(
      (notificacao) =>
        !notificacao.lida &&
        notificacao.metadata_json?.tipo_notificacao === "feedback_agendamento"
    );

    if (!pendente) return;

    const dispensada = window.sessionStorage.getItem(
      `crm:feedback-agenda-popup:${pendente.id}`
    );

    if (!dispensada) {
      setFeedbackAgendaPopup(pendente);
    }
  }, [feedbackAgendaPopup, mounted, notificacoes]);

  useEffect(() => {
    const temaAtual =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";

    setTemaVisual(temaAtual);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }

      if (notificacoesRef.current && !notificacoesRef.current.contains(target)) {
        setNotificacoesOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    function abrirModalPlanosPorEvento(event: Event) {
      const customEvent = event as CustomEvent<{ handled?: boolean }>;

      if (customEvent.detail) {
        customEvent.detail.handled = true;
      }

      setMenuOpen(false);
      setNotificacoesOpen(false);
      setPlanoPagamentoSelecionado(null);
      setModalPlanosOpen(true);
    }

    window.addEventListener(
      "assinatura:abrir-modal-planos",
      abrirModalPlanosPorEvento
    );

    return () => {
      window.removeEventListener(
        "assinatura:abrir-modal-planos",
        abrirModalPlanosPorEvento
      );
    };
  }, []);

  useEffect(() => {
    if (!modalPlanosOpen) return;
    void carregarResumoAssinatura();
  }, [modalPlanosOpen]);

  useEffect(() => {
    function atualizarAssinatura() {
      if (modalPlanosOpen) {
        void carregarResumoAssinatura();
      }
    }

    window.addEventListener("assinatura:atualizada", atualizarAssinatura);
    return () =>
      window.removeEventListener("assinatura:atualizada", atualizarAssinatura);
  }, [modalPlanosOpen]);

  useEffect(() => {
    if (assinaturaEmAberto || !saldoTokensEmAlerta(saldoTokensIa)) {
      setAlertaTokensOpen(false);
      return;
    }

    const periodo = saldoTokensIa?.periodo_inicio || "atual";
    const chaveBase = `tokens-low-warning:${periodo}`;
    const tokensRestantes = Number(saldoTokensIa?.tokens_restantes ?? 0);
    const ultimoSaldoRegistrado = Number(
      window.sessionStorage.getItem(`${chaveBase}:lastRemaining`) ?? ""
    );
    const ultimoAvisoEm = Number(
      window.sessionStorage.getItem(`${chaveBase}:lastPromptAt`) ?? ""
    );

    const houveConsumoDepoisDoUltimoAviso =
      Number.isFinite(ultimoSaldoRegistrado) &&
      tokensRestantes < ultimoSaldoRegistrado;
    const lembreteVenceu =
      !Number.isFinite(ultimoAvisoEm) ||
      Date.now() - ultimoAvisoEm >= INTERVALO_LEMBRETE_TOKENS_MS;

    if (houveConsumoDepoisDoUltimoAviso || lembreteVenceu) {
      window.sessionStorage.setItem(
        `${chaveBase}:lastPromptAt`,
        String(Date.now())
      );
      window.sessionStorage.setItem(
        `${chaveBase}:lastRemaining`,
        String(tokensRestantes)
      );
      setAlertaTokensOpen(true);
    }
  }, [assinaturaEmAberto, saldoTokensIa]);

  function toggleMenu() {
    setMenuOpen((prev) => !prev);
    setNotificacoesOpen(false);
  }

  function toggleNotificacoes() {
    setNotificacoesOpen((prev) => !prev);
    setMenuOpen(false);
  }

  function abrirModalNotificacoes() {
    setPaginaNotificacoes(1);
    setNotificacoesOpen(false);
    setModalNotificacoesOpen(true);
  }

  function fecharModalNotificacoes() {
    setModalNotificacoesOpen(false);
  }

  function irParaPaginaAnteriorNotificacoes() {
    setPaginaNotificacoes((paginaAtual) => Math.max(1, paginaAtual - 1));
  }

  function irParaProximaPaginaNotificacoes() {
    setPaginaNotificacoes((paginaAtual) =>
      Math.min(totalPaginasNotificacoes, paginaAtual + 1)
    );
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  async function carregarResumoAssinatura() {
    setCarregandoAssinaturaResumo(true);
    setErroAssinaturaResumo("");

    try {
      const response = await fetch("/api/assinaturas/resumo", {
        method: "GET",
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Não foi possível carregar a assinatura.");
      }

      setAssinaturaResumo({
        subscription: data.subscription,
        plan: data.plan,
        addons: data.addons,
        pending: data.pending,
      });
    } catch (error) {
      setErroAssinaturaResumo(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a assinatura."
      );
    } finally {
      setCarregandoAssinaturaResumo(false);
    }
  }

  function obterPlanoAtualCheckout() {
    if (assinaturaResumo?.plan.is_free) return null;

    return (
      PLANOS_RENOVACAO.find(
        (plano): plano is PlanoCheckout =>
          plano.tipo === "checkout" && planoEhAtual(plano)
      ) || null
    );
  }

  function pagarProximaRenovacao() {
    const planoAtual = obterPlanoAtualCheckout();
    if (!planoAtual) return;
    setPlanoPagamentoSelecionado(planoAtual);
  }

  async function adicionarNumeroAssinatura() {
    if (abrindoCheckoutAddon) return;

    const novaAba = window.open("about:blank", "_blank");
    if (!novaAba) {
      setErroAssinaturaResumo(
        "O navegador bloqueou a nova aba. Permita pop-ups e tente novamente."
      );
      return;
    }

    novaAba.opener = null;
    setAbrindoCheckoutAddon(true);
    setErroAssinaturaResumo("");

    try {
      const response = await fetch(
        "/api/assinaturas/adicionais/whatsapp/checkout",
        { method: "POST" }
      );
      const data = await response.json();

      if (!response.ok || !data?.ok || !data?.checkout_url) {
        novaAba.close();
        throw new Error(
          data?.error || "Não foi possível gerar o checkout do adicional."
        );
      }

      novaAba.location.href = data.checkout_url;
    } catch (error) {
      novaAba.close();
      setErroAssinaturaResumo(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o checkout do adicional."
      );
    } finally {
      setAbrindoCheckoutAddon(false);
    }
  }

  async function cancelarNumeroAdicional(integrationId: string) {
    if (cancelandoAddonId) return;

    setCancelandoAddonId(integrationId);
    setErroAssinaturaResumo("");

    try {
      const response = await fetch(
        "/api/assinaturas/adicionais/whatsapp/cancelar",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ integration_id: integrationId }),
        }
      );
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || "Não foi possível cancelar o adicional."
        );
      }

      setConfirmandoCancelamentoAddonId(null);
      await carregarResumoAssinatura();
    } catch (error) {
      setErroAssinaturaResumo(
        error instanceof Error
          ? error.message
          : "Não foi possível cancelar o adicional."
      );
    } finally {
      setCancelandoAddonId(null);
    }
  }

  function abrirModalPlanosAssinatura() {
    setMenuOpen(false);
    setNotificacoesOpen(false);
    setPlanoPagamentoSelecionado(null);
    setConfirmandoCancelamentoAddonId(null);
    setModalPlanosOpen(true);
  }

  function fecharModalPlanosAssinatura() {
    setPlanoPagamentoSelecionado(null);
    setModalPlanosOpen(false);
  }

  function abrirCotacaoPlano() {
    const mensagem =
      "Olá! Quero fazer uma cotação do plano Profissional Enterprise do CRM Prosperity.";

    const url = montarWhatsappUrl(mensagem);

    setModalPlanosOpen(false);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function contratarPlanoAssinatura(plano: PlanoRenovacao) {
    if (plano.tipo === "cotacao") {
      abrirCotacaoPlano();
      return;
    }

    setPlanoPagamentoSelecionado(plano);
  }

  const tokensEmAlerta = saldoTokensEmAlerta(saldoTokensIa);
  const tokensCriticos = saldoTokensCritico(saldoTokensIa);
  const tokensZerados = saldoTokensZerado(saldoTokensIa);
  const tokensBadgeClassName = `${styles.tokensBadge}${
    tokensCriticos
      ? ` ${styles.tokensBadgeDanger}`
      : tokensEmAlerta
        ? ` ${styles.tokensBadgeWarning}`
        : ""
  }`;
  const tokensWarningClassName = `${styles.tokensWarningInline} ${
    tokensCriticos
      ? styles.tokensWarningInlineDanger
      : styles.tokensWarningInlineWarning
  }`;
  const avisoTokensTitulo = tokensZerados
    ? "Tokens esgotados"
    : tokensCriticos
      ? "Tokens estão acabando"
      : "Atenção aos tokens";
  const avisoTokensMensagem = tokensZerados
    ? "Recarregue para reativar a IA."
    : tokensCriticos
      ? "Saldo abaixo de 10%. Recarregue para evitar pausas na IA."
      : "Saldo abaixo de 20%. Planeje uma recarga para não interromper a IA.";

  const assinaturaStatus = headerUser.assinatura?.status ?? "ativa";
  const assinaturaBloqueada = assinaturaStatus === "bloqueada";
  const assinaturaPlanoNome = headerUser.assinatura?.plano_nome || "Plano atual";
  const assinaturaStatusLabel = formatarStatusAssinatura(assinaturaStatus);
  const assinaturaRenovacaoEm = assinaturaResumo?.plan.is_free
    ? null
    : assinaturaResumo?.subscription.next_due_at ||
      assinaturaResumo?.subscription.current_period_end ||
      headerUser.assinatura?.vencimento_em ||
      null;
  const assinaturaPagaAntecipadamente =
    assinaturaResumo?.subscription.paid_ahead === true;
  const assinaturaPodeRenovar =
    !assinaturaResumo?.plan.is_free && !assinaturaPagaAntecipadamente;
  const assinaturaAcaoPagamento =
    assinaturaStatus === "ativa"
      ? "Adiantar próxima mensalidade"
      : "Pagar / renovar";
  const assinaturaStatusBadgeClassName = `${styles.planCurrentStatus} ${
    assinaturaBloqueada
      ? styles.planCurrentStatusDanger
      : assinaturaStatus === "vencida"
        ? styles.planCurrentStatusWarning
        : styles.planCurrentStatusActive
  }`;
  const assinaturaWarningClassName = `${styles.assinaturaWarningInline} ${
    assinaturaBloqueada
      ? styles.assinaturaWarningInlineDanger
      : styles.assinaturaWarningInlineWarning
  }`;
  const avisoAssinaturaTitulo = assinaturaBloqueada
    ? "Plano bloqueado"
    : "Plano vencido";
  const avisoAssinaturaMensagem = assinaturaBloqueada
    ? "Renove para liberar o sistema"
    : "Renove em ate 7 dias";
  const temaEscuroAtivo = temaVisual === "dark";
  const temaBotaoLabel = temaEscuroAtivo ? "Tema claro" : "Tema escuro";
  const temaBotaoStatus = temaEscuroAtivo ? "Escuro" : "Claro";

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {mobileBackHref && (
          <Link
            href={mobileBackHref}
            className={styles.mobileBackButton}
            aria-label={mobileBackLabel}
            title={mobileBackLabel}
          >
            <ArrowLeft size={20} strokeWidth={2.4} />
          </Link>
        )}

        <h1 className={styles.title}>{title}</h1>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>

      <div className={styles.right}>
        {assinaturaEmAberto && (
          <button
            type="button"
            className={assinaturaWarningClassName}
            title="Renovar plano"
            onClick={abrirModalPlanosAssinatura}
          >
            <span>{avisoAssinaturaTitulo}</span>
            <strong>{avisoAssinaturaMensagem}</strong>
          </button>
        )}

        {!assinaturaEmAberto &&
          podeExibirSaldoTokensIa &&
          saldoTokensIa &&
          tokensEmAlerta &&
          (podeAcessarExtratoTokensIa ? (
            <Link
              href="/ia/tokens/pacotes"
              className={tokensWarningClassName}
              title="Comprar tokens de IA"
            >
              <span>{avisoTokensTitulo}</span>
              <strong>{avisoTokensMensagem}</strong>
            </Link>
          ) : (
            <span className={tokensWarningClassName}>
              <span>{avisoTokensTitulo}</span>
              <strong>{avisoTokensMensagem}</strong>
            </span>
          ))}

        {!assinaturaEmAberto &&
          podeExibirSaldoTokensIa &&
          saldoTokensIa &&
          (podeAcessarExtratoTokensIa ? (
          <Link
            href="/ia/tokens"
            className={tokensBadgeClassName}
            title="Abrir extrato de tokens de IA"
          >
            <span className={styles.tokensLabel}>IA</span>

            <strong>
              {formatarTokens(saldoTokensIa.tokens_restantes)}
            </strong>

            {tokensEmAlerta && (
              <span
                className={`${styles.mobileTokensNotification} ${
                  tokensCriticos
                    ? styles.mobileTokensNotificationDanger
                    : styles.mobileTokensNotificationWarning
                }`}
                aria-label={avisoTokensTitulo}
              >
                !
              </span>
            )}
          </Link>
          ) : (
          <span
            className={`${tokensBadgeClassName} ${styles.tokensBadgeStatic}`}
            title="Tokens de IA restantes no ciclo mensal"
          >
            <span className={styles.tokensLabel}>IA</span>

            <strong>
              {formatarTokens(saldoTokensIa.tokens_restantes)}
            </strong>

            {tokensEmAlerta && (
              <span
                className={`${styles.mobileTokensNotification} ${
                  tokensCriticos
                    ? styles.mobileTokensNotificationDanger
                    : styles.mobileTokensNotificationWarning
                }`}
                aria-label={avisoTokensTitulo}
              >
                !
              </span>
            )}
          </span>
          ))}

        <div className={styles.notificationWrapper} ref={notificacoesRef}>
          <button
            type="button"
            className={styles.notificationButton}
            onClick={toggleNotificacoes}
            title="Notificações"
          >
            🔔

            {naoLidas > 0 && (
              <span className={styles.notificationBadge}>
                {naoLidas > 9 ? "9+" : naoLidas}
              </span>
            )}
          </button>

          {notificacoesOpen && (
            <div className={styles.notificationDropdown}>
              <div className={styles.notificationHeader}>
                <strong>Notificações</strong>

                <div className={styles.notificationHeaderActions}>
                  {naoLidas > 0 && (
                    <button
                      type="button"
                      className={styles.markAllReadButton}
                      onClick={marcarTodasNotificacoesComoLidas}
                    >
                      Marcar todas lidas
                    </button>
                  )}

                  <span>{naoLidas} não lida(s)</span>
                </div>
              </div>

              {notificacoes.length === 0 ? (
                <div className={styles.notificationEmpty}>Nenhuma notificação.</div>
              ) : (
                <div className={styles.notificationList}>
                  {notificacoesMenu.map((notificacao) => (
                    <button
                      key={notificacao.id}
                      type="button"
                      className={
                        notificacao.lida
                          ? styles.notificationItem
                          : `${styles.notificationItem} ${styles.notificationItemUnread}`
                      }
                      onClick={() => abrirNotificacao(notificacao)}
                    >
                      <div className={styles.notificationItemTop}>
                        <strong>{notificacao.titulo}</strong>
                        {!notificacao.lida && <span className={styles.unreadDot} />}
                      </div>

                      <p>{notificacao.mensagem}</p>
                    </button>
                  ))}

                  {temMaisDeSessentaNotificacoes && (
                    <div className={styles.notificationViewAllWrapper}>
                      <button
                        type="button"
                        className={styles.notificationViewAllButton}
                        onClick={abrirModalNotificacoes}
                      >
                        Ver todas as notificações
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {modalNotificacoesOpen && (
          <div
            className={styles.notificationModalOverlay}
            onClick={fecharModalNotificacoes}
          >
            <div
              className={styles.notificationModal}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.notificationModalHeader}>
                <div className={styles.notificationModalTitle}>
                  <strong>Todas as notificações</strong>
                  <span>
                    Página {paginaNotificacoes} de {totalPaginasNotificacoes}
                  </span>
                </div>

                <div className={styles.notificationModalHeaderActions}>
                  {naoLidas > 0 && (
                    <button
                      type="button"
                      className={styles.markAllReadButton}
                      onClick={marcarTodasNotificacoesComoLidas}
                    >
                      Marcar todas lidas
                    </button>
                  )}

                  <button
                    type="button"
                    className={styles.notificationModalClose}
                    onClick={fecharModalNotificacoes}
                    title="Fechar"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className={styles.notificationModalList}>
                {notificacoesPaginaModal.map((notificacao) => (
                  <button
                    key={notificacao.id}
                    type="button"
                    className={
                      notificacao.lida
                        ? styles.notificationItem
                        : `${styles.notificationItem} ${styles.notificationItemUnread}`
                    }
                    onClick={() => abrirNotificacao(notificacao)}
                  >
                    <div className={styles.notificationItemTop}>
                      <strong>{notificacao.titulo}</strong>
                      {!notificacao.lida && <span className={styles.unreadDot} />}
                    </div>

                    <p>{notificacao.mensagem}</p>
                  </button>
                ))}
              </div>

              <div className={styles.notificationModalFooter}>
                <button
                  type="button"
                  className={styles.notificationPageButton}
                  onClick={irParaPaginaAnteriorNotificacoes}
                  disabled={paginaNotificacoes === 1}
                >
                  Anterior
                </button>

                <span>
                  {notificacoes.length} notificação(ões)
                </span>

                <button
                  type="button"
                  className={styles.notificationPageButton}
                  onClick={irParaProximaPaginaNotificacoes}
                  disabled={paginaNotificacoes === totalPaginasNotificacoes}
                >
                  Próxima
                </button>
              </div>
            </div>
          </div>
        )}

        {modalPlanosOpen && (
          <div
            className={styles.planRenewalOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-renewal-title"
            onClick={fecharModalPlanosAssinatura}
          >
            <div
              className={styles.planRenewalModal}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.planRenewalHeader}>
                <div>
                  <span className={styles.planRenewalEyebrow}>
                    Plano e assinatura
                  </span>
                  <h2 id="plan-renewal-title">Gerenciar plano</h2>
                  <p>
                    Controle sua assinatura, adicionais e pagamentos em um só
                    lugar, com total transparência sobre o próximo ciclo.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.planRenewalClose}
                  onClick={fecharModalPlanosAssinatura}
                  aria-label="Fechar planos"
                >
                  ×
                </button>
              </div>

              <div className={styles.planCurrentSummary}>
                <div className={styles.planCurrentMain}>
                  <div className={styles.planCurrentBrandIcon}>
                    <Sparkles size={20} strokeWidth={2.1} />
                  </div>
                  <div className={styles.planCurrentIdentity}>
                    <span>Plano atual</span>
                    <strong>
                      {assinaturaResumo?.plan.name || assinaturaPlanoNome}
                    </strong>
                    <small>
                      {assinaturaResumo?.plan.is_free
                        ? "Plano gratuito"
                        : "Assinatura pré-paga · sem renovação automática via PIX"}
                    </small>
                  </div>
                </div>

                <div className={styles.planCurrentMeta}>
                  <div>
                    <span>Status</span>
                    <strong className={assinaturaStatusBadgeClassName}>
                      {assinaturaStatusLabel}
                    </strong>
                  </div>

                  <div>
                    <span>Próxima renovação</span>
                    <strong>
                      {assinaturaResumo?.plan.is_free
                        ? "Não se aplica"
                        : formatarDataAssinatura(
                            assinaturaResumo?.subscription.next_due_at ||
                              assinaturaResumo?.subscription.current_period_end ||
                              headerUser.assinatura?.vencimento_em
                          )}
                    </strong>
                  </div>

                  <div>
                    <span>Próxima cobrança</span>
                    <strong>
                      {assinaturaResumo?.plan.is_free
                        ? "Sem cobrança"
                        : assinaturaResumo
                          ? formatarMoedaCentavos(
                              assinaturaResumo.subscription.next_amount_cents
                            )
                          : "-"}
                    </strong>
                  </div>
                </div>
              </div>

              <div className={styles.planManagementScroll}>
                {assinaturaResumo?.subscription.paid_ahead && (
                  <div className={styles.subscriptionPrepaidNotice}>
                    <div className={styles.subscriptionPrepaidIcon}>
                      <CheckCircle2 size={22} strokeWidth={2.3} />
                    </div>
                    <div className={styles.subscriptionPrepaidContent}>
                      <span>Mensalidade futura quitada</span>
                      <strong>O próximo ciclo já está pago</strong>
                      <p>
                        O período a partir de{" "}
                        {formatarDataAssinatura(
                          assinaturaResumo.subscription.paid_ahead_starts_at
                        )}{" "}
                        já está garantido. Os avisos de vencimento desse ciclo
                        não serão enviados.
                      </p>
                    </div>
                    <div className={styles.subscriptionPrepaidUntil}>
                      <span>Coberto até</span>
                      <strong>
                        {formatarDataAssinatura(
                          assinaturaResumo.subscription.paid_until
                        )}
                      </strong>
                    </div>
                  </div>
                )}

                <section className={styles.subscriptionComposition}>
                  <div className={styles.subscriptionSectionHeader}>
                    <div>
                      <span className={styles.planRenewalEyebrow}>
                        Sua assinatura
                      </span>
                      <h3>Composição atual</h3>
                    </div>

                    {obterPlanoAtualCheckout() && (
                      <button
                        type="button"
                        className={styles.subscriptionPayButton}
                        onClick={pagarProximaRenovacao}
                        disabled={
                          carregandoAssinaturaResumo || !assinaturaPodeRenovar
                        }
                      >
                        {assinaturaPagaAntecipadamente
                          ? "Próxima mensalidade já paga"
                          : assinaturaResumo
                            ? `${assinaturaAcaoPagamento} — ${formatarMoedaCentavos(
                                assinaturaResumo.subscription.next_amount_cents
                              )}`
                            : assinaturaAcaoPagamento}
                      </button>
                    )}
                  </div>

                  {carregandoAssinaturaResumo && !assinaturaResumo ? (
                    <div className={styles.subscriptionLoading}>
                      Carregando assinatura...
                    </div>
                  ) : (
                    <>
                      <div className={styles.subscriptionItem}>
                        <div className={styles.subscriptionItemIcon}>
                          <CreditCard size={19} strokeWidth={2.1} />
                        </div>
                        <div className={styles.subscriptionItemMain}>
                          <span>Plano base</span>
                          <strong>
                            {assinaturaResumo?.plan.name || assinaturaPlanoNome}
                          </strong>
                          <small>
                            {assinaturaResumo?.plan.users_limit
                              ? `${assinaturaResumo.plan.users_limit} usuários`
                              : "Plano contratado"}
                            {assinaturaResumo?.plan.tokens_limit
                              ? ` · ${formatarQuantidadeCompacta(
                                  assinaturaResumo.plan.tokens_limit
                                )} tokens de IA`
                              : ""}
                          </small>
                        </div>
                        <div className={styles.subscriptionItemPrice}>
                          <strong>
                            {assinaturaResumo?.plan.is_free
                              ? "Gratuito"
                              : assinaturaResumo
                                ? formatarMoedaCentavos(
                                    assinaturaResumo.plan.price_cents
                                  )
                                : "-"}
                            {!assinaturaResumo?.plan.is_free && (
                              <small>/mês</small>
                            )}
                          </strong>
                          <span className={styles.subscriptionActiveBadge}>
                            Ativo
                          </span>
                        </div>
                      </div>

                      {assinaturaResumo?.pending.plan_change && (
                        <div className={styles.subscriptionPendingPlan}>
                          <div>
                            <span>Alteração de plano agendada</span>
                            <strong>
                              {assinaturaResumo.plan.name} →{" "}
                              {assinaturaResumo.pending.plan_change.plan_name}
                            </strong>
                            <small>
                              A mudança será aplicada na próxima renovação após
                              a confirmação do pagamento.
                            </small>
                          </div>
                          <div>
                            <span>Próximo plano</span>
                            <strong>
                              {formatarMoedaCentavos(
                                assinaturaResumo.pending.plan_change
                                  .plan_price_cents
                              )}
                              /mês
                            </strong>
                          </div>
                        </div>
                      )}

                      {(assinaturaResumo?.addons.whatsapp || []).map((addon) => {
                        const integrationId = addon.integration?.id || null;
                        const confirmando =
                          integrationId === confirmandoCancelamentoAddonId;
                        const cancelando = integrationId === cancelandoAddonId;

                        return (
                          <div
                            className={`${styles.subscriptionItem} ${
                              addon.cancellation
                                ? styles.subscriptionItemPending
                                : ""
                            }`}
                            key={integrationId || `whatsapp-${addon.index}`}
                          >
                            <div className={styles.subscriptionItemIcon}>
                              <Smartphone size={19} strokeWidth={2.1} />
                            </div>
                            <div className={styles.subscriptionItemMain}>
                              <span>Adicional</span>
                              <strong>Número WhatsApp adicional</strong>
                              <small>
                                {addon.integration?.numero ||
                                  addon.integration?.nome ||
                                  "Número ainda não configurado"}
                              </small>
                              {addon.cancellation && (
                                <em>
                                  Cancelamento agendado para{" "}
                                  {formatarDataAssinatura(
                                    addon.cancellation.effective_at
                                  )}
                                </em>
                              )}
                            </div>
                            <div className={styles.subscriptionItemPrice}>
                              <strong>
                                {formatarMoedaCentavos(addon.unit_amount_cents)}
                                <small>/mês</small>
                              </strong>

                              {addon.cancellation ? (
                                <span className={styles.subscriptionPendingBadge}>
                                  Sai na próxima renovação
                                </span>
                              ) : integrationId &&
                                addon.integration?.configured ? (
                                <div className={styles.subscriptionCancelActions}>
                                  {confirmando ? (
                                    <>
                                      <button
                                        type="button"
                                        className={styles.subscriptionCancelConfirm}
                                        onClick={() =>
                                          cancelarNumeroAdicional(integrationId)
                                        }
                                        disabled={cancelando}
                                      >
                                        {cancelando
                                          ? "Agendando..."
                                          : "Confirmar cancelamento"}
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.subscriptionCancelBack}
                                        onClick={() =>
                                          setConfirmandoCancelamentoAddonId(null)
                                        }
                                        disabled={cancelando}
                                      >
                                        Voltar
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      className={styles.subscriptionCancelButton}
                                      onClick={() =>
                                        setConfirmandoCancelamentoAddonId(
                                          integrationId
                                        )
                                      }
                                    >
                                      Cancelar na próxima renovação
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className={styles.subscriptionSetupBadge}>
                                  Aguardando configuração
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {(assinaturaResumo?.addons.others || []).map((addon) => (
                        <div
                          className={styles.subscriptionItem}
                          key={addon.code}
                        >
                          <div className={styles.subscriptionItemIcon}>＋</div>
                          <div className={styles.subscriptionItemMain}>
                            <span>Adicional</span>
                            <strong>{addon.description}</strong>
                            <small>Quantidade: {addon.quantity}</small>
                          </div>
                          <div className={styles.subscriptionItemPrice}>
                            <strong>
                              {formatarMoedaCentavos(
                                addon.total_amount_cents ||
                                  addon.unit_amount_cents * addon.quantity
                              )}
                              <small>/mês</small>
                            </strong>
                          </div>
                        </div>
                      ))}

                      {!assinaturaResumo?.plan.is_free && (
                        <button
                          type="button"
                          className={styles.subscriptionAddButton}
                          onClick={adicionarNumeroAssinatura}
                          disabled={abrindoCheckoutAddon}
                        >
                          {abrindoCheckoutAddon
                            ? "Calculando valor proporcional..."
                            : "+ Adicionar número WhatsApp"}
                        </button>
                      )}

                      {erroAssinaturaResumo && (
                        <div className={styles.subscriptionError} role="alert">
                          {erroAssinaturaResumo}
                        </div>
                      )}

                      {assinaturaResumo && !assinaturaResumo.plan.is_free && (
                        <div className={styles.subscriptionRenewalSummary}>
                          <div className={styles.subscriptionSummaryHeader}>
                            <strong>Resumo da próxima renovação</strong>
                            <span>
                              {formatarDataAssinatura(
                                assinaturaResumo.subscription.next_due_at ||
                                  assinaturaResumo.subscription.current_period_end
                              )}
                            </span>
                          </div>

                          <div className={styles.subscriptionSummaryLine}>
                            <span>
                              {assinaturaResumo.pending.plan_change?.plan_name ||
                                assinaturaResumo.plan.name}
                            </span>
                            <strong>
                              {formatarMoedaCentavos(
                                assinaturaResumo.pending.plan_change
                                  ?.plan_price_cents ||
                                  assinaturaResumo.plan.price_cents
                              )}
                            </strong>
                          </div>

                          {assinaturaResumo.addons.whatsapp.length > 0 && (
                            <div className={styles.subscriptionSummaryLine}>
                              <span>
                                {Math.max(
                                  0,
                                  assinaturaResumo.addons.whatsapp.length -
                                    assinaturaResumo.pending
                                      .whatsapp_cancellations
                                )}{" "}
                                número(s) adicional(is)
                              </span>
                              <strong>
                                {formatarMoedaCentavos(
                                  Math.max(
                                    0,
                                    assinaturaResumo.addons.whatsapp.length -
                                      assinaturaResumo.pending
                                        .whatsapp_cancellations
                                  ) *
                                    (assinaturaResumo.addons.whatsapp[0]
                                      ?.unit_amount_cents || 0)
                                )}
                              </strong>
                            </div>
                          )}

                          <div
                            className={`${styles.subscriptionSummaryLine} ${styles.subscriptionSummaryTotal}`}
                          >
                            <span>Total</span>
                            <strong>
                              {formatarMoedaCentavos(
                                assinaturaResumo.subscription.next_amount_cents
                              )}
                            </strong>
                          </div>

                          {obterPlanoAtualCheckout() && (
                            <button
                              type="button"
                              className={styles.subscriptionPayButtonFull}
                              onClick={pagarProximaRenovacao}
                              disabled={!assinaturaPodeRenovar}
                            >
                              {assinaturaPagaAntecipadamente
                                ? "Próxima mensalidade já paga"
                                : `${assinaturaAcaoPagamento} — ${formatarMoedaCentavos(
                                    assinaturaResumo.subscription.next_amount_cents
                                  )}`}
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </section>

                <div className={styles.planChangeHeader}>
                  <span className={styles.planRenewalEyebrow}>Alterar plano</span>
                  <h3>Escolha outro plano</h3>
                  <p>
                    Em upgrades, a Prosperity Pay calcula somente a diferença
                    proporcional do ciclo atual. Downgrades passam a valer na
                    próxima renovação.
                  </p>
                </div>

                <div className={styles.planRenewalGrid}>
                  {PLANOS_RENOVACAO.map((plano) => {
                    const planoAtual =
                      !assinaturaResumo?.plan.is_free && planoEhAtual(plano);

                    return (
                      <article
                        key={plano.nome}
                        className={`${styles.planRenewalCard} ${
                          plano.nome === "Essencial IA PRO"
                            ? styles.planRenewalCardFeatured
                            : ""
                        }`}
                      >
                        <div className={styles.planRenewalCardTop}>
                          <span className={styles.planRenewalBadge}>
                            {plano.badge}
                          </span>
                          <h3>{plano.nome}</h3>
                          <p>{plano.descricao}</p>
                        </div>

                        <div className={styles.planRenewalPriceBlock}>
                          {"precoOriginal" in plano &&
                            plano.precoOriginal && (
                              <span className={styles.planRenewalOldPrice}>
                                {plano.precoOriginal}
                              </span>
                            )}
                          <strong>{plano.preco}</strong>
                          <small>{plano.observacao}</small>
                        </div>

                        <ul className={styles.planRenewalFeatures}>
                          {plano.recursos.map((recurso) => (
                            <li key={recurso}>{recurso}</li>
                          ))}
                        </ul>

                        <button
                          type="button"
                          className={
                            plano.tipo === "cotacao"
                              ? styles.planRenewalSecondary
                              : planoAtual
                                ? styles.planRenewalCurrent
                                : styles.planRenewalPrimary
                          }
                          onClick={() => contratarPlanoAssinatura(plano)}
                          title={
                            planoAtual
                              ? "Este é o plano atual"
                              : getPlanoActionLabel(plano, planoAtual)
                          }
                          disabled={planoAtual}
                        >
                          {planoAtual
                            ? "Plano atual"
                            : getPlanoActionLabel(plano, planoAtual)}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {planoPagamentoSelecionado && (
          <PaymentGatewayModal
            plano={{
              slug: planoPagamentoSelecionado.slug,
              nome: planoPagamentoSelecionado.nome,
              renovarPlanoAtual:
                !assinaturaResumo?.plan.is_free &&
                planoEhAtual(planoPagamentoSelecionado),
            }}
            onClose={() => setPlanoPagamentoSelecionado(null)}
          />
        )}

        <div className={styles.userMenuWrapper} ref={menuRef}></div>

        <div className={styles.userMenuWrapper} ref={menuRef}>
          <button
            type="button"
            className={styles.profileButton}
            onClick={toggleMenu}
          >
            <div className={styles.avatar}>
              {avatarFinal ? (
                <img
                  src={avatarFinal}
                  alt={`Foto de ${nomeFinal}`}
                  className={styles.avatarImage}
                />
              ) : (
                <span className={styles.avatarFallback}>{letraAvatar}</span>
              )}
            </div>

            <span className={styles.profileName}>{nomeFinal}</span>
            <span className={styles.chevron}>{menuOpen ? "▴" : "▾"}</span>
          </button>

          {menuOpen && (
            <div className={styles.dropdown}>
              <Link
                href="/perfil"
                className={styles.dropdownItem}
                onClick={closeMenu}
              >
                Meu perfil
              </Link>

              {headerUser.isAdmin ? (
                <Link
                  href="/configuracoes-gerais"
                  className={styles.dropdownItem}
                  onClick={closeMenu}
                >
                  Configurações
                </Link>
              ) : null}

              <a
                href={AJUDA_WHATSAPP_URL}
                className={styles.dropdownItem}
                onClick={closeMenu}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ajuda
              </a>

              <div className={styles.dropdownDivider} />

              <button
                type="button"
                className={`${styles.dropdownItem} ${styles.themeMenuButton}`}
                onClick={alternarTemaVisual}
                aria-pressed={temaEscuroAtivo}
              >
                <span className={styles.themeMenuMain}>
                  <span className={styles.themeMenuIcon}>
                    {temaEscuroAtivo ? (
                      <Sun size={16} strokeWidth={2.2} />
                    ) : (
                      <Moon size={16} strokeWidth={2.2} />
                    )}
                  </span>
                  <span>{temaBotaoLabel}</span>
                </span>

                <span className={styles.themeMenuBadge}>
                  {temaBotaoStatus}
                </span>
              </button>

              <div className={styles.dropdownDivider} />

              <div className={styles.dropdownLogout}>
                <LogoutButton />
              </div>
            </div>
          )}
        </div>
      </div>

        {mounted &&
          alertaTokensOpen &&
        saldoTokensIa &&
        createPortal(
          <div
            className={styles.tokenAlertOverlay}
            role="dialog"
            aria-modal="true"
            onClick={fecharAlertaTokens}
          >
            <div
              className={`${styles.tokenAlertCard} ${
                tokensCriticos
                  ? styles.tokenAlertCardDanger
                  : styles.tokenAlertCardWarning
              }`}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className={styles.tokenAlertClose}
                onClick={fecharAlertaTokens}
                aria-label="Fechar aviso de tokens"
              >
                ×
              </button>

              <div className={styles.tokenAlertHero}>
                <span className={styles.tokenAlertEyebrow}>
                  {saldoTokensZerado(saldoTokensIa)
                    ? "Tokens esgotados"
                    : tokensCriticos
                      ? "Tokens quase acabando"
                      : "Atenção aos tokens"}
                </span>

                <h2>
                  {saldoTokensZerado(saldoTokensIa)
                    ? "Sua IA pode parar no atendimento"
                    : tokensCriticos
                      ? "Seu saldo de IA está crítico"
                      : "Seu saldo de IA está ficando baixo"}
                </h2>

                <p>
                  Restam{" "}
                  <strong>
                    {formatarTokens(saldoTokensIa.tokens_restantes)}
                  </strong>{" "}
                  tokens disponíveis, incluindo pacotes avulsos. Sem tokens,
                  automações podem deixar de interpretar respostas, analisar arquivos
                  e transcrever áudios.
                </p>
              </div>

              <div className={styles.tokenAlertOffers}>
                <div>
                  <span>Pacote rápido</span>
                  <strong>50 mil tokens</strong>
                  <small>R$ 25</small>
                </div>

                <div>
                  <span>Mais volume</span>
                  <strong>200 mil tokens</strong>
                  <small>R$ 100</small>
                </div>
              </div>

              <div className={styles.tokenAlertActions}>
                <Link
                  href="/ia/tokens/pacotes"
                  className={styles.tokenAlertPrimary}
                  onClick={fecharAlertaTokens}
                >
                  Comprar tokens
                </Link>

                <button
                  type="button"
                  className={styles.tokenAlertSecondary}
                  onClick={fecharAlertaTokens}
                >
                  Ver depois
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {mounted &&
          feedbackAgendaPopup &&
          createPortal(
            <div className={styles.feedbackAgendaPopup} role="status">
              <button
                type="button"
                className={styles.feedbackAgendaPopupClose}
                onClick={fecharFeedbackAgendaPopup}
                aria-label="Fechar aviso de agendamento"
              >
                ×
              </button>

              <span className={styles.feedbackAgendaPopupEyebrow}>
                Agenda
              </span>
              <strong>{feedbackAgendaPopup.titulo}</strong>
              <p>{feedbackAgendaPopup.mensagem}</p>

              <button
                type="button"
                className={styles.feedbackAgendaPopupAction}
                onClick={() => abrirNotificacao(feedbackAgendaPopup)}
              >
                Ver na Agenda
              </button>
            </div>,
            document.body
          )}
    </header>
  );
}
