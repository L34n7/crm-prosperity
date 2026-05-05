"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function criarSessao() {
      const supabase = createClient();

      const next = searchParams.get("next") || "/definir-senha";

      const hash = window.location.hash.replace("#", "");
      const params = new URLSearchParams(hash);

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (!accessToken || !refreshToken) {
        router.replace("/login?erro=link-invalido");
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error("[AUTH CALLBACK SET SESSION]", error.message);
        router.replace("/login?erro=link-invalido");
        return;
      }

      router.replace(next);
    }

    criarSessao();
  }, [router, searchParams]);

  return <p>Validando acesso...</p>;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<p>Validando acesso...</p>}>
      <AuthCallbackContent />
    </Suspense>
  );
}