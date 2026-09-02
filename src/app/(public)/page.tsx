import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarCheck2,
  Check,
  ChevronDown,
  Clock3,
  ContactRound,
  GitBranch,
  Headphones,
  Layers3,
  Link2,
  MessageCircleMore,
  Network,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { montarWaMeUrl } from "@/lib/contatos/sistema";
import {
  AutomationVisual,
  ConversationVisual,
  KanbanVisual,
} from "./ProductVisuals";
import SiteHeader from "./SiteHeader";
import styles from "./site.module.css";

export const metadata: Metadata = {
  title: "CRM com IA para atendimento no WhatsApp",
  description:
    "Centralize conversas, organize sua equipe e automatize o atendimento no WhatsApp com Inteligência Artificial integrada ao CRM Prosperity.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "CRM Prosperity",
    title: "CRM Prosperity | Atendimento no WhatsApp com IA integrada",
    description:
      "Atendimento, automações, contatos, oportunidades, agenda e disparos em uma plataforma empresarial conectada ao WhatsApp.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "CRM Prosperity — plataforma de atendimento e automação no WhatsApp",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CRM Prosperity | Atendimento no WhatsApp com IA integrada",
    description:
      "Centralize o atendimento, automatize conversas e organize sua operação com IA integrada.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const PROBLEMS = [
  {
    number: "01",
    title: "Clientes esperando resposta",
    description:
      "Mensagens se acumulam, o tempo de resposta aumenta e oportunidades esfriam antes do primeiro contato.",
  },
  {
    number: "02",
    title: "Conversas sem organização",
    description:
      "Informações importantes ficam espalhadas, sem histórico centralizado ou clareza sobre quem está atendendo.",
  },
  {
    number: "03",
    title: "Equipe sobrecarregada",
    description:
      "Perguntas repetitivas e processos manuais consomem o tempo que deveria ser usado em atendimentos estratégicos.",
  },
  {
    number: "04",
    title: "Oportunidades sem acompanhamento",
    description:
      "Sem uma visão clara da jornada, contatos deixam de receber o retorno certo no momento certo.",
  },
];

const AI_CAPABILITIES = [
  {
    icon: Workflow,
    title: "Criação de automações",
    description:
      "Descreva o objetivo do atendimento e use a IA para estruturar fluxos que sua equipe pode revisar e ajustar.",
  },
  {
    icon: MessageCircleMore,
    title: "Apoio durante o atendimento",
    description:
      "Use o contexto da conversa para agilizar respostas e manter uma comunicação mais consistente.",
  },
  {
    icon: ContactRound,
    title: "Informações mais organizadas",
    description:
      "Capture e aproveite dados importantes do contato ao longo das automações e dos atendimentos.",
  },
  {
    icon: Sparkles,
    title: "Configurações mais simples",
    description:
      "Reduza etapas técnicas e torne recursos avançados mais acessíveis para quem opera o sistema todos os dias.",
  },
];

const SUPPORTING_FEATURES = [
  {
    icon: CalendarCheck2,
    title: "Agenda conectada ao atendimento",
    description:
      "Consulte horários, crie, remarque e cancele agendamentos sem perder o contexto da conversa.",
  },
  {
    icon: Zap,
    title: "Disparos e mensagens agendadas",
    description:
      "Planeje comunicações, acompanhe envios e mantenha o histórico da operação em um só lugar.",
  },
  {
    icon: Users,
    title: "Equipes, usuários e setores",
    description:
      "Distribua atendimentos, transfira conversas e organize responsabilidades entre diferentes áreas.",
  },
  {
    icon: BarChart3,
    title: "Indicadores operacionais",
    description:
      "Acompanhe o atendimento e a operação com relatórios disponíveis dentro da plataforma.",
  },
  {
    icon: Link2,
    title: "Estrutura para integrações",
    description:
      "Conecte o CRM a outros processos por meio dos recursos de API e automações disponíveis.",
  },
  {
    icon: ShieldCheck,
    title: "Operação empresarial",
    description:
      "Permissões, histórico e informações centralizadas ajudam a manter mais controle sobre o relacionamento com clientes.",
  },
];

const STEPS = [
  {
    icon: Link2,
    title: "Conecte o WhatsApp",
    description:
      "Vincule o ambiente oficial da Meta e, com o modo Coexistência, mantenha o mesmo número ativo também no WhatsApp Business do smartphone.",
  },
  {
    icon: Users,
    title: "Organize a equipe",
    description:
      "Cadastre usuários, setores e responsabilidades de atendimento.",
  },
  {
    icon: Sparkles,
    title: "Crie com ajuda da IA",
    description:
      "Estruture automações e adapte cada etapa à jornada do seu cliente.",
  },
  {
    icon: Headphones,
    title: "Centralize o atendimento",
    description:
      "Receba, responda e acompanhe conversas em uma central compartilhada.",
  },
  {
    icon: BarChart3,
    title: "Acompanhe a operação",
    description:
      "Visualize contatos, oportunidades, agendas, disparos e resultados.",
  },
];

const DIFFERENTIALS = [
  "API Oficial da Meta com modo Coexistência",
  "Inteligência Artificial presente em diferentes áreas",
  "Automações visuais sem programação",
  "Atendimento por múltiplos usuários",
  "Gestão centralizada de contatos e oportunidades",
  "Estrutura preparada para novas integrações",
];

const AUDIENCES = [
  {
    title: "Empresas de serviços",
    description:
      "Organize solicitações, distribua atendimentos e acompanhe cada oportunidade com contexto.",
  },
  {
    title: "Clínicas e operações com agenda",
    description:
      "Automatize a triagem e conecte a conversa ao processo de agendamento.",
  },
  {
    title: "Imobiliárias e equipes comerciais",
    description:
      "Centralize os contatos, organize etapas e mantenha o acompanhamento ativo.",
  },
  {
    title: "E-commerce e negócios digitais",
    description:
      "Agilize dúvidas recorrentes, campanhas e o relacionamento depois da compra.",
  },
];

const PLANS = [
  {
    name: "Básico",
    eyebrow: "Entrada inteligente",
    oldPrice: "R$ 197/mês",
    price: "R$ 137",
    period: "/mês",
    description:
      "Para começar com atendimento automatizado, organização profissional e IA integrada.",
    features: [
      "2 usuários inclusos",
      "100 mil tokens de IA",
      "API Oficial do WhatsApp inclusa",
      "Atendimento automatizado com IA",
      "Disparos e relatórios operacionais",
    ],
  },
  {
    name: "Essencial IA PRO",
    eyebrow: "Mais indicado",
    oldPrice: "R$ 367/mês",
    price: "R$ 267",
    period: "/mês",
    description:
      "Para equipes que precisam de mais capacidade, automação e Inteligência Artificial.",
    features: [
      "6 usuários inclusos",
      "400 mil tokens de IA",
      "API Oficial do WhatsApp inclusa",
      "IA treinável e automações avançadas",
      "Segmentação e relatórios completos",
    ],
    featured: true,
  },
  {
    name: "Profissional Enterprise",
    eyebrow: "Escala personalizada",
    price: "Sob cotação",
    period: "",
    description:
      "Uma estrutura ajustada para operações maiores, múltiplos números e demandas específicas.",
    features: [
      "Usuários e tokens sob medida",
      "Múltiplos números do WhatsApp",
      "IA personalizada para a empresa",
      "Atendimento multi-equipe",
      "Suporte estratégico prioritário",
    ],
    enterprise: true,
  },
];

const FAQ = [
  {
    question: "O CRM Prosperity funciona para diferentes segmentos?",
    answer:
      "Sim. Os fluxos, setores, usuários e etapas de atendimento podem ser adaptados à operação de empresas de serviços, clínicas, imobiliárias, e-commerce e outros negócios que utilizam o WhatsApp no relacionamento com clientes.",
  },
  {
    question: "Preciso saber programar para criar automações?",
    answer:
      "Não. A construção dos fluxos é visual, e a Inteligência Artificial pode ajudar a organizar a primeira estrutura da automação para você revisar e personalizar.",
  },
  {
    question: "A integração com o WhatsApp é oficial?",
    answer:
      "Sim. O CRM Prosperity utiliza a API Oficial do WhatsApp e possui um processo guiado para conectar o ambiente empresarial da Meta.",
  },
  {
    question:
      "Vou perder o WhatsApp Business do smartphone ao conectar o CRM?",
    answer:
      "Não. Com o modo Coexistência, você pode usar o mesmo número no CRM Prosperity e no aplicativo WhatsApp Business do smartphone ao mesmo tempo. Assim, sua empresa ganha automações, atendimento em equipe e organização sem abrir mão do uso habitual no celular.",
  },
  {
    question: "Várias pessoas podem atender pelo mesmo CRM?",
    answer:
      "Sim. Os planos incluem usuários e a plataforma permite organizar atendentes, equipes, setores, filas e transferências de conversa.",
  },
  {
    question: "Posso acompanhar contatos além da conversa?",
    answer:
      "Sim. A plataforma reúne gestão de contatos, classificações, informações capturadas, Kanban de oportunidades, agenda e histórico de atendimento.",
  },
  {
    question: "Como começo a usar?",
    answer:
      "Crie seu cadastro, escolha o plano adequado e siga a configuração guiada para conectar o WhatsApp e preparar o ambiente da empresa.",
  },
];

function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
  align?: "center" | "left";
}) {
  return (
    <div
      className={`${styles.sectionHeading} ${
        align === "left" ? styles.sectionHeadingLeft : ""
      }`}
    >
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export default function SitePage() {
  const enterpriseWhatsAppUrl = montarWaMeUrl(
    "Olá! Quero fazer uma cotação do plano Profissional Enterprise do CRM Prosperity.",
  );

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "CRM Prosperity",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://crmprosperity.com",
    description:
      "Plataforma empresarial de atendimento, automação e gestão de relacionamento com clientes pelo WhatsApp.",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "BRL",
      lowPrice: "137",
      offerCount: "3",
    },
  };

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <SiteHeader />

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroGlow} />
        <div className={styles.heroGrid} />

        <div className={styles.heroContent}>
          <div className={styles.heroEyebrow}>
            <span>
              <Sparkles size={14} />
            </span>
            Inteligência Artificial integrada de ponta a ponta
          </div>

          <h1 id="hero-title">
            Atendimento pelo WhatsApp{" "}
            <span>organizado, automatizado e potencializado por IA.</span>
          </h1>

          <p>
            Centralize conversas, organize sua equipe e automatize processos em
            uma plataforma moderna que transforma o WhatsApp em uma operação de
            atendimento completa.
          </p>

          <div className={styles.heroActions}>
            <Link href="/comecar" className={styles.primaryAction}>
              Criar minha conta
              <ArrowRight size={18} />
            </Link>
            <a href="#plataforma" className={styles.secondaryAction}>
              Conhecer a plataforma
            </a>
          </div>

          <div className={styles.heroProof}>
            <span>
              <Check size={14} />
              API Oficial da Meta + Coexistência
            </span>
            <span>
              <Check size={14} />
              Google Calendar conectado
            </span>
            <span>
              <Check size={14} />
              Automações com IA
            </span>
          </div>
        </div>

        <div className={styles.heroProduct} id="plataforma">
          <div className={styles.heroProductHalo} />
          <ConversationVisual />
          <div className={`${styles.floatingMetric} ${styles.metricOne}`}>
            <span>
              <Bot size={15} />
            </span>
            <div>
              <small>IA integrada</small>
              <strong>Resposta sugerida</strong>
            </div>
          </div>
          <div className={`${styles.floatingMetric} ${styles.metricTwo}`}>
            <span>
              <Clock3 size={15} />
            </span>
            <div>
              <small>Automação</small>
              <strong>Atendimento contínuo</strong>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.problemSection} id="problema">
        <div className={styles.sectionShell}>
          <SectionHeading
            eyebrow="O problema não é só responder"
            title={
              <>
                Quando o atendimento cresce sem estrutura,{" "}
                <em>a empresa perde o controle.</em>
              </>
            }
            description="O WhatsApp aproxima sua empresa dos clientes. Sem organização, porém, ele também pode concentrar atrasos, tarefas manuais e informações perdidas."
          />

          <div className={styles.problemList}>
            {PROBLEMS.map((problem) => (
              <article key={problem.number} className={styles.problemItem}>
                <span>{problem.number}</span>
                <div>
                  <h3>{problem.title}</h3>
                  <p>{problem.description}</p>
                </div>
              </article>
            ))}
          </div>

          <div className={styles.problemConclusion}>
            <span>O resultado?</span>
            <p>
              Mais esforço para a equipe, menos clareza para a gestão e uma
              experiência inconsistente para o cliente.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.solutionSection} id="solucao">
        <div className={styles.sectionShell}>
          <div className={styles.solutionIntro}>
            <SectionHeading
              align="left"
              eyebrow="Uma operação conectada"
              title={
                <>
                  Toda a jornada do cliente em{" "}
                  <em>uma única plataforma.</em>
                </>
              }
              description="O CRM Prosperity conecta atendimento, automação e gestão para que cada conversa tenha contexto, responsável e próximo passo."
            />
            <div className={styles.solutionPillars}>
              <article>
                <MessageCircleMore size={20} />
                <div>
                  <strong>Conversas centralizadas</strong>
                  <p>Histórico e atendimento compartilhados com a equipe.</p>
                </div>
              </article>
              <article>
                <Workflow size={20} />
                <div>
                  <strong>Processos automatizados</strong>
                  <p>Fluxos que atendem, direcionam e coletam informações.</p>
                </div>
              </article>
              <article>
                <Layers3 size={20} />
                <div>
                  <strong>Gestão com contexto</strong>
                  <p>Contatos, oportunidades, agenda e operação conectados.</p>
                </div>
              </article>
            </div>
          </div>

          <div className={styles.solutionVisual}>
            <div className={styles.orbitCenter}>
              <Image
                src="/logo.png"
                alt="Símbolo do CRM Prosperity"
                width={190}
                height={186}
              />
            </div>
            <div className={`${styles.orbitItem} ${styles.orbitItemOne}`}>
              <MessageCircleMore size={17} />
              Conversas
            </div>
            <div className={`${styles.orbitItem} ${styles.orbitItemTwo}`}>
              <Bot size={17} />
              Inteligência Artificial
            </div>
            <div className={`${styles.orbitItem} ${styles.orbitItemThree}`}>
              <GitBranch size={17} />
              Automações
            </div>
            <div className={`${styles.orbitItem} ${styles.orbitItemFour}`}>
              <ContactRound size={17} />
              Contatos
            </div>
            <div className={`${styles.orbitItem} ${styles.orbitItemFive}`}>
              <BarChart3 size={17} />
              Gestão
            </div>
          </div>
        </div>
      </section>

      <section className={styles.integrationsSection} id="integracoes">
        <div className={styles.sectionShell}>
          <SectionHeading
            eyebrow="API Oficial, Coexistência e agenda conectada"
            title={
              <>
                Conecte o WhatsApp ao CRM{" "}
                <em>sem abrir mão do aplicativo no celular.</em>
              </>
            }
            description="Com o modo Coexistência da API Oficial da Meta, o mesmo número pode ser usado no CRM Prosperity e no WhatsApp Business do smartphone ao mesmo tempo. Sua empresa evolui o atendimento sem perder a praticidade que já conhece."
          />

          <div className={styles.integrationGrid}>
            <article className={styles.integrationCard}>
              <div className={styles.integrationCardTop}>
                <div className={styles.integrationLogo}>
                  <Image
                    src="/meta-logo.png"
                    alt="Meta"
                    width={205}
                    height={60}
                  />
                </div>
                <span>API Oficial + Coexistência</span>
              </div>
              <div className={styles.integrationCardContent}>
                <span className={styles.integrationLabel}>
                  CRM e smartphone conectados
                </span>
                <h3>O mesmo WhatsApp no CRM e no seu smartphone</h3>
                <p>
                  Conecte o número que sua empresa já utiliza ao CRM Prosperity
                  sem deixar de usá-lo no aplicativo WhatsApp Business. Atenda
                  pelo celular quando quiser e, ao mesmo tempo, aproveite toda a
                  estrutura profissional do CRM.
                </p>
                <ul>
                  <li>
                    <Check size={15} />
                    Use o mesmo número no CRM e no smartphone ao mesmo tempo
                  </li>
                  <li>
                    <Check size={15} />
                    Continue acessando o WhatsApp Business pelo celular
                  </li>
                  <li>
                    <Check size={15} />
                    Ganhe automações, atendimento em equipe e histórico no CRM
                  </li>
                </ul>
              </div>
            </article>

            <article className={styles.integrationCard}>
              <div className={styles.integrationCardTop}>
                <div
                  className={`${styles.integrationLogo} ${styles.googleLogo}`}
                >
                  <Image
                    src="/google-logo.png"
                    alt="Google"
                    width={230}
                    height={60}
                  />
                </div>
                <span>Agenda conectada</span>
              </div>
              <div className={styles.integrationCardContent}>
                <span className={styles.integrationLabel}>
                  Google Calendar
                </span>
                <h3>Agendamentos conectados ao atendimento</h3>
                <p>
                  Transforme uma conversa em compromisso sem perder o contexto.
                  O CRM consulta a agenda e conduz as etapas do agendamento
                  diretamente pelas automações.
                </p>
                <ul>
                  <li>
                    <Check size={15} />
                    Consulta de datas e horários disponíveis
                  </li>
                  <li>
                    <Check size={15} />
                    Criação, remarcação e cancelamento de agendamentos
                  </li>
                  <li>
                    <Check size={15} />
                    Jornada conectada entre conversa, automação e agenda
                  </li>
                </ul>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.aiSection} id="inteligencia-artificial">
        <div className={styles.aiBackdrop} />
        <div className={styles.sectionShell}>
          <div className={styles.aiHeader}>
            <div>
              <span className={styles.aiKicker}>
                <Sparkles size={15} />
                IA como parte do sistema
              </span>
              <h2>
                Não é um recurso isolado.{" "}
                <em>É uma camada que simplifica toda a experiência.</em>
              </h2>
            </div>
            <p>
              A Inteligência Artificial participa de diferentes pontos da
              plataforma para reduzir tarefas repetitivas, apoiar decisões e
              tornar recursos avançados mais fáceis de usar.
            </p>
          </div>

          <div className={styles.aiCapabilityGrid}>
            {AI_CAPABILITIES.map(({ icon: Icon, title, description }, index) => (
              <article key={title}>
                <div>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <Icon size={22} />
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>

          <div className={styles.aiStatement}>
            <span className={styles.aiStatementLine} />
            <Sparkles size={18} />
            <p>
              Tecnologia avançada nos bastidores.{" "}
              <strong>Simplicidade para quem usa.</strong>
            </p>
            <span className={styles.aiStatementLine} />
          </div>
        </div>
      </section>

      <section className={styles.showcaseSection} id="recursos">
        <div className={styles.sectionShell}>
          <SectionHeading
            eyebrow="Veja a plataforma em ação"
            title={
              <>
                Recursos conectados à rotina,{" "}
                <em>não apenas uma lista de ferramentas.</em>
              </>
            }
            description="Cada área do CRM Prosperity foi pensada para resolver uma parte real da operação de atendimento e relacionamento com clientes."
          />

          <div className={styles.showcaseRows}>
            <article className={styles.showcaseRow}>
              <div className={styles.showcaseCopy}>
                <span className={styles.showcaseNumber}>01</span>
                <h3>Uma central de conversas para toda a equipe</h3>
                <p>
                  Reúna atendimentos do WhatsApp, veja o histórico do contato,
                  distribua responsabilidades e mantenha a conversa organizada
                  do início ao fim.
                </p>
                <ul>
                  <li>
                    <Check size={15} /> Histórico centralizado
                  </li>
                  <li>
                    <Check size={15} /> Filas, setores e transferências
                  </li>
                  <li>
                    <Check size={15} /> Informações do contato durante o atendimento
                  </li>
                </ul>
              </div>
              <div className={styles.showcaseVisual}>
                <ConversationVisual />
              </div>
            </article>

            <article className={`${styles.showcaseRow} ${styles.showcaseReverse}`}>
              <div className={styles.showcaseCopy}>
                <span className={styles.showcaseNumber}>02</span>
                <h3>Automações que continuam o atendimento por você</h3>
                <p>
                  Crie jornadas visuais para enviar mensagens, fazer perguntas,
                  capturar informações, agendar, direcionar setores e continuar
                  processos mesmo fora do horário comercial.
                </p>
                <ul>
                  <li>
                    <Check size={15} /> Construtor visual de fluxos
                  </li>
                  <li>
                    <Check size={15} /> Criação assistida por IA
                  </li>
                  <li>
                    <Check size={15} /> Etapas adaptáveis à sua operação
                  </li>
                </ul>
              </div>
              <div className={styles.showcaseVisual}>
                <AutomationVisual />
              </div>
            </article>

            <article className={styles.showcaseRow}>
              <div className={styles.showcaseCopy}>
                <span className={styles.showcaseNumber}>03</span>
                <h3>Oportunidades visíveis, organizadas e acompanhadas</h3>
                <p>
                  Transforme contatos em uma jornada clara. O Kanban ajuda a
                  equipe a visualizar etapas, prioridades e movimentações sem
                  perder o histórico da conversa.
                </p>
                <ul>
                  <li>
                    <Check size={15} /> Etapas personalizáveis
                  </li>
                  <li>
                    <Check size={15} /> Classificação de contatos
                  </li>
                  <li>
                    <Check size={15} /> Visão compartilhada da operação
                  </li>
                </ul>
              </div>
              <div className={styles.showcaseVisual}>
                <KanbanVisual />
              </div>
            </article>
          </div>

          <div className={styles.supportingFeatures}>
            {SUPPORTING_FEATURES.map(({ icon: Icon, title, description }) => (
              <article key={title}>
                <span>
                  <Icon size={20} />
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.stepsSection} id="como-funciona">
        <div className={styles.sectionShell}>
          <SectionHeading
            eyebrow="Da conexão à operação"
            title={
              <>
                Comece com uma estrutura clara.{" "}
                <em>E evolua no seu ritmo.</em>
              </>
            }
            description="O processo foi organizado para tirar a complexidade técnica do caminho e colocar sua equipe em operação."
          />

          <ol className={styles.stepsList}>
            {STEPS.map(({ icon: Icon, title, description }, index) => (
              <li key={title}>
                <span className={styles.stepNumber}>{index + 1}</span>
                <div className={styles.stepIcon}>
                  <Icon size={20} />
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.differentialsSection}>
        <div className={styles.sectionShell}>
          <div className={styles.differentialsGrid}>
            <div className={styles.differentialsCopy}>
              <SectionHeading
                align="left"
                eyebrow="Por que CRM Prosperity"
                title={
                  <>
                    Tecnologia moderna com foco na{" "}
                    <em>operação real da sua empresa.</em>
                  </>
                }
                description="Uma plataforma criada para unir automação, Inteligência Artificial e organização sem transformar a rotina em um projeto técnico."
              />
              <Link href="/comecar" className={styles.inlineCta}>
                Conhecer os planos
                <ArrowRight size={17} />
              </Link>
            </div>
            <div className={styles.differentialsList}>
              {DIFFERENTIALS.map((item, index) => (
                <div key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{item}</p>
                  <Check size={17} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.audienceSection}>
        <div className={styles.sectionShell}>
          <SectionHeading
            eyebrow="Uma base flexível"
            title={
              <>
                Para empresas que atendem, vendem e constroem{" "}
                <em>relacionamento pelo WhatsApp.</em>
              </>
            }
          />
          <div className={styles.audienceGrid}>
            {AUDIENCES.map((item, index) => (
              <article key={item.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.pricingSection} id="planos">
        <div className={styles.sectionShell}>
          <SectionHeading
            eyebrow="Planos CRM Prosperity"
            title={
              <>
                Escolha a capacidade ideal{" "}
                <em>para o momento da sua operação.</em>
              </>
            }
            description="Os planos Básico e Essencial incluem os principais recursos. A diferença está nos usuários, tokens de IA e capacidade da operação."
          />

          <div className={styles.pricingGrid}>
            {PLANS.map((plan) => (
              <article
                key={plan.name}
                className={`${styles.pricingCard} ${
                  plan.featured ? styles.pricingCardFeatured : ""
                }`}
              >
                {plan.featured ? (
                  <div className={styles.recommendedLabel}>Mais indicado</div>
                ) : null}
                <span className={styles.planEyebrow}>{plan.eyebrow}</span>
                <h3>{plan.name}</h3>
                <p className={styles.planDescription}>{plan.description}</p>
                <div className={styles.planPrice}>
                  {plan.oldPrice ? <del>{plan.oldPrice}</del> : null}
                  <div>
                    <strong>{plan.price}</strong>
                    <span>{plan.period}</span>
                  </div>
                </div>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <span>
                        <Check size={13} />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                {plan.enterprise ? (
                  <a
                    href={enterpriseWhatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.planAction}
                  >
                    Solicitar cotação
                    <ArrowRight size={16} />
                  </a>
                ) : (
                  <Link href="/comecar" className={styles.planAction}>
                    Começar com este plano
                    <ArrowRight size={16} />
                  </Link>
                )}
              </article>
            ))}
          </div>
          <p className={styles.pricingNote}>
            Valores e condições exibidos conforme os planos atualmente
            cadastrados no CRM Prosperity.
          </p>
        </div>
      </section>

      <section className={styles.faqSection} id="faq">
        <div className={styles.sectionShell}>
          <div className={styles.faqGrid}>
            <SectionHeading
              align="left"
              eyebrow="Perguntas frequentes"
              title={
                <>
                  Tudo o que você precisa saber{" "}
                  <em>antes de começar.</em>
                </>
              }
              description="Se ainda tiver dúvidas, fale com nosso time pelo WhatsApp."
            />
            <div className={styles.faqList}>
              {FAQ.map((item, index) => (
                <details key={item.question} open={index === 0}>
                  <summary>
                    <span>{item.question}</span>
                    <ChevronDown size={18} />
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.finalCtaGrid} />
        <div className={styles.finalCtaGlow} />
        <div className={styles.sectionShell}>
          <span className={styles.finalCtaEyebrow}>
            <Network size={16} />
            Atendimento, automação e gestão conectados
          </span>
          <h2>
            Menos tarefas manuais. Mais controle.{" "}
            <em>Uma experiência melhor para sua equipe e seus clientes.</em>
          </h2>
          <p>
            Crie sua conta e veja como o CRM Prosperity pode organizar a
            operação que hoje depende do WhatsApp.
          </p>
          <div className={styles.heroActions}>
            <Link href="/comecar" className={styles.primaryAction}>
              Criar minha conta
              <ArrowRight size={18} />
            </Link>
            <a
              href={enterpriseWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.secondaryAction}
            >
              Falar com nosso time
            </a>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.sectionShell}>
          <div className={styles.footerMain}>
            <div className={styles.footerBrand}>
              <Link href="/" className={styles.brand}>
                <span className={styles.brandLogo}>
                  <Image
                    src="/logo.png"
                    alt=""
                    width={64}
                    height={64}
                  />
                </span>
                <span className={styles.brandName}>
                  <strong>CRM</strong>
                  <span>Prosperity</span>
                </span>
              </Link>
              <p>
                Plataforma empresarial de atendimento, automação e gestão de
                relacionamento com clientes pelo WhatsApp.
              </p>
            </div>

            <nav className={styles.footerColumn} aria-label="Links do produto">
              <strong>Produto</strong>
              <a href="#solucao">Solução</a>
              <a href="#inteligencia-artificial">Inteligência Artificial</a>
              <a href="#recursos">Recursos</a>
              <a href="#planos">Planos</a>
            </nav>

            <nav className={styles.footerColumn} aria-label="Links da empresa">
              <strong>Empresa</strong>
              <a href="#como-funciona">Como funciona</a>
              <a href="#faq">Perguntas frequentes</a>
              <a href="mailto:contato@crmprosperity.com">
                contato@crmprosperity.com
              </a>
              <a
                href={enterpriseWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Falar pelo WhatsApp
              </a>
            </nav>

            <nav className={styles.footerColumn} aria-label="Links legais">
              <strong>Legal</strong>
              <Link href="/termos-de-servico">Termos de Serviço</Link>
              <Link href="/politica-de-privacidade">
                Política de Privacidade
              </Link>
              <Link href="/exclusao-de-dados">Exclusão de dados</Link>
              <Link href="/login">Entrar no CRM</Link>
            </nav>
          </div>

          <div className={styles.footerBottom}>
            <span>
              © {new Date().getFullYear()} CRM Prosperity. Todos os direitos
              reservados.
            </span>
            <span>
              <ShieldCheck size={14} />
              Tecnologia para relações mais organizadas.
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}
