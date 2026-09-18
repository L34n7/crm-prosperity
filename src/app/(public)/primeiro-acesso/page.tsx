"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "../definir-senha/definir-senha.module.css";

export default function PrimeiroAcessoPage() {
  const router = useRouter();
  const aberturaRegistrada = useRef(false);

  const [token, setToken] = useState("");
  const [validandoLink, setValidandoLink] = useState(true);
  const [linkValido, setLinkValido] = useState(false);
  const [emailUsuario, setEmailUsuario] = useState("");
  const [aberturasRestantes, setAberturasRestantes] = useState<number | null>(null);
  const [expiraEm, setExpiraEm] = useState<string | null>(null);

  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [motivoErro, setMotivoErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const requisitos = useMemo(
    () => ({
      minimo: senha.length >= 8,
      maiuscula: /[A-Z]/.test(senha),
      minuscula: /[a-z]/.test(senha),
      numero: /\d/.test(senha),
      especial: /[^A-Za-z0-9]/.test(senha),
    }),
    [senha]
  );

  const totalRequisitos = Object.values(requisitos).filter(Boolean).length;
  const senhasIguais = senha.length > 0 && senha === confirmacao;
  const senhaValida = totalRequisitos >= 4 && senhasIguais;
  const forcaSenha =
    totalRequisitos <= 2 ? "fraca" : totalRequisitos < 5 ? "media" : "forte";

  useEffect(() => {
    if (aberturaRegistrada.current) return;
    aberturaRegistrada.current = true;

    async function validarLink() {
      const tokenUrl = new URLSearchParams(window.location.search)
        .get("token")
        ?.trim();

      if (!tokenUrl) {
        setErro("Link de primeiro acesso inválido.");
        setMotivoErro("invalido");
        setValidandoLink(false);
        return;
      }

      setToken(tokenUrl);

      try {
        const resposta = await fetch("/api/auth/primeiro-acesso/abrir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenUrl }),
        });

        const json = await resposta.json();

        if (!resposta.ok || !json.ok) {
          setErro(json.error || "Não foi possível validar este link.");
          setMotivoErro(json.motivo || "invalido");
          return;
        }

        setMotivoErro("");
        setLinkValido(true);
        setEmailUsuario(json.email || "");
        setAberturasRestantes(
          typeof json.aberturas_restantes === "number"
            ? json.aberturas_restantes
            : null
        );
        setExpiraEm(json.expira_em || null);
      } catch {
        setErro("Não foi possível validar este link de primeiro acesso.");
        setMotivoErro("erro_validacao");
      } finally {
        setValidandoLink(false);
      }
    }

    validarLink();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro("");
    setSucesso("");

    if (!linkValido || !token) {
      setErro("Este link não está disponível para cadastrar a senha.");
      return;
    }

    if (!senhaValida) {
      setErro("Crie uma senha segura e confirme corretamente.");
      return;
    }

    try {
      setEnviando(true);

      const resposta = await fetch("/api/auth/primeiro-acesso/definir-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, senha }),
      });

      const json = await resposta.json();

      if (!resposta.ok || !json.ok) {
        setErro(json.error || "Não foi possível cadastrar sua senha.");

        if (json.motivo === "senha_definida") {
          setMotivoErro("senha_definida");
          setLinkValido(false);
        }

        return;
      }

      setMotivoErro("");
      setLinkValido(false);
      setSucesso("Senha criada com sucesso. Redirecionando para o login...");

      window.setTimeout(() => {
        router.replace("/login?sucesso=senha_definida");
      }, 1500);
    } catch {
      setErro("Erro inesperado ao cadastrar sua senha.");
    } finally {
      setEnviando(false);
    }
  }

  function RegraSenha({ valido, texto }: { valido: boolean; texto: string }) {
    return (
      <li className={valido ? styles.regraValida : styles.regraInvalida}>
        {valido ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
        {texto}
      </li>
    );
  }

  const validadeTexto = expiraEm
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(expiraEm))
    : null;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.iconBox}>
          <KeyRound size={28} />
        </div>

        <div className={styles.header}>
          <h1>Primeiro acesso</h1>
          <p>Crie sua senha para acessar o CRM Prosperity.</p>
          {emailUsuario ? <strong>{emailUsuario}</strong> : null}
        </div>

        {validandoLink ? (
          <div className={styles.infoBox}>Validando seu link de acesso...</div>
        ) : !linkValido ? (
          <div className={styles.unavailableArea}>
            <div className={erro ? styles.errorBox : styles.infoBox}>
              {erro || "Este link não está mais disponível."}
            </div>

            {motivoErro === "senha_definida" ? (
              <button
                type="button"
                className={styles.loginButton}
                onClick={() => router.push("/login")}
              >
                Fazer login
              </button>
            ) : null}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.infoBox}>
              Este link é válido por 24 horas e pode ser aberto até 3 vezes.
              {aberturasRestantes !== null
                ? ` Restam ${aberturasRestantes} abertura${
                    aberturasRestantes === 1 ? "" : "s"
                  } após esta.`
                : ""}
              {validadeTexto ? ` Validade: ${validadeTexto}.` : ""}
            </div>

            <div className={styles.inputGroup}>
              <label>Nova senha</label>
              <div className={styles.passwordWrapper}>
                <input
                  type={mostrarSenha ? "text" : "password"}
                  value={senha}
                  onChange={(event) => setSenha(event.target.value)}
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
                  onChange={(event) => setConfirmacao(event.target.value)}
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
                  {mostrarConfirmacao ? (
                    <EyeOff size={20} />
                  ) : (
                    <Eye size={20} />
                  )}
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
              disabled={enviando || !senhaValida || !linkValido}
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
