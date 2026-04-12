"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import styles from "./LogoutButton.module.css";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();

    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={handleLogout} className={styles.button}>
      Sair
    </button>
  );
}