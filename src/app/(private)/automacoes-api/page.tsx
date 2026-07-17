"use client";

import { useMemo, useState } from "react";
import Header from "@/components/Header";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Code2,
  Copy,
  Database,
  Eye,
  EyeOff,
  ExternalLink,
  FileSearch,
  Filter,
  MoreVertical,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import styles from "./automacoes-api.module.css";

type StatusRotina = "ativa" | "pausada" | "erro";
type Frequencia = "diaria" | "semanal" | "mensal";
type AbaIntegracao = "sistemas" | "crm";

type Rotina = {
  id: string;
  nome: string;
  descricao: string;
  consulta: string;
  template: string;
  frequencia: string;
  proximaExecucao: string;
  ultimaExecucao: string;
  enviados: number;
  status: StatusRotina;
};

const consultas = [
  {
    id: "inadimplentes",
    titulo: "Clientes inadimplentes",
    descricao: "Retorna clientes com títulos vencidos e pagamento pendente.",
    categoria: "Financeiro",
    icone: CircleDollarSign,
    campos: [
      "nome",
      "telefone",
      "valor",
      "vencimento",
      "dias_atraso",
      "link_pagamento",
    ],
    destaque: true,
  },
  {
    id: "proximos_vencimento",
    titulo: "Próximos do vencimento",
    descricao:
      "Clientes com cobrança prestes a vencer dentro do período definido.",
    categoria: "Financeiro",
    icone: CalendarClock,
    campos: ["nome", "telefone", "valor", "vencimento", "linha_digitavel"],
  },
  {
    id: "aniversariantes",
    titulo: "Aniversariantes do período",
    descricao: "Pessoas com aniversário na data ou intervalo consultado.",
    categoria: "Relacionamento",
    icone: Sparkles,
    campos: ["nome", "telefone", "data_nascimento", "cupom"],
  },
  {
    id: "agendamentos",
    titulo: "Lembrete de agendamento",
    descricao:
      "Compromissos confirmados que ocorrerão nas próximas horas ou dias.",
    categoria: "Agenda",
    icone: Clock3,
    campos: ["nome", "telefone", "data", "horario", "profissional", "local"],
  },
  {
    id: "pedidos",
    titulo: "Atualização de pedidos",
    descricao: "Pedidos que mudaram de status desde a última consulta.",
    categoria: "Operacional",
    icone: RefreshCw,
    campos: ["nome", "telefone", "pedido", "status", "previsao", "rastreio"],
  },
  {
    id: "contratos",
    titulo: "Contratos próximos da renovação",
    descricao: "Contratos que vencem dentro da janela configurada.",
    categoria: "Comercial",
    icone: FileSearch,
    campos: ["nome", "telefone", "contrato", "vencimento", "consultor"],
  },
];

const rotinasIniciais: Rotina[] = [
  {
    id: "1",
    nome: "Cobrança diária de inadimplentes",
    descricao: "Consulta o ERP e envia o link atualizado para pagamento.",
    consulta: "Clientes inadimplentes",
    template: "cobranca_fatura_vencida",
    frequencia: "Todos os dias, às 09:00",
    proximaExecucao: "Hoje, 09:00",
    ultimaExecucao: "Ontem, 09:02",
    enviados: 128,
    status: "ativa",
  },
  {
    id: "2",
    nome: "Lembrete antes do vencimento",
    descricao: "Aviso preventivo três dias antes da data de vencimento.",
    consulta: "Próximos do vencimento",
    template: "lembrete_vencimento_3_dias",
    frequencia: "Segunda a sexta, às 08:00",
    proximaExecucao: "Hoje, 08:00",
    ultimaExecucao: "Ontem, 08:01",
    enviados: 74,
    status: "ativa",
  },
  {
    id: "3",
    nome: "Lembrete de atendimento",
    descricao: "Confirma os atendimentos agendados para o dia seguinte.",
    consulta: "Lembrete de agendamento",
    template: "confirmacao_agendamento",
    frequencia: "Todos os dias, às 17:30",
    proximaExecucao: "Hoje, 17:30",
    ultimaExecucao: "Ontem, 17:31",
    enviados: 32,
    status: "pausada",
  },
];

const conectoresDisponiveis = [
  {
    id: "erp_provedor",
    nome: "ERP para provedores",
    descricao:
      "Cobranças, faturas, clientes inadimplentes e status dos serviços.",
    categoria: "Provedor de internet",
    status: "configurar",
    icone: Server,
  },
  {
    id: "api_personalizada",
    nome: "API personalizada",
    descricao:
      "Conecte outro sistema por uma API REST homologada pela nossa equipe.",
    categoria: "Integração sob medida",
    status: "personalizada",
    icone: Code2,
  },
];

function statusLabel(status: StatusRotina) {
  if (status === "ativa") return "Ativa";
  if (status === "pausada") return "Pausada";
  return "Com erro";
}

export default function AutomacoesApiPage() {
  const [rotinas, setRotinas] = useState(rotinasIniciais);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todas");
  const [modalAberto, setModalAberto] = useState(false);
  const [etapa, setEtapa] = useState(1);
  const [consultaSelecionada, setConsultaSelecionada] =
    useState("inadimplentes");
  const [nome, setNome] = useState("");
  const [template, setTemplate] = useState("cobranca_fatura_vencida");
  const [frequencia, setFrequencia] = useState<Frequencia>("diaria");
  const [horario, setHorario] = useState("09:00");
  const [consentimento, setConsentimento] = useState(false);
  const [testando, setTestando] = useState(false);
  const [testeConcluido, setTesteConcluido] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [modalIntegracoesAberto, setModalIntegracoesAberto] = useState(false);
  const [abaIntegracao, setAbaIntegracao] = useState<AbaIntegracao>("sistemas");
  const [conectorExpandido, setConectorExpandido] = useState<string | null>(
    "erp_provedor",
  );
  const [urlErp, setUrlErp] = useState("");
  const [tokenErp, setTokenErp] = useState("");
  const [codigoEmpresa, setCodigoEmpresa] = useState("");
  const [mostrarTokenErp, setMostrarTokenErp] = useState(false);
  const [testandoConexao, setTestandoConexao] = useState(false);
  const [conexaoTestada, setConexaoTestada] = useState(false);
  const [mostrarTokenCrm, setMostrarTokenCrm] = useState(false);
  const [tokenCrmGerado, setTokenCrmGerado] = useState(false);

  const consultaAtual =
    consultas.find((item) => item.id === consultaSelecionada) || consultas[0];

  const rotinasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return rotinas.filter((rotina) => {
      const correspondeBusca =
        !termo ||
        rotina.nome.toLowerCase().includes(termo) ||
        rotina.consulta.toLowerCase().includes(termo) ||
        rotina.template.toLowerCase().includes(termo);
      const correspondeStatus =
        statusFiltro === "todas" || rotina.status === statusFiltro;
      return correspondeBusca && correspondeStatus;
    });
  }, [busca, rotinas, statusFiltro]);

  const totalEnviados = rotinas.reduce(
    (total, rotina) => total + rotina.enviados,
    0,
  );
  const totalAtivas = rotinas.filter(
    (rotina) => rotina.status === "ativa",
  ).length;
  const totalErros = rotinas.filter(
    (rotina) => rotina.status === "erro",
  ).length;

  function abrirNovaRotina() {
    setEtapa(1);
    setNome("");
    setConsultaSelecionada("inadimplentes");
    setTemplate("cobranca_fatura_vencida");
    setFrequencia("diaria");
    setHorario("09:00");
    setConsentimento(false);
    setTesteConcluido(false);
    setFeedback("");
    setModalAberto(true);
  }

  function alternarStatus(id: string) {
    setRotinas((atuais) =>
      atuais.map((rotina) =>
        rotina.id === id
          ? {
              ...rotina,
              status: rotina.status === "ativa" ? "pausada" : "ativa",
            }
          : rotina,
      ),
    );
  }

  function testarConsulta() {
    setTestando(true);
    setTesteConcluido(false);
    window.setTimeout(() => {
      setTestando(false);
      setTesteConcluido(true);
    }, 900);
  }

  function salvarRotina() {
    if (!consentimento) return;
    const frequenciaLabel =
      frequencia === "diaria"
        ? `Todos os dias, às ${horario}`
        : frequencia === "semanal"
          ? `Toda segunda-feira, às ${horario}`
          : `Todo dia 5, às ${horario}`;

    setRotinas((atuais) => [
      {
        id: String(Date.now()),
        nome: nome.trim() || consultaAtual.titulo,
        descricao: consultaAtual.descricao,
        consulta: consultaAtual.titulo,
        template,
        frequencia: frequenciaLabel,
        proximaExecucao: `Aguardando cálculo, ${horario}`,
        ultimaExecucao: "Ainda não executada",
        enviados: 0,
        status: "ativa",
      },
      ...atuais,
    ]);
    setModalAberto(false);
    setFeedback("Automação criada e ativada com sucesso.");
    window.setTimeout(() => setFeedback(""), 3500);
  }

  function abrirIntegracoes() {
    setAbaIntegracao("sistemas");
    setConectorExpandido("erp_provedor");
    setConexaoTestada(false);
    setModalIntegracoesAberto(true);
  }

  function testarConexaoErp() {
    if (!urlErp.trim() || !tokenErp.trim()) return;
    setTestandoConexao(true);
    setConexaoTestada(false);
    window.setTimeout(() => {
      setTestandoConexao(false);
      setConexaoTestada(true);
    }, 900);
  }

  function salvarConexaoErp() {
    if (!urlErp.trim() || !tokenErp.trim()) return;
    setModalIntegracoesAberto(false);
    setFeedback("Configuração da integração preparada com sucesso.");
    window.setTimeout(() => setFeedback(""), 3500);
  }

  async function copiarTexto(valor: string, mensagem: string) {
    await navigator.clipboard?.writeText(valor);
    setFeedback(mensagem);
    window.setTimeout(() => setFeedback(""), 2500);
  }

  return (
    <main className={styles.page}>
      <Header
        title="Automações por API"
        subtitle="Consulte dados externos e transforme resultados em disparos automáticos pelo WhatsApp."
      />

      <div className={styles.content}>
        {feedback ? (
          <div className={styles.feedback}>
            <CheckCircle2 size={18} />
            {feedback}
          </div>
        ) : null}

        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <span className={styles.eyebrow}>
              <Workflow size={15} /> Automação inteligente
            </span>
            <h1>Conecte seu ERP ao WhatsApp sem criar processos manuais.</h1>
            <p>
              Escolha uma consulta homologada, defina a rotina e use os dados
              retornados pela API para personalizar e enviar mensagens
              automaticamente.
            </p>
            <div className={styles.heroActions}>
              <button
                className={styles.primaryButton}
                onClick={abrirNovaRotina}
              >
                <Plus size={18} /> Nova automação
              </button>
              <button
                className={styles.secondaryButton}
                onClick={abrirIntegracoes}
              >
                <Code2 size={18} /> Gerenciar conexão da API
              </button>
            </div>
          </div>

          <div className={styles.flowPreview} aria-label="Fluxo da automação">
            <div className={styles.flowNode}>
              <Database size={20} />
              <span>ERP / API</span>
            </div>
            <ArrowRight size={20} className={styles.flowArrow} />
            <div className={`${styles.flowNode} ${styles.flowNodeActive}`}>
              <Filter size={20} />
              <span>Consulta</span>
            </div>
            <ArrowRight size={20} className={styles.flowArrow} />
            <div className={styles.flowNode}>
              <Send size={20} />
              <span>WhatsApp</span>
            </div>
            <div className={styles.pulseOne} />
            <div className={styles.pulseTwo} />
          </div>
        </section>

        <section className={styles.metricsGrid}>
          <article className={styles.metricCard}>
            <div className={styles.metricIcon}>
              <Zap size={20} />
            </div>
            <div>
              <span>Rotinas ativas</span>
              <strong>{totalAtivas}</strong>
              <small>de {rotinas.length} configuradas</small>
            </div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricIcon}>
              <Send size={20} />
            </div>
            <div>
              <span>Envios no último ciclo</span>
              <strong>{totalEnviados}</strong>
              <small>contatos processados</small>
            </div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricIcon}>
              <Activity size={20} />
            </div>
            <div>
              <span>Taxa de execução</span>
              <strong>99,7%</strong>
              <small>últimos 30 dias</small>
            </div>
          </article>
          <article className={styles.metricCard}>
            <div
              className={`${styles.metricIcon} ${totalErros ? styles.metricIconDanger : ""}`}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <span>Precisam de atenção</span>
              <strong>{totalErros}</strong>
              <small>
                {totalErros ? "verifique as falhas" : "nenhuma falha agora"}
              </small>
            </div>
          </article>
        </section>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionLabel}>ROTINAS CONFIGURADAS</span>
              <h2>Automações</h2>
              <p>
                Acompanhe agendamento, consulta utilizada e resultado da última
                execução.
              </p>
            </div>
            <button className={styles.primaryButton} onClick={abrirNovaRotina}>
              <Plus size={18} /> Criar automação
            </button>
          </div>

          <div className={styles.toolbar}>
            <label className={styles.searchBox}>
              <Search size={18} />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por nome, consulta ou template"
              />
            </label>
            <label className={styles.filterSelect}>
              <Filter size={17} />
              <select
                value={statusFiltro}
                onChange={(event) => setStatusFiltro(event.target.value)}
              >
                <option value="todas">Todos os status</option>
                <option value="ativa">Ativas</option>
                <option value="pausada">Pausadas</option>
                <option value="erro">Com erro</option>
              </select>
              <ChevronDown size={16} />
            </label>
          </div>

          <div className={styles.routineList}>
            {rotinasFiltradas.map((rotina) => (
              <article className={styles.routineCard} key={rotina.id}>
                <div className={styles.routineMain}>
                  <div className={styles.routineIcon}>
                    <Workflow size={22} />
                  </div>
                  <div className={styles.routineInfo}>
                    <div className={styles.routineTitleLine}>
                      <h3>{rotina.nome}</h3>
                      <span
                        className={`${styles.statusBadge} ${styles[`status_${rotina.status}`]}`}
                      >
                        {statusLabel(rotina.status)}
                      </span>
                    </div>
                    <p>{rotina.descricao}</p>
                    <div className={styles.routineTags}>
                      <span>
                        <Database size={14} />
                        {rotina.consulta}
                      </span>
                      <span>
                        <Send size={14} />
                        {rotina.template}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={styles.routineSchedule}>
                  <span>Próxima execução</span>
                  <strong>{rotina.proximaExecucao}</strong>
                  <small>
                    <Clock3 size={13} />
                    {rotina.frequencia}
                  </small>
                </div>
                <div className={styles.routineResult}>
                  <span>Última execução</span>
                  <strong>{rotina.ultimaExecucao}</strong>
                  <small>
                    <Users size={13} />
                    {rotina.enviados} destinatários
                  </small>
                </div>
                <div className={styles.routineActions}>
                  <button
                    title={rotina.status === "ativa" ? "Pausar" : "Ativar"}
                    onClick={() => alternarStatus(rotina.id)}
                  >
                    {rotina.status === "ativa" ? (
                      <Pause size={17} />
                    ) : (
                      <Play size={17} />
                    )}
                  </button>
                  <button title="Configurar">
                    <Settings2 size={17} />
                  </button>
                  <button title="Mais opções">
                    <MoreVertical size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.catalogCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionLabel}>BIBLIOTECA HOMOLOGADA</span>
              <h2>Consultas disponíveis</h2>
              <p>
                Consultas prontas para diferentes áreas e nichos. Novas
                consultas podem ser solicitadas à nossa equipe.
              </p>
            </div>
            <button className={styles.secondaryButton}>
              <ExternalLink size={17} /> Solicitar consulta personalizada
            </button>
          </div>
          <div className={styles.catalogGrid}>
            {consultas.map((consulta) => {
              const Icone = consulta.icone;
              return (
                <article className={styles.queryCard} key={consulta.id}>
                  <div className={styles.queryTop}>
                    <div className={styles.queryIcon}>
                      <Icone size={20} />
                    </div>
                    <span>{consulta.categoria}</span>
                    {consulta.destaque ? <b>Popular</b> : null}
                  </div>
                  <h3>{consulta.titulo}</h3>
                  <p>{consulta.descricao}</p>
                  <div className={styles.fieldPreview}>
                    {consulta.campos.slice(0, 3).map((campo) => (
                      <span key={campo}>{`{{${campo}}}`}</span>
                    ))}
                    {consulta.campos.length > 3 ? (
                      <span>+{consulta.campos.length - 3}</span>
                    ) : null}
                  </div>
                  <button
                    onClick={() => {
                      setConsultaSelecionada(consulta.id);
                      abrirNovaRotina();
                      setConsultaSelecionada(consulta.id);
                    }}
                  >
                    Usar consulta <ArrowRight size={16} />
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {modalAberto ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModalAberto(false);
          }}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Criar automação por API"
          >
            <header className={styles.modalHeader}>
              <div>
                <span className={styles.modalBadge}>
                  <Sparkles size={14} /> Nova automação
                </span>
                <h2>Configure sua rotina automática</h2>
                <p>
                  Defina como o CRM consultará os dados e realizará os disparos.
                </p>
              </div>
              <button
                className={styles.closeButton}
                onClick={() => setModalAberto(false)}
              >
                <X size={20} />
              </button>
            </header>

            <div className={styles.steps}>
              {["Consulta", "Mensagem", "Rotina", "Revisão"].map(
                (item, index) => {
                  const numero = index + 1;
                  return (
                    <button
                      key={item}
                      className={`${styles.step} ${etapa === numero ? styles.stepActive : ""} ${etapa > numero ? styles.stepDone : ""}`}
                      onClick={() => setEtapa(numero)}
                    >
                      <span>
                        {etapa > numero ? <Check size={15} /> : numero}
                      </span>
                      <div>
                        <b>{item}</b>
                        <small>
                          {index === 0
                            ? "Dados externos"
                            : index === 1
                              ? "Template e campos"
                              : index === 2
                                ? "Frequência"
                                : "Ativar"}
                        </small>
                      </div>
                    </button>
                  );
                },
              )}
            </div>

            <div className={styles.modalBody}>
              {etapa === 1 ? (
                <div className={styles.stepContent}>
                  <div className={styles.stepHeading}>
                    <span>ETAPA 1 DE 4</span>
                    <h3>Qual dado externo deve iniciar o disparo?</h3>
                    <p>
                      Selecione uma consulta previamente homologada para sua
                      integração.
                    </p>
                  </div>
                  <label className={styles.formField}>
                    <span>Nome da automação</span>
                    <input
                      value={nome}
                      onChange={(event) => setNome(event.target.value)}
                      placeholder="Ex.: Cobrança diária de inadimplentes"
                    />
                  </label>
                  <div className={styles.querySelection}>
                    {consultas.map((consulta) => {
                      const Icone = consulta.icone;
                      return (
                        <button
                          key={consulta.id}
                          className={
                            consultaSelecionada === consulta.id
                              ? styles.queryOptionActive
                              : ""
                          }
                          onClick={() => {
                            setConsultaSelecionada(consulta.id);
                            setTesteConcluido(false);
                          }}
                        >
                          <div className={styles.queryOptionIcon}>
                            <Icone size={19} />
                          </div>
                          <div>
                            <b>{consulta.titulo}</b>
                            <small>{consulta.descricao}</small>
                          </div>
                          <span className={styles.radio}>
                            {consultaSelecionada === consulta.id ? (
                              <Check size={13} />
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className={styles.infoBox}>
                    <ShieldCheck size={19} />
                    <div>
                      <b>Consulta protegida</b>
                      <p>
                        O CRM executa somente consultas homologadas. Credenciais
                        e regras internas do ERP não ficam expostas ao usuário
                        final.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {etapa === 2 ? (
                <div className={styles.stepContent}>
                  <div className={styles.stepHeading}>
                    <span>ETAPA 2 DE 4</span>
                    <h3>Escolha a mensagem e relacione os campos.</h3>
                    <p>
                      As variáveis recebidas da API serão inseridas no template
                      aprovado.
                    </p>
                  </div>
                  <label className={styles.formField}>
                    <span>Template do WhatsApp</span>
                    <select
                      value={template}
                      onChange={(event) => setTemplate(event.target.value)}
                    >
                      <option value="cobranca_fatura_vencida">
                        cobranca_fatura_vencida
                      </option>
                      <option value="lembrete_vencimento_3_dias">
                        lembrete_vencimento_3_dias
                      </option>
                      <option value="confirmacao_agendamento">
                        confirmacao_agendamento
                      </option>
                      <option value="atualizacao_pedido">
                        atualizacao_pedido
                      </option>
                    </select>
                  </label>
                  <div className={styles.mappingGrid}>
                    <div>
                      <span>Variável do template</span>
                      <strong>{"{{1}}"}</strong>
                      <small>Nome do cliente</small>
                    </div>
                    <ArrowRight size={18} />
                    <label>
                      <span>Campo retornado pela API</span>
                      <select>
                        <option>{consultaAtual.campos[0]}</option>
                      </select>
                    </label>
                    <div>
                      <span>Variável do template</span>
                      <strong>{"{{2}}"}</strong>
                      <small>Dado principal</small>
                    </div>
                    <ArrowRight size={18} />
                    <label>
                      <span>Campo retornado pela API</span>
                      <select>
                        <option>
                          {consultaAtual.campos[2] || consultaAtual.campos[1]}
                        </option>
                      </select>
                    </label>
                    <div>
                      <span>Variável do template</span>
                      <strong>{"{{3}}"}</strong>
                      <small>Data ou referência</small>
                    </div>
                    <ArrowRight size={18} />
                    <label>
                      <span>Campo retornado pela API</span>
                      <select>
                        <option>
                          {consultaAtual.campos[3] || consultaAtual.campos[2]}
                        </option>
                      </select>
                    </label>
                  </div>
                  <div className={styles.templatePreview}>
                    <div className={styles.phoneHeader}>WhatsApp Business</div>
                    <div className={styles.messageBubble}>
                      <b>Olá, {"{{nome}}"}!</b>
                      <p>
                        Identificamos uma atualização referente a{" "}
                        <strong>{"{{valor}}"}</strong>, com data{" "}
                        <strong>{"{{vencimento}}"}</strong>.
                      </p>
                      <small>Mensagem gerada com dados do ERP</small>
                    </div>
                  </div>
                </div>
              ) : null}

              {etapa === 3 ? (
                <div className={styles.stepContent}>
                  <div className={styles.stepHeading}>
                    <span>ETAPA 3 DE 4</span>
                    <h3>Quando a rotina deve ser executada?</h3>
                    <p>
                      O horário define quando o CRM consultará o ERP e criará o
                      disparo.
                    </p>
                  </div>
                  <div className={styles.frequencyGrid}>
                    {(["diaria", "semanal", "mensal"] as Frequencia[]).map(
                      (item) => (
                        <button
                          key={item}
                          className={
                            frequencia === item ? styles.frequencyActive : ""
                          }
                          onClick={() => setFrequencia(item)}
                        >
                          <CalendarClock size={20} />
                          <b>
                            {item === "diaria"
                              ? "Diariamente"
                              : item === "semanal"
                                ? "Semanalmente"
                                : "Mensalmente"}
                          </b>
                          <small>
                            {item === "diaria"
                              ? "Todos os dias"
                              : item === "semanal"
                                ? "Em um dia da semana"
                                : "Em um dia do mês"}
                          </small>
                        </button>
                      ),
                    )}
                  </div>
                  <div className={styles.scheduleGrid}>
                    <label className={styles.formField}>
                      <span>Horário da consulta</span>
                      <input
                        type="time"
                        value={horario}
                        onChange={(event) => setHorario(event.target.value)}
                      />
                    </label>
                    <label className={styles.formField}>
                      <span>Fuso horário</span>
                      <select>
                        <option>Brasília (GMT-3)</option>
                      </select>
                    </label>
                  </div>
                  <div className={styles.scheduleSummary}>
                    <Clock3 size={19} />
                    <div>
                      <b>Resumo do agendamento</b>
                      <p>
                        A consulta será executada{" "}
                        {frequencia === "diaria"
                          ? "todos os dias"
                          : frequencia === "semanal"
                            ? "toda segunda-feira"
                            : "todo dia 5"}
                        , às {horario}. Cada contato válido retornado poderá
                        gerar um disparo.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {etapa === 4 ? (
                <div className={styles.stepContent}>
                  <div className={styles.stepHeading}>
                    <span>ETAPA 4 DE 4</span>
                    <h3>Revise e autorize a automação.</h3>
                    <p>Faça um teste antes de ativar a rotina em produção.</p>
                  </div>
                  <div className={styles.reviewGrid}>
                    <div>
                      <span>Automação</span>
                      <strong>{nome || consultaAtual.titulo}</strong>
                    </div>
                    <div>
                      <span>Consulta</span>
                      <strong>{consultaAtual.titulo}</strong>
                    </div>
                    <div>
                      <span>Template</span>
                      <strong>{template}</strong>
                    </div>
                    <div>
                      <span>Execução</span>
                      <strong>
                        {frequencia === "diaria"
                          ? "Diária"
                          : frequencia === "semanal"
                            ? "Semanal"
                            : "Mensal"}
                        , {horario}
                      </strong>
                    </div>
                  </div>
                  <button
                    className={`${styles.testButton} ${testeConcluido ? styles.testSuccess : ""}`}
                    onClick={testarConsulta}
                    disabled={testando}
                  >
                    {testando ? (
                      <RefreshCw size={18} className={styles.spinning} />
                    ) : testeConcluido ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Database size={18} />
                    )}
                    <div>
                      <b>
                        {testando
                          ? "Consultando o ERP..."
                          : testeConcluido
                            ? "Teste concluído com sucesso"
                            : "Testar consulta agora"}
                      </b>
                      <small>
                        {testeConcluido
                          ? "12 registros válidos encontrados e 0 inconsistências."
                          : "Valide conexão, campos e formato dos telefones."}
                      </small>
                    </div>
                  </button>
                  <label className={styles.consentBox}>
                    <input
                      type="checkbox"
                      checked={consentimento}
                      onChange={(event) =>
                        setConsentimento(event.target.checked)
                      }
                    />
                    <span className={styles.customCheck}>
                      {consentimento ? <Check size={14} /> : null}
                    </span>
                    <div>
                      <b>
                        Confirmo a autorização e responsabilidade pelo envio
                      </b>
                      <p>
                        Declaro que possuo base legal e consentimento aplicável
                        para tratar os dados consultados e enviar mensagens aos
                        destinatários, respeitando opt-out, LGPD e políticas do
                        WhatsApp.
                      </p>
                    </div>
                  </label>
                  <div className={styles.warningBox}>
                    <AlertTriangle size={19} />
                    <div>
                      <b>Importante</b>
                      <p>
                        O CRM ignorará telefones inválidos, contatos com opt-out
                        aplicável e registros sem os campos obrigatórios do
                        template.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <footer className={styles.modalFooter}>
              <button
                className={styles.ghostButton}
                onClick={() =>
                  etapa === 1
                    ? setModalAberto(false)
                    : setEtapa((atual) => atual - 1)
                }
              >
                {etapa === 1 ? "Cancelar" : "Voltar"}
              </button>
              {etapa < 4 ? (
                <button
                  className={styles.primaryButton}
                  onClick={() => setEtapa((atual) => atual + 1)}
                >
                  Continuar <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  className={styles.primaryButton}
                  disabled={!consentimento}
                  onClick={salvarRotina}
                >
                  <Zap size={17} /> Salvar e ativar
                </button>
              )}
            </footer>
          </section>
        </div>
      ) : null}

      {modalIntegracoesAberto ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setModalIntegracoesAberto(false);
          }}
        >
          <section
            className={`${styles.modal} ${styles.integrationModal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Integrações externas"
          >
            <header className={styles.modalHeader}>
              <div>
                <span className={styles.modalBadge}>
                  <Database size={14} /> Integrações externas
                </span>
                <h2>Conecte o CRM aos seus sistemas</h2>
                <p>
                  Configure o ERP que fornecerá os dados ou gere credenciais
                  para acessar a API do CRM.
                </p>
              </div>
              <button
                className={styles.closeButton}
                onClick={() => setModalIntegracoesAberto(false)}
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </header>

            <div className={styles.integrationTabs} role="tablist">
              <button
                className={
                  abaIntegracao === "sistemas"
                    ? styles.integrationTabActive
                    : ""
                }
                onClick={() => setAbaIntegracao("sistemas")}
              >
                <Server size={17} />
                <span>
                  Sistemas conectados<small>CRM consulta ERPs externos</small>
                </span>
              </button>
              <button
                className={
                  abaIntegracao === "crm" ? styles.integrationTabActive : ""
                }
                onClick={() => setAbaIntegracao("crm")}
              >
                <Code2 size={17} />
                <span>
                  API do CRM<small>Outro sistema acessa o CRM</small>
                </span>
              </button>
            </div>

            <div className={styles.modalBody}>
              {abaIntegracao === "sistemas" ? (
                <div className={styles.integrationContent}>
                  <div className={styles.integrationIntro}>
                    <div>
                      <span className={styles.sectionLabel}>
                        CATÁLOGO DE CONECTORES
                      </span>
                      <h3>Escolha o sistema externo</h3>
                      <p>
                        Cada conector traduz os dados do sistema de origem para
                        um formato único usado pelas automações.
                      </p>
                    </div>
                    <span className={styles.connectionCounter}>
                      0 conectados
                    </span>
                  </div>
                  <div className={styles.connectorList}>
                    {conectoresDisponiveis.map((conector) => {
                      const Icone = conector.icone;
                      const expandido = conectorExpandido === conector.id;
                      return (
                        <article
                          className={`${styles.connectorCard} ${expandido ? styles.connectorCardExpanded : ""}`}
                          key={conector.id}
                        >
                          <button
                            className={styles.connectorSummary}
                            onClick={() =>
                              setConectorExpandido(
                                expandido ? null : conector.id,
                              )
                            }
                            aria-expanded={expandido}
                          >
                            <span className={styles.connectorIcon}>
                              <Icone size={22} />
                            </span>
                            <span className={styles.connectorInfo}>
                              <small>{conector.categoria}</small>
                              <strong>{conector.nome}</strong>
                              <em>{conector.descricao}</em>
                            </span>
                            <span
                              className={`${styles.connectorStatus} ${conector.status === "personalizada" ? styles.connectorStatusCustom : ""}`}
                            >
                              {conector.status === "personalizada"
                                ? "Sob consulta"
                                : "Não configurado"}
                            </span>
                            <ChevronDown
                              size={18}
                              className={
                                expandido
                                  ? styles.connectorChevronOpen
                                  : styles.connectorChevron
                              }
                            />
                          </button>

                          {expandido && conector.id === "erp_provedor" ? (
                            <div className={styles.connectorForm}>
                              <div className={styles.connectorFormHeader}>
                                <div>
                                  <h4>Credenciais do ERP</h4>
                                  <p>
                                    Solicite estes dados ao suporte do ERP
                                    utilizado pelo provedor.
                                  </p>
                                </div>
                                <span>
                                  <ShieldCheck size={15} /> Credenciais
                                  protegidas
                                </span>
                              </div>
                              <div className={styles.integrationFormGrid}>
                                <label
                                  className={`${styles.formField} ${styles.formFieldWide}`}
                                >
                                  <span>URL base da API *</span>
                                  <input
                                    value={urlErp}
                                    onChange={(event) => {
                                      setUrlErp(event.target.value);
                                      setConexaoTestada(false);
                                    }}
                                    placeholder="https://api.seuerp.com.br/v1"
                                    inputMode="url"
                                  />
                                </label>
                                <label className={styles.formField}>
                                  <span>Código da empresa</span>
                                  <input
                                    value={codigoEmpresa}
                                    onChange={(event) =>
                                      setCodigoEmpresa(event.target.value)
                                    }
                                    placeholder="Ex.: 001"
                                  />
                                </label>
                                <label
                                  className={`${styles.formField} ${styles.formFieldWide}`}
                                >
                                  <span>Token de acesso *</span>
                                  <div className={styles.secretInput}>
                                    <input
                                      type={
                                        mostrarTokenErp ? "text" : "password"
                                      }
                                      value={tokenErp}
                                      onChange={(event) => {
                                        setTokenErp(event.target.value);
                                        setConexaoTestada(false);
                                      }}
                                      placeholder="Cole o token fornecido pelo ERP"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setMostrarTokenErp((atual) => !atual)
                                      }
                                      aria-label={
                                        mostrarTokenErp
                                          ? "Ocultar token"
                                          : "Mostrar token"
                                      }
                                    >
                                      {mostrarTokenErp ? (
                                        <EyeOff size={17} />
                                      ) : (
                                        <Eye size={17} />
                                      )}
                                    </button>
                                  </div>
                                </label>
                              </div>
                              <div className={styles.availableQueries}>
                                <span>Consultas que serão habilitadas</span>
                                <div>
                                  <b>
                                    <Check size={13} /> Clientes inadimplentes
                                  </b>
                                  <b>
                                    <Check size={13} /> Próximos do vencimento
                                  </b>
                                  <b>
                                    <Check size={13} /> Pagamentos confirmados
                                  </b>
                                  <b>
                                    <Check size={13} /> Serviços suspensos
                                  </b>
                                </div>
                              </div>
                              {conexaoTestada ? (
                                <div className={styles.connectionSuccess}>
                                  <CheckCircle2 size={18} />
                                  <div>
                                    <b>Conexão validada</b>
                                    <small>
                                      O ERP respondeu corretamente e está pronto
                                      para salvar.
                                    </small>
                                  </div>
                                </div>
                              ) : null}
                              <div className={styles.connectorFormActions}>
                                <button
                                  className={styles.ghostButton}
                                  onClick={testarConexaoErp}
                                  disabled={
                                    !urlErp.trim() ||
                                    !tokenErp.trim() ||
                                    testandoConexao
                                  }
                                >
                                  {testandoConexao ? (
                                    <RefreshCw
                                      size={17}
                                      className={styles.spinning}
                                    />
                                  ) : (
                                    <Database size={17} />
                                  )}
                                  {testandoConexao
                                    ? "Testando..."
                                    : "Testar conexão"}
                                </button>
                                <button
                                  className={styles.primaryButton}
                                  onClick={salvarConexaoErp}
                                  disabled={!urlErp.trim() || !tokenErp.trim()}
                                >
                                  Salvar integração
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {expandido && conector.id === "api_personalizada" ? (
                            <div className={styles.customConnectorBody}>
                              <Code2 size={22} />
                              <div>
                                <h4>Integração personalizada</h4>
                                <p>
                                  Nossa equipe analisa a documentação, homologa
                                  as consultas e prepara o mapeamento dos dados
                                  com segurança.
                                </p>
                              </div>
                              <button className={styles.secondaryButton}>
                                Solicitar integração <ChevronRight size={16} />
                              </button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className={styles.integrationContent}>
                  <div className={styles.integrationIntro}>
                    <div>
                      <span className={styles.sectionLabel}>
                        ACESSO EXTERNO
                      </span>
                      <h3>Credenciais da API do CRM</h3>
                      <p>
                        Use esta opção quando outro sistema precisar enviar ou
                        consultar informações no CRM.
                      </p>
                    </div>
                  </div>
                  <div className={styles.crmApiCard}>
                    <div className={styles.crmApiHeader}>
                      <span className={styles.connectorIcon}>
                        <Code2 size={22} />
                      </span>
                      <div>
                        <strong>API CRM Prosperity</strong>
                        <p>Autenticação segura por token de acesso.</p>
                      </div>
                      <span className={styles.connectorStatus}>
                        Não configurada
                      </span>
                    </div>
                    <div className={styles.endpointBox}>
                      <span>URL base da API</span>
                      <div>
                        <code>https://seu-dominio.com/api/v1</code>
                        <button
                          onClick={() =>
                            copiarTexto(
                              "https://seu-dominio.com/api/v1",
                              "URL da API copiada.",
                            )
                          }
                          aria-label="Copiar URL"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </div>
                    <div className={styles.tokenBox}>
                      <div>
                        <span>Token de acesso</span>
                        <small>
                          O token completo é exibido somente no momento da
                          geração.
                        </small>
                      </div>
                      {tokenCrmGerado ? (
                        <div className={styles.generatedToken}>
                          <code>
                            {mostrarTokenCrm
                              ? "crm_live_8f4c2a7d6e1b9c3f"
                              : "crm_live_••••••••••••9c3f"}
                          </code>
                          <button
                            onClick={() =>
                              setMostrarTokenCrm((atual) => !atual)
                            }
                            aria-label={
                              mostrarTokenCrm
                                ? "Ocultar token"
                                : "Mostrar token"
                            }
                          >
                            {mostrarTokenCrm ? (
                              <EyeOff size={16} />
                            ) : (
                              <Eye size={16} />
                            )}
                          </button>
                          <button
                            onClick={() =>
                              copiarTexto(
                                "crm_live_8f4c2a7d6e1b9c3f",
                                "Token copiado.",
                              )
                            }
                            aria-label="Copiar token"
                          >
                            <Copy size={16} />
                          </button>
                        </div>
                      ) : (
                        <button
                          className={styles.primaryButton}
                          onClick={() => {
                            setTokenCrmGerado(true);
                            setMostrarTokenCrm(true);
                          }}
                        >
                          Gerar token de acesso
                        </button>
                      )}
                    </div>
                    <div className={styles.apiPermissions}>
                      <span>Permissões do token</span>
                      <label>
                        <input type="checkbox" defaultChecked /> Consultar
                        contatos
                      </label>
                      <label>
                        <input type="checkbox" defaultChecked /> Criar e
                        atualizar contatos
                      </label>
                      <label>
                        <input type="checkbox" /> Consultar automações
                      </label>
                      <label>
                        <input type="checkbox" /> Executar automações
                      </label>
                    </div>
                    <div className={styles.warningBox}>
                      <AlertTriangle size={19} />
                      <div>
                        <b>Ambiente de configuração</b>
                        <p>
                          A geração definitiva e o armazenamento seguro do token
                          serão ativados junto com os endpoints públicos da API.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
