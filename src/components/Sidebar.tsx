"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";

type MenuItem = {
  label: string;
  href: string;
};

const menuItems: MenuItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Conversas", href: "/conversas" },
  { label: "Disparos", href: "/disparos-whatsapp" },
  { label: "Contatos", href: "/contatos" },
  { label: "Usuários", href: "/usuarios" },
  { label: "Empresas", href: "/empresas" },
  { label: "Setores", href: "/setores" },
  { label: "Config. Perfis", href: "/configuracoes/perfis" },
  { label: "Config. Permissões", href: "/configuracoes/permissoes" },
  { label: "Config. Setores", href: "/configuracoes/setores" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <div className={styles.logo}>CRM</div>

        <div>
          <p className={styles.brandLabel}>Plataforma</p>
          <h1 className={styles.brandTitle}>CRM Prosperity</h1>
        </div>
      </div>

      <div className={styles.navArea}>
        <p className={styles.sectionTitle}>Navegação principal</p>

        <nav className={styles.nav}>
          {menuItems.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.link} ${active ? styles.linkActive : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={styles.footerBox}>
        <p className={styles.footerLabel}>Ambiente</p>
        <p className={styles.footerTitle}>Sistema administrativo</p>
        <p className={styles.footerText}>
          Visual unificado, mais profissional e pronto para evoluir.
        </p>
      </div>
    </aside>
  );
}