"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RecuperarSenhaPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMensagem("");
    setErro("");

    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/atualizar-senha`
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        setErro(error.message);
        return;
      }

      setMensagem(
        "Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha."
      );
      setEmail("");
    } catch {
      setErro("Não foi possível solicitar a recuperação de senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background:
          "linear-gradient(135deg, #0f172a 0%, #111827 45%, #1e293b 100%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "rgba(255, 255, 255, 0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "20px",
          padding: "32px",
          backdropFilter: "blur(10px)",
          color: "#fff",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}
      >
        <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px" }}>
          Recuperar senha
        </h1>

        <p
          style={{
            fontSize: "14px",
            color: "rgba(255,255,255,0.75)",
            marginBottom: "24px",
            lineHeight: 1.5,
          }}
        >
          Informe seu e-mail para receber o link de redefinição de senha.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <label htmlFor="email" style={{ fontSize: "14px", fontWeight: 600 }}>
              E-mail
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@empresa.com"
              required
              style={{
                height: "46px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                padding: "0 14px",
                outline: "none",
              }}
            />
          </div>

          {mensagem ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                background: "rgba(34,197,94,0.14)",
                border: "1px solid rgba(34,197,94,0.35)",
                fontSize: "14px",
              }}
            >
              {mensagem}
            </div>
          ) : null}

          {erro ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                background: "rgba(239,68,68,0.14)",
                border: "1px solid rgba(239,68,68,0.35)",
                fontSize: "14px",
              }}
            >
              {erro}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              height: "46px",
              borderRadius: "12px",
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Enviando..." : "Enviar link de recuperação"}
          </button>
        </form>

        <div style={{ marginTop: "18px" }}>
          <Link
            href="/login"
            style={{
              color: "#93c5fd",
              fontSize: "14px",
              textDecoration: "none",
            }}
          >
            Voltar para o login
          </Link>
        </div>
      </div>
    </main>
  );
}