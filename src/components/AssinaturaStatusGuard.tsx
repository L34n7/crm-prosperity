"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AssinaturaEmpresa } from "@/lib/assinaturas/status";
import { useHeaderUser } from "@/components/header-user-context";
import styles from "./CrmShell.module.css";

type Props = {
  assinatura: AssinaturaEmpresa | null;
  isAdmin: boolean;
};

const INTERVALO_VENCIDA_MS = 20 * 60 * 1000;
const INTERVALO_BLOQUEADA_MS = 10 * 60 * 1000;

function formatarData(valor: string | null) {
  if (!valor) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(valor));
}

export default function AssinaturaStatusGuard({ assinatura, isAdmin }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const headerUser = useHeaderUser();
  const [popupAberto, setPopupAberto] = useState(false);

  const status = assinatura?.status ?? "ativa";
  const bloqueada = status === "bloqueada";
  const vencida = status === "vencida";
  const intervaloLembrete = bloqueada
    ? INTERVALO_BLOQUEADA_MS
    : INTERVALO_VENCIDA_MS;

  const storageKey = useMemo(() => {
    if (!assinatura || status === "ativa") return null;

    return [
      "assinatura-renovacao",
      assinatura.plano_id || "sem-plano",
      status,
      assinatura.vencimento_em || "sem-vencimento",
      assinatura.bloqueio_em || "sem-bloqueio",
    ].join(":");
  }, [assinatura, status]);

  useEffect(() => {
    if (!bloqueada || !isAdmin) return;
    if (pathname === "/conversas" || pathname.startsWith("/conversas/")) return;

    router.replace("/conversas");
  }, [bloqueada, isAdmin, pathname, router]);

  useEffect(() => {
    if (!assinatura || status === "ativa" || !storageKey) {
      return;
    }

    const chaveStorage = storageKey;

    function deveAbrirPopup() {
      const ultimoAviso = Number(
        window.localStorage.getItem(chaveStorage) || ""
      );
      return (
        !Number.isFinite(ultimoAviso) ||
        Date.now() - ultimoAviso >= intervaloLembrete
      );
    }

    const aberturaInicialTimer = deveAbrirPopup()
      ? window.setTimeout(() => {
          setPopupAberto(true);
          window.localStorage.setItem(chaveStorage, String(Date.now()));
        }, 0)
      : null;

    const timer = window.setInterval(() => {
      if (deveAbrirPopup()) {
        setPopupAberto(true);
        window.localStorage.setItem(chaveStorage, String(Date.now()));
      }
    }, 60_000);

    return () => {
      window.clearInterval(timer);

      if (aberturaInicialTimer !== null) {
        window.clearTimeout(aberturaInicialTimer);
      }
    };
  }, [assinatura, intervaloLembrete, status, storageKey]);

  useEffect(() => {
    function abrirPopup() {
      if (status !== "ativa") {
        setPopupAberto(true);
        if (storageKey) {
          window.localStorage.setItem(storageKey, String(Date.now()));
        }
      }
    }

    window.addEventListener("assinatura:abrir-renovacao", abrirPopup);

    return () => {
      window.removeEventListener("assinatura:abrir-renovacao", abrirPopup);
    };
  }, [status, storageKey]);

  if (!assinatura || status === "ativa") return null;

  const titulo = bloqueada
    ? "Plano bloqueado"
    : "Plano vencido";
  const mensagem = bloqueada
    ? "A renovacao nao foi identificada dentro do prazo. Os fluxos foram pausados e o acesso ficou limitado ate a renovacao."
    : "O ciclo do plano terminou. Renove em ate 7 dias para evitar bloqueio dos fluxos e das permissoes.";
  const podeFechar = vencida || (bloqueada && isAdmin);
  const checkoutUrl = assinatura.checkout_url || "/plano";
  const bloquearTela = bloqueada && !isAdmin;

  return (
    <>
      {bloquearTela && (
        <div className={styles.assinaturaBlockOverlay} role="dialog" aria-modal="true">
          <div className={styles.assinaturaModal}>
            <span className={styles.assinaturaEyebrow}>Acesso bloqueado</span>
            <h2>Plano aguardando renovacao</h2>
            <p>
              Sua empresa esta com o plano bloqueado. As permissoes ficam
              suspensas ate que um administrador renove a assinatura.
            </p>
          </div>
        </div>
      )}

      {popupAberto && (
        <div className={styles.assinaturaPopupOverlay} role="dialog" aria-modal="true">
          <div className={styles.assinaturaModal}>
            {podeFechar && (
              <button
                type="button"
                className={styles.assinaturaClose}
                onClick={() => setPopupAberto(false)}
                aria-label="Fechar aviso de renovacao"
              >
                x
              </button>
            )}

            <span className={styles.assinaturaEyebrow}>
              {assinatura.plano_nome || "CRM Prosperity"}
            </span>

            <h2>{titulo}</h2>
            <p>{mensagem}</p>

            <div className={styles.assinaturaDates}>
              <div>
                <span>Vencimento</span>
                <strong>{formatarData(assinatura.vencimento_em)}</strong>
              </div>
              <div>
                <span>Bloqueio</span>
                <strong>{formatarData(assinatura.bloqueio_em)}</strong>
              </div>
            </div>

            <div className={styles.assinaturaActions}>
              <Link href={checkoutUrl} className={styles.assinaturaPrimary}>
                Renovar plano
              </Link>

              {podeFechar && (
                <button
                  type="button"
                  className={styles.assinaturaSecondary}
                  onClick={() => setPopupAberto(false)}
                >
                  Lembrar depois
                </button>
              )}
            </div>

            {bloqueada && isAdmin && (
              <p className={styles.assinaturaHint}>
                {headerUser.profileName}, enquanto o plano estiver bloqueado,
                o administrador pode continuar apenas pela pagina de conversas.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
