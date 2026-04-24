"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Status = "carregando" | "sucesso" | "erro" | "aguardando";

function CallbackContent() {
  const searchParams = useSearchParams();

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const [status, setStatus] = useState<Status>("carregando");
  const [mensagem, setMensagem] = useState("Processando retorno do Meta...");

  useEffect(() => {
    async function processarCallback() {
      if (error) {
        setStatus("erro");
        setMensagem(
          errorDescription || "O Meta retornou um erro durante a conexão."
        );
        return;
      }

      if (!code || !state) {
        setStatus("aguardando");
        setMensagem(
          "Esta página está pronta para receber o retorno da configuração do Meta."
        );
        return;
      }

      try {
        setStatus("carregando");
        setMensagem("Conectando sua conta Meta ao CRM...");

        const response = await fetch("/api/integracoes-whatsapp/meta-callback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code,
            state,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(
            data.error ||
              data?.meta_response?.error?.message ||
              "Erro ao finalizar conexão com Meta."
          );
        }

        setStatus("sucesso");
        setMensagem(
          "Meta conectado com sucesso. Você já pode voltar para a tela de configuração do ambiente."
        );
      } catch (err) {
        console.error("[META CALLBACK PAGE] Erro:", err);

        setStatus("erro");
        setMensagem(
          err instanceof Error
            ? err.message
            : "Erro inesperado ao processar retorno do Meta."
        );
      }
    }

    processarCallback();
  }, [code, state, error, errorDescription]);

  const corTitulo =
    status === "sucesso"
      ? "#166534"
      : status === "erro"
      ? "#991b1b"
      : "#0f172a";

  const titulo =
    status === "sucesso"
      ? "Meta conectado com sucesso"
      : status === "erro"
      ? "Erro ao conectar Meta"
      : status === "aguardando"
      ? "Callback Meta ativo"
      : "Processando conexão";

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
        <h1 style={{ color: corTitulo, marginBottom: 12 }}>{titulo}</h1>

        <p style={{ color: "#475569", lineHeight: 1.6 }}>{mensagem}</p>

        {status === "carregando" && (
          <p style={{ marginTop: 16, color: "#2563eb", fontWeight: 700 }}>
            Aguarde alguns segundos...
          </p>
        )}

        {status === "sucesso" && (
          <button
            type="button"
            onClick={() => {
              window.location.href = "/configurar-ambiente";
            }}
            style={{
              marginTop: 22,
              height: 44,
              padding: "0 18px",
              borderRadius: 12,
              border: 0,
              background: "#2563eb",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Voltar para configuração
          </button>
        )}

        {status === "erro" && (
          <button
            type="button"
            onClick={() => {
              window.location.href = "/configurar-ambiente";
            }}
            style={{
              marginTop: 22,
              height: 44,
              padding: "0 18px",
              borderRadius: 12,
              border: 0,
              background: "#dc2626",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Voltar e tentar novamente
          </button>
        )}

        {code && state && (
          <div
            style={{
              marginTop: 20,
              padding: 16,
              borderRadius: 16,
              background: "#f1f5f9",
              textAlign: "left",
              wordBreak: "break-all",
              fontSize: 12,
              color: "#334155",
            }}
          >
            <strong>Code recebido:</strong>
            <br />
            {code.slice(0, 40)}...
            <br />
            <br />
            <strong>State recebido:</strong>
            <br />
            {state}
          </div>
        )}
      </section>
    </main>
  );
}

export default function ConfiguracaoMetaCallbackPage() {
  return (
    <Suspense fallback={<div>Carregando...</div>}>
      <CallbackContent />
    </Suspense>
  );
}