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
  Layers3,
  IdCard,
  ShieldCheck,
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
} from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import { useHeaderSummary } from "@/components/header-summary-context";
import { useHeaderUser } from "@/components/header-user-context";
import type { AssinaturaEmpresa } from "@/lib/assinaturas/status";
import {
  PERMISSAO_INTERNA_EMPRESAS,
  PERMISSAO_RELATORIOS_INTERNOS,
} from "@/lib/permissoes/internas";
import styles from "./Sidebar.module.css";

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
};

type WhatsappSidebarPerfil = {
  nome: string;
  foto: string;
  numero: string;
};

const PERMISSAO_VISUALIZAR_PLANO_SIDEBAR = "assinaturas.plano.visualizar";
const AJUDA_WHATSAPP_URL = "https://wa.me/5531975117638";
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
  { label: "Painel", href: "/", icon: LayoutDashboard },
  { label: "Conversas", href: "/conversas", icon: MessageSquare },
  /*{ label: "Disparos", href: "/disparos-whatsapp", icon: Send },
  { label: "Disparos agendados", href: "/disparos-agendados", icon: CalendarClock },*/
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

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
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
  const { conversasNaoLidas, disparosPendentes } = useHeaderSummary();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [temaVisual, setTemaVisual] = useState<TemaVisual>(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  });
  const [whatsappPerfil, setWhatsappPerfil] =
    useState<WhatsappSidebarPerfil | null>(null);
    
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

  const visibleMenuItems = menuItems.filter((item) => {
    if (assinaturaBloqueada) {
      return isAdmin && item.href === "/conversas";
    }

    return !item.permissao || permissoes.includes(item.permissao);
  });
  const desktopMenuItems = visibleMenuItems.filter(
    (item) => item.href !== "/configuracoes/whatsapp/perfil"
  );
  const mobilePrimaryItems = mobilePrimaryHrefs
    .map((href) => visibleMenuItems.find((item) => item.href === href))
    .filter((item): item is MenuItem => Boolean(item));
  const mobileMoreItems = visibleMenuItems.filter(
    (item) => !mobilePrimaryHrefs.includes(item.href)
  );
  const mobileMoreActive =
    mobileMoreItems.some((item) => isActivePath(pathname, item.href)) ||
    isActivePath(pathname, "/perfil");

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

                  {item.href === "/disparos-agendados" && disparosPendentesVisiveis > 0 && (
                      <span className={styles.notificationDot}>
                        {disparosPendentesVisiveis > 9 ? "9+" : disparosPendentesVisiveis}
                      </span>
                  )}

                  {item.href === "/conversas" && conversasNaoLidas > 0 && (
                    <span
                      className={`${styles.notificationDot} ${styles.conversationsNotificationDot}`}
                    >
                      {conversasNaoLidas > 9 ? "9+" : conversasNaoLidas}
                    </span>
                  )}
                  </span>

                  {!collapsed && (
                    <span className={styles.linkText}>{item.label}</span>
                  )}
                </Link>
              );
            })}
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

                {item.href === "/conversas" && conversasNaoLidas > 0 && (
                  <span className={styles.mobileNotificationDot}>
                    {conversasNaoLidas > 9 ? "9+" : conversasNaoLidas}
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

            <div className={styles.mobileProfileCard}>
              <Link
                href="/perfil"
                className={styles.mobileProfileLink}
                onClick={() => setMobileMoreOpen(false)}
              >
                <span className={styles.mobileAvatar}>
                  {avatarFinal ? (
                    <img src={avatarFinal} alt={`Foto de ${nomeFinal}`} />
                  ) : (
                    <span>{letraAvatar}</span>
                  )}
                </span>

                <span className={styles.mobileProfileText}>
                  <strong>{nomeFinal}</strong>
                  <small>Meu perfil</small>
                </span>

                <UserCircle size={20} strokeWidth={2.2} />
              </Link>
            </div>

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

                    {item.href === "/disparos-agendados" &&
                      disparosPendentesVisiveis > 0 && (
                        <span className={styles.mobileMoreBadge}>
                          {disparosPendentesVisiveis > 9
                            ? "9+"
                            : disparosPendentesVisiveis}
                        </span>
                      )}
                  </Link>
                );
              })}
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
