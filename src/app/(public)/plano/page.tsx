"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, CalendarClock, MonitorPlay, GraduationCap } from "lucide-react";
import { montarWaMeUrl } from "@/lib/contatos/sistema";
import PaymentProviderModal, {
  type PaymentGateway,
  type PaymentPlanSummary,
} from "@/components/payments/PaymentProviderModal";
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
  const [loadingCheckout, setLoadingCheckout] = useState<PaymentGateway | null>(null);
  const [planoPagamento, setPlanoPagamento] = useState<PaymentPlanSummary | null>(null);
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    function resetarLoadingCheckout() {
      setLoadingCheckout(null);
      setCheckoutError("");
    }

    window.addEventListener("pageshow", resetarLoadingCheckout);

    return () => {
      window.removeEventListener("pageshow", resetarLoadingCheckout);
    };
  }, []);

  function obterLeadId() {
    const leadId = localStorage.getItem("lead_id");

    if (!leadId) {
      alert(
        "Lead não encontrado. Volte para a página inicial e preencha o formulário novamente."
      );
      router.push("/comecar");
      return null;
    }

    return leadId;
  }

  async function iniciarCheckout(
    planoSlug: "basico" | "essencial",
    gateway: PaymentGateway,
    novaAba?: Window | null
  ) {
    const leadId = obterLeadId();

    if (!leadId) {
      novaAba?.close();
      return;
    }

    setCheckoutError("");
    setLoadingCheckout(gateway);

    try {
      const res = await fetch("/api/public/checkout-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lead_id: leadId,
          plano_slug: planoSlug,
          gateway,
        }),
      });

      const data = (await res.json()) as CheckoutResponse;

      if (!res.ok || !data?.checkout_url) {
        novaAba?.close();
        const mensagem = data?.error || "Não foi possível iniciar o checkout.";

        if (planoPagamento) {
          setCheckoutError(mensagem);
        } else {
          alert(mensagem);
        }

        setLoadingCheckout(null);
        return;
      }

      if (!novaAba) {
        setCheckoutError(
          "O navegador bloqueou a nova aba. Permita pop-ups para continuar o pagamento."
        );
        setLoadingCheckout(null);
        return;
      }

      novaAba.location.href = data.checkout_url;
      setLoadingCheckout(null);
      setCheckoutError("");
    } catch (error) {
      novaAba?.close();
      console.error("Erro ao buscar checkout:", error);

      const mensagem = "Erro inesperado ao iniciar o checkout.";

      if (planoPagamento) {
        setCheckoutError(mensagem);
      } else {
        alert(mensagem);
      }

      setLoadingCheckout(null);
    }
  }

  function handlePlanoCheckout(plano: PaymentPlanSummary) {
    const leadId = obterLeadId();

    if (!leadId) return;

    const tipoOferta = localStorage.getItem("tipo_oferta") || "normal";

    // O plano gratuito não possui pagamento e continua no fluxo próprio.
    // Ofertas pagas (normal, afiliado, VIP e JV) usam o seletor de gateway.
    if (tipoOferta === "free") {
      const novaAba = window.open("about:blank", "_blank");

      if (!novaAba) {
        setCheckoutError(
          "O navegador bloqueou a nova aba. Permita pop-ups para continuar."
        );
        return;
      }

      novaAba.opener = null;
      void iniciarCheckout(plano.slug, "atomo", novaAba);
      return;
    }

    setCheckoutError("");
    setPlanoPagamento(plano);
  }

  function handleGatewaySelect(gateway: PaymentGateway) {
    if (!planoPagamento || loadingCheckout) return;

    const novaAba = window.open("about:blank", "_blank");

    if (!novaAba) {
      setCheckoutError(
        "O navegador bloqueou a nova aba. Permita pop-ups para o CRM e tente novamente."
      );
      return;
    }

    novaAba.opener = null;
    void iniciarCheckout(planoPagamento.slug, gateway, novaAba);
  }

  function fecharModalPagamento() {
    if (loadingCheckout) return;

    setPlanoPagamento(null);
    setCheckoutError("");
  }

  function abrirCheckoutCotacao() {
    window.open(
      montarWaMeUrl(
        "Olá! Gostaria de conhecer o Programa Profissional Enterprise."
      ),
      "_blank",
      "noopener,noreferrer"
    );
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
      nome: "Programa Básico",
      slug: "basico",
      descricao:
        "Aprenda a organizar contatos, criar disparos e iniciar automações de atendimento, aplicando os conhecimentos no CRM Prosperity.",
      precoOriginal: "R$ 197/mês",
      preco: "R$ 137/mês",
      observacaoPreco: "🔥 Oferta de entrada: economize R$ 60 todos os meses.",
      tipo: "checkout",
      badge: "Entrada inteligente",
      recursos: [
        "2 usuários inclusos",
        "100 mil de tokens de IA",
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
      nome: "Programa Essencial IA+",
      slug: "essencial",
      descricao:
        "Aprofunde seus conhecimentos em automações, inteligência artificial e atendimento, com mais capacidade para aplicar tudo no CRM Prosperity.",
      precoOriginal: "R$ 367/mês",
      preco: "R$ 267/mês",
      observacaoPreco: "🔥 Melhor custo-benefício: economize R$ 100 por mês.",
      tipo: "checkout",
      badge: "Mais indicado",
      recursos: [
        "6 usuários inclusos",
        "400 mil de tokens de IA",
        "2 números na API Oficial do WhatsApp",
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
      nome: "Programa Profissional Enterprise",
      descricao:
        "Orientações e estrutura sob medida para quem deseja avançar no uso de automações e recursos do CRM Prosperity.",
      preco: "Sob cotação",
      observacaoPreco:
        "Fale com nosso time para conhecer as condições e a orientação disponíveis.",
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
          <Link href="/" className={styles.brand} aria-label="Voltar para a página inicial">
            <Image
              src="/logo.png"
              alt="Prosperity CRM"
              width={64}
              height={63}
              className={styles.logo}
              priority
            />
            <span><strong>Prosperity</strong> CRM</span>
          </Link>

          <div className={styles.kicker}>Programas Prosperity</div>

          <h1 className={styles.title}>
            Escolha seu programa para aprender e colocar em prática
          </h1>

          <p className={styles.subtitle}>
            Aprenda com conteúdos predominantemente gravados, orientações flexíveis
            e acesso ao CRM Prosperity. Escolha a modalidade com os recursos
            mais adequados ao que você deseja desenvolver.
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

                <div className={styles.learningIncluded}>
                  <GraduationCap size={18} aria-hidden="true" />
                  <span>
                    <strong>Treinamento prático</strong> com acesso ao CRM Prosperity
                  </span>
                </div>

                <h3 className={styles.featureHeading}>Recursos disponíveis no CRM</h3>

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
                      onClick={() =>
                        handlePlanoCheckout({
                          slug: plano.slug ?? "basico",
                          nome: plano.nome,
                          preco: plano.preco,
                        })
                      }
                      disabled={loadingCheckout !== null}
                    >
                      {loadingCheckout ? "Carregando..." : "Começar agora"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.quoteButton}
                      onClick={abrirCheckoutCotacao}
                    >
                      Fazer cotação
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <section className={styles.learningPanel} aria-labelledby="aprendizado-flexivel">
          <div className={styles.learningPanelHeader}>
            <span className={styles.learningEyebrow}>Sua jornada de aprendizado</span>
            <h2 id="aprendizado-flexivel" className={styles.learningPanelTitle}>
              Aprenda no seu ritmo
            </h2>
            <p className={styles.learningPanelDescription}>
              Conteúdos gravados, prática e orientações conforme sua necessidade e
              a disponibilidade de atendimento, sem calendário fixo de aulas.
            </p>
          </div>

          <div className={styles.learningDetails}>
            <div className={styles.learningDetail}>
              <span className={styles.learningDetailIcon}>
                <MonitorPlay size={21} aria-hidden="true" />
              </span>
              <strong>Conteúdos gravados</strong>
              <span>Revise as explicações e acompanhe os temas no seu tempo.</span>
            </div>
            <div className={styles.learningDetail}>
              <span className={styles.learningDetailIcon}>
                <CalendarClock size={21} aria-hidden="true" />
              </span>
              <strong>Orientação flexível</strong>
              <span>Esclarecimentos e apoio conforme sua necessidade e disponibilidade.</span>
            </div>
            <div className={styles.learningDetail}>
              <span className={styles.learningDetailIcon}>
                <BookOpen size={21} aria-hidden="true" />
              </span>
              <strong>Aplicação prática</strong>
              <span>Use o CRM Prosperity para aplicar os conhecimentos adquiridos.</span>
            </div>
          </div>
        </section>

        <div className={styles.footerInfo}>
          <button
            className={styles.secondaryButton}
            onClick={() => router.push("/comecar")}
            disabled={loadingCheckout !== null}
          >
            Voltar
          </button>

          <p className={styles.footerText}>
            Os programas incluem <strong>conteúdos educacionais, orientações flexíveis</strong> e
            acesso aos recursos do <strong>CRM Prosperity</strong> durante o período contratado.
            As modalidades diferem em <strong>usuários, tokens de IA, números de WhatsApp</strong> e
            capacidade de utilização. Para necessidades maiores, conheça o
            <strong> Programa Profissional Enterprise</strong> por meio de uma cotação.
          </p>
        </div>
      </section>

      <PaymentProviderModal
        plano={planoPagamento}
        loadingGateway={loadingCheckout}
        error={checkoutError}
        onClose={fecharModalPagamento}
        onSelect={handleGatewaySelect}
      />
    </main>
  );
}
