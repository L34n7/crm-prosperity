import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CrmShell from "@/components/CrmShell";
import Header from "@/components/Header";
import styles from "./page.module.css";

function getStatusLabel(status: string | null) {
  if (!status) return "Não definido";

  switch (status) {
    case "ativo":
      return "Ativo";
    case "inativo":
      return "Inativo";
    case "bloqueado":
      return "Bloqueado";
    default:
      return status;
  }
}

function getStatusClass(status: string | null) {
  switch (status) {
    case "ativo":
      return styles.statusActive;
    case "inativo":
      return styles.statusInactive;
    case "bloqueado":
      return styles.statusBlocked;
    default:
      return styles.statusDefault;
  }
}

const modulos = [
  {
    titulo: "Conversas",
    descricao: "Gerencie filas, responsáveis, transferências e atendimento.",
    href: "/conversas",
  },
  {
    titulo: "Mensagens",
    descricao: "Acompanhe o histórico e a comunicação com os clientes.",
    href: "/mensagens",
  },
  {
    titulo: "Contatos",
    descricao: "Visualize e organize os contatos da operação.",
    href: "/contatos",
  },
  {
    titulo: "Usuários",
    descricao: "Administre usuários, acessos, vínculos e estrutura interna.",
    href: "/usuarios",
  },
  {
    titulo: "Setores",
    descricao: "Distribua sua operação por setores e equipes.",
    href: "/setores",
  },
  {
    titulo: "Permissões",
    descricao: "Configure perfis e regras de acesso do sistema.",
    href: "/configuracoes/permissoes",
  },
];

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: usuarioSistema, error: usuarioSistemaError } = await supabase
    .from("usuarios")
    .select("id, nome, email, empresa_id, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (usuarioSistemaError) {
    console.error("Erro ao buscar usuário do sistema:", usuarioSistemaError);
    redirect("/login");
  }

  if (!usuarioSistema) {
    redirect("/login");
  }

  const statusLabel = getStatusLabel(usuarioSistema.status);
  const statusClass = getStatusClass(usuarioSistema.status);

  return (
    <CrmShell>
      <Header
        title="Dashboard"
        subtitle="Visão inicial do sistema com acesso rápido aos principais módulos."
      />

      <section className={styles.heroGrid}>
        <div className={styles.heroCard}>
          <p className={styles.heroLabel}>Bem-vindo ao CRM</p>
          <h2 className={styles.heroTitle}>
            Plataforma com estrutura mais profissional, limpa e pronta para crescer
          </h2>
          <p className={styles.heroText}>
            Essa área pode evoluir para mostrar métricas, atendimentos em fila,
            usuários online, alertas operacionais e desempenho dos setores.
          </p>

          <div className={styles.heroActions}>
            <Link href="/conversas" className={styles.primaryButton}>
              Abrir conversas
            </Link>

            <Link href="/usuarios" className={styles.secondaryButton}>
              Gerenciar usuários
            </Link>
          </div>
        </div>

        <div className={styles.sessionCard}>
          <p className={styles.cardLabel}>Usuário autenticado</p>
          <h3 className={styles.cardTitle}>Informações da sessão</h3>

          <div className={styles.infoList}>
            <div className={styles.infoItem}>
              <span className={styles.infoKey}>Nome</span>
              <span className={styles.infoValue}>
                {usuarioSistema.nome || "Não informado"}
              </span>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.infoKey}>E-mail</span>
              <span className={styles.infoValue}>
                {usuarioSistema.email || "Não informado"}
              </span>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.infoKey}>Empresa vinculada</span>
              <span className={styles.infoValue}>
                {usuarioSistema.empresa_id || "Sem empresa vinculada"}
              </span>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.infoKey}>Status</span>
              <span className={`${styles.statusBadge} ${statusClass}`}>
                {statusLabel}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.modulesCard}>
        <div className={styles.modulesHeader}>
          <div>
            <p className={styles.cardLabel}>Acesso rápido</p>
            <h2 className={styles.cardTitle}>Módulos do sistema</h2>
          </div>

          <p className={styles.modulesDescription}>
            Navegação mais organizada para o painel administrativo.
          </p>
        </div>

        <div className={styles.modulesGrid}>
          {modulos.map((modulo) => (
            <Link key={modulo.href} href={modulo.href} className={styles.moduleItem}>
              <div>
                <h3 className={styles.moduleTitle}>{modulo.titulo}</h3>
                <p className={styles.moduleText}>{modulo.descricao}</p>
              </div>

              <span className={styles.openTag}>Abrir</span>
            </Link>
          ))}
        </div>
      </section>
    </CrmShell>
  );
}