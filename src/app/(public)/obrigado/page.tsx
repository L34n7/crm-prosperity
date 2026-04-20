"use client";

import { useRouter } from "next/navigation";
import styles from "./obrigado.module.css";

export default function ObrigadoPage() {
  const router = useRouter();

  const passos = [
    "Verifique seu email.",
    "Confirme sua conta.",
    "Entre na plataforma.",
    "Conecte seu WhatsApp oficial.",
  ];

  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlowTop} />
      <div className={styles.backgroundGlowBottom} />
      <div className={styles.backgroundGrid} />

      <section className={styles.card}>
        <div className={styles.successSeal}>
          <div className={styles.successSealInner}>✓</div>
        </div>

        <p className={styles.kicker}>Pagamento recebido</p>

        <h1 className={styles.title}>Assinatura confirmada com sucesso</h1>

        <p className={styles.description}>
          Estamos finalizando a criação da sua conta no <strong>CRM Prosperity</strong>.
          Em instantes, você poderá acessar a plataforma e começar a configurar
          sua operação com estrutura profissional.
        </p>

        <div className={styles.highlightBox}>
          <div className={styles.highlightIcon}>⚡</div>
          <div className={styles.highlightContent}>
            <strong>Seu acesso está em preparação.</strong>
            <p>
              Assim que a ativação estiver concluída, você poderá entrar no sistema
              e seguir com a configuração do seu WhatsApp oficial.
            </p>
          </div>
        </div>

        <div className={styles.stepsCard}>
          <div className={styles.stepsHeader}>
            <h2 className={styles.stepsTitle}>Próximos passos</h2>
            <p className={styles.stepsSubtitle}>
              Siga esta sequência para começar da forma certa.
            </p>
          </div>

          <div className={styles.stepsList}>
            {passos.map((passo, index) => (
              <div key={passo} className={styles.stepItem}>
                <div className={styles.stepNumber}>{index + 1}</div>
                <div className={styles.stepText}>{passo}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <button
            onClick={() => router.push("/login")}
            className={styles.primaryButton}
          >
            Ir para login
          </button>

          <button
            onClick={() => router.push("/comecar")}
            className={styles.secondaryButton}
          >
            Fazer novo cadastro
          </button>
        </div>

        <p className={styles.footerNote}>
          Se não encontrar o email de acesso, verifique também a caixa de spam ou promoções.
        </p>
      </section>
    </main>
  );
}