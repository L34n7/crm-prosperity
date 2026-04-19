"use client";

import { useRouter } from "next/navigation";

export default function ObrigadoPage() {
  const router = useRouter();

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
          maxWidth: "680px",
          background: "#ffffff",
          borderRadius: "24px",
          padding: "32px",
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.08)",
          border: "1px solid #e2e8f0",
          textAlign: "center",
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
          Pagamento recebido
        </p>

        <h1
          style={{
            margin: "12px 0 0",
            fontSize: "34px",
            lineHeight: 1.1,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Obrigado pela sua assinatura
        </h1>

        <p
          style={{
            margin: "16px 0 0",
            fontSize: "16px",
            lineHeight: 1.7,
            color: "#475569",
          }}
        >
          Estamos finalizando a criação da sua conta. Assim que tudo estiver
          concluído, você poderá entrar no CRM e seguir com a configuração do
          seu WhatsApp oficial.
        </p>

        <div
          style={{
            marginTop: "24px",
            padding: "18px",
            borderRadius: "18px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            color: "#334155",
            fontSize: "14px",
            lineHeight: 1.7,
            textAlign: "left",
          }}
        >
          <strong>Próximos passos:</strong>
          <br />
          1. Verifique seu email.
          <br />
          2. Confirme sua conta.
          <br />
          3. Entre na plataforma.
          <br />
          4. Conecte seu WhatsApp oficial.
        </div>

        <div
          style={{
            marginTop: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <button
            onClick={() => router.push("/login")}
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
            Ir para login
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
            Fazer novo cadastro
          </button>
        </div>
      </section>
    </main>
  );
}