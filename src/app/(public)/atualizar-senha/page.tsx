"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function AtualizarSenhaContent() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const processadoRef = useRef(false);

  const [password, setPassword] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [podeAlterar, setPodeAlterar] = useState(false);

  useEffect(() => {
    if (processadoRef.current) return;
    processadoRef.current = true;

    async function prepararRecuperacao() {
      setErro("");
      setVerificando(true);

      try {
        const tokenHash = searchParams.get("token_hash");
        const type = searchParams.get("type");

        if (!tokenHash || type !== "recovery") {
          setErro("Link inválido ou expirado. Solicite uma nova recuperação de senha.");
          setPodeAlterar(false);
          return;
        }

        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });

        if (error) {
          setErro("Link inválido ou expirado. Solicite uma nova recuperação de senha.");
          setPodeAlterar(false);
          return;
        }

        setPodeAlterar(true);
      } catch {
        setErro("Não foi possível validar o link de recuperação.");
        setPodeAlterar(false);
      } finally {
        setVerificando(false);
      }
    }

    prepararRecuperacao();
  }, [searchParams, supabase]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    setMensagem("");

    if (password.length < 6) {
      setErro("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmarSenha) {
      setErro("A confirmação de senha não confere.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setErro(error.message);
        return;
      }

      setMensagem("Senha atualizada com sucesso. Redirecionando para o login...");

      setTimeout(async () => {
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }, 1200);
    } catch {
      setErro("Não foi possível atualizar a senha.");
    } finally {
      setLoading(false);
    }
  }

  if (verificando) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background:
            "linear-gradient(135deg, #0f172a 0%, #111827 45%, #1e293b 100%)",
          color: "#fff",
          padding: "24px",
        }}
      >
        <p>Validando link de recuperação...</p>
      </main>
    );
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
          Definir nova senha
        </h1>

        <p
          style={{
            fontSize: "14px",
            color: "rgba(255,255,255,0.75)",
            marginBottom: "24px",
            lineHeight: 1.5,
          }}
        >
          Digite sua nova senha para concluir a recuperação de acesso.
        </p>

        {erro && !podeAlterar ? (
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
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
            <div style={{ display: "grid", gap: "8px" }}>
              <label htmlFor="password" style={{ fontSize: "14px", fontWeight: 600 }}>
                Nova senha
              </label>

              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite a nova senha"
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

            <div style={{ display: "grid", gap: "8px" }}>
              <label htmlFor="confirmarSenha" style={{ fontSize: "14px", fontWeight: 600 }}>
                Confirmar nova senha
              </label>

              <input
                id="confirmarSenha"
                type="password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="Repita a nova senha"
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
              {loading ? "Salvando..." : "Atualizar senha"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function AtualizarSenhaFallback() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "linear-gradient(135deg, #0f172a 0%, #111827 45%, #1e293b 100%)",
        color: "#fff",
        padding: "24px",
      }}
    >
      <p>Carregando...</p>
    </main>
  );
}

export default function AtualizarSenhaPage() {
  return (
    <Suspense fallback={<AtualizarSenhaFallback />}>
      <AtualizarSenhaContent />
    </Suspense>
  );
}