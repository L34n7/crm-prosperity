"use client";

import { useEffect, useMemo, useState } from "react";
import type { AcessoTemporarioEmpresaContexto } from "@/lib/auth/get-usuario-contexto";
import styles from "./AcessoTemporarioEmpresaBanner.module.css";

export default function AcessoTemporarioEmpresaBanner({
  acesso,
}: {
  acesso: AcessoTemporarioEmpresaContexto;
}) {
  const [encerrando, setEncerrando] = useState(false);
  const [erro, setErro] = useState("");

  const expiraLabel = useMemo(() => {
    const data = new Date(acesso.expira_em);

    if (Number.isNaN(data.getTime())) return "";

    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(data);
  }, [acesso.expira_em]);

  useEffect(() => {
    const restante = new Date(acesso.expira_em).getTime() - Date.now();

    if (!Number.isFinite(restante)) return;

    if (restante <= 0) {
      window.location.assign("/configuracoes/empresas");
      return;
    }

    const timer = window.setTimeout(() => {
      window.location.assign("/configuracoes/empresas");
    }, restante + 500);

    return () => window.clearTimeout(timer);
  }, [acesso.expira_em]);

  async function encerrar() {
    if (encerrando) return;

    setEncerrando(true);
    setErro("");

    try {
      const response = await fetch("/api/empresas/acesso-temporario", {
        method: "DELETE",
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setErro(data.error || "Não foi possível encerrar a sessão.");
        return;
      }

      window.location.assign("/configuracoes/empresas");
    } catch {
      setErro("Não foi possível encerrar a sessão.");
    } finally {
      setEncerrando(false);
    }
  }

  return (
    <div className={styles.banner} role="status">
      <div className={styles.content}>
        <span className={styles.badge}>Sessão de suporte</span>

        <div className={styles.text}>
          <strong>Empresa: {acesso.empresa_nome}</strong>
          <span>
            Você está no ambiente do cliente como administrador temporário.
            Todas as ações ficam vinculadas ao operador real
            {expiraLabel ? ` e a sessão expira às ${expiraLabel}` : ""}.
          </span>
          {erro && <span className={styles.error}>{erro}</span>}
        </div>
      </div>

      <button
        type="button"
        className={styles.exitButton}
        onClick={encerrar}
        disabled={encerrando}
      >
        {encerrando ? "Encerrando..." : "Encerrar acesso"}
      </button>
    </div>
  );
}
