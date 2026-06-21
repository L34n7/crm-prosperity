"use client";

import Link from "next/link";
import { useEffect } from "react";
import Header from "@/components/Header";
import { solicitarAtualizacaoSaldoTokensIa } from "@/lib/ia/tokens-client-events";
import styles from "./pacotes.module.css";

type PacoteTokens = {
  nome: string;
  tokens: string;
  preco: string;
  descricao: string;
  economia?: string;
  recursos: string[];
  checkoutUrl?: string;
  destaque?: boolean;
};

const whatsappComercial =
  process.env.NEXT_PUBLIC_WHATSAPP_COMERCIAL || "5531975233266";

const checkoutEssencial =
  process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL_ESSENCIAL || "";

const pacotes: PacoteTokens[] = [
  {
    nome: "Pacote 1 mi",
    tokens: "1.000.000 tokens",
    preco: "R$ 25",
    descricao:
      "Reforco rapido para manter automacoes, transcricoes e analises com IA funcionando ate a renovacao.",
    recursos: [
      "Saldo extra para o ciclo atual",
      "Ajuda a evitar pausas em automacoes",
      "Ideal para picos pontuais de atendimento",
      "Compra avulsa, sem alterar o plano",
    ],
    checkoutUrl: process.env.NEXT_PUBLIC_TOKEN_PACKAGE_1M_URL || "",
  },
  {
    nome: "Pacote 5 mi",
    tokens: "5.000.000 tokens",
    preco: "R$ 100",
    descricao:
      "Melhor custo por volume para operacoes que usam IA com frequencia durante o atendimento. Garanta a sua operação até a renovacao",
    economia: "Economize R$25 comparado a 5 pacotes de 1mi.",
    recursos: [
      "Maior folga para automacoes com IA",
      "Melhor custo por milhao de tokens",
      "Recomendado para equipes com alto volume",
      "Mantem analises e transcricoes operando",
    ],
    checkoutUrl: process.env.NEXT_PUBLIC_TOKEN_PACKAGE_5M_URL || "",
    destaque: true,
  },
];

function abrirWhatsApp(mensagem: string) {
  const url = `https://api.whatsapp.com/send?phone=${whatsappComercial}&text=${encodeURIComponent(
    mensagem
  )}`;

  window.open(url, "_blank", "noopener,noreferrer");
}

function comprarPacote(pacote: PacoteTokens) {
  if (pacote.checkoutUrl) {
    window.location.assign(pacote.checkoutUrl);
    return;
  }

  abrirWhatsApp(
    `Ola! Quero comprar o ${pacote.nome} de IA (${pacote.tokens}) por ${pacote.preco}.`
  );
}

function contratarEssencial() {
  if (checkoutEssencial) {
    window.location.assign(checkoutEssencial);
    return;
  }

  abrirWhatsApp("Ola! Quero mudar meu plano para o Essencial.");
}

export default function PacotesTokensPage() {
  useEffect(() => {
    solicitarAtualizacaoSaldoTokensIa();
  }, []);

  return (
    <>
      <Header
        title="Pacotes de tokens"
        subtitle="Adicione saldo de IA ou ajuste o plano da sua operacao."
      />

      <main className={styles.pageContent}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <p className={styles.heroKicker}>Tokens extras para IA</p>
            <h2>Evite que suas automacoes parem no meio do atendimento</h2>
            <p>
              Quando os tokens acabam, a IA deixa de interpretar respostas,
              analisar arquivos e transcrever audios. Use pacotes avulsos para
              complementar o ciclo atual ou migre para um plano com mais volume
              mensal.
            </p>
          </div>

          <div className={styles.heroPanel}>
            <span>Planos atuais</span>
            <strong>Basico: 1 mi tokens</strong>
            <strong>Essencial: 5 mi tokens</strong>
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
                <span className={styles.cornerSeal}>Melhor valor</span>
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
                <small>pagamento unico</small>
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
                onClick={() => comprarPacote(pacote)}
              >
                Comprar pacote
              </button>
            </article>
          ))}
        </section>

        <section className={styles.planGrid}>
          <article className={styles.planCard}>
            <span className={styles.eyebrow}>Upgrade mensal</span>
            <h3>Plano Essencial</h3>
            <p>
              Aumente o limite mensal para 5 milhoes de tokens e tenha mais
              folga para automacoes com IA no atendimento.
            </p>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={contratarEssencial}
            >
              Mudar para Essencial
            </button>
          </article>

          <article className={styles.planCard}>
            <span className={styles.eyebrow}>Operacao maior</span>
            <h3>Cotacao personalizada</h3>
            <p>
              Para volumes maiores, multiplos numeros ou uso intenso de IA,
              monte um limite e uma estrutura sob medida.
            </p>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() =>
                abrirWhatsApp(
                  "Ola! Quero uma cotacao personalizada de tokens e plano para o CRM Prosperity."
                )
              }
            >
              Solicitar cotacao
            </button>
          </article>
        </section>
      </main>
    </>
  );
}
