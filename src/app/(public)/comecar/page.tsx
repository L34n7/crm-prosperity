"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./comecar.module.css";

type TipoOferta = "normal" | "vip" | "jv";

export default function ComecarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  function formatarTelefone(valor: string) {
    const numeros = valor.replace(/\D/g, "").slice(0, 11);

    if (numeros.length <= 2) {
      return numeros;
    }

    if (numeros.length <= 7) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
    }

    if (numeros.length <= 10) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
    }

    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  }

  function handleTelefoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTelefone(formatarTelefone(e.target.value));
  }

  function obterTipoOfertaDaUrl(): TipoOferta {
    const oferta = String(searchParams.get("oferta") ?? "")
      .trim()
      .toLowerCase();

    if (oferta === "vip" || oferta === "vip2026") {
      return "vip";
    }

    if (oferta === "jv" || oferta === "jv2026") {
      return "jv";
    }

    return "normal";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setErro("");

    if (!nome || !email) {
      setErro("Preencha nome e email.");
      return;
    }

    const telefoneLimpo = telefone.replace(/\D/g, "");

    if (telefone && telefoneLimpo.length < 10) {
      setErro("Telefone inválido.");
      return;
    }

    const tipoOferta = obterTipoOfertaDaUrl();

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
          telefone: telefoneLimpo || null,
          empresa,
          tipo_oferta: tipoOferta,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data?.error || "Erro ao iniciar cadastro.");
        setLoading(false);
        return;
      }

      localStorage.setItem("lead_id", data.lead_id);
      localStorage.setItem("tipo_oferta", data.tipo_oferta || tipoOferta);

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
      <div className={styles.backgroundGlowTop} />
      <div className={styles.backgroundGlowBottom} />

      <section className={styles.wrapper}>
        <div className={styles.hero}>
          <div className={styles.badge}>CRM Prosperity</div>

          <h1 className={styles.heroTitle}>
            Organize atendimentos, equipe e vendas em um só lugar
          </h1>

          <p className={styles.heroText}>
            Um CRM moderno para empresas que querem profissionalizar o atendimento,
            acelerar respostas e ter mais controle da operação.
          </p>

          <div className={styles.featureList}>
            <div className={styles.featureItem}>
              <span className={styles.featureIcon}>✓</span>
              <span>Atendimento via WhatsApp com visão profissional</span>
            </div>

            <div className={styles.featureItem}>
              <span className={styles.featureIcon}>✓</span>
              <span>Gestão de equipe, protocolos e setores</span>
            </div>

            <div className={styles.featureItem}>
              <span className={styles.featureIcon}>✓</span>
              <span>Estrutura pensada para operação comercial de alto nível</span>
            </div>
          </div>

          <div className={styles.heroFooter}>
            Comece agora e avance para a escolha do seu plano.
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.title}>Criar acesso</h2>
            <p className={styles.subtitle}>
              Preencha seus dados para iniciar seu cadastro no CRM Prosperity.
            </p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Seu nome</label>
              <input
                placeholder="Digite seu nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className={styles.input}
                autoComplete="name"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Seu email</label>
              <input
                placeholder="Digite seu email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
                autoComplete="email"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Telefone</label>
              <input
                placeholder="(00) 00000-0000"
                type="tel"
                value={telefone}
                onChange={handleTelefoneChange}
                className={styles.input}
                autoComplete="tel"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Nome da empresa</label>
              <input
                placeholder="Digite o nome da empresa"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                className={styles.input}
                autoComplete="organization"
              />
            </div>

            {erro && (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>{erro}</p>

                {erro.includes("conta") && (
                  <div className={styles.errorActions}>
                    <button
                      type="button"
                      onClick={() => router.push("/login")}
                      className={styles.errorButtonPrimary}
                    >
                      Fazer login
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push("/recuperar-senha")}
                      className={styles.errorButtonSecondary}
                    >
                      Recuperar senha
                    </button>
                  </div>
                )}
              </div>
            )}

            <button className={styles.button} disabled={loading}>
              {loading ? "Carregando..." : "Continuar"}
            </button>

            <p className={styles.helperText}>
              Ao continuar, você seguirá para a página de planos para concluir a contratação.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}