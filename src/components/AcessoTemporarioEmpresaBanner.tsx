"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AcessoTemporarioEmpresaContexto } from "@/lib/auth/get-usuario-contexto";
import styles from "./AcessoTemporarioEmpresaBanner.module.css";

export default function AcessoTemporarioEmpresaBanner({
  acesso,
}: {
  acesso: AcessoTemporarioEmpresaContexto;
}) {
  const [encerrando, setEncerrando] = useState(false);
  const [erro, setErro] = useState("");
  const encerramentoEmAndamento = useRef(false);

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

    const timer = window.setTimeout(() => {
      void encerrar("expiracao");
    }, Math.max(restante + 250, 0));

    return () => window.clearTimeout(timer);
  }, [acesso.expira_em, acesso.sessao_id]);

  async function encerrar(motivo: "manual" | "expiracao" = "manual") {
    if (encerramentoEmAndamento.current) return;

    encerramentoEmAndamento.current = true;
    setEncerrando(true);
    setErro("");

    try {
      const response = await fetch("/api/empresas/acesso-temporario", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          sessao_id: acesso.sessao_id,
          motivo,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setErro(data.error || "Não foi possível encerrar a sessão.");
        encerramentoEmAndamento.current = false;
        return;
      }

      if (data.sessao_substituida) {
        window.location.reload();
        return;
      }

      window.location.replace("/configuracoes/empresas");
    } catch {
      setErro("Não foi possível encerrar a sessão.");
      encerramentoEmAndamento.current = false;
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
        onClick={() => void encerrar("manual")}
        disabled={encerrando}
      >
        {encerrando ? "Encerrando..." : "Encerrar acesso"}
      </button>
    </div>
  );
}
