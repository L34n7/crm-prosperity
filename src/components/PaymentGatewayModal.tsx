"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./PaymentGatewayModal.module.css";

type PlanoSlug = "basico" | "essencial";
type GatewayPagamento = "prosperity_pay" | "atomo";

type PlanoPagamento = {
  slug: PlanoSlug;
  nome: string;
  renovarPlanoAtual: boolean;
};

type CheckoutPlanoResponse = {
  ok: boolean;
  checkout_url?: string;
  error?: string;
};

type PaymentGatewayModalProps = {
  plano: PlanoPagamento;
  onClose: () => void;
};

const PROSPERITY_PAY_CHECKOUTS: Record<PlanoSlug, string> = {
  basico: "https://prosperitypay.com.br/checkout/plano-basic-be3817c7",
  essencial: "https://prosperitypay.com.br/checkout/c7074bf9e18e",
};

function nomeGateway(gateway: GatewayPagamento) {
  return gateway === "prosperity_pay" ? "Prosperity Pay" : "Átomo";
}

export default function PaymentGatewayModal({
  plano,
  onClose,
}: PaymentGatewayModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loadingGateway, setLoadingGateway] =
    useState<GatewayPagamento | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMessage("");
    setError("");
  }, [plano.slug, plano.renovarPlanoAtual]);

  async function abrirCheckout(gateway: GatewayPagamento) {
    if (loadingGateway) return;

    const novaAba = window.open("about:blank", "_blank");

    if (!novaAba) {
      setError(
        "O navegador bloqueou a nova aba. Permita pop-ups para o CRM e tente novamente."
      );
      return;
    }

    novaAba.opener = null;
    setLoadingGateway(gateway);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/assinaturas/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plano_slug: plano.slug,
          renovar_plano_atual: plano.renovarPlanoAtual,
          gateway,
        }),
      });

      const data = (await response.json()) as CheckoutPlanoResponse;

      if (!response.ok || !data.ok) {
        novaAba.close();
        setError(data.error || "Não foi possível preparar o checkout.");
        return;
      }

      const checkoutUrl = plano.renovarPlanoAtual
        ? data.checkout_url
        : gateway === "prosperity_pay"
          ? PROSPERITY_PAY_CHECKOUTS[plano.slug]
          : data.checkout_url;

      if (!checkoutUrl) {
        novaAba.close();
        setError(`Checkout do ${nomeGateway(gateway)} não configurado.`);
        return;
      }

      novaAba.location.href = checkoutUrl;
      setMessage(
        `Checkout do ${nomeGateway(gateway)} aberto em uma nova aba. Se precisar, você pode usar o outro gateway por aqui.`
      );
    } catch {
      novaAba.close();
      setError("Erro inesperado ao preparar o checkout.");
    } finally {
      setLoadingGateway(null);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-gateway-title"
      onClick={() => {
        if (!loadingGateway) onClose();
      }}
    >
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Forma de pagamento</span>
            <h2 id="payment-gateway-title">Escolha como pagar</h2>
            <p>
              Plano <strong>{plano.nome}</strong>. O checkout será aberto em uma
              nova aba e o CRM continuará disponível nesta tela.
            </p>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={Boolean(loadingGateway)}
            aria-label="Fechar opções de pagamento"
          >
            ×
          </button>
        </div>

        <div className={styles.gatewayGrid}>
          <button
            type="button"
            className={`${styles.gatewayCard} ${styles.gatewayCardPrimary}`}
            onClick={() => abrirCheckout("prosperity_pay")}
            disabled={Boolean(loadingGateway)}
          >
            <span className={styles.gatewayBadge}>Recomendado</span>
            <strong>Prosperity Pay</strong>
            <small>Continue pelo checkout principal da Prosperity Pay.</small>
            <span className={styles.gatewayAction}>
              {loadingGateway === "prosperity_pay"
                ? "Preparando checkout..."
                : "Continuar com Prosperity Pay ↗"}
            </span>
          </button>

          <div className={styles.fallbackOption}>
            <span>
              Está com dificuldade para concluir pela Prosperity Pay?
            </span>
            <button
              type="button"
              className={styles.fallbackLink}
              onClick={() => abrirCheckout("atomo")}
              disabled={Boolean(loadingGateway)}
            >
              {loadingGateway === "atomo"
                ? "Abrindo alternativa..."
                : "Usar Átomo como alternativa"}
            </button>
          </div>
        </div>

        {message && <p className={styles.successMessage}>{message}</p>}
        {error && <p className={styles.errorMessage}>{error}</p>}

        <p className={styles.footnote}>
          A Prosperity Pay é o checkout principal. A Átomo permanece disponível
          apenas como alternativa de contingência.
        </p>
      </div>
    </div>,
    document.body
  );
}
