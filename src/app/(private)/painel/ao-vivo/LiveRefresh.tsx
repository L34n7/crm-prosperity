"use client";

import { useEffect, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

const INTERVALO_ATUALIZACAO = 30_000;

export default function LiveRefresh() {
  const router = useRouter();
  const [atualizando, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => {
      startTransition(() => router.refresh());
    }, INTERVALO_ATUALIZACAO);

    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <button
      type="button"
      className={styles.refreshButton}
      onClick={() => startTransition(() => router.refresh())}
      disabled={atualizando}
      title="Atualizar indicadores agora"
    >
      <span className={styles.livePulse} aria-hidden="true" />
      <span>{atualizando ? "Atualizando…" : "Ao vivo · 30s"}</span>
      <RefreshCw size={15} className={atualizando ? styles.spinning : undefined} />
    </button>
  );
}
