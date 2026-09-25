import styles from "./checkout-carregando.module.css";

export const dynamic = "force-static";

export default function CheckoutCarregandoPage() {
  return (
    <main className={styles.page}>
      <section
        className={styles.card}
        role="status"
        aria-live="polite"
        aria-label="Preparando checkout"
      >
        <div className={styles.brand}>
          <span className={styles.brandIcon}>P</span>
          <div>
            <small>Prosperity CRM</small>
            <strong>Pagamento seguro</strong>
          </div>
        </div>

        <div className={styles.spinner} aria-hidden="true" />

        <div className={styles.content}>
          <h1>Preparando seu checkout</h1>
          <p>
            Estamos sincronizando seu plano, adicionais e o valor da cobrança
            com a Prosperity Pay.
          </p>
        </div>

        <div className={styles.steps}>
          <span>Validando assinatura</span>
          <span>Calculando composição</span>
          <span>Gerando checkout seguro</span>
        </div>

        <p className={styles.note}>
          Esta página será redirecionada automaticamente assim que o checkout
          estiver pronto.
        </p>
      </section>
    </main>
  );
}
