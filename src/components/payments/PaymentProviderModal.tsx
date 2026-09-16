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

        <div className={styles.eyebrow}>Forma de pagamento</div>
        <h2 id="payment-provider-title" className={styles.title}>
          Como deseja pagar?
        </h2>
        <p className={styles.subtitle}>
          Você escolheu o plano <strong>{plano.nome}</strong> por {plano.preco}.
          Selecione o checkout para continuar.
        </p>

        <div className={styles.options}>
          <button
            type="button"
            className={`${styles.providerButton} ${styles.prosperityButton}`}
            onClick={() => onSelect("prosperity_pay")}
            disabled={busy}
          >
            <span className={styles.providerIcon}>P</span>
            <span className={styles.providerContent}>
              <span className={styles.providerTitleRow}>
                <strong>Prosperity Pay</strong>
                {plano.slug === "basico" ? (
                  <span className={styles.testBadge}>Teste R$ 5</span>
                ) : null}
              </span>
              <span className={styles.providerDescription}>
                Checkout da Prosperity Pay
              </span>
            </span>
            <span className={styles.providerAction}>
              {loadingGateway === "prosperity_pay" ? "Abrindo..." : "Continuar"}
            </span>
          </button>

          <button
            type="button"
            className={styles.providerButton}
            onClick={() => onSelect("atomo")}
            disabled={busy}
          >
            <span className={`${styles.providerIcon} ${styles.atomoIcon}`}>A</span>
            <span className={styles.providerContent}>
              <span className={styles.providerTitleRow}>
                <strong>Atomo</strong>
              </span>
              <span className={styles.providerDescription}>
                Continuar pelo checkout atual da Atomo
              </span>
            </span>
            <span className={styles.providerAction}>
              {loadingGateway === "atomo" ? "Abrindo..." : "Continuar"}
            </span>
          </button>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <p className={styles.helper}>
          A escolha altera apenas o checkout. O plano contratado continua o mesmo.
        </p>
      </section>
    </div>
  );
}
