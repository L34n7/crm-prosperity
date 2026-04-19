"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./comecar.module.css";

export default function ComecarPage() {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [empresa, setEmpresa] = useState("");

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setErro("");

    if (!nome || !email) {
      setErro("Preencha nome e email.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/public/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nome,
          email,
          telefone,
          empresa,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data?.error || "Erro ao iniciar cadastro.");
        setLoading(false);
        return;
      }

      // 👉 salvar lead_id no localStorage
      localStorage.setItem("lead_id", data.lead_id);

      // 👉 ir para página de oferta
      router.push("/plano");
    } catch (err) {
      console.error(err);
      setErro("Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Comece agora</h1>
        <p className={styles.subtitle}>
          Crie seu acesso e configure seu CRM em minutos.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            placeholder="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={styles.input}
          />

          <input
            placeholder="Seu email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.input}
          />

          <input
            placeholder="Telefone"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            className={styles.input}
          />

          <input
            placeholder="Nome da empresa"
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            className={styles.input}
          />

          <button className={styles.button} disabled={loading}>
            {loading ? "Carregando..." : "Continuar"}
          </button>

          {erro && <p className={styles.error}>{erro}</p>}
        </form>
      </div>
    </main>
  );
}