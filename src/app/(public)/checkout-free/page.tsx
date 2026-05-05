"use client";

import { useMemo, useState } from "react";
import styles from "./checkout-free.module.css";

type MetodoPagamento = "pix";

function gerarTransactionId() {
  return `tx_free_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function limparTelefone(valor: string) {
  return valor.replace(/\D/g, "");
}

function formatarTelefone(valor: string) {
  const numeros = valor.replace(/\D/g, "").slice(0, 11);

  if (numeros.length <= 2) {
    return numeros;
  }

  if (numeros.length <= 6) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
  }

  if (numeros.length <= 10) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
  }

  return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
}


export default function CheckoutFreePage() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const metodo: MetodoPagamento = "pix";
  const valorCentavos = 0;
  const planoSlug = "basico";
  const tipoOferta = "free";

  const payload = useMemo(() => {
    const transactionId = gerarTransactionId();

    return {
      token: `free_token_${Date.now()}`,
      event: "transaction",
      created_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
      platform: "Checkout Free",
      status: "paid",
      method: metodo,
      customer: {
        name: nome,
        email,
        phone: limparTelefone(telefone),
        phone_number: limparTelefone(telefone),
      },
      transaction: {
        id: transactionId,
        status: "paid",
        method: metodo,
        amount: valorCentavos,
        net_amount: 0,
        pix: {
          code: "PIX_FREE_ACCESS",
          url: null,
          expires_at: null,
        },
      },
      offer: {
        hash: "offer_free_beta",
        title: "CRM Prosperity",
        price: valorCentavos,
      },
      items: [
        {
          hash: "item_free_beta",
          product_hash: "crm_prosperity",
          title: "CRM Prosperity",
          price: valorCentavos,
          quantity: 1,
          cover: null,
          operation_type: 1,
        },
      ],
      tracking: {
        src: "checkout_free",
        utm_source: "beta",
        utm_campaign: "free_access",
        utm_medium: "checkout",
        utm_term: planoSlug,
        utm_content: tipoOferta,
      },
      metadata_extra: {
        plano_slug: planoSlug,
        tipo_oferta: tipoOferta,
      },
      ip: "127.0.0.1",
      fbp: null,
      fbc: null,
    };
  }, [nome, email, telefone]);

  async function ativarAcessoGratuito() {
    try {
      setCarregando(true);
      setErro("");

      if (!nome.trim()) throw new Error("Informe seu nome.");
      if (!email.trim()) throw new Error("Informe seu e-mail.");
      if (!telefone.trim()) throw new Error("Informe seu telefone.");

      const response = await fetch("/api/webhooks/atomopay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "Não foi possível ativar seu acesso.");
      }

      window.location.href = "/obrigado";
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>🛡️ ACESSO 100% SEGURO</div>

      <div className={styles.wrapper}>
        <section className={styles.content}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.step}>1</span>
              <h2 className={styles.title}>Identifique-se</h2>
            </div>

            <div className={styles.divider} />

            <label className={styles.label}>Nome Completo</label>
              <input
                className={styles.input}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome Completo"
              />

            <label className={styles.label}>E-mail</label>
              <input
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail"
              />

            <label className={styles.label}>Telefone/WhatsApp</label>
              <input
                className={styles.input}
                value={telefone}
                onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="tel"
              />
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.step}>2</span>
              <div>
                <h2 className={styles.title}>Pagamento</h2>
                <p className={styles.subtitle}>Confirme seus dados para liberar seu acesso gratuito</p>
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.paymentBox}>
              <span className={styles.badge}>APROVAÇÃO IMEDIATA</span>

              <div className={styles.summaryBox}>
                <strong className={styles.summaryTitle}>Você está adquirindo:</strong>

                <div className={styles.productRow}>
                  <img
                    src="/logo.png"
                    alt="CRM Prosperity"
                    className={styles.productImage}
                  />

                  <div>
                    <strong className={styles.productName}>CRM PROSPERITY</strong>
                    <p className={styles.oldPrice}>R$ 0,00</p>
                    <p className={styles.freeLabel}>Acesso beta gratuito</p>
                  </div>
                </div>

                <div className={styles.priceLine}>
                  <span>Valor do plano</span>
                  <strong>R$ 147,00</strong>
                </div>

                <div className={styles.priceLine}>
                  <span>Desconto beta</span>
                  <strong className={styles.discount}>- R$ 147,00</strong>
                </div>

                <div className={styles.totalLine}>
                  <span>Total:</span>
                  <strong>R$ 0,00</strong>
                </div>
              </div>
            </div>

            {erro ? <div className={styles.error}>{erro}</div> : null}

            <button
              type="button"
              onClick={ativarAcessoGratuito}
              disabled={carregando}
              className={styles.button}
            >
              {carregando ? "ATIVANDO..." : "LIBERAR MEU ACESSO"}
            </button>
          </div>
        </section>

        <aside className={styles.sidebar}>
          <InfoCard title="Dados protegidos" text="Os seus dados são confidenciais e seguros" icon="◌" />
          <InfoCard title="ACESSO 100% SEGURO" text="As informações são criptografadas." icon="🔒" />
          <InfoCard title="Conteúdo Aprovado" text="100% revisado e aprovado por profissionais" icon="🎓" />
          <InfoCard title="Garantia de 7 dias" text="Você está protegido por uma garantia de satisfação" icon="🛡️" />
        </aside>
      </div>

      <footer className={styles.footer}>
        CRM Prosperity está processando este pedido à serviço do acesso beta gratuito.
      </footer>
    </main>
  );
}

function InfoCard({
  title,
  text,
  icon,
}: {
  title: string;
  text: string;
  icon: string;
}) {
  return (
    <div className={styles.infoCard}>
      <div className={styles.infoIcon}>{icon}</div>
      <div>
        <strong className={styles.infoTitle}>{title}</strong>
        <p className={styles.infoText}>{text}</p>
      </div>
    </div>
  );
}
