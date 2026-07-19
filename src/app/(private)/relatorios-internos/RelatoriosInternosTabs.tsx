"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, TrendingUp } from "lucide-react";
import styles from "./relatorios-internos-tabs.module.css";

const tabs = [
  {
    href: "/relatorios-internos",
    label: "Operacional",
    description: "Uso e operação da plataforma",
    icon: BarChart3,
  },
  {
    href: "/relatorios-internos/growth",
    label: "Growth Analytics",
    description: "Novos clientes e crescimento",
    icon: TrendingUp,
  },
];

export default function RelatoriosInternosTabs() {
  const pathname = usePathname();

  return (
    <nav className={styles.tabs} aria-label="Seções dos relatórios internos">
      {tabs.map((tab) => {
        const ativo =
          tab.href === "/relatorios-internos"
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`${styles.tab} ${ativo ? styles.active : ""}`}
            aria-current={ativo ? "page" : undefined}
          >
            <Icon size={19} strokeWidth={2.1} aria-hidden="true" />
            <span>
              <strong>{tab.label}</strong>
              <small>{tab.description}</small>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
