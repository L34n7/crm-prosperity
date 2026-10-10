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

const INTERVALO_TRIAL_MS = 5 * 60 * 1000;
const INTERVALO_VENCIDA_MS = 20 * 60 * 1000;
const INTERVALO_BLOQUEADA_MS = 10 * 60 * 1000;
const TRIAL_AVISO_LOGIN_STORAGE_KEY = "crm_trial_aviso_apos_login";

function formatarData(valor: string | null) {
  if (!valor) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(valor));
}

function formatarDataHora(valor: string | null) {
  if (!valor) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
  const trialAtivo = status === "ativa" && assinatura?.free_trial_4d === true;
  const trialEncerrado = bloqueada && assinatura?.free_trial_4d === true;
  const intervaloLembrete = trialAtivo
    ? INTERVALO_TRIAL_MS
    : bloqueada
      ? INTERVALO_BLOQUEADA_MS
      : INTERVALO_VENCIDA_MS;

  const storageKey = useMemo(() => {
    if (!assinatura) return null;

    if (trialAtivo) {
      return [
        "assinatura-trial",
        assinatura.plano_id || "sem-plano",
        assinatura.vencimento_em || "sem-vencimento",
      ].join(":");
    }

    if (status === "ativa") return null;

    return [
      "assinatura-renovacao",
      assinatura.plano_id || "sem-plano",
      status,
      assinatura.vencimento_em || "sem-vencimento",
      assinatura.bloqueio_em || "sem-bloqueio",
    ].join(":");
  }, [assinatura, status, trialAtivo]);

  useEffect(() => {
    if (!bloqueada || !isAdmin) return;
    if (pathname === "/conversas" || pathname.startsWith("/conversas/")) return;

    router.replace("/conversas");
  }, [bloqueada, isAdmin, pathname, router]);

  useEffect(() => {
    if (!assinatura || !storageKey) {
      return;
    }

    const relevante = trialAtivo || status !== "ativa";
    if (!relevante) return;

    const chaveStorage = storageKey;
    const forcarAvisoAposLogin =
      trialAtivo &&
      window.sessionStorage.getItem(TRIAL_AVISO_LOGIN_STORAGE_KEY) === "true";

    if (forcarAvisoAposLogin) {
      window.sessionStorage.removeItem(TRIAL_AVISO_LOGIN_STORAGE_KEY);
    }

    function deveAbrirPopup() {
      const ultimoAviso = Number(
        window.localStorage.getItem(chaveStorage) || ""
      );
      return (
        !Number.isFinite(ultimoAviso) ||
        Date.now() - ultimoAviso >= intervaloLembrete
      );
    }

    const aberturaInicialTimer =
      forcarAvisoAposLogin || deveAbrirPopup()
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
    }, trialAtivo ? 15_000 : 60_000);

    return () => {
      window.clearInterval(timer);

      if (aberturaInicialTimer !== null) {
        window.clearTimeout(aberturaInicialTimer);
      }
    };
  }, [
    assinatura,
    intervaloLembrete,
    status,
    storageKey,
    trialAtivo,
  ]);

  useEffect(() => {
    function abrirPopup() {
      if (status !== "ativa" || trialAtivo) {
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
  }, [status, storageKey, trialAtivo]);

  if (!assinatura || (status === "ativa" && !trialAtivo)) return null;

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

  const titulo = trialAtivo
    ? "Plano de teste ativo"
    : trialEncerrado
      ? "Período de teste encerrado"
      : bloqueada
        ? "Plano bloqueado"
        : "Plano vencido";
  const mensagem = trialAtivo
    ? `Você está usando o plano Básico em período de teste por 4 dias. O teste encerra em ${formatarDataHora(assinatura.vencimento_em)}. Depois desse prazo, será necessário contratar um plano para continuar usando todos os recursos.`
    : trialEncerrado
      ? "Seu teste gratuito de 4 dias terminou. Automações e IA foram pausadas, os tokens foram zerados e o acesso ficou limitado à área de conversas até a contratação do plano Básico."
      : bloqueada
        ? "A renovação não foi identificada dentro do prazo. Os fluxos foram pausados e o acesso ficou limitado até a renovação."
        : "O ciclo do plano terminou. Renove em até 7 dias para evitar bloqueio dos fluxos e das permissões.";
  const podeFechar = trialAtivo || vencida || (bloqueada && isAdmin);
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
              {trialAtivo
                ? `${assinatura.plano_nome || "Plano Básico"} · Teste de 4 dias`
                : assinatura.plano_nome || "CRM Prosperity"}
            </span>

            <h2>{titulo}</h2>
            <p>{mensagem}</p>

            <div className={styles.assinaturaDates}>
              <div>
                <span>{trialAtivo ? "Início do teste" : "Vencimento"}</span>
                <strong>
                  {trialAtivo
                    ? formatarDataHora(assinatura.inicio_em)
                    : formatarData(assinatura.vencimento_em)}
                </strong>
              </div>
              <div>
                <span>{trialAtivo ? "Encerra em" : "Bloqueio"}</span>
                <strong>
                  {trialAtivo
                    ? formatarDataHora(assinatura.vencimento_em)
                    : formatarData(assinatura.bloqueio_em)}
                </strong>
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
                {trialAtivo
                  ? "Ver planos"
                  : trialEncerrado
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
