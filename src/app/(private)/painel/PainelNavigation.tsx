"use client";

import Link from "next/link";
import { BarChart3, Radio } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./layout.module.css";

export default function PainelNavigation() {
  const pathname = usePathname();
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const aoVivo = pathname.startsWith("/painel/ao-vivo");

  useEffect(() => {
    const main = document.querySelector("main");
    const hero = main?.querySelector(":scope > section");
    if (!(hero instanceof HTMLElement)) return;

    const host = document.createElement("div");
    host.dataset.painelNavigationHost = "true";
    Object.assign(host.style, {
      position: "absolute",
      top: "10px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "6",
      width: "fit-content",
      maxWidth: "calc(100% - 24px)",
    });
    hero.append(host);
    setPortalHost(host);

    return () => {
      setPortalHost(null);
      host.remove();
    };
  }, [pathname]);

  if (!portalHost) return null;

  const tabStyle = {
    minHeight: 26,
    padding: "4px 8px",
    gap: 5,
    borderRadius: 7,
    fontSize: 11,
    lineHeight: 1,
    flex: "0 0 auto",
    whiteSpace: "nowrap" as const,
  };

  return createPortal(
    <div
      className={styles.navigationWrap}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "fit-content",
        maxWidth: "100%",
        padding: 0,
        margin: 0,
      }}
    >
      <nav
        className={styles.navigation}
        aria-label="Visões do painel"
        style={{
          width: "fit-content",
          maxWidth: "100%",
          gap: 2,
          padding: 2,
          borderRadius: 9,
          boxShadow: "none",
        }}
      >
        <Link
          href="/painel/ao-vivo"
          className={aoVivo ? styles.activeTab : styles.tab}
          style={tabStyle}
          title="Ao vivo / Hoje"
        >
          <Radio size={12} />
          <span>Ao vivo</span>
          <i
            className={styles.liveDot}
            aria-hidden="true"
            style={{ width: 4, height: 4, boxShadow: "0 0 0 2px var(--crm-success-bg)" }}
          />
        </Link>
        <Link
          href="/painel?visao=analitica"
          className={!aoVivo ? styles.activeTab : styles.tab}
          style={tabStyle}
          title="Visão analítica"
        >
          <BarChart3 size={12} />
          <span>Analítica</span>
        </Link>
      </nav>
    </div>,
    portalHost,
  );
}
