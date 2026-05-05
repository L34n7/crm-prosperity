"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./recuperar-senha.module.css";

export default function RecuperarSenhaPage() {
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);
    setMensagem("");
    setErro("");

    if (!emailValido) {
      setErro("Digite um e-mail válido para continuar.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/recuperar-senha", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao enviar email");
        return;
      }

      setMensagem(
        "Se existir uma conta com esse e-mail, enviamos um link para redefinir sua senha."
      );

      setEmail("");
    } catch {
      setErro("Não foi possível solicitar a recuperação de senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.iconBox}>
          <ShieldCheck size={30} />
        </div>

        <div className={styles.header}>
          <h1>Recuperar senha</h1>
          <p>
            Informe seu e-mail cadastrado para receber um link seguro de
            redefinição de senha.
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="email">E-mail cadastrado</label>

            <div className={styles.inputWrapper}>
              <Mail size={20} />

              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErro("");
                  setMensagem("");
                }}
                placeholder="seuemail@empresa.com"
                autoComplete="email"
                required
              />
            </div>

            {email && !emailValido ? (
              <p className={styles.inputHintError}>Digite um e-mail válido.</p>
            ) : (
              <p className={styles.inputHint}>
                Enviaremos as instruções para este endereço.
              </p>
            )}
          </div>

          <div className={styles.infoBox}>
            <CheckCircle2 size={18} />
            <span>
              O link de recuperação é temporário e só deve ser usado por você.
            </span>
          </div>

          {mensagem ? <div className={styles.successBox}>{mensagem}</div> : null}
          {erro ? <div className={styles.errorBox}>{erro}</div> : null}

          <button
            type="submit"
            disabled={loading || !emailValido}
            className={styles.submitButton}
          >
            {loading ? "Enviando..." : "Enviar link de recuperação"}
          </button>
        </form>

        <Link href="/login" className={styles.backLink}>
          <ArrowLeft size={17} />
          Voltar para o login
        </Link>
      </section>
    </main>
  );
}