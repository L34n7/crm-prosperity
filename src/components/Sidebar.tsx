"use client";

import Image from "next/image";
import Link from "next/link";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  BarChart3,
  MessageSquare,
  Send,
  CalendarClock,
  CalendarCheck,
  Contact,
  Users,
  Building2,
  House,
  Layers3,
  IdCard,
  ShieldCheck,
  Settings,
  Settings2,
  FileText,
  GitBranch,
  MessageCircle,
  ScrollText,
  MousePointerClick,
  CreditCard,
  MoreHorizontal,
  UserCircle,
  HelpCircle,
  Moon,
  Sun,
  X,
  ChevronDown,
} from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import { useHeaderSummary } from "@/components/header-summary-context";
import { useHeaderUser } from "@/components/header-user-context";
import { montarWaMeUrl } from "@/lib/contatos/sistema";
import type { AssinaturaEmpresa } from "@/lib/assinaturas/status";
import {
  PERMISSAO_INTERNA_EMPRESAS,
  PERMISSAO_RELATORIOS_INTERNOS,
} from "@/lib/permissoes/internas";
import { PERMISSAO_VISUALIZAR_DISPAROS } from "@/lib/whatsapp/disparo-permissoes";
import styles from "./Sidebar.module.css";
import {
  getNichoConfig,
  type NichoCodigo,
} from "@/lib/nichos/config";

type MenuItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  permissao?: string;
};

type SidebarProps = {
  initialCollapsed?: boolean;
  permissoes?: string[];
  assinatura?: AssinaturaEmpresa | null;
  isAdmin?: boolean;
  nichoCodigo?: NichoCodigo;
};

type WhatsappSidebarPerfil = {
  nome: string;
  foto: string;
  numero: string;
};

const PERMISSAO_VISUALIZAR_PLANO_SIDEBAR = "assinaturas.plano.visualizar";
const AJUDA_WHATSAPP_URL = montarWaMeUrl();
const THEME_STORAGE_KEY = "crm-theme";
const mobilePrimaryHrefs = [
  "/conversas",
  "/agendas",
  "/disparos-whatsapp",
  "/fluxos",
];

type TemaVisual = "light" | "dark";

const mobileLabelByHref: Record<string, string> = {
  "/conversas": "Conversas",
  "/agendas": "Agenda",
  "/disparos-whatsapp": "Disparo",
  "/fluxos": "Fluxo",
};

const menuItems: MenuItem[] = [
  { label: "Painel", href: "/painel", icon: LayoutDashboard },
  { label: "Conversas", href: "/conversas", icon: MessageSquare },
  {
    label: "Disparos",
    href: "/disparos-whatsapp",
    icon: Send,
    permissao: PERMISSAO_VISUALIZAR_DISPAROS,
  },
  {
    label: "Disparos agendados",
    href: "/disparos-agendados",
    icon: CalendarClock,
    permissao: PERMISSAO_VISUALIZAR_DISPAROS,
  },
  { label: "Agendas", href: "/agendas", icon: CalendarCheck },
  { label: "Templates", href: "/configuracoes/templates-whatsapp", icon: FileText },
  { label: "Fluxos", href: "/fluxos", icon: GitBranch },
  { label: "Contatos", href: "/contatos", icon: Contact },
  {
    label: "Rastreamento de leads",
    href: "/rastreamento",
    icon: MousePointerClick,
    permissao: "rastreamento.visualizar",
  },
  { label: "Usuários", href: "/usuarios", icon: Users },
  {
    label: "Empresas",
    href: "/empresas",
    icon: Building2,
    permissao: PERMISSAO_INTERNA_EMPRESAS,
  },
  {
    label: "Configuração de setores",
    href: "/configuracoes/setores",
    icon: Layers3,
    permissao: "setores.visualizar",
  },
  {
    label: "Configuração de perfis",
    href: "/configuracoes/perfis",
    icon: IdCard,
    permissao: "perfis.visualizar",
  },
  {
    label: "Configuração de permissões",
    href: "/configuracoes/permissoes",
    icon: ShieldCheck,
  },
  {
    label: "Auditoria",
    href: "/auditoria",
    icon: ScrollText,
    permissao: "auditoria.visualizar",
  },
  {
    label: "Relatórios Internos",
    href: "/relatorios-internos",
    icon: BarChart3,
    permissao: PERMISSAO_RELATORIOS_INTERNOS,
  },
  { label: "Perfil WhatsApp", href: "/configuracoes/whatsapp/perfil", icon: Settings2 },
];

const configuracoesHrefs = new Set([
  "/usuarios",
  "/empresas",
  "/configuracoes/setores",
  "/configuracoes/perfis",
  "/configuracoes/permissoes",
  "/auditoria",
]);

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getAssinaturaStatusLabel(status: AssinaturaEmpresa["status"]) {
  if (status === "bloqueada") return "Bloqueado";
  if (status === "vencida") return "Vencido";
  return "Ativo";
}

export default function Sidebar({
  initialCollapsed = false,
  permissoes = [],
  assinatura = null,
  isAdmin = false,
  nichoCodigo = "comercio",
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const conversaAbertaNoMobile =
    pathname === "/conversas" &&
    Boolean(
      searchParams.get("id") ||
      searchParams.get("conversaId")
  );
  const headerUser = useHeaderUser();
  const {
    conversasNaoLidas,
    disparosPendentes,
    agendamentosFeedbackPendentes,
  } = useHeaderSummary();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [configuracoesOpen, setConfiguracoesOpen] = useState(false);
  const [temaVisual, setTemaVisual] = useState<TemaVisual>(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  });
  const [whatsappPerfil, setWhatsappPerfil] =
    useState<WhatsappSidebarPerfil | null>(null);

  useEffect(() => {
    document.documentElement.dataset.sidebarCollapsed = collapsed
      ? "true"
      : "false";
  }, [collapsed]);
    
  const assinaturaBloqueada = assinatura?.status === "bloqueada";
  const disparosPendentesVisiveis = assinaturaBloqueada ? 0 : disparosPendentes;
  const planoNome = assinatura?.plano_nome || "Plano atual";
  const assinaturaStatus = assinatura?.status ?? "ativa";
  const assinaturaStatusLabel = getAssinaturaStatusLabel(assinaturaStatus);
  const planoTitle = `Plano atual: ${planoNome} (${assinaturaStatusLabel})`;
  const podeVisualizarPlanoSidebar = permissoes.includes(
    PERMISSAO_VISUALIZAR_PLANO_SIDEBAR
  );
  const nomeFinal = headerUser.profileName || "Usuario";
  const avatarFinal = headerUser.avatarUrl || "";
  const letraAvatar = nomeFinal?.trim()?.charAt(0)?.toUpperCase() || "U";
  const temaEscuroAtivo = temaVisual === "dark";
  const temaBotaoLabel = temaEscuroAtivo ? "Tema claro" : "Tema escuro";
  const nichoConfig = getNichoConfig(nichoCodigo);
  const modulosNichoMenu: MenuItem[] = [
    ...(nichoConfig.modulos.includes("saude.prontuarios")
      ? [
          {
            label: "Prontuários",
            href: "/prontuarios",
            icon: FileText,
            permissao: "prontuarios.visualizar",
          },
        ]
      : []),
    ...(nichoConfig.modulos.includes("saude.odontograma")
      ? [
          {
            label: "Odontograma",
            href: "/odontograma",
            icon: Layers3,
            permissao: "odontograma.visualizar",
          },
        ]
      : []),
    ...(nichoConfig.modulos.includes("imobiliario.imoveis")
      ? [
          {
            label: "Imóveis",
            href: "/imoveis",
            icon: Building2,
          },
          {
            label: "Meus imóveis",
            href: "/meus-imoveis",
            icon: House,
            permissao: "imoveis.visualizar",
          },
        ]
      : []),
  ];
  const menuItemsComCadastro: MenuItem[] = [
    ...menuItems.slice(0, 8),
    {
      label: nichoConfig.cadastroPlural,
      href: "/cadastros",
      icon: Users,
      permissao: "pessoas.visualizar",
    },
    ...modulosNichoMenu,
    ...menuItems.slice(8),
  ];

  const visibleMenuItems = menuItemsComCadastro.filter((item) => {
    if (assinaturaBloqueada) {
      return isAdmin && item.href === "/conversas";
    }

    return !item.permissao || permissoes.includes(item.permissao);
  });

  const configuracoesItems = visibleMenuItems.filter((item) =>
    configuracoesHrefs.has(item.href)
  );

  const desktopMenuItems = visibleMenuItems.filter(
    (item) =>
      item.href !== "/configuracoes/whatsapp/perfil" &&
      !configuracoesHrefs.has(item.href)
  );

  const configuracoesActive = configuracoesItems.some((item) =>
    isActivePath(pathname, item.href)
  );

  useEffect(() => {
    if (configuracoesActive) {
      setConfiguracoesOpen(true);
    }
  }, [configuracoesActive]);

  const mobilePrimaryItems = mobilePrimaryHrefs
    .map((href) => visibleMenuItems.find((item) => item.href === href))
    .filter((item): item is MenuItem => Boolean(item));
    
  const mobileMoreItems = visibleMenuItems.filter(
    (item) =>
      item.href !== "/configuracoes/whatsapp/perfil" &&
      !mobilePrimaryHrefs.includes(item.href) &&
      !configuracoesHrefs.has(item.href)
  );

  const mobileMoreActive =
    mobileMoreItems.some((item) => isActivePath(pathname, item.href)) ||
    isActivePath(pathname, "/perfil") ||
    isActivePath(pathname, "/configuracoes/whatsapp/perfil");

  function getMenuNotificationCount(href: string) {
    if (href === "/conversas") {
      return conversasNaoLidas;
    }

    if (href === "/disparos-agendados") {
      return disparosPendentesVisiveis;
    }

    if (href === "/agendas") {
      return agendamentosFeedbackPendentes;
    }

    return 0;
  }

  const mobileMoreNotificationCount = mobileMoreItems.reduce(
    (total, item) => total + getMenuNotificationCount(item.href),
    0
  );

  function getMenuNotificationClass(href: string) {
    if (href === "/conversas") {
      return `${styles.mobileNotificationDot} ${styles.mobileConversationsNotificationDot}`;
    }

    return styles.mobileNotificationDot;
  }

  useEffect(() => {
    async function carregarPerfilWhatsapp() {
      try {
        const res = await fetch("/api/whatsapp/perfil");

        const json = await res.json();

        if (res.ok && json.ok) {
          setWhatsappPerfil({
            nome:
              json.integracao?.phone_number_display_name ||
              json.integracao?.verified_name ||
              json.integracao?.nome_conexao ||
              "WhatsApp",
            foto: json.perfil?.profile_picture_url || "",
            numero:
              json.integracao?.display_phone_number ||
              json.integracao?.numero ||
              "",
          });
        }
      } catch {
        setWhatsappPerfil(null);
      }
    }

    carregarPerfilWhatsapp();
  }, []);

  function persistSidebarState(nextValue: boolean) {
    localStorage.setItem("crm-sidebar-collapsed", String(nextValue));
    document.cookie = `crm-sidebar-collapsed=${String(
      nextValue
    )}; path=/; max-age=31536000; samesite=lax`;
  }

  function toggleSidebar() {
    setCollapsed((current) => {
      const nextValue = !current;
      persistSidebarState(nextValue);
      return nextValue;
    });
  }

  function abrirModalPlanosAssinatura() {
    const detail = { handled: false };

    window.dispatchEvent(
      new CustomEvent("assinatura:abrir-modal-planos", { detail })
    );

    if (!detail.handled) {
      router.push("/plano");
    }
  }

  function alternarTemaVisual() {
    const proximoTema = temaVisual === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = proximoTema;
    document.documentElement.style.colorScheme = proximoTema;
    window.localStorage.setItem(THEME_STORAGE_KEY, proximoTema);
    setTemaVisual(proximoTema);
  }

  function toggleMobileMore() {
    const temaAtual =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";

    setTemaVisual(temaAtual);
    setMobileMoreOpen((current) => !current);
  }

  return (
    <aside
      className={`${styles.sidebar} ${
        collapsed ? styles.sidebarCollapsed : ""
      } ${
        conversaAbertaNoMobile
          ? styles.sidebarHiddenDuringMobileChat
          : ""
      }`}
    >
      <div className={styles.sidebarTop}>
        <div className={styles.topBar}>
          <div className={styles.brand}>
            <div className={styles.logo}>
              <Image
                src="/logo.png"
                alt="CRM Prosperity"
                width={2096}
                height={2048}
                className={styles.logoImage}
                priority
              />
            </div>

            {!collapsed && (
              <div className={styles.brandText}>
                <p className={styles.brandLabel}>Plataforma</p>
                <h1 className={styles.brandTitle}>Prosperity CRM</h1>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.sidebarMiddle}>
        <div className={styles.navArea}>
          <p
            className={`${styles.sectionTitle} ${
              collapsed ? styles.sectionTitleCollapsed : ""
            }`}
          >
            Navegação principal
          </p>

          <nav className={styles.nav}>
            {desktopMenuItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.link} ${active ? styles.linkActive : ""}`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className={styles.linkIcon}>
                    {item.href === "/configuracoes/whatsapp/perfil" &&
                    whatsappPerfil?.foto ? (
                      <img
                        src={whatsappPerfil.foto}
                        alt={whatsappPerfil.nome}
                        className={styles.whatsappSidebarAvatar}
                      />
                    ) : (
                      <Icon size={18} strokeWidth={2} />
                    )}

                    {item.href === "/disparos-agendados" &&
                      disparosPendentesVisiveis > 0 && (
                        <span className={styles.notificationDot}>
                          {disparosPendentesVisiveis > 9
                            ? "9+"
                            : disparosPendentesVisiveis}
                        </span>
                      )}

                    {item.href === "/conversas" && conversasNaoLidas > 0 && (
                      <span
                        className={`${styles.notificationDot} ${styles.conversationsNotificationDot}`}
                      >
                        {conversasNaoLidas > 9 ? "9+" : conversasNaoLidas}
                      </span>
                    )}

                    {item.href === "/agendas" &&
                      agendamentosFeedbackPendentes > 0 && (
                        <span className={styles.notificationDot}>
                          {agendamentosFeedbackPendentes > 9
                            ? "9+"
                            : agendamentosFeedbackPendentes}
                        </span>
                      )}
                  </span>

                  {!collapsed && <span className={styles.linkText}>{item.label}</span>}
                </Link>
              );
            })}

            {configuracoesItems.length > 0 && (
              <div className={styles.submenuGroup}>
                <button
                  type="button"
                  className={`${styles.link} ${styles.submenuButton} ${
                    configuracoesActive ? styles.configuracoesActive : ""
                  }`}
                  onClick={() => setConfiguracoesOpen((current) => !current)}
                  title={collapsed ? "Configurações" : undefined}
                  aria-expanded={configuracoesOpen}
                >
                  <span className={styles.linkIcon}>
                    <Settings  size={18} strokeWidth={2} />
                  </span>

                  {!collapsed && (
                    <>
                      <span className={styles.linkText}>Configurações</span>

                      <span
                        className={`${styles.submenuChevron} ${
                          configuracoesOpen ? styles.submenuChevronOpen : ""
                        }`}
                      >
                        <ChevronDown size={15} strokeWidth={2.4} />
                      </span>
                    </>
                  )}
                </button>

                {configuracoesOpen && (
                  <div className={styles.submenuList}>
                    {configuracoesItems.map((item) => {
                      const active = isActivePath(pathname, item.href);
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`${styles.submenuLink} ${
                            active ? styles.submenuLinkActive : ""
                          }`}
                          title={collapsed ? item.label : undefined}
                        >
                          <span className={styles.submenuIcon}>
                            <Icon size={15} strokeWidth={2.1} />
                          </span>

                          {!collapsed && <span>{item.label}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>
      </div>

      {!assinaturaBloqueada && (
        <Link
          href="/configuracoes/whatsapp/perfil"
          className={`${styles.link} ${styles.linkWhatsappPerfil} ${
            pathname === "/configuracoes/whatsapp/perfil"
              ? styles.linkWhatsappActive
              : ""
          }`}
        >
          <span className={styles.linkIcon}>
            {whatsappPerfil?.foto ? (
              <img
                src={whatsappPerfil.foto}
                alt={whatsappPerfil.nome}
                className={styles.whatsappSidebarAvatar}
              />
            ) : (
              <MessageCircle size={18} strokeWidth={2} />
            )}
          </span>

          {!collapsed && (
            <span className={styles.linkText}>
              Perfil WhatsApp
            </span>
          )}
        </Link>
      )}

      <div className={styles.sidebarBottom}>
        {podeVisualizarPlanoSidebar && (
          <button
            type="button"
            className={styles.planButton}
            onClick={abrirModalPlanosAssinatura}
            title={collapsed ? planoTitle : "Ver plano e assinatura"}
            aria-label={planoTitle}
          >
            <span className={styles.planIcon}>
              <CreditCard size={19} strokeWidth={2} />
            </span>

            {!collapsed && (
              <span className={styles.planText}>
                <span className={styles.planLabel}>Plano atual</span>
                <strong>{planoNome}</strong>
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={toggleSidebar}
          className={styles.menuButton}
          aria-label="Alternar menu lateral"
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          <span className={styles.menuIcon}>
            <span></span>
            <span></span>
            <span></span>
          </span>

          {!collapsed && <span className={styles.menuText}>Menu</span>}
        </button>
      </div>

      <nav className={styles.mobileNav} aria-label="Navegacao mobile">
        {mobilePrimaryItems.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          const notificationCount = getMenuNotificationCount(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.mobileNavItem} ${
                active ? styles.mobileNavItemActive : ""
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className={styles.mobileNavIcon}>
                <Icon size={20} strokeWidth={2.2} />

                {notificationCount > 0 && (
                  <span className={getMenuNotificationClass(item.href)}>
                    {notificationCount > 9 ? "9+" : notificationCount}
                  </span>
                )}
              </span>

              <span>{mobileLabelByHref[item.href] || item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          className={`${styles.mobileNavItem} ${
            mobileMoreActive || mobileMoreOpen ? styles.mobileNavItemActive : ""
          }`}
          onClick={toggleMobileMore}
          aria-expanded={mobileMoreOpen}
          aria-controls="mobile-sidebar-menu"
        >
          <span className={styles.mobileNavIcon}>
            {mobileMoreOpen ? (
              <X size={20} strokeWidth={2.2} />
            ) : (
              <MoreHorizontal size={22} strokeWidth={2.2} />
            )}

            {mobileMoreNotificationCount > 0 && (
              <span className={styles.mobileNotificationDot}>
                {mobileMoreNotificationCount > 9 ? "9+" : mobileMoreNotificationCount}
              </span>
            )}
          </span>

          <span>Mais</span>
        </button>
      </nav>

      {mobileMoreOpen && (
        <div
          className={styles.mobileMoreOverlay}
          onClick={() => setMobileMoreOpen(false)}
        >
          <div
            id="mobile-sidebar-menu"
            className={styles.mobileMorePanel}
            onClick={(event) => event.stopPropagation()}
          >
          <div className={styles.mobileMoreHandle} />

            {!assinaturaBloqueada && (
              <div className={styles.mobileWhatsappCard}>
                <Link
                  href="/configuracoes/whatsapp/perfil"
                  className={styles.mobileWhatsappLink}
                  onClick={() => setMobileMoreOpen(false)}
                >
                  <span className={styles.mobileWhatsappAvatar}>
                    {whatsappPerfil?.foto ? (
                      <img
                        src={whatsappPerfil.foto}
                        alt={whatsappPerfil.nome}
                      />
                    ) : (
                      <MessageCircle size={20} strokeWidth={2.2} />
                    )}
                  </span>

                  <span className={styles.mobileWhatsappText}>
                    <small>Perfil WhatsApp</small>
                    <strong>{whatsappPerfil?.nome || "WhatsApp"}</strong>
                    {whatsappPerfil?.numero && <em>{whatsappPerfil.numero}</em>}
                  </span>
                </Link>
              </div>
            )}

            {podeVisualizarPlanoSidebar && (
              <button
                type="button"
                className={styles.mobilePlanButton}
                onClick={() => {
                  setMobileMoreOpen(false);
                  abrirModalPlanosAssinatura();
                }}
              >
                <CreditCard size={18} strokeWidth={2.2} />
                <span>
                  <small>Plano atual</small>
                  <strong>{planoNome}</strong>
                </span>
              </button>
            )}

            <div className={styles.mobileMoreList}>
              {mobileMoreItems.map((item) => {
                const active = isActivePath(pathname, item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.mobileMoreLink} ${
                      active ? styles.mobileMoreLinkActive : ""
                    }`}
                    onClick={() => setMobileMoreOpen(false)}
                  >
                    <span className={styles.mobileMoreIcon}>
                      {item.href === "/configuracoes/whatsapp/perfil" &&
                      whatsappPerfil?.foto ? (
                        <img
                          src={whatsappPerfil.foto}
                          alt={whatsappPerfil.nome}
                          className={styles.whatsappSidebarAvatar}
                        />
                      ) : (
                        <Icon size={18} strokeWidth={2.1} />
                      )}
                    </span>

                    <span>{item.label}</span>

                    {getMenuNotificationCount(item.href) > 0 && (
                      <span className={styles.mobileMoreBadge}>
                        {getMenuNotificationCount(item.href) > 9
                          ? "9+"
                          : getMenuNotificationCount(item.href)}
                      </span>
                    )}
                  </Link>
                );
              })}

              {configuracoesItems.length > 0 && (
                <div className={styles.mobileSubmenuGroup}>
                  <button
                    type="button"
                    className={`${styles.mobileMoreLink} ${
                      configuracoesActive ? styles.mobileMoreLinkActive : ""
                    }`}
                    onClick={() => setConfiguracoesOpen((current) => !current)}
                    aria-expanded={configuracoesOpen}
                  >
                    <span className={styles.mobileMoreIcon}>
                      <Settings2 size={18} strokeWidth={2.1} />
                    </span>

                    <span>Configurações</span>

                    <ChevronDown
                      size={16}
                      strokeWidth={2.4}
                      className={`${styles.mobileSubmenuChevron} ${
                        configuracoesOpen ? styles.mobileSubmenuChevronOpen : ""
                      }`}
                    />
                  </button>

                  {configuracoesOpen && (
                    <div className={styles.mobileSubmenuList}>
                      {configuracoesItems.map((item) => {
                        const active = isActivePath(pathname, item.href);
                        const Icon = item.icon;

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`${styles.mobileSubmenuLink} ${
                              active ? styles.mobileSubmenuLinkActive : ""
                            }`}
                            onClick={() => setMobileMoreOpen(false)}
                          >
                            <Icon size={16} strokeWidth={2.1} />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className={styles.mobileProfileActions}>
              <Link
                href="/perfil"
                className={styles.mobileProfileAction}
                onClick={() => setMobileMoreOpen(false)}
              >
                <UserCircle size={18} strokeWidth={2.2} />
                <span>Perfil</span>
              </Link>
              <a
                href={AJUDA_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.mobileProfileAction}
                onClick={() => setMobileMoreOpen(false)}
              >
                <HelpCircle size={18} strokeWidth={2.2} />
                <span>Ajuda</span>
              </a>

              <button
                type="button"
                className={styles.mobileProfileAction}
                onClick={alternarTemaVisual}
                aria-pressed={temaEscuroAtivo}
              >
                {temaEscuroAtivo ? (
                  <Sun size={18} strokeWidth={2.2} />
                ) : (
                  <Moon size={18} strokeWidth={2.2} />
                )}
                <span>{temaBotaoLabel}</span>
              </button>

              <div className={styles.mobileLogout}>
                <LogoutButton />
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
