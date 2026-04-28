"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  MessageSquare,
  Send,
  Contact,
  Users,
  Building2,
  Layers3,
  IdCard,
  ShieldCheck,
  Settings2,
  FileText,
  GitBranch,
  PlugZap,
} from "lucide-react";
import styles from "./Sidebar.module.css";

type MenuItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

type SidebarProps = {
  initialCollapsed?: boolean;
};

const menuItems: MenuItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Conversas", href: "/conversas", icon: MessageSquare },
  { label: "Disparos", href: "/disparos-whatsapp", icon: Send },
  { label: "Templates", href: "/configuracoes/templates-whatsapp", icon: FileText },
  { label: "Fluxos", href: "/fluxos", icon: GitBranch },
  { label: "Contatos", href: "/contatos", icon: Contact },
  { label: "Usuários", href: "/usuarios", icon: Users },
  { label: "Empresas", href: "/empresas", icon: Building2 },
  { label: "Setores", href: "/setores", icon: Layers3 },
  { label: "Config. Perfis", href: "/configuracoes/perfis", icon: IdCard },

  {
    label: "Config. Permissões",
    href: "/configuracoes/permissoes",
    icon: ShieldCheck,
  },
  {
    label: "Config. Setores",
    href: "/configuracoes/setores",
    icon: Settings2,
  },

  { label: "Config. Ambiente", href: "/configurar-ambiente", icon: PlugZap },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar({
  initialCollapsed = false,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

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
                    <Icon size={18} strokeWidth={2} />
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

      <div className={styles.sidebarBottom}>
        <button
          type="button"
          onClick={toggleSidebar}
          className={styles.menuButton}
          aria-label="Alternar menu lateral"
          title={collapsed ? "Expandir menu" : "Minimizar menu"}
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