"use client";

import { useEffect } from "react";
import styles from "./PaymentProviderModal.module.css";

export type PaymentGateway = "prosperity_pay" | "atomo";

export type PaymentPlanSummary = {
  slug: "basico" | "essencial";
  nome: string;
  preco: string;
};

type PaymentProviderModalProps = {
  plano: PaymentPlanSummary | null;
  loadingGateway: PaymentGateway | null;
  error?: string;
  onClose: () => void;
  onSelect: (gateway: PaymentGateway) => void;
};

export default function PaymentProviderModal({
  plano,
  loadingGateway,
  error,
  onClose,
  onSelect,
}: PaymentProviderModalProps) {
  const busy = loadingGateway !== null;

  useEffect(() => {
    if (!plano) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [plano, busy, onClose]);

  if (!plano) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-provider-title"
      >
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Fechar"
          onClick={onClose}
          disabled={busy}
        >
          ×
        </button>

        <span className={styles.eyebrow}>Forma de pagamento</span>
        <h2 id="payment-provider-title" className={styles.title}>
          Finalizar com Prosperity Pay
        </h2>

        <p className={styles.subtitle}>
          <strong>Plano {plano.nome}</strong> — {plano.preco}
        </p>

        <p className={styles.description}>
          Contratação do plano pelo checkout principal do CRM Prosperity.
        </p>

        <button
          type="button"
          className={styles.prosperityPayButton}
          onClick={() => onSelect("prosperity_pay")}
          disabled={busy}
        >
          <span className={styles.providerIcon}>P</span>
          <span className={styles.providerContent}>
            <small>Checkout principal</small>
            <strong>Prosperity Pay</strong>
          </span>
          <span className={styles.providerAction}>
            {loadingGateway === "prosperity_pay" ? "Abrindo..." : "Continuar →"}
          </span>
        </button>

        <div className={styles.fallbackOption}>
          <span>Está com dificuldade para concluir pela Prosperity Pay?</span>
          <button
            type="button"
            className={styles.fallbackLink}
            onClick={() => onSelect("atomo")}
            disabled={busy}
          >
            {loadingGateway === "atomo"
              ? "Abrindo alternativa..."
              : "Usar Átomo como alternativa"}
          </button>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <p className={styles.helper}>
          A Prosperity Pay é a forma principal de pagamento. A Átomo fica
          disponível apenas como contingência.
        </p>
      </section>
    </div>
  );
}
