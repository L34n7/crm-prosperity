"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { enviarEventoSessao, getClientSessionId } from "@/lib/auth/browser-session";

type IntegracaoWhatsappAmbiente = {
  status?: string | null;
  webhook_verificado?: boolean | null;
  onboarding_etapa?: string | null;
  onboarding_status?: string | null;
  setup_completed_at?: string | null;
  phone_registered?: boolean | null;
  app_assigned?: boolean | null;
  waba_id?: string | null;
  phone_number_id?: string | null;
};

function isAmbienteConfigurado(
  integracao: IntegracaoWhatsappAmbiente | null | undefined
) {
  if (!integracao) return false;

  return (
    integracao.status === "ativa" &&
    integracao.webhook_verificado === true &&
    integracao.onboarding_etapa === "concluido" &&
    integracao.onboarding_status === "concluido" &&
    integracao.phone_registered === true &&
    integracao.app_assigned === true &&
    !!integracao.waba_id &&
    !!integracao.phone_number_id &&
    !!integracao.setup_completed_at
  );
}

async function obterRotaAposLogin() {
  try {
    const response = await fetch("/api/integracoes-whatsapp", {
      method: "GET",
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      return "/";
    }

    const ambienteConfigurado = isAmbienteConfigurado(data.integracao);

    if (!ambienteConfigurado) {
      return "/configurar-ambiente";
    }

    return "/";
  } catch (error) {
    console.warn("[LOGIN] Erro ao verificar ambiente:", error);
    return "/";
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
    window.sessionStorage.removeItem("crm_ambiente_configurado");
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

      <section className={styles.wrapper}>
        <div className={styles.brandPanel}>
          <div className={styles.brandHeader}>
            <div className={styles.brandBadge}>
              <Image
                src="/logo.png"
                alt="CRM Prosperity"
                width={2096}
                height={2048}
                className={styles.brandLogo}
                priority
              />
            </div>

            <div className={styles.brandIdentity}>
              <p className={styles.eyebrow}>Plataforma empresarial</p>
              <h1 className={styles.title}>CRM Prosperity</h1>
            </div>
          </div>

          <p className={styles.description}>
            Centralize o atendimento pelo WhatsApp, automatize conversas, realize
            disparos e acompanhe a jornada dos seus leads em um único sistema.
          </p>

          <div className={styles.featureList}>
            <div className={styles.featureItem}>
              <span className={styles.featureDot} />
              <span>Integração com a API Oficial do WhatsApp da Meta</span>
            </div>

            <div className={styles.featureItem}>
              <span className={styles.featureDot} />
              <span>Automações, fluxos e disparos programados</span>
            </div>

            <div className={styles.featureItem}>
              <span className={styles.featureDot} />
              <span>Rastreamento de leads, campanhas e conversões com Pixel</span>
            </div>
          </div>

          <div className={styles.integrationFooter}>
            <span className={styles.integrationLabel}>Integrações com</span>

            <div className={styles.integrationBrands}>
              <div className={styles.integrationBrand}>
                <Image
                  src="/meta-logo.png"
                  alt="Meta"
                  width={120}
                  height={40}
                  className={styles.integrationLogo}
                />
              </div>

              <span className={styles.integrationDivider} />

              <div className={styles.integrationBrand}>
                <Image
                  src="/google-logo.png"
                  alt="Google"
                  width={120}
                  height={40}
                  className={styles.integrationLogo}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <p className={styles.cardEyebrow}>Acesso seguro</p>
            <h2 className={styles.cardTitle}>Entrar na plataforma</h2>
            <p className={styles.cardSubtitle}>
              Informe seu e-mail e senha para acessar o painel administrativo.
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
              {loading ? "Entrando..." : "Entrar"}
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
                Ainda não tenho conta
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
        </div>
      </section>
    </main>
  );
}
