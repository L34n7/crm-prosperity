"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Database,
  Eye,
  EyeOff,
  Filter,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import styles from "./automacoes-api.module.css";

type Integracao = {
  id: string;
  nome: string;
  tipo: string;
  base_url: string;
  codigo_empresa: string | null;
  status: "nao_testada" | "ativa" | "erro" | "inativa";
  ultimo_teste_em: string | null;
  ultimo_erro: string | null;
};

type Rotina = {
  id: string;
  integracao_id: string;
  nome: string;
  consulta_chave: string;
  endpoint: string;
  metodo: "GET" | "POST";
  template_id: string | null;
  frequencia: "diaria" | "semanal" | "mensal";
  horario: string;
  status: "ativa" | "pausada" | "erro";
  proxima_execucao_em: string | null;
  ultima_execucao_em: string | null;
  ultimo_erro: string | null;
  total_processados: number;
};

type Template = {
  id: string;
  nome: string;
  status: string;
};

type Frequencia = Rotina["frequencia"];
type AbaIntegracao = "sistemas" | "crm";

type Metricas = {
  total_rotinas: number;
  rotinas_ativas: number;
  com_erro: number;
  enviados_30_dias: number;
  taxa_execucao: number | null;
};

const metricasVazias: Metricas = {
  total_rotinas: 0,
  rotinas_ativas: 0,
  com_erro: 0,
  enviados_30_dias: 0,
  taxa_execucao: null,
};

const CRM_WHATSAPP_HOMOLOGACAO = `https://wa.me/553175117638?text=${encodeURIComponent(
  "Olá, preciso solicitar a homologação de uma integração personalizada no CRM Prosperity.",
)}`;

function formatarData(valor: string | null) {
  if (!valor) return "Ainda não executada";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}

function statusLabel(status: Rotina["status"]) {
  if (status === "ativa") return "Ativa";
  if (status === "pausada") return "Pausada";
  return "Com erro";
}

function statusIntegracaoLabel(status: Integracao["status"]) {
  if (status === "ativa") return "Conectada";
  if (status === "erro") return "Com erro";
  if (status === "inativa") return "Arquivada";
  return "Não testada";
}

function frequenciaLabel(frequencia: Frequencia) {
  if (frequencia === "diaria") return "Diariamente";
  if (frequencia === "semanal") return "Semanalmente";
  return "Mensalmente";
}

export default function AutomacoesApiPage() {
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [rotinas, setRotinas] = useState<Rotina[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [metricas, setMetricas] = useState(metricasVazias);
  const [podeGerenciar, setPodeGerenciar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todas");

  const [modalRotinaAberto, setModalRotinaAberto] = useState(false);
  const [etapa, setEtapa] = useState(1);
  const [consentimento, setConsentimento] = useState(false);
  const [rotinaValidada, setRotinaValidada] = useState(false);

  const [modalIntegracoesAberto, setModalIntegracoesAberto] = useState(false);
  const [abaIntegracao, setAbaIntegracao] =
    useState<AbaIntegracao>("sistemas");
  const [conectorExpandido, setConectorExpandido] = useState<string | null>(null);
  const [mostrarTokenErp, setMostrarTokenErp] = useState(false);
  const [testandoConexao, setTestandoConexao] = useState(false);
  const [conexaoTestada, setConexaoTestada] = useState(false);
  const [mensagemTesteConexao, setMensagemTesteConexao] = useState("");
  const [operacaoConexaoId, setOperacaoConexaoId] = useState<string | null>(null);

  const [nomeIntegracao, setNomeIntegracao] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [codigoEmpresa, setCodigoEmpresa] = useState("");
  const [tokenErp, setTokenErp] = useState("");

  const [nomeRotina, setNomeRotina] = useState("");
  const [integracaoId, setIntegracaoId] = useState("");
  const [consultaChave, setConsultaChave] = useState("personalizada");
  const [endpoint, setEndpoint] = useState("");
  const [metodo, setMetodo] = useState<"GET" | "POST">("GET");
  const [templateId, setTemplateId] = useState("");
  const [frequencia, setFrequencia] = useState<Frequencia>("diaria");
  const [horario, setHorario] = useState("09:00");

  const mostrarFeedback = useCallback((mensagem: string) => {
    setFeedback(mensagem);
    window.setTimeout(() => setFeedback(""), 3500);
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");

    try {
      const response = await fetch("/api/automacoes-api", {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error || "Não foi possível carregar as automações.",
        );
      }

      setIntegracoes(data.integracoes || []);
      setRotinas(data.rotinas || []);
      setTemplates(data.templates || []);
      setMetricas(data.metricas || metricasVazias);
      setPodeGerenciar(data.pode_gerenciar === true);
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao carregar a página.",
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const rotinasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return rotinas.filter((rotina) => {
      const correspondeBusca =
        !termo ||
        rotina.nome.toLowerCase().includes(termo) ||
        rotina.consulta_chave.toLowerCase().includes(termo) ||
        rotina.endpoint.toLowerCase().includes(termo);

      return (
        correspondeBusca &&
        (statusFiltro === "todas" || rotina.status === statusFiltro)
      );
    });
  }, [busca, rotinas, statusFiltro]);

  const integracoesDisponiveis = useMemo(
    () => integracoes.filter((item) => item.status !== "inativa"),
    [integracoes],
  );

  const integracaoSelecionada = useMemo(
    () => integracoes.find((item) => item.id === integracaoId) || null,
    [integracaoId, integracoes],
  );

  const templateSelecionado = useMemo(
    () => templates.find((item) => item.id === templateId) || null,
    [templateId, templates],
  );

  const totalIntegracoesAtivas = useMemo(
    () => integracoes.filter((item) => item.status === "ativa").length,
    [integracoes],
  );

  async function requisicao(
    body: Record<string, unknown>,
    method = "POST",
  ) {
    setSalvando(true);
    setErro("");

    try {
      const response = await fetch("/api/automacoes-api", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível concluir a operação.");
      }

      await carregar();
      return data;
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar.");
      return null;
    } finally {
      setSalvando(false);
    }
  }

  function abrirNovaRotina() {
    setEtapa(1);
    setNomeRotina("");
    setIntegracaoId(integracoesDisponiveis[0]?.id || "");
    setConsultaChave("personalizada");
    setEndpoint("");
    setMetodo("GET");
    setTemplateId("");
    setFrequencia("diaria");
    setHorario("09:00");
    setConsentimento(false);
    setRotinaValidada(false);
    setModalRotinaAberto(true);
  }

  function abrirIntegracoes() {
    setAbaIntegracao("sistemas");
    setConectorExpandido(integracoes[0]?.id || "nova_conexao");
    setConexaoTestada(false);
    setMensagemTesteConexao("");
    setModalIntegracoesAberto(true);
  }

  function abrirFormularioConexao() {
    setModalRotinaAberto(false);
    setModalIntegracoesAberto(true);
    setAbaIntegracao("sistemas");
    setConectorExpandido("nova_conexao");
  }

  async function criarIntegracao() {
    const data = await requisicao({
      acao: "criar_integracao",
      nome: nomeIntegracao,
      base_url: baseUrl,
      codigo_empresa: codigoEmpresa,
      token: tokenErp,
      conexao_testada: conexaoTestada,
    });

    if (!data) return;

    setNomeIntegracao("");
    setBaseUrl("");
    setCodigoEmpresa("");
    setTokenErp("");
    setConexaoTestada(false);
    setMensagemTesteConexao("");
    setConectorExpandido(data.integracao?.id || null);
    mostrarFeedback("Conexão cadastrada com sucesso.");
  }

  async function testarConexaoErp() {
    if (!baseUrl.trim()) return;

    setTestandoConexao(true);
    setConexaoTestada(false);
    setMensagemTesteConexao("");
    setErro("");

    try {
      const response = await fetch("/api/automacoes-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "testar_conexao",
          base_url: baseUrl,
          token: tokenErp,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível testar a conexão.");
      }

      setConexaoTestada(true);
      setMensagemTesteConexao(
        data.message || "O servidor externo respondeu à validação.",
      );
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao testar a conexão.",
      );
    } finally {
      setTestandoConexao(false);
    }
  }

  async function criarRotina() {
    const data = await requisicao({
      acao: "criar_rotina",
      nome: nomeRotina,
      integracao_id: integracaoId,
      consulta_chave: consultaChave,
      endpoint,
      metodo,
      template_id: templateId || null,
      frequencia,
      horario,
    });

    if (!data) return;

    setModalRotinaAberto(false);
    setNomeRotina("");
    setEndpoint("");
    setConsentimento(false);
    setRotinaValidada(false);
    mostrarFeedback(
      "Automação criada pausada. Ative após homologar a resposta da API.",
    );
  }

  async function alternarStatus(rotina: Rotina) {
    await requisicao(
      {
        entidade: "rotina",
        id: rotina.id,
        status: rotina.status === "ativa" ? "pausada" : "ativa",
      },
      "PATCH",
    );
  }

  async function alterarStatusIntegracao(
    integracao: Integracao,
    status: "inativa" | "nao_testada",
  ) {
    setOperacaoConexaoId(integracao.id);

    const data = await requisicao(
      {
        entidade: "integracao",
        id: integracao.id,
        status,
      },
      "PATCH",
    );

    setOperacaoConexaoId(null);
    if (!data) return;

    mostrarFeedback(
      data.message ||
        (status === "inativa"
          ? "Conexão arquivada."
          : "Conexão reaberta."),
    );
  }

  async function excluirIntegracao(integracao: Integracao) {
    const totalRotinas = rotinas.filter(
      (rotina) => rotina.integracao_id === integracao.id,
    ).length;

    const detalheRotinas = totalRotinas
      ? ` Esta ação também excluirá ${totalRotinas} rotina${totalRotinas === 1 ? "" : "s"} vinculada${totalRotinas === 1 ? "" : "s"} e seus históricos.`
      : "";

    const confirmou = window.confirm(
      `Excluir permanentemente a conexão “${integracao.nome}”?${detalheRotinas} Esta ação não pode ser desfeita.`,
    );

    if (!confirmou) return;

    setOperacaoConexaoId(integracao.id);
    setErro("");

    try {
      const response = await fetch("/api/automacoes-api", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: integracao.id }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível excluir a conexão.");
      }

      if (integracaoId === integracao.id) setIntegracaoId("");
      setConectorExpandido(null);
      await carregar();
      mostrarFeedback(
        data.rotinas_excluidas
          ? `Conexão excluída com ${data.rotinas_excluidas} rotina(s) vinculada(s).`
          : "Conexão excluída permanentemente.",
      );
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao excluir conexão.",
      );
    } finally {
      setOperacaoConexaoId(null);
    }
  }

  function validarConfiguracaoRotina() {
    const valida = Boolean(
      nomeRotina.trim() &&
        integracaoId &&
        consultaChave.trim() &&
        endpoint.trim().startsWith("/") &&
        horario,
    );

    setRotinaValidada(valida);

    if (!valida) {
      setErro(
        "Preencha nome, conexão, identificador, endpoint iniciado por / e horário.",
      );
    } else {
      setErro("");
    }
  }

  async function copiarTexto(valor: string, mensagem: string) {
    await navigator.clipboard?.writeText(valor);
    mostrarFeedback(mensagem);
  }

  const podeAvancarEtapa1 = Boolean(
    nomeRotina.trim() &&
      integracaoId &&
      consultaChave.trim() &&
      endpoint.trim().startsWith("/"),
  );
  const podeSalvarRotina =
    podeAvancarEtapa1 && Boolean(horario) && consentimento;

  return (
    <main className={styles.page}>
      <Header
        title="Automações por API"
        subtitle="Conecte sistemas externos e acompanhe rotinas reais, sem dados demonstrativos."
      />

      <div className={styles.content}>
        {feedback ? (
          <div className={styles.feedback}>
            <CheckCircle2 size={18} />
            {feedback}
          </div>
        ) : null}

        {erro ? (
          <div
            className={styles.feedback}
            style={{
              borderColor: "var(--crm-danger-border)",
              background: "var(--crm-danger-bg)",
              color: "var(--crm-danger-text)",
            }}
          >
            <AlertTriangle size={18} />
            {erro}
          </div>
        ) : null}

        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <span className={styles.eyebrow}>
              <Workflow size={15} /> Dados reais
            </span>
            <h1>Automatize consultas externas com controle e rastreabilidade.</h1>
            <p>
              Cadastre uma conexão real, configure o endpoint e associe um
              template aprovado. Nenhum conector é exibido como conectado sem
              existir no banco da empresa.
            </p>
            <div className={styles.heroActions}>
              <button className={styles.primaryButton} onClick={abrirNovaRotina}>
                <Plus size={18} /> Nova automação
              </button>
              <button className={styles.secondaryButton} onClick={abrirIntegracoes}>
                <Code2 size={18} /> Gerenciar conexões
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => void carregar()}
                disabled={carregando}
              >
                <RefreshCw size={17} /> Atualizar
              </button>
            </div>
          </div>

          <div className={styles.flowPreview} aria-label="Fluxo da automação">
            <div className={styles.flowNode}>
              <Database size={20} />
              <span>API externa</span>
            </div>
            <ArrowRight size={20} className={styles.flowArrow} />
            <div className={`${styles.flowNode} ${styles.flowNodeActive}`}>
              <Filter size={20} />
              <span>Rotina</span>
            </div>
            <ArrowRight size={20} className={styles.flowArrow} />
            <div className={styles.flowNode}>
              <Send size={20} />
              <span>WhatsApp</span>
            </div>
          </div>
        </section>

        <section className={styles.metricsGrid}>
          <article className={styles.metricCard}>
            <div className={styles.metricIcon}>
              <Zap size={20} />
            </div>
            <div>
              <span>Rotinas ativas</span>
              <strong>{metricas.rotinas_ativas}</strong>
              <small>de {metricas.total_rotinas} configuradas</small>
            </div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricIcon}>
              <Send size={20} />
            </div>
            <div>
              <span>Envios em 30 dias</span>
              <strong>{metricas.enviados_30_dias}</strong>
              <small>mensagens registradas</small>
            </div>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricIcon}>
              <Activity size={20} />
            </div>
            <div>
              <span>Taxa de execução</span>
              <strong>
                {metricas.taxa_execucao === null
                  ? "—"
                  : `${metricas.taxa_execucao}%`}
              </strong>
              <small>
                {metricas.taxa_execucao === null
                  ? "sem execuções concluídas"
                  : "últimos 30 dias"}
              </small>
            </div>
          </article>
          <article className={styles.metricCard}>
            <div
              className={`${styles.metricIcon} ${
                metricas.com_erro ? styles.metricIconDanger : ""
              }`}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <span>Precisam de atenção</span>
              <strong>{metricas.com_erro}</strong>
              <small>
                {metricas.com_erro
                  ? "verifique os erros"
                  : "nenhuma falha registrada"}
              </small>
            </div>
          </article>
        </section>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionLabel}>ROTINAS REAIS</span>
              <h2>Automações configuradas</h2>
              <p>Somente registros persistidos para a empresa atual.</p>
            </div>
            <button className={styles.primaryButton} onClick={abrirNovaRotina}>
              <Plus size={17} /> Criar automação
            </button>
          </div>

          <div className={styles.toolbar}>
            <label className={styles.searchBox}>
              <Search size={18} />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por nome, consulta ou endpoint"
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
            </label>
          </div>

          {carregando ? (
            <div style={{ padding: 40, textAlign: "center" }}>
              <Loader2 className={styles.spinning} /> Carregando dados reais...
            </div>
          ) : null}

          {!carregando && !rotinasFiltradas.length ? (
            <div
              style={{
                padding: 42,
                textAlign: "center",
                color: "var(--crm-text-muted)",
              }}
            >
              <Workflow size={34} />
              <h3>Nenhuma automação configurada</h3>
              <p>Cadastre uma conexão e crie a primeira rotina.</p>
            </div>
          ) : null}

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
                        className={`${styles.statusBadge} ${
                          styles[`status_${rotina.status}`]
                        }`}
                      >
                        {statusLabel(rotina.status)}
                      </span>
                    </div>
                    <p>
                      {rotina.metodo} {rotina.endpoint}
                    </p>
                    <div className={styles.routineTags}>
                      <span>
                        <Database size={14} />
                        {rotina.consulta_chave}
                      </span>
                      <span>
                        <Send size={14} />
                        {templates.find((item) => item.id === rotina.template_id)
                          ?.nome || "Sem template"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={styles.routineSchedule}>
                  <span>Próxima execução</span>
                  <strong>{formatarData(rotina.proxima_execucao_em)}</strong>
                  <small>
                    {frequenciaLabel(rotina.frequencia)} às{" "}
                    {rotina.horario.slice(0, 5)}
                  </small>
                </div>
                <div className={styles.routineResult}>
                  <span>Última execução</span>
                  <strong>{formatarData(rotina.ultima_execucao_em)}</strong>
                  <small>{rotina.total_processados || 0} processados</small>
                </div>
                <div className={styles.routineActions}>
                  <button
                    title={rotina.status === "ativa" ? "Pausar" : "Ativar"}
                    onClick={() => void alternarStatus(rotina)}
                    disabled={salvando}
                  >
                    {rotina.status === "ativa" ? (
                      <Pause size={17} />
                    ) : (
                      <Play size={17} />
                    )}
                  </button>
                  <button title="Configuração persistida" disabled>
                    <Settings2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.catalogCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionLabel}>CONEXÕES CADASTRADAS</span>
              <h2>Sistemas externos</h2>
              <p>
                Aqui aparecem somente conexões reais. Conectores demonstrativos
                foram removidos.
              </p>
            </div>
            <button className={styles.secondaryButton} onClick={abrirIntegracoes}>
              <Plus size={17} /> Gerenciar conexões
            </button>
          </div>

          <div className={styles.catalogGrid}>
            {integracoes.map((integracao) => (
              <article className={styles.queryCard} key={integracao.id}>
                <div className={styles.queryTop}>
                  <div className={styles.queryIcon}>
                    <Database size={20} />
                  </div>
                  <span>{integracao.tipo}</span>
                </div>
                <h3>{integracao.nome}</h3>
                <p>{integracao.base_url}</p>
                <div className={styles.fieldPreview}>
                  <span>{statusIntegracaoLabel(integracao.status)}</span>
                  {integracao.codigo_empresa ? (
                    <span>empresa: {integracao.codigo_empresa}</span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      {modalRotinaAberto ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModalRotinaAberto(false);
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
                onClick={() => setModalRotinaAberto(false)}
                aria-label="Fechar"
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
                      className={`${styles.step} ${
                        etapa === numero ? styles.stepActive : ""
                      } ${etapa > numero ? styles.stepDone : ""}`}
                      onClick={() => setEtapa(numero)}
                    >
                      <span>{etapa > numero ? <Check size={15} /> : numero}</span>
                      <div>
                        <b>{item}</b>
                        <small>
                          {index === 0
                            ? "Dados externos"
                            : index === 1
                              ? "Template"
                              : index === 2
                                ? "Frequência"
                                : "Confirmar"}
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
                    <h3>Qual conexão e endpoint serão consultados?</h3>
                    <p>
                      Selecione uma conexão real e informe o endpoint fornecido
                      pelo sistema externo.
                    </p>
                  </div>

                  {!integracoesDisponiveis.length ? (
                    <div className={styles.infoBox}>
                      <AlertTriangle size={19} />
                      <div>
                        <b>Nenhuma conexão disponível</b>
                        <p>
                          Cadastre uma conexão antes de configurar a automação.
                        </p>
                        <button
                          className={styles.primaryButton}
                          onClick={abrirFormularioConexao}
                        >
                          <Plus size={16} /> Cadastrar conexão
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <label className={styles.formField}>
                        <span>Nome da automação</span>
                        <input
                          value={nomeRotina}
                          onChange={(event) => {
                            setNomeRotina(event.target.value);
                            setRotinaValidada(false);
                          }}
                          placeholder="Ex.: Cobrança diária de inadimplentes"
                        />
                      </label>

                      <div className={styles.querySelection}>
                        {integracoesDisponiveis.map((integracao) => (
                          <button
                            key={integracao.id}
                            className={
                              integracaoId === integracao.id
                                ? styles.queryOptionActive
                                : ""
                            }
                            onClick={() => {
                              setIntegracaoId(integracao.id);
                              setRotinaValidada(false);
                            }}
                          >
                            <div className={styles.queryOptionIcon}>
                              <Database size={19} />
                            </div>
                            <div>
                              <b>{integracao.nome}</b>
                              <small>
                                {integracao.base_url} ·{" "}
                                {statusIntegracaoLabel(integracao.status)}
                              </small>
                            </div>
                            <span className={styles.radio}>
                              {integracaoId === integracao.id ? (
                                <Check size={13} />
                              ) : null}
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className={styles.scheduleGrid}>
                        <label className={styles.formField}>
                          <span>Identificador da consulta</span>
                          <input
                            value={consultaChave}
                            onChange={(event) => {
                              setConsultaChave(event.target.value);
                              setRotinaValidada(false);
                            }}
                            placeholder="Ex.: clientes_inadimplentes"
                          />
                        </label>
                        <label className={styles.formField}>
                          <span>Método</span>
                          <select
                            value={metodo}
                            onChange={(event) =>
                              setMetodo(event.target.value as "GET" | "POST")
                            }
                          >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                          </select>
                        </label>
                      </div>

                      <label className={styles.formField}>
                        <span>Endpoint *</span>
                        <input
                          value={endpoint}
                          onChange={(event) => {
                            setEndpoint(event.target.value);
                            setRotinaValidada(false);
                          }}
                          placeholder="/clientes/inadimplentes"
                        />
                      </label>

                      <div className={styles.infoBox}>
                        <ShieldCheck size={19} />
                        <div>
                          <b>Consulta isolada por empresa</b>
                          <p>
                            A rotina só poderá utilizar conexões cadastradas para
                            a empresa atual.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {etapa === 2 ? (
                <div className={styles.stepContent}>
                  <div className={styles.stepHeading}>
                    <span>ETAPA 2 DE 4</span>
                    <h3>Escolha a mensagem do WhatsApp.</h3>
                    <p>
                      São listados somente templates aprovados da empresa. O
                      mapeamento das variáveis depende da homologação do retorno da
                      API.
                    </p>
                  </div>

                  <label className={styles.formField}>
                    <span>Template aprovado</span>
                    <select
                      value={templateId}
                      onChange={(event) => setTemplateId(event.target.value)}
                    >
                      <option value="">Sem template por enquanto</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.nome}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className={styles.templatePreview}>
                    <div className={styles.phoneHeader}>WhatsApp Business</div>
                    <div className={styles.messageBubble}>
                      <b>{templateSelecionado?.nome || "Template não selecionado"}</b>
                      <p>
                        As variáveis serão preenchidas com os campos reais
                        retornados pelo endpoint homologado.
                      </p>
                      <small>Nenhum resultado de consulta é simulado.</small>
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
                      O horário define quando o CRM consultará o sistema externo.
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
                          <b>{frequenciaLabel(item)}</b>
                          <small>
                            {item === "diaria"
                              ? "Todos os dias"
                              : item === "semanal"
                                ? "Uma vez por semana"
                                : "Uma vez por mês"}
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
                      <select defaultValue="America/Sao_Paulo">
                        <option value="America/Sao_Paulo">
                          Brasília (GMT-3)
                        </option>
                      </select>
                    </label>
                  </div>

                  <div className={styles.scheduleSummary}>
                    <CalendarClock size={19} />
                    <div>
                      <b>Resumo do agendamento</b>
                      <p>
                        Execução {frequenciaLabel(frequencia).toLowerCase()}, às{" "}
                        {horario}.
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
                    <p>
                      A rotina será criada pausada até a homologação do endpoint.
                    </p>
                  </div>

                  <div className={styles.reviewGrid}>
                    <div>
                      <span>Automação</span>
                      <strong>{nomeRotina || "Não informada"}</strong>
                    </div>
                    <div>
                      <span>Conexão</span>
                      <strong>
                        {integracaoSelecionada?.nome || "Não selecionada"}
                      </strong>
                    </div>
                    <div>
                      <span>Consulta</span>
                      <strong>
                        {metodo} {endpoint || "Endpoint não informado"}
                      </strong>
                    </div>
                    <div>
                      <span>Template</span>
                      <strong>
                        {templateSelecionado?.nome || "Sem template"}
                      </strong>
                    </div>
                    <div>
                      <span>Execução</span>
                      <strong>
                        {frequenciaLabel(frequencia)}, {horario}
                      </strong>
                    </div>
                  </div>

                  <button
                    className={`${styles.testButton} ${
                      rotinaValidada ? styles.testSuccess : ""
                    }`}
                    onClick={validarConfiguracaoRotina}
                  >
                    {rotinaValidada ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Database size={18} />
                    )}
                    <div>
                      <b>
                        {rotinaValidada
                          ? "Campos obrigatórios validados"
                          : "Validar configuração"}
                      </b>
                      <small>
                        Esta validação não inventa registros nem executa uma
                        consulta sem endpoint homologado.
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
                      <b>Confirmo a autorização e responsabilidade pelo envio</b>
                      <p>
                        Declaro possuir base legal para consultar os dados e enviar
                        mensagens, respeitando LGPD, opt-out e políticas do
                        WhatsApp.
                      </p>
                    </div>
                  </label>
                </div>
              ) : null}
            </div>

            <footer className={styles.modalFooter}>
              <button
                className={styles.ghostButton}
                onClick={() =>
                  etapa === 1
                    ? setModalRotinaAberto(false)
                    : setEtapa((atual) => atual - 1)
                }
              >
                {etapa === 1 ? "Cancelar" : "Voltar"}
              </button>

              {etapa < 4 ? (
                <button
                  className={styles.primaryButton}
                  onClick={() => setEtapa((atual) => atual + 1)}
                  disabled={etapa === 1 && !podeAvancarEtapa1}
                >
                  Continuar <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  className={styles.primaryButton}
                  disabled={!podeSalvarRotina || salvando}
                  onClick={() => void criarRotina()}
                >
                  {salvando ? (
                    <Loader2 size={17} className={styles.spinning} />
                  ) : (
                    <Zap size={17} />
                  )}
                  Salvar automação
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
            if (event.target === event.currentTarget) {
              setModalIntegracoesAberto(false);
            }
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
                  Somente conexões realmente cadastradas são identificadas como
                  existentes.
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
                <Database size={17} />
                <span>
                  Sistemas conectados
                  <small>CRM consulta APIs externas</small>
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
                  API do CRM
                  <small>Outro sistema acessa o CRM</small>
                </span>
              </button>
            </div>

            <div className={styles.modalBody}>
              {abaIntegracao === "sistemas" ? (
                <div className={styles.integrationContent}>
                  <div className={styles.integrationIntro}>
                    <div>
                      <span className={styles.sectionLabel}>
                        CONEXÕES DA EMPRESA
                      </span>
                      <h3>Sistemas externos cadastrados</h3>
                      <p>
                        O número abaixo diferencia conexões ativas de simples
                        cadastros ainda não testados.
                      </p>
                    </div>
                    <span className={styles.connectionCounter}>
                      {totalIntegracoesAtivas} conectada
                      {totalIntegracoesAtivas === 1 ? "" : "s"} ·{" "}
                      {integracoes.length} cadastrada
                      {integracoes.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className={styles.connectorList}>
                    {integracoes.map((integracao) => {
                      const expandido = conectorExpandido === integracao.id;
                      const processando = operacaoConexaoId === integracao.id;
                      const totalRotinas = rotinas.filter(
                        (rotina) => rotina.integracao_id === integracao.id,
                      ).length;

                      return (
                        <article
                          className={`${styles.connectorCard} ${
                            expandido ? styles.connectorCardExpanded : ""
                          }`}
                          key={integracao.id}
                        >
                          <button
                            className={styles.connectorSummary}
                            onClick={() =>
                              setConectorExpandido(expandido ? null : integracao.id)
                            }
                            aria-expanded={expandido}
                          >
                            <span className={styles.connectorIcon}>
                              <Database size={22} />
                            </span>
                            <span className={styles.connectorInfo}>
                              <small>{integracao.tipo.toUpperCase()}</small>
                              <strong>{integracao.nome}</strong>
                              <em>{integracao.base_url}</em>
                            </span>
                            <span className={styles.connectorStatus}>
                              {statusIntegracaoLabel(integracao.status)}
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

                          {expandido ? (
                            <div className={styles.connectorForm}>
                              <div className={styles.connectorFormHeader}>
                                <div>
                                  <h4>Detalhes da conexão</h4>
                                  <p>
                                    {totalRotinas} rotina
                                    {totalRotinas === 1 ? "" : "s"} vinculada
                                    {totalRotinas === 1 ? "" : "s"}.
                                  </p>
                                </div>
                                <span>
                                  <ShieldCheck size={15} /> Credenciais protegidas
                                </span>
                              </div>

                              <div className={styles.reviewGrid}>
                                <div>
                                  <span>URL base</span>
                                  <strong>{integracao.base_url}</strong>
                                </div>
                                <div>
                                  <span>Código da empresa</span>
                                  <strong>
                                    {integracao.codigo_empresa || "Não informado"}
                                  </strong>
                                </div>
                                <div>
                                  <span>Status</span>
                                  <strong>
                                    {statusIntegracaoLabel(integracao.status)}
                                  </strong>
                                </div>
                                <div>
                                  <span>Último teste</span>
                                  <strong>
                                    {integracao.ultimo_teste_em
                                      ? formatarData(integracao.ultimo_teste_em)
                                      : "Ainda não testada"}
                                  </strong>
                                </div>
                              </div>

                              {integracao.ultimo_erro ? (
                                <div className={styles.warningBox}>
                                  <AlertTriangle size={19} />
                                  <div>
                                    <b>Último erro</b>
                                    <p>{integracao.ultimo_erro}</p>
                                  </div>
                                </div>
                              ) : null}

                              {podeGerenciar ? (
                                <div className={styles.connectorFormActions}>
                                  {integracao.status === "inativa" ? (
                                    <button
                                      className={styles.ghostButton}
                                      onClick={() =>
                                        void alterarStatusIntegracao(
                                          integracao,
                                          "nao_testada",
                                        )
                                      }
                                      disabled={processando}
                                    >
                                      {processando ? (
                                        <Loader2
                                          size={17}
                                          className={styles.spinning}
                                        />
                                      ) : (
                                        <RotateCcw size={17} />
                                      )}
                                      Reabrir conexão
                                    </button>
                                  ) : (
                                    <button
                                      className={styles.ghostButton}
                                      onClick={() =>
                                        void alterarStatusIntegracao(
                                          integracao,
                                          "inativa",
                                        )
                                      }
                                      disabled={processando}
                                    >
                                      {processando ? (
                                        <Loader2
                                          size={17}
                                          className={styles.spinning}
                                        />
                                      ) : (
                                        <Archive size={17} />
                                      )}
                                      Arquivar
                                    </button>
                                  )}
                                  <button
                                    className={styles.secondaryButton}
                                    style={{
                                      color: "var(--crm-danger-text)",
                                      borderColor: "var(--crm-danger-border)",
                                    }}
                                    onClick={() => void excluirIntegracao(integracao)}
                                    disabled={processando}
                                  >
                                    <Trash2 size={17} /> Excluir permanentemente
                                  </button>
                                </div>
                              ) : (
                                <div className={styles.infoBox}>
                                  <ShieldCheck size={19} />
                                  <div>
                                    <b>Acesso administrativo necessário</b>
                                    <p>
                                      Somente administradores podem arquivar ou
                                      excluir conexões.
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}

                    <article
                      className={`${styles.connectorCard} ${
                        conectorExpandido === "nova_conexao"
                          ? styles.connectorCardExpanded
                          : ""
                      }`}
                    >
                      <button
                        className={styles.connectorSummary}
                        onClick={() =>
                          setConectorExpandido(
                            conectorExpandido === "nova_conexao"
                              ? null
                              : "nova_conexao",
                          )
                        }
                        aria-expanded={conectorExpandido === "nova_conexao"}
                      >
                        <span className={styles.connectorIcon}>
                          <Plus size={22} />
                        </span>
                        <span className={styles.connectorInfo}>
                          <small>NOVA INTEGRAÇÃO</small>
                          <strong>Adicionar conexão REST</strong>
                          <em>
                            Cadastre URL, identificação e credencial fornecidas
                            pelo sistema externo.
                          </em>
                        </span>
                        <span className={styles.connectorStatus}>Cadastrar</span>
                        <ChevronDown
                          size={18}
                          className={
                            conectorExpandido === "nova_conexao"
                              ? styles.connectorChevronOpen
                              : styles.connectorChevron
                          }
                        />
                      </button>

                      {conectorExpandido === "nova_conexao" ? (
                        <div className={styles.connectorForm}>
                          <div className={styles.connectorFormHeader}>
                            <div>
                              <h4>Credenciais do sistema externo</h4>
                              <p>
                                Solicite os dados ao fornecedor da API ou do ERP.
                              </p>
                            </div>
                            <span>
                              <ShieldCheck size={15} /> Credenciais protegidas
                            </span>
                          </div>

                          <div className={styles.integrationFormGrid}>
                            <label className={styles.formField}>
                              <span>Nome da conexão *</span>
                              <input
                                value={nomeIntegracao}
                                onChange={(event) =>
                                  setNomeIntegracao(event.target.value)
                                }
                                placeholder="Ex.: ERP principal"
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
                              <span>URL base HTTPS *</span>
                              <input
                                value={baseUrl}
                                onChange={(event) => {
                                  setBaseUrl(event.target.value);
                                  setConexaoTestada(false);
                                  setMensagemTesteConexao("");
                                }}
                                placeholder="https://api.sistema.com.br/v1"
                                inputMode="url"
                              />
                            </label>
                            <label
                              className={`${styles.formField} ${styles.formFieldWide}`}
                            >
                              <span>Token de acesso</span>
                              <div className={styles.secretInput}>
                                <input
                                  type={mostrarTokenErp ? "text" : "password"}
                                  value={tokenErp}
                                  onChange={(event) => {
                                    setTokenErp(event.target.value);
                                    setConexaoTestada(false);
                                    setMensagemTesteConexao("");
                                  }}
                                  placeholder="Cole o token fornecido pelo sistema"
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

                          {conexaoTestada ? (
                            <div className={styles.connectionSuccess}>
                              <CheckCircle2 size={18} />
                              <div>
                                <b>Servidor alcançado</b>
                                <small>{mensagemTesteConexao}</small>
                              </div>
                            </div>
                          ) : null}

                          <div className={styles.connectorFormActions}>
                            <button
                              className={styles.ghostButton}
                              onClick={() => void testarConexaoErp()}
                              disabled={!baseUrl.trim() || testandoConexao}
                            >
                              {testandoConexao ? (
                                <Loader2
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
                              onClick={() => void criarIntegracao()}
                              disabled={
                                !nomeIntegracao.trim() ||
                                !baseUrl.trim() ||
                                salvando
                              }
                            >
                              {salvando ? (
                                <Loader2
                                  size={17}
                                  className={styles.spinning}
                                />
                              ) : (
                                <CheckCircle2 size={17} />
                              )}
                              Salvar conexão
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>

                    <article
                      className={`${styles.connectorCard} ${
                        conectorExpandido === "api_personalizada"
                          ? styles.connectorCardExpanded
                          : ""
                      }`}
                    >
                      <button
                        className={styles.connectorSummary}
                        onClick={() =>
                          setConectorExpandido(
                            conectorExpandido === "api_personalizada"
                              ? null
                              : "api_personalizada",
                          )
                        }
                        aria-expanded={conectorExpandido === "api_personalizada"}
                      >
                        <span className={styles.connectorIcon}>
                          <Code2 size={22} />
                        </span>
                        <span className={styles.connectorInfo}>
                          <small>INTEGRAÇÃO SOB MEDIDA</small>
                          <strong>API personalizada</strong>
                          <em>
                            Solicite a análise da documentação e homologação dos
                            endpoints.
                          </em>
                        </span>
                        <span
                          className={`${styles.connectorStatus} ${styles.connectorStatusCustom}`}
                        >
                          Sob consulta
                        </span>
                        <ChevronDown
                          size={18}
                          className={
                            conectorExpandido === "api_personalizada"
                              ? styles.connectorChevronOpen
                              : styles.connectorChevron
                          }
                        />
                      </button>

                      {conectorExpandido === "api_personalizada" ? (
                        <div className={styles.customConnectorBody}>
                          <MessageCircle size={22} />
                          <div>
                            <h4>Solicitar homologação</h4>
                            <p>
                              Envie a documentação da API para a equipe do CRM
                              Prosperity analisar autenticação, limites, endpoints
                              e formato dos dados.
                            </p>
                          </div>
                          <a
                            className={styles.secondaryButton}
                            href={CRM_WHATSAPP_HOMOLOGACAO}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Falar com o CRM <ChevronRight size={16} />
                          </a>
                        </div>
                      ) : null}
                    </article>
                  </div>
                </div>
              ) : (
                <div className={styles.integrationContent}>
                  <div className={styles.integrationIntro}>
                    <div>
                      <span className={styles.sectionLabel}>ACESSO EXTERNO</span>
                      <h3>Credenciais da API do CRM</h3>
                      <p>
                        Esta aba será usada quando outro sistema precisar enviar ou
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
                        <p>Endpoints públicos ainda não habilitados.</p>
                      </div>
                      <span className={styles.connectorStatus}>Em preparação</span>
                    </div>

                    <div className={styles.endpointBox}>
                      <span>Rota planejada</span>
                      <div>
                        <code>/api/v1</code>
                        <button
                          onClick={() =>
                            void copiarTexto("/api/v1", "Rota copiada.")
                          }
                          aria-label="Copiar rota"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </div>

                    <div className={styles.warningBox}>
                      <AlertTriangle size={19} />
                      <div>
                        <b>API pública ainda indisponível</b>
                        <p>
                          Nenhum token fictício será gerado. A emissão será
                          liberada quando autenticação, permissões e endpoints
                          públicos estiverem implementados.
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
