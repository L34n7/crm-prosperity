import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  GraduationCap,
  Hourglass,
  Link2,
  LockKeyhole,
  Mail,
  MessageCircleMore,
  MessagesSquare,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
} from "lucide-react";
import ImpactCalculator from "./ImpactCalculator";
import styles from "./sobre.module.css";

export const metadata: Metadata = {
  title: "CRM Prosperity | Sua máquina de vendas",
  description:
    "Automatize o relacionamento com clientes, centralize seus canais e escale suas vendas com o CRM Prosperity.",
};

const PAINS = [
  {
    icon: Mail,
    title: "Leads Perdidos Sem Registro",
    description:
      "Contatos caem no esquecimento porque não há histórico. Oportunidades somem todo dia sem você saber.",
  },
  {
    icon: Hourglass,
    title: "Follow-up 100% Manual",
    description:
      "Sua equipe gasta horas lembrando quem ligar, quando ligar e o que dizer. Produtividade no chão.",
  },
  {
    icon: BarChart3,
    title: "Relatórios Inexistentes",
    description:
      "Você toma decisões no escuro porque os dados ficam em planilhas espalhadas, nunca consolidados.",
  },
  {
    icon: MessageCircleMore,
    title: "Atendimento Fragmentado",
    description:
      "Cliente fala no WhatsApp, e-mail e Instagram. Ninguém vê o histórico completo. Ele repete tudo de novo.",
  },
];

const FEATURES = [
  {
    icon: Bot,
    title: "Copiloto de IA para Vendas",
    description:
      "Nossa IA analisa o histórico do cliente, sugere o próximo passo ideal e gera mensagens personalizadas automaticamente. Sua equipe foca em fechar, não em digitar.",
    tags: [
      "GPT-4 Integrado",
      "Análise de Sentimento",
      "Sugestões em Tempo Real",
      "Multidioma",
    ],
    featured: true,
  },
  {
    icon: RefreshCw,
    title: "Automações Sem Código",
    description:
      "Monte fluxos completos de follow-up, nutrição e reativação arrastando e soltando. Zero programação necessária.",
  },
  {
    icon: Smartphone,
    title: "Omnichannel Unificado",
    description:
      "WhatsApp, e-mail, Instagram e SMS em uma única caixa de entrada. Histórico completo do cliente em qualquer canal.",
  },
  {
    icon: BarChart3,
    title: "Analytics em Tempo Real",
    description:
      "Dashboards com métricas de conversão, ciclo de vendas e performance por vendedor. Tome decisões com dados.",
  },
  {
    icon: Link2,
    title: "Integrações Nativas",
    description:
      "Conecte com seu e-commerce, ERP, plataforma de pagamento e mais de 200 ferramentas. API aberta incluída.",
  },
  {
    icon: ShieldCheck,
    title: "AWS + Segurança Enterprise",
    description:
      "Infraestrutura AWS com 99,9% de uptime. Seus dados protegidos com criptografia de ponta a ponta e conformidade LGPD.",
  },
];

const ECOSYSTEM = [
  {
    icon: GraduationCap,
    title: "Academia Prosperity",
    description:
      "Cursos práticos para dominar o CRM e vender mais com automações e IA.",
  },
  {
    icon: MessagesSquare,
    title: "Comunidade Oficial",
    description:
      "Conecte-se com milhares de usuários, tire dúvidas e troque estratégias.",
  },
  {
    icon: Sparkles,
    title: "Prosperity Tube",
    description:
      "Tutoriais, cases de sucesso e novidades publicados toda semana.",
  },
];

const FAQ = [
  {
    question: "O CRM Prosperity funciona para o meu segmento?",
    answer:
      "Sim. O CRM Prosperity foi construído para ser flexível e se adapta a diferentes segmentos: infoprodutores, e-commerce, imobiliárias, clínicas, prestadores de serviço e muito mais. As automações e pipelines são personalizáveis.",
  },
  {
    question: "Preciso saber programar para usar as automações?",
    answer:
      "Não. Os fluxos são montados de forma visual e intuitiva. Você configura gatilhos, ações e mensagens sem escrever código.",
  },
  {
    question: "A plataforma é estável? Não vai cair no meu lançamento?",
    answer:
      "A plataforma utiliza infraestrutura em nuvem e monitoramento contínuo para oferecer disponibilidade, segurança e escala para a sua operação.",
  },
  {
    question: "Como funciona o suporte?",
    answer:
      "Você conta com atendimento humanizado para dúvidas de uso e configuração, além de materiais práticos para acelerar a implantação.",
  },
  {
    question: "Vocês integram com meu sistema atual?",
    answer:
      "O CRM possui integrações nativas e recursos de API para se conectar às principais ferramentas da sua operação.",
  },
];

export default function SobrePage() {
  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlowTop} />
      <div className={styles.backgroundGlowBottom} />

      <header className={styles.header}>
        <Link href="/sobre" className={styles.brand} aria-label="CRM Prosperity">
          <span className={styles.logoBox}>
            <Image
              src="/logo.png"
              alt=""
              width={42}
              height={42}
              className={styles.logo}
              priority
            />
          </span>
          <strong>
            CRM <span>Prosperity</span>
          </strong>
        </Link>

        <nav className={styles.nav} aria-label="Navegação principal">
          <a href="#recursos">Recursos</a>
          <Link href="/plano">Planos</Link>
          <a href="#faq">FAQ</a>
        </nav>

        <div className={styles.headerActions}>
          <Link href="/login" className={styles.loginButton}>
            Entrar
          </Link>
          <Link href="/comecar" className={styles.primaryButton}>
            Criar Conta
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroBadge}>
          <span />
          Plataforma de CRM com IA
        </div>

        <h1>
          Seu CRM.
          <span>Sua máquina de vendas.</span>
        </h1>

        <p>
          Automatize seu relacionamento com clientes, dispare campanhas
          inteligentes e escale suas vendas com IA. Tudo em uma plataforma.
        </p>

        <div className={styles.heroActions}>
          <Link href="/comecar" className={styles.heroPrimaryButton}>
            Criar Conta
            <ArrowRight size={17} />
          </Link>
          <a href="#recursos" className={styles.heroSecondaryButton}>
            Ver Recursos
          </a>
        </div>

        <div className={styles.stats} aria-label="Números do CRM Prosperity">
          <div>
            <strong>
              500K<span>+</span>
            </strong>
            <small>Contatos gerenciados</small>
          </div>
          <div>
            <strong>
              99,9<span>%</span>
            </strong>
            <small>Uptime garantido</small>
          </div>
          <div>
            <strong>
              &lt;2<span>s</span>
            </strong>
            <small>Resposta automática</small>
          </div>
          <div>
            <strong>
              3K<span>+</span>
            </strong>
            <small>Empresas ativas</small>
          </div>
        </div>

        <div className={styles.trustBadges}>
          <span>
            <Star size={14} /> AWS Infrastructure
          </span>
          <span>
            <Check size={14} /> Suporte Humanizado
          </span>
          <span>
            <LockKeyhole size={14} /> Dados 100% Seguros
          </span>
          <span>
            <Clock3 size={14} /> Resposta 24/7
          </span>
        </div>
      </section>

      <section className={styles.section} id="dores">
        <div className={styles.sectionHeading}>
          <p>Você conhece essa dor</p>
          <h2>
            Os problemas que <span>te trouxeram até aqui</span>
          </h2>
          <div>
            São as dores que toda empresa enfrenta sem um CRM inteligente. No
            CRM Prosperity, elas não existem.
          </div>
        </div>

        <div className={styles.painGrid}>
          {PAINS.map(({ icon: Icon, title, description }) => (
            <article key={title} className={styles.painCard}>
              <div className={styles.painIcon}>
                <Icon size={20} />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>

        <p className={styles.painFooter}>
          Com o CRM Prosperity,{" "}
          <strong>essas dores viram coisa do passado</strong> — a partir do
          primeiro acesso.
        </p>
      </section>

      <section className={styles.section} id="recursos">
        <div className={styles.sectionHeading}>
          <p>Por que CRM Prosperity</p>
          <h2>
            Infraestrutura completa.
            <span> Resultados reais.</span>
          </h2>
          <div>
            Cada funcionalidade foi construída para eliminar gargalos e
            multiplicar conversões.
          </div>
        </div>

        <div className={styles.featureGrid}>
          {FEATURES.map(
            ({ icon: Icon, title, description, tags, featured }) => (
              <article
                key={title}
                className={`${styles.featureCard} ${
                  featured ? styles.featuredCard : ""
                }`}
              >
                {featured && (
                  <span className={styles.featureLabel}>Destaque</span>
                )}
                <div className={styles.featureIcon}>
                  <Icon size={22} />
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
                {tags && (
                  <div className={styles.tags}>
                    {tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}
              </article>
            ),
          )}
        </div>
      </section>

      <section className={styles.section} id="impacto">
        <div className={styles.sectionHeading}>
          <p>Calculadora de impacto</p>
          <h2>
            Quanto você perde
            <span> sem automação?</span>
          </h2>
          <div>
            Leads frios custam caro. Veja a diferença que o CRM Prosperity faz
            no seu faturamento.
          </div>
        </div>

        <ImpactCalculator />
      </section>

      <section className={styles.section} id="ecossistema">
        <div className={styles.sectionHeading}>
          <p>Explore o ecossistema</p>
          <h2>
            Saiba mais sobre o
            <span> CRM Prosperity</span>
          </h2>
        </div>

        <div className={styles.ecosystemGrid}>
          {ECOSYSTEM.map(({ icon: Icon, title, description }) => (
            <article key={title} className={styles.ecosystemCard}>
              <Icon size={27} />
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.faqSection} id="faq">
        <div className={styles.sectionHeading}>
          <p>Dúvidas</p>
          <h2>
            Perguntas <span>Frequentes</span>
          </h2>
          <div>Tudo que você precisa saber antes de começar.</div>
        </div>

        <div className={styles.faqList}>
          {FAQ.map(({ question, answer }, index) => (
            <details key={question} open={index === 0}>
              <summary>
                {question}
                <ChevronDown size={18} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <h2>
          Chega de perder vendas
          <span>por falta de organização.</span>
        </h2>
        <p>Comece agora. Crie sua conta em 2 minutos.</p>
        <div className={styles.heroActions}>
          <Link href="/comecar" className={styles.heroPrimaryButton}>
            Criar Conta 
            <ArrowRight size={17} />
          </Link>
          <Link href="/plano" className={styles.heroSecondaryButton}>
            Ver Planos
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerGrid}>
          <div className={styles.footerBrand}>
            <Link
              href="/sobre"
              className={styles.brand}
              aria-label="CRM Prosperity"
            >
              <span className={styles.logoBox}>
                <Image
                  src="/logo.png"
                  alt=""
                  width={36}
                  height={36}
                  className={styles.logo}
                />
              </span>
              <strong>
                CRM <span>Prosperity</span>
              </strong>
            </Link>
            <p>
              Automatize seu CRM, escale suas vendas e conquiste a prosperidade
              que seu negócio merece.
            </p>
          </div>

          <div className={styles.footerColumn}>
            <strong>Produto</strong>
            <a href="#recursos">Recursos</a>
            <Link href="/plano">Planos</Link>
            <a href="#ecossistema">Ecossistema</a>
            <a href="#faq">FAQ</a>
          </div>

          <div className={styles.footerColumn}>
            <strong>Suporte</strong>
            <a href="#faq">Central de Ajuda</a>
            <a href="mailto:contato@crmprosperity.com">Contato</a>
            <a href="#faq">WhatsApp</a>
            <Link href="/login">Entrar no CRM</Link>
          </div>

          <div className={styles.footerColumn}>
            <strong>Segmentos</strong>
            <span>Infoprodutores</span>
            <span>E-commerce</span>
            <span>Imobiliárias</span>
            <span>Empresas Locais</span>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <span>
            © {new Date().getFullYear()} CRM Prosperity. Todos os direitos
            reservados.
          </span>
          <nav aria-label="Links legais">
            <Link href="/termos-de-servico">Termos de Uso</Link>
            <Link href="/politica-de-privacidade">Privacidade</Link>
          </nav>
        </div>
      </footer>

    </main>
  );
}
