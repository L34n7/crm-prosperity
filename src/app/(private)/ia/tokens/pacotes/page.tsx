"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { solicitarAtualizacaoSaldoTokensIa } from "@/lib/ia/tokens-client-events";
import styles from "./pacotes.module.css";

type CompraCheckout = {
  nome: string;
  preco: string;
  descricaoCheckout: string;
  prosperityPayUrl: string;
  atomoUrl: string;
};

type PacoteTokens = CompraCheckout & {
  tokens: string;
  descricao: string;
  economia?: string;
  recursos: string[];
  destaque?: boolean;
};

const whatsappComercial =
  process.env.NEXT_PUBLIC_WHATSAPP_COMERCIAL || "5531975233266";

const PACOTE_50_PROSPERITY_PAY =
  "https://www.prosperitypay.com.br/checkout/22203982607a";
const PACOTE_200_PROSPERITY_PAY =
  "https://www.prosperitypay.com.br/checkout/a66f9a1dc10e";

const PACOTE_50_ATOMO =
  process.env.NEXT_PUBLIC_TOKEN_PACKAGE_1M_URL ||
  "https://go.atomopay.com.br/uoqee";
const PACOTE_200_ATOMO =
  process.env.NEXT_PUBLIC_TOKEN_PACKAGE_5M_URL ||
  "https://go.atomopay.com.br/8vyyj";

const ESSENCIAL_PROSPERITY_PAY =
  "https://www.prosperitypay.com.br/checkout/c7074bf9e18e";
const ESSENCIAL_ATOMO =
  process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL_ESSENCIAL ||
  "https://go.atomopay.com.br/7ibzm";

const pacotes: PacoteTokens[] = [
  {
    nome: "Pacote 50 mil tokens",
    tokens: "50.000 tokens",
    preco: "R$ 25",
    descricao:
      "Reforço rápido para manter automações, transcrições e análises com IA funcionando até a renovação.",
    descricaoCheckout: "Compra avulsa de 50 mil tokens de IA.",
    recursos: [
      "Saldo extra para o ciclo atual",
      "Ajuda a evitar pausas em automações",
      "Ideal para picos pontuais de atendimento",
      "Compra avulsa, sem alterar o plano",
    ],
    prosperityPayUrl: PACOTE_50_PROSPERITY_PAY,
    atomoUrl: PACOTE_50_ATOMO,
  },
  {
    nome: "Pacote 200 mil tokens",
    tokens: "200.000 tokens",
    preco: "R$ 100",
    descricao:
      "Mais volume em uma única compra para complementar o saldo até a renovação do plano.",
    descricaoCheckout: "Compra avulsa de 200 mil tokens de IA.",
    recursos: [
      "Maior folga para automações com IA",
      "Quatro vezes o volume do pacote de R$ 25",
      "Recomendado para picos maiores de atendimento",
      "Compra avulsa, sem alterar o plano",
    ],
    prosperityPayUrl: PACOTE_200_PROSPERITY_PAY,
    atomoUrl: PACOTE_200_ATOMO,
    destaque: true,
  },
];

const ofertaEssencial: CompraCheckout = {
  nome: "Plano Essencial IA+",
  preco: "R$ 267/mês",
  descricaoCheckout:
    "Upgrade para 400 mil tokens mensais e 6 usuários inclusos.",
  prosperityPayUrl: ESSENCIAL_PROSPERITY_PAY,
  atomoUrl: ESSENCIAL_ATOMO,
};

function abrirWhatsApp(mensagem: string) {
  const url = `https://api.whatsapp.com/send?phone=${whatsappComercial}&text=${encodeURIComponent(
    mensagem
  )}`;

  window.open(url, "_blank", "noopener,noreferrer");
}

export default function PacotesTokensPage() {
  const [compraSelecionada, setCompraSelecionada] =
    useState<CompraCheckout | null>(null);
  const [gatewayAbrindo, setGatewayAbrindo] = useState<
    "prosperity_pay" | "atomo" | null
  >(null);

  useEffect(() => {
    solicitarAtualizacaoSaldoTokensIa();
  }, []);

  useEffect(() => {
    if (!compraSelecionada) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function fecharComEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !gatewayAbrindo) {
        setCompraSelecionada(null);
      }
    }

    window.addEventListener("keydown", fecharComEscape);

    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", fecharComEscape);
    };
  }, [compraSelecionada, gatewayAbrindo]);

  function abrirModalPagamento(compra: CompraCheckout) {
    setGatewayAbrindo(null);
    setCompraSelecionada(compra);
  }

  function fecharModalPagamento() {
    if (gatewayAbrindo) return;
    setCompraSelecionada(null);
  }

  function abrirCheckout(gateway: "prosperity_pay" | "atomo") {
    if (!compraSelecionada || gatewayAbrindo) return;

    const url =
      gateway === "prosperity_pay"
        ? compraSelecionada.prosperityPayUrl
        : compraSelecionada.atomoUrl;

    if (!url) {
      abrirWhatsApp(
        `Olá! Preciso de ajuda para concluir a compra de ${compraSelecionada.nome}.`
      );
      return;
    }

    setGatewayAbrindo(gateway);
    window.location.assign(url);
  }

  return (
    <>
      <Header
        title="Pacotes de tokens"
        subtitle="Adicione saldo de IA ou ajuste o plano da sua operação."
      />

      <main className={styles.pageContent}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <p className={styles.heroKicker}>Tokens extras para IA</p>
            <h2>Evite que suas automações parem no meio do atendimento</h2>
            <p>
              Quando os tokens acabam, a IA deixa de interpretar respostas,
              analisar arquivos e transcrever áudios. Use pacotes avulsos para
              complementar o ciclo atual ou migre para um plano com mais volume
              mensal.
            </p>
          </div>

          <div className={styles.heroPanel}>
            <span>Planos atuais</span>
            <strong>Básico: 100 mil tokens</strong>
            <strong>Essencial: 400 mil tokens</strong>
            <Link href="/ia/tokens" className={styles.heroLink}>
              Ver extrato de consumo
            </Link>
          </div>
        </section>

        <section className={styles.packagesGrid}>
          {pacotes.map((pacote) => (
            <article
              key={pacote.nome}
              className={`${styles.packageCard} ${
                pacote.destaque ? styles.packageCardFeatured : ""
              }`}
            >
              {pacote.destaque && (
                <span className={styles.cornerSeal}>Mais volume</span>
              )}

              <div className={styles.badgeRow}>
                <span className={styles.miniBadge}>Pacote avulso</span>
              </div>

              <div className={styles.packageHeader}>
                <h3>{pacote.nome}</h3>
                <p>{pacote.tokens}</p>
              </div>

              <p className={styles.packageDescription}>{pacote.descricao}</p>

              <div className={styles.priceRow}>
                <span>{pacote.preco}</span>
                <small>pagamento único</small>
              </div>

              {pacote.economia && (
                <p className={styles.savings}>{pacote.economia}</p>
              )}

              <ul className={styles.featureList}>
                {pacote.recursos.map((recurso) => (
                  <li key={recurso}>
                    <span>✓</span>
                    {recurso}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => abrirModalPagamento(pacote)}
              >
                Comprar pacote
              </button>
            </article>
          ))}
        </section>

        <section className={styles.planGrid}>
          <article className={`${styles.planCard} ${styles.essentialCard}`}>
            <span className={styles.eyebrow}>Upgrade mensal</span>
            <h3>Plano Essencial IA+</h3>
            <p>
              Mais capacidade mensal para operações que usam IA com frequência
              e precisam de mais usuários no atendimento.
            </p>

            <div className={styles.essentialPrice}>
              <small>De R$ 367/mês</small>
              <strong>R$ 267/mês</strong>
            </div>

            <ul className={styles.essentialBenefits}>
              <li>400 mil tokens de IA por mês</li>
              <li>6 usuários inclusos</li>
              <li>Automação avançada e gestão completa</li>
            </ul>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => abrirModalPagamento(ofertaEssencial)}
            >
              Mudar para Essencial
            </button>
          </article>

          <article className={styles.planCard}>
            <span className={styles.eyebrow}>Operação maior</span>
            <h3>Cotação personalizada</h3>
            <p>
              Para volumes maiores, múltiplos números ou uso intenso de IA,
              monte um limite e uma estrutura sob medida.
            </p>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() =>
                abrirWhatsApp(
                  "Olá! Quero uma cotação personalizada de tokens e plano para o CRM Prosperity."
                )
              }
            >
              Solicitar cotação
            </button>
          </article>
        </section>
      </main>

      {compraSelecionada && (
        <div
          className={styles.paymentOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              fecharModalPagamento();
            }
          }}
        >
          <section
            className={styles.paymentModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="token-payment-title"
          >
            <button
              type="button"
              className={styles.paymentClose}
              onClick={fecharModalPagamento}
              disabled={Boolean(gatewayAbrindo)}
              aria-label="Fechar"
            >
              ×
            </button>

            <span className={styles.paymentEyebrow}>Forma de pagamento</span>
            <h2 id="token-payment-title">Finalizar com Prosperity Pay</h2>

            <p className={styles.paymentSubtitle}>
              <strong>{compraSelecionada.nome}</strong> —{" "}
              {compraSelecionada.preco}
            </p>

            <p className={styles.paymentDescription}>
              {compraSelecionada.descricaoCheckout}
            </p>

            <button
              type="button"
              className={styles.prosperityPayButton}
              onClick={() => abrirCheckout("prosperity_pay")}
              disabled={Boolean(gatewayAbrindo)}
            >
              <span className={styles.paymentProviderIcon}>P</span>
              <span className={styles.paymentProviderText}>
                <small>Checkout principal</small>
                <strong>Prosperity Pay</strong>
              </span>
              <span className={styles.paymentProviderAction}>
                {gatewayAbrindo === "prosperity_pay"
                  ? "Abrindo..."
                  : "Continuar →"}
              </span>
            </button>

            <div className={styles.paymentFallback}>
              <span>
                Está com dificuldade para concluir pela Prosperity Pay?
              </span>
              <button
                type="button"
                onClick={() => abrirCheckout("atomo")}
                disabled={Boolean(gatewayAbrindo)}
              >
                {gatewayAbrindo === "atomo"
                  ? "Abrindo alternativa..."
                  : "Usar Átomo como alternativa"}
              </button>
            </div>

            <p className={styles.paymentHelper}>
              A Prosperity Pay é a forma principal de pagamento. A Átomo fica
              disponível apenas como contingência.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
