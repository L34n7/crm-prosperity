"use client";

import Link from "next/link";
import { BarChart3, Radio } from "lucide-react";
import { usePathname } from "next/navigation";
import styles from "./layout.module.css";

export default function PainelNavigation() {
  const pathname = usePathname();
  const aoVivo = pathname.startsWith("/painel/ao-vivo");

  return (
    <div className={styles.navigationWrap}>
      <nav className={styles.navigation} aria-label="Visões do painel">
        <Link href="/painel" className={!aoVivo ? styles.activeTab : styles.tab}>
          <BarChart3 size={16} />
          <span>Visão analítica</span>
        </Link>
        <Link href="/painel/ao-vivo" className={aoVivo ? styles.activeTab : styles.tab}>
          <Radio size={16} />
          <span>Ao vivo / Hoje</span>
          <i className={styles.liveDot} aria-hidden="true" />
        </Link>
      </nav>
    </div>
  );
}
