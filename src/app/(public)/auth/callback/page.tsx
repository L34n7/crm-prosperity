"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const next = searchParams.get("next") || "/";

    router.replace(next);
  }, [router, searchParams]);

  return (
    <main style={{ padding: 24 }}>
      <p>Finalizando login...</p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          <p>Finalizando login...</p>
        </main>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );   
}