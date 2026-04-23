"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";

function lerHashParams() {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  return new URLSearchParams(hash);
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mensagem, setMensagem] = useState("Validando seu acesso...");

  const supabase = useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  useEffect(() => {
    async function processarCallback() {
      try {
        const next = searchParams.get("next") || "/definir-senha";
        const hashParams = lerHashParams();

        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const errorDescription = hashParams.get("error_description");

        if (errorDescription) {
          router.replace(`/login?erro=${encodeURIComponent(errorDescription)}`);
          return;
        }

        if (!accessToken || !refreshToken) {
          router.replace("/login?erro=link_invalido");
          return;
        }

        setMensagem("Criando sua sessão...");

        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error || !data.session) {
          router.replace("/login?erro=falha_ao_validar_sessao");
          return;
        }

        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + window.location.search
        );

        router.replace(next);
      } catch {
        router.replace("/login?erro=erro_no_callback");
      }
    }

    processarCallback();
  }, [router, searchParams, supabase]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
        padding: "24px",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "#ffffff",
          borderRadius: "24px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 20px 60px rgba(15,23,42,0.08)",
          padding: "32px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            marginTop: 0,
            marginBottom: "12px",
            fontSize: "28px",
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Aguarde um instante
        </h1>

        <p
          style={{
            margin: 0,
            color: "#475569",
            fontSize: "15px",
            lineHeight: 1.6,
          }}
        >
          {mensagem}
        </p>
      </section>
    </main>
  );
}