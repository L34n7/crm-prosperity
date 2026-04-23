"use client";

import { useSearchParams } from "next/navigation";

export default function ConfiguracaoMetaCallbackPage() {
  const searchParams = useSearchParams();

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 680,
          background: "#fff",
          borderRadius: 24,
          padding: 32,
          boxShadow: "0 20px 60px rgba(15,23,42,0.08)",
          border: "1px solid #e2e8f0",
          textAlign: "center",
        }}
      >
        {error ? (
          <>
            <h1 style={{ color: "#991b1b", marginBottom: 12 }}>
              Conexão cancelada ou recusada
            </h1>

            <p style={{ color: "#475569" }}>
              {errorDescription || "O Meta retornou um erro na autorização."}
            </p>
          </>
        ) : code ? (
          <>
            <h1 style={{ color: "#166534", marginBottom: 12 }}>
              Meta conectado com sucesso
            </h1>

            <p style={{ color: "#475569", lineHeight: 1.6 }}>
              Recebemos a autorização do Meta. Você já pode voltar para o CRM
              para continuar a configuração.
            </p>

            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 16,
                background: "#f1f5f9",
                textAlign: "left",
                wordBreak: "break-all",
                fontSize: 13,
                color: "#334155",
              }}
            >
              <strong>Code:</strong>
              <br />
              {code}
              <br />
              <br />
              <strong>State:</strong>
              <br />
              {state || "Não informado"}
            </div>
          </>
        ) : (
          <>
            <h1 style={{ color: "#0f172a", marginBottom: 12 }}>
              Callback Meta ativo
            </h1>

            <p style={{ color: "#475569", lineHeight: 1.6 }}>
              Esta página está pronta para receber o retorno da configuração do
              Meta.
            </p>
          </>
        )}
      </section>
    </main>
  );
}