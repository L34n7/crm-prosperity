"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { montarWhatsappUrl } from "@/lib/contatos/sistema";
import styles from "../obrigado/obrigado.module.css";

const PASSOS = [
  "Verifique seu e-mail.",
  "Crie sua senha de primeiro acesso.",
  "Entre na plataforma.",
  "Aproveite o plano Básico por 4 dias.",
];

const AJUDA_WHATSAPP_URL = montarWhatsappUrl(
  "Olá! Preciso de ajuda com meu Free Trial de 4 dias do CRM Prosperity."
);

export default function TrialIniciadoPage() {
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
            alt="CRM Prosperity"
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

        <p className={styles.kicker}>Free Trial ativado</p>

        <h1 className={styles.title}>Seu teste gratuito de 4 dias começou</h1>

        <p className={styles.description}>
          Seu acesso ao <strong>plano Básico</strong> foi liberado sem cobrança.
          Enviamos para o seu e-mail o link para criar a senha e acessar o CRM.
        </p>

        <div className={styles.highlightBox}>
          <div className={styles.highlightIcon}>⚡</div>
          <div className={styles.highlightContent}>
            <strong>Você tem 4 dias para testar o CRM Prosperity.</strong>
            <p>
              Ao final do período, o acesso ficará limitado até a contratação do
              plano Básico. Se o cadastro veio por um credenciado, a origem
              comercial será preservada no pagamento.
            </p>
          </div>
        </div>

        <div className={styles.stepsCard}>
          <div className={styles.stepsHeader}>
            <h2 className={styles.stepsTitle}>Próximos passos</h2>
            <p className={styles.stepsSubtitle}>
              Comece agora e aproveite o período de teste.
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
          Se não encontrar o e-mail de acesso, verifique também a caixa de spam
          ou promoções.
        </p>
      </section>
    </main>
  );
}
