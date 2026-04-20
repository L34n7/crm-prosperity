"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./plano.module.css";

type Plano = {
  nome: string;
  descricao: string;
  preco: string;
  observacaoPreco?: string;
  recursos: string[];
  ativo: boolean;
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

  async function handleCheckout() {
    const leadId = localStorage.getItem("lead_id");

    if (!leadId) {
      alert("Lead não encontrado. Volte para a página inicial e preencha o formulário novamente.");
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
        }),
      });

      const data = (await res.json()) as CheckoutResponse;

      if (!res.ok || !data?.checkout_url) {
        alert(data?.error || "Não foi possível iniciar o checkout.");
        setLoadingCheckout(false);
        return;
      }

      window.location.href = data.checkout_url;
    } catch (error) {
      console.error("Erro ao buscar checkout:", error);
      alert("Erro inesperado ao iniciar o checkout.");
      setLoadingCheckout(false);
    }
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
      nome: "Essencial",
      descricao:
        "Ideal para empresas que querem começar com atendimento profissional no WhatsApp oficial.",
      preco: "Ativação disponível",
      observacaoPreco: "O valor será exibido na próxima etapa.",
      ativo: true,
      badge: "Mais indicado para começar",
      recursos: [
        "1 número de WhatsApp",
        "2 usuários inclusos",
        "Atendimento automatizado",
        "Disparo de mensagens",
        "Fila de atendimento dinâmica",
        "Organização completa do chat",
        "Relatórios de operação",
      ],
    },
    {
      nome: "Profissional",
      descricao:
        "Para operações em crescimento que precisam de mais canais, mais inteligência e mais produtividade.",
      preco: "Plano profissional",
      observacaoPreco: "Prévia da próxima evolução do CRM Prosperity.",
      ativo: false,
      badge: "Expansão operacional",
      recursos: [
        "2 números de WhatsApp",
        "3 usuários inclusos",
        "Usuário adicional com valor extra",
        "Atendimento automatizado",
        "Agente IA de atendimento",
        "Disparo de mensagens",
        "Agenda inteligente",
        "Kanban comercial",
        "Relatórios dinâmicos",
        "Assistente IA para chat",
        "Integração com Instagram e Messenger",
        "Integração com Meta Ads",
      ],
    },
    {
      nome: "Elite",
      descricao:
        "Para operações mais robustas que precisam de escala, inteligência avançada e maior capacidade.",
      preco: "Preço sob consulta",
      observacaoPreco: "Versão premium para estruturas mais completas.",
      ativo: false,
      badge: "Nível avançado",
      recursos: [
        "Mais números de WhatsApp",
        "Mais usuários inclusos",
        "Usuário adicional com valor extra",
        "Atendimento automatizado",
        "Agente IA de atendimento",
        "Disparo de mensagens",
        "Agenda inteligente",
        "Kanban comercial",
        "Relatórios avançados",
        "Assistente IA para chat",
        "Agente IA consultor de marketing",
        "Integração com Instagram e Messenger",
        "Integração com Meta Ads",
        "Suporte prioritário",
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
            Comece com estrutura profissional no WhatsApp oficial e evolua para
            recursos mais avançados conforme sua empresa cresce.
          </p>
        </div>

        <div className={styles.cards}>
          {planos.map((plano) => {
            const expandido = planosExpandidos.includes(plano.nome);
            const limiteItens = plano.ativo ? plano.recursos.length : 7;
            const recursosVisiveis = expandido
              ? plano.recursos
              : plano.recursos.slice(0, limiteItens);
            const temOcultos = !plano.ativo && plano.recursos.length > limiteItens;

            return (
              <article
                key={plano.nome}
                className={`${styles.card} ${
                  plano.ativo ? styles.cardAtivo : styles.cardEmBreve
                }`}
              >
                {!plano.ativo && <div className={styles.cornerSeal}>Em breve</div>}

                <div className={styles.cardTop}>
                  <div className={styles.badgeRow}>
                    {plano.badge ? (
                      <span
                        className={`${styles.miniBadge} ${
                          plano.ativo ? styles.miniBadgeAtivo : styles.miniBadgeEmBreve
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
                  {plano.ativo ? (
                    <button
                      className={styles.primaryButton}
                      onClick={handleCheckout}
                      disabled={loadingCheckout}
                    >
                      {loadingCheckout ? "Carregando..." : "Ir para pagamento"}
                    </button>
                  ) : (
                    <button className={styles.disabledButton} disabled>
                      Em breve
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
            O plano <strong>Essencial</strong> já está disponível para contratação.
            Os demais planos aparecem como prévia da evolução do produto.
            Após a confirmação do pagamento, sua conta será criada e você receberá
            as instruções para ativação.
          </p>
        </div>
      </section>
    </main>
  );
}