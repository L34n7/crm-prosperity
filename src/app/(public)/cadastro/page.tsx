"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./cadastro.module.css";

type FormDataState = {
  nomeFantasia: string;
  razaoSocial: string;
  documento: string;
  emailEmpresa: string;
  telefoneEmpresa: string;
  nomeResponsavel: string;
  nomeUsuario: string;
  emailUsuario: string;
  senha: string;
  confirmarSenha: string;
};

const VALOR_INICIAL: FormDataState = {
  nomeFantasia: "",
  razaoSocial: "",
  documento: "",
  emailEmpresa: "",
  telefoneEmpresa: "",
  nomeResponsavel: "",
  nomeUsuario: "",
  emailUsuario: "",
  senha: "",
  confirmarSenha: "",
};

export default function CadastroPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [form, setForm] = useState<FormDataState>(VALOR_INICIAL);
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [tipoMensagem, setTipoMensagem] = useState<"sucesso" | "erro" | "">("");

  function atualizarCampo<K extends keyof FormDataState>(
    campo: K,
    valor: FormDataState[K]
  ) {
    setForm((estadoAnterior) => ({
      ...estadoAnterior,
      [campo]: valor,
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setMensagem("");
    setTipoMensagem("");

    if (form.senha.length < 6) {
      setMensagem("A senha deve ter pelo menos 6 caracteres.");
      setTipoMensagem("erro");
      return;
    }

    if (form.senha !== form.confirmarSenha) {
      setMensagem("A confirmação de senha não confere.");
      setTipoMensagem("erro");
      return;
    }

    setLoading(true);

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.emailUsuario.trim(),
        password: form.senha,
        options: {
          data: {
            nome: form.nomeUsuario.trim(),
          },
        },
      });

      if (signUpError) {
        setMensagem(signUpError.message);
        setTipoMensagem("erro");
        setLoading(false);
        return;
      }

      const authUserId = signUpData.user?.id;

      if (!authUserId) {
        setMensagem("Não foi possível criar o usuário de autenticação.");
        setTipoMensagem("erro");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/public/cadastro", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_user_id: authUserId,
          nome_fantasia: form.nomeFantasia,
          razao_social: form.razaoSocial,
          documento: form.documento,
          email_empresa: form.emailEmpresa,
          telefone_empresa: form.telefoneEmpresa,
          nome_responsavel: form.nomeResponsavel,
          nome_usuario: form.nomeUsuario,
          email_usuario: form.emailUsuario,
          plano_slug: "basico",
        }),
      });

      const resultado = await response.json();

      if (!response.ok) {
        setMensagem(resultado?.error || "Não foi possível concluir o cadastro.");
        setTipoMensagem("erro");
        setLoading(false);
        return;
      }

      setMensagem(
        "Cadastro realizado com sucesso. Confirme seu email para entrar na plataforma."
      );
      setTipoMensagem("sucesso");
      setForm(VALOR_INICIAL);

      setTimeout(() => {
        router.push("/login");
      }, 2500);
    } catch (error) {
      console.error("Erro ao cadastrar:", error);
      setMensagem("Erro inesperado ao realizar o cadastro.");
      setTipoMensagem("erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlowTop} />
      <div className={styles.backgroundGlowBottom} />

      <section className={styles.wrapper}>
        <div className={styles.brandPanel}>
          <div className={styles.brandBadge}>CRM</div>

          <p className={styles.eyebrow}>Cadastro inicial</p>

          <h1 className={styles.title}>Crie sua empresa no CRM Prosperity</h1>

          <p className={styles.description}>
            Cadastre sua empresa e o usuário administrador inicial. Depois, basta
            confirmar seu email para entrar e seguir para a conexão com o WhatsApp.
          </p>

          <div className={styles.featureList}>
            <div className={styles.featureItem}>
              <span className={styles.featureDot} />
              <span>Plano básico com 2 acessos</span>
            </div>

            <div className={styles.featureItem}>
              <span className={styles.featureDot} />
              <span>1 administrador inicial</span>
            </div>

            <div className={styles.featureItem}>
              <span className={styles.featureDot} />
              <span>Estrutura inicial criada automaticamente</span>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <p className={styles.cardEyebrow}>Novo cadastro</p>
            <h2 className={styles.cardTitle}>Criar conta</h2>
            <p className={styles.cardSubtitle}>
              Preencha os dados da empresa e do usuário administrador.
            </p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.sectionTitle}>Dados da empresa</div>

            <div className={styles.field}>
              <label className={styles.label}>Nome fantasia</label>
              <input
                type="text"
                className={styles.input}
                value={form.nomeFantasia}
                onChange={(e) => atualizarCampo("nomeFantasia", e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Razão social</label>
              <input
                type="text"
                className={styles.input}
                value={form.razaoSocial}
                onChange={(e) => atualizarCampo("razaoSocial", e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Documento</label>
              <input
                type="text"
                className={styles.input}
                value={form.documento}
                onChange={(e) => atualizarCampo("documento", e.target.value)}
                placeholder="CPF ou CNPJ"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Email da empresa</label>
              <input
                type="email"
                className={styles.input}
                value={form.emailEmpresa}
                onChange={(e) => atualizarCampo("emailEmpresa", e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Telefone da empresa</label>
              <input
                type="text"
                className={styles.input}
                value={form.telefoneEmpresa}
                onChange={(e) => atualizarCampo("telefoneEmpresa", e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Nome do responsável</label>
              <input
                type="text"
                className={styles.input}
                value={form.nomeResponsavel}
                onChange={(e) => atualizarCampo("nomeResponsavel", e.target.value)}
              />
            </div>

            <div className={styles.sectionTitle}>Usuário administrador</div>

            <div className={styles.field}>
              <label className={styles.label}>Nome do usuário</label>
              <input
                type="text"
                className={styles.input}
                value={form.nomeUsuario}
                onChange={(e) => atualizarCampo("nomeUsuario", e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Email do usuário</label>
              <input
                type="email"
                className={styles.input}
                value={form.emailUsuario}
                onChange={(e) => atualizarCampo("emailUsuario", e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Senha</label>
              <input
                type="password"
                className={styles.input}
                value={form.senha}
                onChange={(e) => atualizarCampo("senha", e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Confirmar senha</label>
              <input
                type="password"
                className={styles.input}
                value={form.confirmarSenha}
                onChange={(e) => atualizarCampo("confirmarSenha", e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={styles.submitButton}
            >
              {loading ? "Criando cadastro..." : "Criar conta"}
            </button>

            <div className={styles.footerLink}>
              <Link href="/login" className={styles.link}>
                Já tenho conta
              </Link>
            </div>
          </form>

          {mensagem && (
            <div
              className={`${styles.messageBox} ${
                tipoMensagem === "sucesso"
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