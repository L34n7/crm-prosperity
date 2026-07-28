"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { montarWhatsappUrl } from "@/lib/contatos/sistema";
import styles from "./obrigado.module.css";

const PASSOS = [
  "Verifique seu email.",
  "Confirme sua conta.",
  "Entre na plataforma.",
  "Conecte seu WhatsApp oficial.",
];

const AJUDA_WHATSAPP_URL = montarWhatsappUrl(
  "Olá! Preciso de ajuda com meu acesso ao CRM Prosperity."
);

export default function ObrigadoPage() {
  const router = useRouter();

  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlowTop} />
      <div className={styles.backgroundGlowBottom} />
      <div className={styles.backgroundGrid} />

      <section className={styles.card}>
        <Link href="/" className={styles.brand} aria-label="Voltar para a página inicial">
          <Image
            src="/logo.png"
            alt="Prosperity CRM"
            width={58}
            height={57}
            className={styles.logo}
            priority
          />
          <span><strong>Prosperity</strong> CRM</span>
        </Link>

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
            {PASSOS.map((passo, index) => (
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

          <a
            href={AJUDA_WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className={styles.helpButton}
          >
            <MessageCircle size={19} aria-hidden="true" />
            Solicitar ajuda pelo WhatsApp
          </a>
        </div>

        <p className={styles.footerNote}>
          Se não encontrar o email de acesso, verifique também a caixa de spam ou promoções.
        </p>
      </section>
    </main>
  );
}
