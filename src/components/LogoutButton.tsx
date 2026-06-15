"use client";

import { createClient } from "@/lib/supabase/client";
import {
  getClientSessionId,
  removerClientSessionId,
} from "@/lib/auth/browser-session";
import { useRouter } from "next/navigation";
import styles from "./LogoutButton.module.css";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();

    window.sessionStorage.removeItem("crm_ambiente_redirect_apos_login");
    window.sessionStorage.removeItem("crm_ambiente_redirect_inicial");
    window.sessionStorage.removeItem("crm_ambiente_configurado");
    
    const clientSessionId = getClientSessionId();

    try {
      await fetch("/api/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_session_id: clientSessionId,
        }),
        cache: "no-store",
        keepalive: true,
      });
    } catch {
      // O logout local ainda deve acontecer mesmo que o registro falhe.
    }

    await supabase.auth.signOut();
    removerClientSessionId();

    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={handleLogout} className={styles.button}>
      Sair
    </button>
  );
}
