"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./plano.module.css";

type Plano = {
  slug?: "basico" | "essencial";
  nome: string;
  descricao: string;
  precoOriginal?: string;
  preco: string;
  observacaoPreco?: string;
  recursos: string[];
  tipo: "checkout" | "cotacao";
  badge?: string;
};

type CheckoutResponse = {
  ok: boolean;
  checkout_url?: string;
  error?: string;
};

export default function PlanoPage() {
  const router = useRouter();
  const [planosExpandidos, setPlanosExpandidos] = useState<string[]>([]);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const whatsappComercial =
    process.env.NEXT_PUBLIC_WHATSAPP_COMERCIAL || "5531975233266";

  async function handleCheckout(planoSlug: "basico" | "essencial") {
    const leadId = localStorage.getItem("lead_id");

    if (!leadId) {
      alert(
        "Lead não encontrado. Volte para a página inicial e preencha o formulário novamente."
      );
      router.push("/comecar");
      return;
    }

    setLoadingCheckout(true);

    try {
      const res = await fetch("/api/public/checkout-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lead_id: leadId,
          plano_slug: planoSlug,
        }),
      });

      const data = (await res.json()) as CheckoutResponse;

      if (!res.ok || !data?.checkout_url) {
        alert(data?.error || "Não foi possível iniciar o checkout.");
        setLoadingCheckout(false);
        return;
      }

      window.location.assign(data.checkout_url);
    } catch (error) {
      console.error("Erro ao buscar checkout:", error);
      alert("Erro inesperado ao iniciar o checkout.");
      setLoadingCheckout(false);
    }
  }

  function abrirCotacaoWhatsApp() {
    const mensagem = encodeURIComponent(
      "Olá! Quero fazer uma cotação do plano Profissional do CRM Prosperity."
    );

    window.location.assign(`https://wa.me/${whatsappComercial}?text=${mensagem}`);
  }

  function togglePlanoExpandido(nomePlano: string) {
    setPlanosExpandidos((prev) =>
      prev.includes(nomePlano)
        ? prev.filter((item) => item !== nomePlano)
        : [...prev, nomePlano]
    );
  }

  const planos: Plano[] = [
    {
      nome: "Básico",
      slug: "basico",
      descricao:
        "Ideal para quem quer começar com atendimento automatizado, organização profissional e IA integrada desde o primeiro dia.",
      precoOriginal: "R$ 197/mês",
      preco: "R$ 137/mês",
      observacaoPreco: "🔥 Oferta de entrada: economize R$ 60 todos os meses.",
      tipo: "checkout",
      badge: "Entrada inteligente",
      recursos: [
        "2 usuários inclusos",
        "1 milhão de tokens de IA",
        "API Oficial do WhatsApp inclusa",
        "Atendimento automatizado com IA",
        "Respostas inteligentes em tempo real",
        "Disparo de mensagens em massa",
        "Fila de atendimento dinâmica",
        "Organização completa do chat",
        "Relatórios operacionais",
        "Painel simples e intuitivo",
      ],
    },
    {
      nome: "Essencial IA PRO",
      slug: "essencial",
      descricao:
        "Para equipes que precisam de mais potência, mais automação e mais inteligência artificial para escalar vendas e atendimento.",
      precoOriginal: "R$ 367/mês",
      preco: "R$ 267/mês",
      observacaoPreco: "🔥 Melhor custo-benefício: economize R$ 100 por mês.",
      tipo: "checkout",
      badge: "Mais indicado",
      recursos: [
        "6 usuários inclusos",
        "5 milhões de tokens de IA",
        "API Oficial do WhatsApp inclusa",
        "Atendimento automatizado avançado com IA",
        "IA treinável para responder clientes",
        "Respostas automáticas humanizadas",
        "Disparo inteligente de mensagens",
        "Segmentação avançada de contatos",
        "Fila dinâmica e distribuição automática",
        "Organização completa do atendimento",
        "Relatórios completos de performance",
        "Integrações e automações avançadas",
        "Muito mais velocidade no suporte e nas vendas",
      ],
    },
    {
      nome: "Profissional Enterprise",
      descricao:
        "Estrutura criada para operações maiores que precisam de performance, escala e automações sob medida.",
      preco: "Sob cotação",
      observacaoPreco:
        "Fale com nosso time e monte o plano ideal para sua operação.",
      tipo: "cotacao",
      badge: "Escala personalizada",
      recursos: [
        "Usuários sob medida",
        "Tokens de IA sob medida",
        "Múltiplos números na API Oficial do WhatsApp",
        "Estrutura para grandes operações",
        "IA personalizada para sua empresa",
        "Automações avançadas",
        "Disparos e segmentações em escala",
        "Atendimento multi-equipe",
        "Acompanhamento comercial personalizado",
        "Condições ajustadas ao seu volume",
        "Suporte estratégico prioritário",
      ],
    },
  ];

  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlowTop} />
      <div className={styles.backgroundGlowBottom} />

      <section className={styles.wrapper}>
        <div className={styles.header}>
          <div className={styles.kicker}>Planos CRM Prosperity</div>

          <h1 className={styles.title}>
            Escolha o plano ideal para o momento da sua operação
          </h1>

          <p className={styles.subtitle}>
            Básico e Essencial possuem os mesmos recursos principais. A diferença
            está nos usuários inclusos e no volume de tokens de IA.
          </p>
        </div>

        <div className={styles.cards}>
          {planos.map((plano) => {
            const expandido = planosExpandidos.includes(plano.nome);
            const limiteItens = plano.recursos.length;
            const recursosVisiveis = expandido
              ? plano.recursos
              : plano.recursos.slice(0, limiteItens);
            const temOcultos = plano.recursos.length > limiteItens;
            const planoCheckout = plano.tipo === "checkout";

            return (
              <article
                key={plano.nome}
                className={`${styles.card} ${
                  planoCheckout ? styles.cardAtivo : styles.cardCotacao
                }`}
              >
                <div className={styles.cardTop}>
                  <div className={styles.badgeRow}>
                    {plano.badge ? (
                      <span
                        className={`${styles.miniBadge} ${
                          planoCheckout
                            ? styles.miniBadgeAtivo
                            : styles.miniBadgeCotacao
                        }`}
                      >
                        {plano.badge}
                      </span>
                    ) : null}
                  </div>

                  <h2 className={styles.cardTitle}>{plano.nome}</h2>

                  <p className={styles.cardDescription}>{plano.descricao}</p>
                </div>

                <div className={styles.priceBox}>
                  {plano.precoOriginal ? (
                    <div className={styles.oldPrice}>{plano.precoOriginal}</div>
                  ) : null}
                  <div className={styles.price}>{plano.preco}</div>
                  {plano.observacaoPreco ? (
                    <p className={styles.priceNote}>{plano.observacaoPreco}</p>
                  ) : null}
                </div>

                <ul className={styles.featureList}>
                  {recursosVisiveis.map((recurso) => (
                    <li key={recurso} className={styles.featureItem}>
                      <span className={styles.featureIcon}>✓</span>
                      <span>{recurso}</span>
                    </li>
                  ))}
                </ul>

                {temOcultos ? (
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => togglePlanoExpandido(plano.nome)}
                  >
                    {expandido ? "Ver menos" : "Ver mais"}
                  </button>
                ) : null}

                <div className={styles.cardActions}>
                  {planoCheckout ? (
                    <button
                      className={styles.primaryButton}
                      onClick={() => handleCheckout(plano.slug ?? "basico")}
                      disabled={loadingCheckout}
                    >
                      {loadingCheckout ? "Carregando..." : "Ir para pagamento"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.quoteButton}
                      onClick={abrirCotacaoWhatsApp}
                    >
                      Fazer cotação
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className={styles.footerInfo}>
          <button
            className={styles.secondaryButton}
            onClick={() => router.push("/comecar")}
            disabled={loadingCheckout}
          >
            Voltar
          </button>

          <p className={styles.footerText}>
            Os planos <strong>Básico</strong> e <strong>Essencial IA PRO</strong> incluem os 
            principais recursos. A diferença está na quantidade de <strong>usuários</strong>, 
            <strong>tokens de IA</strong> e volume de operação. Para demandas maiores, solicite 
            uma cotação do <strong>Profissional Enterprise</strong> pelo WhatsApp.

          </p>
        </div>
      </section>
    </main>
  );
}
