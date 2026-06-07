"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
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
} from "lucide-react";
import type { AssinaturaEmpresa } from "@/lib/assinaturas/status";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
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

const menuItems: MenuItem[] = [
  { label: "Painel", href: "/", icon: LayoutDashboard },
  { label: "Conversas", href: "/conversas", icon: MessageSquare },
  { label: "Disparos", href: "/disparos-whatsapp", icon: Send },
  { label: "Disparos agendados", href: "/disparos-agendados", icon: CalendarClock },
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
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [disparosPendentes, setDisparosPendentes] = useState(0);
  const [conversasNaoLidas, setConversasNaoLidas] = useState(0);
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

  useEffect(() => {
    if (assinaturaBloqueada) {
      return;
    }

    async function carregarDisparosPendentes() {
      try {
        const res = await fetch("/api/disparos-agendados/pendentes", {
          cache: "no-store",
        });

        const json = await res.json();

        if (res.ok && json.ok) {
          setDisparosPendentes(Number(json.quantidade || 0));
        }
      } catch {
        setDisparosPendentes(0);
      }
    }

    carregarDisparosPendentes();

    const intervalo = window.setInterval(carregarDisparosPendentes, 60_000);

    return () => window.clearInterval(intervalo);
  }, [assinaturaBloqueada]);

  useEffect(() => {
    async function carregarConversasNaoLidas() {
      try {
        const res = await fetch("/api/conversas/nao-lidas", {
          cache: "no-store",
        });

        const json = await res.json();

        if (res.ok && json.ok) {
          setConversasNaoLidas(Number(json.quantidade || 0));
          return;
        }

        setConversasNaoLidas(0);
      } catch {
        setConversasNaoLidas(0);
      }
    }

    carregarConversasNaoLidas();

    const intervalo = window.setInterval(carregarConversasNaoLidas, 30_000);

    return () => window.clearInterval(intervalo);
  }, []);

  useEffect(() => {
    async function carregarPerfilWhatsapp() {
      try {
        const res = await fetch("/api/whatsapp/perfil", {
          cache: "no-store",
        });

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

  return (
    <aside
      className={`${styles.sidebar} ${
        collapsed ? styles.sidebarCollapsed : ""
      }`}
    >
      <div className={styles.sidebarTop}>
        <div className={styles.topBar}>
          <div className={styles.brand}>
            <div className={styles.logo}>CRM</div>

            {!collapsed && (
              <div className={styles.brandText}>
                <p className={styles.brandLabel}>Plataforma</p>
                <h1 className={styles.brandTitle}>CRM Prosperity</h1>
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
            {menuItems.map((item) => {
              if (assinaturaBloqueada) {
                if (!isAdmin || item.href !== "/conversas") {
                  return null;
                }
              }

              if (item.href === "/configuracoes/whatsapp/perfil") {
                return null;
              }

              if (item.permissao && !permissoes.includes(item.permissao)) {
                return null;
              }

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
    </aside>
  );
}
