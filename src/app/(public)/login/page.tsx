"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";
import Link from "next/link";
import { ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import { enviarEventoSessao, getClientSessionId } from "@/lib/auth/browser-session";

const AMBIENTE_CONFIGURADO_STORAGE_KEY = "crm_ambiente_configurado";

async function obterRotaAposLogin() {
  try {
    const response = await fetch("/api/integracoes-whatsapp/status", {
      method: "GET",
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      if (response.status === 403 || response.status === 404) {
        return "/conta-incompleta";
      }

      return "/painel";
    }

    const ambienteConfigurado = data.configurado === true;

    if (ambienteConfigurado) {
      window.sessionStorage.setItem(AMBIENTE_CONFIGURADO_STORAGE_KEY, "true");
    } else {
      window.sessionStorage.removeItem(AMBIENTE_CONFIGURADO_STORAGE_KEY);
    }

    if (!ambienteConfigurado) {
      return "/configurar-ambiente";
    }

    return "/painel";
  } catch (error) {
    console.warn("[LOGIN] Erro ao verificar ambiente:", error);
    return "/painel";
  }
}

export default function LoginPage() {
  const [supabase] = useState(() => createClient());
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const rota = await obterRotaAposLogin();

        if (rota === "/configurar-ambiente") {
          window.sessionStorage.setItem(
            "crm_ambiente_redirect_apos_login",
            "true"
          );
        }

        router.replace(rota);
        router.refresh();
      }
    }

    checkUser();
  }, [router, supabase]);

  function traduzirErroLogin(message: string) {
    const mapa: Record<string, string> = {
      "Invalid login credentials": "E-mail ou senha inválidos.",
      "Email not confirmed": "Confirme seu e-mail antes de entrar.",
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

    window.sessionStorage.removeItem("crm_ambiente_redirect_apos_login");
    window.sessionStorage.removeItem("crm_ambiente_redirect_inicial");
    window.sessionStorage.removeItem(AMBIENTE_CONFIGURADO_STORAGE_KEY);
    try {
      getClientSessionId();
      await enviarEventoSessao("login");
    } catch {
      // O registro de sessao nao deve bloquear o login.
    }

    const rota = await obterRotaAposLogin();

    if (rota === "/configurar-ambiente") {
      window.sessionStorage.setItem("crm_ambiente_redirect_apos_login", "true");
    }

    setMensagem("Login realizado com sucesso.");
    setLoading(false);

    router.replace(rota);
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlowTop} />
      <div className={styles.backgroundGlowBottom} />
      <div className={styles.backgroundGrid} />

      <section className={styles.wrapper}>
        <div className={styles.brandPanel}>
          <div>
            <Link href="/" className={styles.brandHeader} aria-label="Ir para a página inicial">
              <span className={styles.brandBadge}>
                <Image
                  src="/logo.png"
                  alt="CRM Prosperity"
                  width={2096}
                  height={2048}
                  className={styles.brandLogo}
                  priority
                />
              </span>

              <span className={styles.brandIdentity}>
                <span className={styles.brandProduct}>Plataforma empresarial</span>
                <span className={styles.brandName}>CRM Prosperity</span>
              </span>
            </Link>

            <p className={styles.eyebrow}>Bem-vindo de volta</p>
            <h1 className={styles.title}>
              Seu atendimento inteligente começa aqui.
            </h1>

            <p className={styles.description}>
              Acesse sua operação, acompanhe conversas e mantenha automações,
              equipe e oportunidades conectadas em um só lugar.
            </p>

            <div className={styles.featureList}>
              <div className={styles.featureItem}>
                <span className={styles.featureIcon}><Check size={14} /></span>
                <span>WhatsApp oficial com atendimento centralizado</span>
              </div>

              <div className={styles.featureItem}>
                <span className={styles.featureIcon}><Check size={14} /></span>
                <span>Inteligência Artificial integrada de ponta a ponta</span>
              </div>

              <div className={styles.featureItem}>
                <span className={styles.featureIcon}><Check size={14} /></span>
                <span>Automações, agenda e gestão em uma única plataforma</span>
              </div>
            </div>
          </div>

          <div className={styles.integrationFooter}>
            <span className={styles.integrationLabel}>Integração Oficial com</span>

            <span className={styles.integrationBrands}>
              <span className={styles.integrationBrand}>
                <Image
                  src="/meta-logo.png"
                  alt="Meta"
                  width={120}
                  height={40}
                  className={styles.integrationLogo}
                />
              </span>

              <span className={styles.integrationDivider} aria-hidden="true" />

              <span className={styles.integrationBrand}>
                <Image
                  src="/google-logo.png"
                  alt="Google"
                  width={120}
                  height={40}
                  className={styles.integrationLogo}
                />
              </span>
            </span>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <p className={styles.cardEyebrow}>Área do cliente</p>
            <h2 className={styles.cardTitle}>Entrar na plataforma</h2>
            <p className={styles.cardSubtitle}>
              Use seus dados de acesso para continuar.
            </p>
          </div>

          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>E-mail</label>
              <input
                id="email"
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@empresa.com.br"
                autoComplete="email"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="password" className={styles.label}>
                Senha
              </label>

              <div className={styles.passwordWrapper}>
                <input
                  id="password"
                  type={mostrarSenha ? "text" : "password"}
                  className={`${styles.input} ${styles.passwordInput}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  autoComplete="current-password"
                  required
                />

                <button
                  type="button"
                  onClick={() => setMostrarSenha((valorAtual) => !valorAtual)}
                  className={styles.eyeButton}
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={mostrarSenha}
                >
                  {mostrarSenha ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={styles.submitButton}
            >
              <span>{loading ? "Entrando..." : "Entrar na plataforma"}</span>
              {loading ? null : <ArrowRight size={19} aria-hidden="true" />}
            </button>

            <div className={styles.formLinks}>
              <Link href="/comecar" className={styles.formLink}>
                Ainda não tenho conta
              </Link>

              <Link href="/recuperar-senha" className={styles.formLink}>
                Esqueci minha senha
              </Link>
            </div>
          </form>

          {mensagem && (
            <div
              className={`${styles.messageBox} ${
                mensagem === "Login realizado com sucesso."
                  ? styles.messageSuccess
                  : styles.messageError
              }`}
            >
              {mensagem}
            </div>
          )}

          <p className={styles.cardFooter}>
            Ainda precisa de ajuda?{" "}
            <Link href="/recuperar-senha">Recupere seu acesso</Link>
            {" "}ou fale com o suporte.
          </p>
        </div>
      </section>
    </main>
  );
}
