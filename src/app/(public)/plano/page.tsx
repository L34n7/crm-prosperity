"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

export default function PlanoPage() {
  const router = useRouter();

  const checkoutUrl = useMemo(() => {
    return process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL ?? "";
  }, []);

  function handleCheckout() {
    const leadId = localStorage.getItem("lead_id");

    if (!leadId) {
      alert("Lead não encontrado. Volte para a página inicial e preencha o formulário novamente.");
      router.push("/comecar");
      return;
    }

    if (!checkoutUrl) {
      alert("Link de pagamento não configurado.");
      return;
    }

    window.location.href = checkoutUrl;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "720px",
          background: "#ffffff",
          borderRadius: "24px",
          padding: "32px",
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.08)",
          border: "1px solid #e2e8f0",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#64748b",
          }}
        >
          Plano escolhido
        </p>

        <h1
          style={{
            margin: "10px 0 0",
            fontSize: "34px",
            lineHeight: 1.1,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Plano Básico
        </h1>

        <p
          style={{
            margin: "14px 0 0",
            fontSize: "16px",
            lineHeight: 1.7,
            color: "#475569",
          }}
        >
          Ideal para começar com estrutura profissional no WhatsApp oficial.
        </p>

        <div
          style={{
            marginTop: "24px",
            padding: "20px",
            borderRadius: "18px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
          }}
        >
          <ul
            style={{
              margin: 0,
              paddingLeft: "20px",
              color: "#0f172a",
              lineHeight: 1.9,
              fontSize: "15px",
            }}
          >
            <li>2 acessos</li>
            <li>1 administrador inicial</li>
            <li>Atendimento com WhatsApp oficial</li>
            <li>Chatbot e automações</li>
            <li>Disparos e organização de conversas</li>
          </ul>
        </div>

        <div
          style={{
            marginTop: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <button
            onClick={handleCheckout}
            style={{
              minHeight: "52px",
              border: "none",
              borderRadius: "16px",
              background: "#0f172a",
              color: "#ffffff",
              fontSize: "15px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Ir para pagamento
          </button>

          <button
            onClick={() => router.push("/comecar")}
            style={{
              minHeight: "48px",
              borderRadius: "16px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#0f172a",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Voltar
          </button>
        </div>

        <p
          style={{
            marginTop: "16px",
            fontSize: "13px",
            color: "#64748b",
            lineHeight: 1.6,
          }}
        >
          Após a confirmação do pagamento, sua conta será criada automaticamente e você receberá o email para ativação.
        </p>
      </section>
    </main>
  );
}