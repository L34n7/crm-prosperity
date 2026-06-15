"use client";

import {
  FormEvent,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./atualizar-senha.module.css";

function AtualizarSenhaContent() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const processadoRef = useRef(false);

  const [password, setPassword] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [podeAlterar, setPodeAlterar] = useState(false);

  const requisitos = {
    minimo: password.length >= 8,
    maiuscula: /[A-Z]/.test(password),
    minuscula: /[a-z]/.test(password),
    numero: /\d/.test(password),
    especial: /[^A-Za-z0-9]/.test(password),
  };

  const totalRequisitos = Object.values(requisitos).filter(Boolean).length;
  const senhasIguais = password.length > 0 && password === confirmarSenha;
  const senhaValida = totalRequisitos >= 4 && senhasIguais;

  const forcaSenha =
    totalRequisitos <= 2 ? "fraca" : totalRequisitos < 4 ? "media" : "forte";

  useEffect(() => {
    if (processadoRef.current) return;
    processadoRef.current = true;

    async function prepararRecuperacao() {
      setErro("");
      setVerificando(true);

      try {
        const tokenHash = searchParams.get("token_hash");
        const type = searchParams.get("type");

        if (tokenHash && type === "recovery") {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });

          if (error) {
            setErro("Link inválido ou expirado. Solicite uma nova recuperação de senha.");
            setPodeAlterar(false);
            return;
          }

          setPodeAlterar(true);
          return;
        }

        const hash = window.location.hash.replace("#", "");
        const params = new URLSearchParams(hash);

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const hashType = params.get("type");

        if (accessToken && refreshToken && hashType === "recovery") {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            setErro("Link inválido ou expirado. Solicite uma nova recuperação de senha.");
            setPodeAlterar(false);
            return;
          }

          setPodeAlterar(true);
          return;
        }

        const { data } = await supabase.auth.getSession();

        if (data.session) {
          setPodeAlterar(true);
          return;
        }

        setErro("Link inválido ou expirado. Solicite uma nova recuperação de senha.");
        setPodeAlterar(false);
      } catch {
        setErro("Não foi possível validar o link de recuperação.");
        setPodeAlterar(false);
      } finally {
        setVerificando(false);
      }
    }

    prepararRecuperacao();
  }, [searchParams, supabase]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setErro("");
    setMensagem("");

    if (!senhaValida) {
      setErro("Crie uma senha segura e confirme corretamente.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setErro(error.message);
        return;
      }

      setMensagem("Senha atualizada com sucesso. Redirecionando para o login...");

      setTimeout(async () => {
        await supabase.auth.signOut();
        router.push("/login?sucesso=senha_atualizada");
        router.refresh();
      }, 1500);
    } catch {
      setErro("Não foi possível atualizar a senha.");
    } finally {
      setLoading(false);
    }
  }

  function RegraSenha({
    valido,
    texto,
  }: {
    valido: boolean;
    texto: string;
  }) {
    return (
      <li className={valido ? styles.regraValida : styles.regraInvalida}>
        {valido ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
        {texto}
      </li>
    );
  }

  if (verificando) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <div className={styles.infoBox}>Validando link de recuperação...</div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.iconBox}>
          <LockKeyhole size={28} />
        </div>

        <div className={styles.header}>
          <h1>Definir nova senha</h1>
          <p>Crie uma senha segura para recuperar o acesso à sua conta.</p>
        </div>

        {erro && !podeAlterar ? (
          <>
            <div className={styles.errorBox}>{erro}</div>

            <Link href="/recuperar-senha" className={styles.backLink}>
              <ArrowLeft size={17} />
              Solicitar novo link
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="password">Nova senha</label>

              <div className={styles.passwordWrapper}>
                <input
                  id="password"
                  type={mostrarSenha ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErro("");
                    setMensagem("");
                  }}
                  placeholder="Digite a nova senha"
                  autoComplete="new-password"
                  required
                />

                <button
                  type="button"
                  onClick={() => setMostrarSenha((valor) => !valor)}
                  className={styles.eyeButton}
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                >
                  {mostrarSenha ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="confirmarSenha">Confirmar nova senha</label>

              <div className={styles.passwordWrapper}>
                <input
                  id="confirmarSenha"
                  type={mostrarConfirmacao ? "text" : "password"}
                  value={confirmarSenha}
                  onChange={(e) => {
                    setConfirmarSenha(e.target.value);
                    setErro("");
                    setMensagem("");
                  }}
                  placeholder="Repita a nova senha"
                  autoComplete="new-password"
                  required
                />

                <button
                  type="button"
                  onClick={() => setMostrarConfirmacao((valor) => !valor)}
                  className={styles.eyeButton}
                  aria-label={
                    mostrarConfirmacao ? "Ocultar confirmação" : "Mostrar confirmação"
                  }
                >
                  {mostrarConfirmacao ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>

              {confirmarSenha && !senhasIguais ? (
                <p className={styles.passwordMismatch}>As senhas não conferem.</p>
              ) : null}
            </div>

            <div className={styles.strengthArea}>
              <div className={styles.strengthHeader}>
                <span>Força da senha</span>
                <strong className={styles[forcaSenha]}>
                  {forcaSenha === "fraca"
                    ? "Fraca"
                    : forcaSenha === "media"
                      ? "Média"
                      : "Forte"}
                </strong>
              </div>

              <div className={styles.strengthBar}>
                <div
                  className={`${styles.strengthFill} ${styles[forcaSenha]}`}
                  style={{ width: `${(totalRequisitos / 5) * 100}%` }}
                />
              </div>
            </div>

            <ul className={styles.regras}>
              <RegraSenha valido={requisitos.minimo} texto="Mínimo de 8 caracteres" />
              <RegraSenha valido={requisitos.maiuscula} texto="Uma letra maiúscula" />
              <RegraSenha valido={requisitos.minuscula} texto="Uma letra minúscula" />
              <RegraSenha valido={requisitos.numero} texto="Um número" />
              <RegraSenha valido={requisitos.especial} texto="Um caractere especial" />
            </ul>

            {mensagem ? <div className={styles.successBox}>{mensagem}</div> : null}
            {erro ? <div className={styles.errorBox}>{erro}</div> : null}

            <button
              type="submit"
              disabled={loading || !senhaValida}
              className={styles.submitButton}
            >
              {loading ? "Salvando..." : "Atualizar senha"}
            </button>
          </form>
        )}

        <Link href="/login" className={styles.backLink}>
          <ArrowLeft size={17} />
          Voltar para o login
        </Link>
      </section>
    </main>
  );
}

export default function AtualizarSenhaPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <section className={styles.card}>
            <div className={styles.infoBox}>Carregando...</div>
          </section>
        </main>
      }
    >
      <AtualizarSenhaContent />
    </Suspense>
  );
}
