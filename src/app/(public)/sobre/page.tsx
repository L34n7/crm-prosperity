import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  CheckCircle2,
  MessageCircle,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import styles from "./sobre.module.css";

const MODULOS = [
  {
    icon: MessageCircle,
    title: "Atendimento centralizado",
    description:
      "Organize conversas, contatos e historicos em uma operacao mais clara para toda a equipe.",
  },
  {
    icon: Bot,
    title: "Automacoes comerciais",
    description:
      "Crie fluxos para agilizar respostas, direcionar atendimentos e apoiar a jornada dos clientes.",
  },
  {
    icon: UsersRound,
    title: "Equipe e permissoes",
    description:
      "Estruture setores, perfis de acesso e responsabilidades conforme a realidade da sua empresa.",
  },
];

const DADOS_GOOGLE = [
  "Criar, atualizar e remover eventos correspondentes aos agendamentos do CRM.",
  "Consultar periodos ocupados para evitar a oferta de horarios indisponiveis.",
  "Manter a sincronizacao somente enquanto a conta estiver vinculada.",
];

export default function SobrePage() {
  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlowTop} />
      <div className={styles.backgroundGlowBottom} />

      <header className={styles.header}>
        <Link href="/sobre" className={styles.brand}>
          <span className={styles.logoBox}>
            <Image
              src="/logo.png"
              alt="CRM Prosperity"
              width={42}
              height={42}
              className={styles.logo}
              priority
            />
          </span>
          <span>
            <strong>CRM Prosperity</strong>
            <small>Plataforma empresarial</small>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="Navegacao principal">
          <a href="#recursos">Recursos</a>
          <a href="#google-calendar">Google Calendar</a>
          <Link href="/politica-de-privacidade">Privacidade</Link>
        </nav>

        <div className={styles.headerActions}>
          <Link href="/login" className={styles.loginButton}>
            Entrar
          </Link>
          <Link href="/comecar" className={styles.primaryButton}>
            Comecar agora
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <span />
            CRM para operacoes que querem crescer
          </div>

          <h1>
            Atendimento, relacionamento e agenda comercial em um so lugar.
          </h1>

          <p>
            O CRM Prosperity ajuda empresas a organizar conversas, contatos,
            equipes, permissoes e automacoes com uma experiencia profissional e
            preparada para a rotina comercial.
          </p>

          <div className={styles.heroActions}>
            <Link href="/comecar" className={styles.heroPrimaryButton}>
              Conhecer a plataforma
              <ArrowRight size={17} />
            </Link>
            <Link href="/login" className={styles.heroSecondaryButton}>
              Acessar minha conta
            </Link>
          </div>

          <div className={styles.heroTrust}>
            <span>
              <ShieldCheck size={17} />
              Controle de acesso
            </span>
            <span>
              <CalendarCheck size={17} />
              Agenda integrada
            </span>
            <span>
              <MessageCircle size={17} />
              Operacao centralizada
            </span>
          </div>
        </div>

        <div className={styles.heroPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelStatus}>
              <i />
              Operacao conectada
            </span>
            <span className={styles.panelLabel}>CRM Prosperity</span>
          </div>

          <div className={styles.panelHero}>
            <div className={styles.panelIcon}>
              <CalendarCheck size={26} />
            </div>
            <div>
              <small>Agenda comercial</small>
              <strong>Compromissos organizados</strong>
              <p>Disponibilidade e sincronizacao em uma visao simples.</p>
            </div>
          </div>

          <div className={styles.panelMetrics}>
            <div>
              <small>Equipe</small>
              <strong>Setores e perfis</strong>
            </div>
            <div>
              <small>Atendimento</small>
              <strong>Fluxos integrados</strong>
            </div>
          </div>

          <div className={styles.panelList}>
            <span>
              <CheckCircle2 size={16} />
              Conversas em um unico ambiente
            </span>
            <span>
              <CheckCircle2 size={16} />
              Agenda conectada ao processo comercial
            </span>
            <span>
              <CheckCircle2 size={16} />
              Controle da operacao por empresa
            </span>
          </div>
        </div>
      </section>

      <section id="recursos" className={styles.section}>
        <div className={styles.sectionHeading}>
          <p>Estrutura da plataforma</p>
          <h2>Recursos para uma operacao comercial mais organizada</h2>
          <span>
            Centralize processos importantes sem perder clareza sobre equipe,
            clientes e compromissos.
          </span>
        </div>

        <div className={styles.resourceGrid}>
          {MODULOS.map(({ icon: Icon, title, description }) => (
            <article key={title} className={styles.resourceCard}>
              <div className={styles.resourceIcon}>
                <Icon size={22} />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="google-calendar" className={styles.googleSection}>
        <div className={styles.googleContent}>
          <p className={styles.sectionEyebrow}>Integracao opcional</p>
          <h2>Sincronizacao transparente com o Google Calendar</h2>
          <p className={styles.googleDescription}>
            A conexao e ativada somente quando um usuario autorizado vincula sua
            conta Google nas configuracoes de uma agenda. O objetivo e manter
            compromissos consistentes e evitar conflitos de horario.
          </p>

          <div className={styles.dataList}>
            {DADOS_GOOGLE.map((item) => (
              <span key={item}>
                <CheckCircle2 size={17} />
                {item}
              </span>
            ))}
          </div>
        </div>

        <aside className={styles.privacyCard}>
          <div className={styles.privacyIcon}>
            <ShieldCheck size={24} />
          </div>
          <p className={styles.sectionEyebrow}>Privacidade por principio</p>
          <h3>Seus dados permanecem sob seu controle</h3>
          <p>
            O CRM Prosperity nao vende dados do Google Calendar, nao utiliza
            essas informacoes para publicidade e nao as compartilha com
            terceiros para finalidades independentes da sincronizacao.
          </p>
          <p>
            O vinculo pode ser removido a qualquer momento no CRM ou revogado
            diretamente nas configuracoes da Conta Google.
          </p>
          <Link href="/politica-de-privacidade">
            Ler Politica de Privacidade
            <ArrowRight size={16} />
          </Link>
        </aside>
      </section>

      <section className={styles.cta}>
        <div>
          <p className={styles.sectionEyebrow}>CRM Prosperity</p>
          <h2>Uma operacao mais organizada com espaco para evoluir.</h2>
        </div>
        <Link href="/comecar" className={styles.ctaButton}>
          Criar meu acesso
          <ArrowRight size={17} />
        </Link>
      </section>

      <footer className={styles.footer}>
        <div>
          <strong>CRM Prosperity</strong>
          <p>Plataforma de gestao comercial e atendimento para empresas.</p>
        </div>
        <nav aria-label="Links legais">
          <Link href="/politica-de-privacidade">Politica de Privacidade</Link>
          <Link href="/termos-de-servico">Termos de Servico</Link>
          <Link href="/login">Entrar no CRM</Link>
        </nav>
      </footer>
    </main>
  );
}
