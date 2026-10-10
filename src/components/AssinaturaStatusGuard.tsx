"use client";

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
  const [checkoutTrialLoading, setCheckoutTrialLoading] = useState(false);
  const [checkoutTrialErro, setCheckoutTrialErro] = useState("");

  const status = assinatura?.status ?? "ativa";
  const bloqueada = status === "bloqueada";
  const vencida = status === "vencida";
  const trialEncerrado = bloqueada && assinatura?.free_trial_4d === true;
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

  function abrirModalPlanos() {
    const detail = { handled: false };

    setPopupAberto(false);
    window.dispatchEvent(
      new CustomEvent("assinatura:abrir-modal-planos", { detail })
    );

    if (!detail.handled) {
      router.push("/plano");
    }
  }

  async function abrirCheckoutTrialBasico() {
    if (checkoutTrialLoading) return;

    const novaAba = window.open("about:blank", "_blank");

    if (!novaAba) {
      setCheckoutTrialErro(
        "O navegador bloqueou a nova aba. Permita pop-ups e tente novamente."
      );
      return;
    }

    novaAba.opener = null;
    setCheckoutTrialLoading(true);
    setCheckoutTrialErro("");

    try {
      const response = await fetch("/api/assinaturas/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plano_slug: "basico",
          renovar_plano_atual: true,
          gateway: assinatura?.affiliate_ref
            ? "prosperity_pay"
            : "atomo",
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok || !data?.checkout_url) {
        novaAba.close();
        throw new Error(
          data?.error || "Não foi possível gerar o checkout do plano Básico."
        );
      }

      novaAba.location.href = data.checkout_url;
    } catch (error) {
      novaAba.close();
      setCheckoutTrialErro(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o checkout do plano Básico."
      );
    } finally {
      setCheckoutTrialLoading(false);
    }
  }

  const titulo = trialEncerrado
    ? "Período de teste encerrado"
    : bloqueada
      ? "Plano bloqueado"
      : "Plano vencido";
  const mensagem = trialEncerrado
    ? "Seu teste gratuito de 4 dias terminou. Automações e IA foram pausadas, os tokens foram zerados e o acesso ficou limitado à área de conversas até a contratação do plano Básico."
    : bloqueada
      ? "A renovação não foi identificada dentro do prazo. Os fluxos foram pausados e o acesso ficou limitado até a renovação."
      : "O ciclo do plano terminou. Renove em até 7 dias para evitar bloqueio dos fluxos e das permissões.";
  const podeFechar = vencida || (bloqueada && isAdmin);
  const bloquearTela = bloqueada && !isAdmin;

  return (
    <>
      {bloquearTela && (
        <div className={styles.assinaturaBlockOverlay} role="dialog" aria-modal="true">
          <div className={styles.assinaturaModal}>
            <span className={styles.assinaturaEyebrow}>Acesso bloqueado</span>
            <h2>
              {trialEncerrado
                ? "Período de teste encerrado"
                : "Plano aguardando renovação"}
            </h2>
            <p>
              {trialEncerrado
                ? "O teste gratuito terminou. Um administrador precisa contratar o plano Básico para liberar novamente o sistema."
                : "Sua empresa está com o plano bloqueado. As permissões ficam suspensas até que um administrador renove a assinatura."}
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
              <button
                type="button"
                className={styles.assinaturaPrimary}
                onClick={
                  trialEncerrado ? abrirCheckoutTrialBasico : abrirModalPlanos
                }
                disabled={trialEncerrado && checkoutTrialLoading}
              >
                {trialEncerrado
                  ? checkoutTrialLoading
                    ? "Preparando pagamento..."
                    : "Continuar com plano Básico"
                  : "Renovar plano"}
              </button>

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

            {checkoutTrialErro && trialEncerrado && (
              <p className={styles.assinaturaHint}>{checkoutTrialErro}</p>
            )}

            {bloqueada && isAdmin && (
              <p className={styles.assinaturaHint}>
                {headerUser.profileName}, enquanto o plano estiver bloqueado,
                o administrador pode continuar apenas pela página de conversas.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
