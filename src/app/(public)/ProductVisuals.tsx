import {
  Bot,
  CalendarCheck2,
  Check,
  ChevronDown,
  Circle,
  GitBranch,
  Layers3,
  MessageCircleMore,
  MoreHorizontal,
  Search,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import styles from "./site.module.css";

export function ConversationVisual() {
  return (
    <div
      className={`${styles.productWindow} ${styles.conversationWindow}`}
      role="img"
      aria-label="Representação da central de conversas do CRM Prosperity"
    >
      <div className={styles.windowTopbar}>
        <div className={styles.windowDots}>
          <span />
          <span />
          <span />
        </div>
        <span>Central de conversas</span>
        <div className={styles.windowStatus}>
          <i />
          Atendimento ativo
        </div>
      </div>

      <div className={styles.conversationLayout}>
        <aside className={styles.productSidebar}>
          <div className={styles.productMark}>P</div>
          <span className={styles.sidebarActive}>
            <MessageCircleMore size={16} />
          </span>
          <span>
            <Users size={16} />
          </span>
          <span>
            <GitBranch size={16} />
          </span>
          <span>
            <Layers3 size={16} />
          </span>
        </aside>

        <div className={styles.contactList}>
          <div className={styles.contactListHeader}>
            <strong>Conversas</strong>
            <span>
              <Search size={13} />
              Buscar
            </span>
          </div>
          <div className={`${styles.contactItem} ${styles.contactItemActive}`}>
            <div className={styles.contactAvatar}>AM</div>
            <div>
              <strong>Ana Martins</strong>
              <small>Gostaria de agendar...</small>
            </div>
            <time>10:42</time>
          </div>
          <div className={styles.contactItem}>
            <div className={styles.contactAvatar}>RC</div>
            <div>
              <strong>Ricardo Costa</strong>
              <small>Obrigado pelo retorno!</small>
            </div>
            <time>10:18</time>
          </div>
          <div className={styles.contactItem}>
            <div className={styles.contactAvatar}>ML</div>
            <div>
              <strong>Mariana Lima</strong>
              <small>Qual o melhor horário?</small>
            </div>
            <time>09:54</time>
          </div>
          <div className={styles.contactItem}>
            <div className={styles.contactAvatar}>JS</div>
            <div>
              <strong>João Silva</strong>
              <small>Recebi as informações.</small>
            </div>
            <time>Ontem</time>
          </div>
        </div>

        <div className={styles.chatPanel}>
          <div className={styles.chatHeader}>
            <div className={styles.contactAvatar}>AM</div>
            <div>
              <strong>Ana Martins</strong>
              <small>WhatsApp • Em atendimento</small>
            </div>
            <MoreHorizontal size={18} />
          </div>

          <div className={styles.chatBody}>
            <span className={styles.chatDate}>Hoje</span>
            <div className={styles.incomingMessage}>
              Olá! Gostaria de agendar uma avaliação para esta semana.
              <small>10:41</small>
            </div>
            <div className={styles.aiSuggestion}>
              <span>
                <Sparkles size={13} />
                Sugestão da IA
              </span>
              <p>
                Olá, Ana! Claro. Tenho horários disponíveis na quarta e na
                quinta. Qual período funciona melhor para você?
              </p>
              <button type="button">
                <Check size={12} />
                Usar resposta
              </button>
            </div>
            <div className={styles.outgoingMessage}>
              Olá, Ana! Tenho horários disponíveis na quarta e na quinta. Qual
              período funciona melhor?
              <small>10:42 ✓✓</small>
            </div>
          </div>

          <div className={styles.chatComposer}>
            <span>Digite uma mensagem...</span>
            <button type="button" aria-label="Enviar mensagem">
              <Send size={14} />
            </button>
          </div>
        </div>

        <aside className={styles.contactPanel}>
          <div className={styles.largeAvatar}>AM</div>
          <strong>Ana Martins</strong>
          <small>Lead em qualificação</small>
          <div className={styles.contactMeta}>
            <span>
              <small>Status</small>
              <strong>Em atendimento</strong>
            </span>
            <span>
              <small>Responsável</small>
              <strong>Equipe comercial</strong>
            </span>
            <span>
              <small>Origem</small>
              <strong>WhatsApp</strong>
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function AutomationVisual() {
  return (
    <div
      className={`${styles.productWindow} ${styles.automationWindow}`}
      role="img"
      aria-label="Representação do construtor visual de fluxos do CRM Prosperity"
    >
      <div className={styles.windowTopbar}>
        <div className={styles.windowDots}>
          <span />
          <span />
          <span />
        </div>
        <span>Fluxo de atendimento</span>
        <div className={styles.automationToolbar}>
          Rascunho
          <ChevronDown size={13} />
        </div>
      </div>

      <div className={styles.flowCanvas}>
        <div className={`${styles.flowNode} ${styles.startNode}`}>
          <span>
            <Circle size={12} fill="currentColor" />
            Início
          </span>
          <strong>Nova conversa</strong>
        </div>
        <span className={`${styles.connector} ${styles.connectorOne}`} />
        <div className={`${styles.flowNode} ${styles.messageNode}`}>
          <span>
            <MessageCircleMore size={13} />
            Mensagem
          </span>
          <strong>Boas-vindas</strong>
          <small>Olá, seja bem-vindo...</small>
        </div>
        <span className={`${styles.connector} ${styles.connectorTwo}`} />
        <div className={`${styles.flowNode} ${styles.questionNode}`}>
          <span>
            <GitBranch size={13} />
            Pergunta
          </span>
          <strong>Como podemos ajudar?</strong>
          <small>2 opções de resposta</small>
        </div>
        <span className={`${styles.connector} ${styles.connectorThree}`} />
        <span className={`${styles.connector} ${styles.connectorFour}`} />
        <div className={`${styles.flowNode} ${styles.scheduleNode}`}>
          <span>
            <CalendarCheck2 size={13} />
            Agenda
          </span>
          <strong>Escolher horário</strong>
        </div>
        <div className={`${styles.flowNode} ${styles.transferNode}`}>
          <span>
            <Users size={13} />
            Atendimento
          </span>
          <strong>Transferir setor</strong>
        </div>

        <div className={styles.aiFlowCard}>
          <span>
            <Sparkles size={14} />
            Assistente de criação
          </span>
          <strong>Crie o fluxo com IA</strong>
          <p>
            Descreva o atendimento. A plataforma organiza a primeira estrutura
            para você revisar.
          </p>
          <div>
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
    </div>
  );
}

const KANBAN_COLUMNS = [
  {
    title: "Novas oportunidades",
    total: "4 contatos",
    cards: [
      ["Ana Martins", "Clínica • WhatsApp"],
      ["Felipe Rocha", "Imobiliária • Campanha"],
    ],
  },
  {
    title: "Em atendimento",
    total: "3 contatos",
    cards: [
      ["Mariana Lima", "Serviços • WhatsApp"],
      ["Ricardo Costa", "E-commerce • Retorno"],
    ],
  },
  {
    title: "Convertidos",
    total: "8 contatos",
    cards: [
      ["Juliana Alves", "Consultoria • WhatsApp"],
      ["Paulo Mendes", "Educação • Indicação"],
    ],
  },
];

export function KanbanVisual() {
  return (
    <div
      className={`${styles.productWindow} ${styles.kanbanWindow}`}
      role="img"
      aria-label="Representação da gestão de oportunidades em Kanban do CRM Prosperity"
    >
      <div className={styles.windowTopbar}>
        <div className={styles.windowDots}>
          <span />
          <span />
          <span />
        </div>
        <span>Gestão de oportunidades</span>
        <div className={styles.windowStatus}>
          <Bot size={12} />
          Atualizado em tempo real
        </div>
      </div>

      <div className={styles.kanbanHeader}>
        <div>
          <strong>Pipeline comercial</strong>
          <small>Acompanhe cada contato do primeiro atendimento à conversão</small>
        </div>
        <span>
          <Search size={13} />
          Buscar contato
        </span>
      </div>

      <div className={styles.kanbanBoard}>
        {KANBAN_COLUMNS.map((column, columnIndex) => (
          <section key={column.title} className={styles.kanbanColumn}>
            <header>
              <span className={styles[`kanbanDot${columnIndex + 1}`]} />
              <strong>{column.title}</strong>
              <small>{column.total}</small>
            </header>
            {column.cards.map(([name, context], cardIndex) => (
              <article key={name} className={styles.kanbanCard}>
                <div>
                  <span>{name.slice(0, 1)}</span>
                  <strong>{name}</strong>
                </div>
                <small>{context}</small>
                <footer>
                  <span>Há {cardIndex + 1}h</span>
                  <span className={styles.kanbanTag}>
                    {columnIndex === 2 ? "Convertido" : "Em andamento"}
                  </span>
                </footer>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
