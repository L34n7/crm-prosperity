"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  MessageSquare,
  Send,
  CalendarClock,
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
  { label: "Conversations", href: "/conversas", icon: MessageSquare },
  { label: "Broadcasts", href: "/disparos-whatsapp", icon: Send },
  { label: "Scheduled Broadcasts", href: "/disparos-agendados", icon: CalendarClock },
  { label: "Templates", href: "/configuracoes/templates-whatsapp", icon: FileText },
  { label: "Flows", href: "/fluxos", icon: GitBranch },
  { label: "Contacts", href: "/contatos", icon: Contact },
  { label: "Users", href: "/usuarios", icon: Users },
  { label: "Companies", href: "/empresas", icon: Building2 },
  { label: "Departments", href: "/setores", icon: Layers3 },
  { label: "Profile Settings", href: "/configuracoes/perfis", icon: IdCard },
  {
    label: "Permission Settings",
    href: "/configuracoes/permissoes",
    icon: ShieldCheck,
  },
  {
    label: "Department Settings",
    href: "/configuracoes/setores",
    icon: Settings2,
  },
  {
    label: "Environment Setup",
    href: "/configurar-ambiente",
    icon: PlugZap,
  },
  { label: "Perfil WhatsApp", href: "/configuracoes/whatsapp/perfil", icon: Settings2 },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar({ initialCollapsed = false }: SidebarProps) {
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
                <p className={styles.brandLabel}>Platform</p>
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
            Main Navigation
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
          aria-label="Toggle sidebar menu"
          title={collapsed ? "Expand menu" : "Collapse menu"}
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