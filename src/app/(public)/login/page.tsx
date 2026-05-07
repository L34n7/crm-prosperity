"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";
import Link from "next/link";

export default function LoginPage() {
  const [supabase] = useState(() => createClient());
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        router.push("/");
        router.refresh();
      }
    }

    checkUser();
  }, [router, supabase]);

  function traduzirErroLogin(message: string) {
    const mapa: Record<string, string> = {
      "Invalid login credentials": "Invalid email or password.",
      "Email not confirmed": "Please confirm your email before signing in.",
    };

    return mapa[message] || message;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMensagem("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMensagem(traduzirErroLogin(error.message));
      setLoading(false);
      return;
    }

    setMensagem("Login completed successfully.");
    setLoading(false);
    router.push("/");
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlowTop} />
      <div className={styles.backgroundGlowBottom} />

      <section className={styles.wrapper}>
        <div className={styles.brandPanel}>
          <div className={styles.brandBadge}>CRM</div>

          <p className={styles.eyebrow}>Business platform</p>

          <h1 className={styles.title}>CRM Prosperity</h1>

          <p className={styles.description}>
            Centralize conversations, contacts, users, departments, and service
            rules in a professional, organized, and modern experience.
          </p>

          <div className={styles.featureList}>
            <div className={styles.featureItem}>
              <span className={styles.featureDot} />
              <span>Multi-department support</span>
            </div>

            <div className={styles.featureItem}>
              <span className={styles.featureDot} />
              <span>Dynamic profile-based permissions</span>
            </div>

            <div className={styles.featureItem}>
              <span className={styles.featureDot} />
              <span>Integrated WhatsApp operation</span>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <p className={styles.cardEyebrow}>Secure access</p>
            <h2 className={styles.cardTitle}>Sign in to the platform</h2>
            <p className={styles.cardSubtitle}>
              Enter your email and password to access the admin dashboard.
            </p>
          </div>

          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yourname@example.com"
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <input
                type="password"
                className={styles.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={styles.submitButton}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <div
              style={{
                marginTop: "12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <Link
                href="/comecar"
                style={{
                  fontSize: "14px",
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                I do not have an account yet
              </Link>

              <Link
                href="/recuperar-senha"
                style={{
                  fontSize: "14px",
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Forgot my password
              </Link>
            </div>
          </form>

          {mensagem && (
            <div
              className={`${styles.messageBox} ${
                mensagem === "Login completed successfully."
                  ? styles.messageSuccess
                  : styles.messageError
              }`}
            >
              {mensagem}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}