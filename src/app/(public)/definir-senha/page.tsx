"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, LockKeyhole, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./definir-senha.module.css";

export default function DefinirSenhaPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [carregandoSessao, setCarregandoSessao] = useState(true);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [emailUsuario, setEmailUsuario] = useState("");

  const requisitos = {
    minimo: senha.length >= 8,
    maiuscula: /[A-Z]/.test(senha),
    minuscula: /[a-z]/.test(senha),
    numero: /\d/.test(senha),
    especial: /[^A-Za-z0-9]/.test(senha),
  };

  const totalRequisitos = Object.values(requisitos).filter(Boolean).length;
  const senhasIguais = senha.length > 0 && senha === confirmacao;
  const senhaValida = totalRequisitos >= 4 && senhasIguais;

  const forcaSenha =
    totalRequisitos <= 2 ? "fraca" : totalRequisitos < 5 ? "media" : "forte";

  useEffect(() => {
    async function carregarUsuario() {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) {
          setErro("Seu link é inválido, expirou ou sua sessão não foi criada.");
          return;
        }

        setEmailUsuario(data.user.email ?? "");
      } catch {
        setErro("Ocorreu um erro ao validar seu acesso.");
      } finally {
        setCarregandoSessao(false);
      }
    }

    carregarUsuario();
  }, [supabase]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    setErro("");
    setSucesso("");

    if (!senhaValida) {
      setErro("Crie uma senha segura e confirme corretamente.");
      return;
    }

    try {
      setEnviando(true);

      const { error: erroSenha } = await supabase.auth.updateUser({
        password: senha,
      });

      if (erroSenha) {
        setErro(erroSenha.message);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setErro("Não foi possível obter a sessão do usuário.");
        return;
      }

      const resposta = await fetch("/api/auth/finalizar-cadastro", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const json = await resposta.json();

      if (!resposta.ok || !json.ok) {
        setErro(json.error || "Senha criada, mas houve erro ao finalizar cadastro.");
        return;
      }

      setSucesso("Senha criada com sucesso. Redirecionando para o login...");

      setTimeout(() => {
        router.push("/login?sucesso=senha_definida");
      }, 1800);
    } catch {
      setErro("Erro inesperado ao definir sua senha.");
    } finally {
      setEnviando(false);
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

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.iconBox}>
          <LockKeyhole size={28} />
        </div>

        <div className={styles.header}>
          <h1>Definir senha</h1>
          <p>Crie uma senha segura para acessar o CRM Prosperity.</p>

          {emailUsuario ? <strong>{emailUsuario}</strong> : null}
        </div>

        {carregandoSessao ? (
          <div className={styles.infoBox}>Validando seu acesso...</div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label>Nova senha</label>

              <div className={styles.passwordWrapper}>
                <input
                  type={mostrarSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Digite sua nova senha"
                  autoComplete="new-password"
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
              <label>Confirmar senha</label>

              <div className={styles.passwordWrapper}>
                <input
                  type={mostrarConfirmacao ? "text" : "password"}
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  placeholder="Confirme sua senha"
                  autoComplete="new-password"
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

              {confirmacao && !senhasIguais ? (
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

            {erro ? <div className={styles.errorBox}>{erro}</div> : null}
            {sucesso ? <div className={styles.successBox}>{sucesso}</div> : null}

            <button
              type="submit"
              disabled={enviando || carregandoSessao || !senhaValida}
              className={styles.submitButton}
            >
              {enviando ? "Salvando..." : "Criar senha e continuar"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}