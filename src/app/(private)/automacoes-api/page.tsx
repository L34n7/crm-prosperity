"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Code2,
  Database,
  Filter,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
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

type Template = { id: string; nome: string; status: string };
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

export default function AutomacoesApiPage() {
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [rotinas, setRotinas] = useState<Rotina[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [metricas, setMetricas] = useState(metricasVazias);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todas");
  const [modal, setModal] = useState<"integracao" | "rotina" | null>(null);

  const [nomeIntegracao, setNomeIntegracao] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [codigoEmpresa, setCodigoEmpresa] = useState("");

  const [nomeRotina, setNomeRotina] = useState("");
  const [integracaoId, setIntegracaoId] = useState("");
  const [consultaChave, setConsultaChave] = useState("personalizada");
  const [endpoint, setEndpoint] = useState("");
  const [metodo, setMetodo] = useState<"GET" | "POST">("GET");
  const [templateId, setTemplateId] = useState("");
  const [frequencia, setFrequencia] = useState<"diaria" | "semanal" | "mensal">("diaria");
  const [horario, setHorario] = useState("09:00");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const response = await fetch("/api/automacoes-api", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Não foi possível carregar as automações.");
      setIntegracoes(data.integracoes || []);
      setRotinas(data.rotinas || []);
      setTemplates(data.templates || []);
      setMetricas(data.metricas || metricasVazias);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar a página.");
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
      return correspondeBusca && (statusFiltro === "todas" || rotina.status === statusFiltro);
    });
  }, [busca, rotinas, statusFiltro]);

  async function requisicao(body: Record<string, unknown>, method = "POST") {
    setSalvando(true);
    setErro("");
    try {
      const response = await fetch("/api/automacoes-api", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
      await carregar();
      return true;
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function criarIntegracao() {
    const ok = await requisicao({
      acao: "criar_integracao",
      nome: nomeIntegracao,
      base_url: baseUrl,
      codigo_empresa: codigoEmpresa,
    });
    if (!ok) return;
    setModal(null);
    setNomeIntegracao("");
    setBaseUrl("");
    setCodigoEmpresa("");
    setFeedback("Conexão cadastrada. Agora configure a autenticação homologada do sistema externo.");
  }

  async function criarRotina() {
    const ok = await requisicao({
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
    if (!ok) return;
    setModal(null);
    setNomeRotina("");
    setEndpoint("");
    setFeedback("Automação criada pausada. Ative somente após homologar a resposta da API.");
  }

  async function alternarStatus(rotina: Rotina) {
    await requisicao({ id: rotina.id, status: rotina.status === "ativa" ? "pausada" : "ativa" }, "PATCH");
  }

  return (
    <main className={styles.page}>
      <Header title="Automações por API" subtitle="Conecte sistemas externos e acompanhe rotinas reais, sem dados demonstrativos." />
      <div className={styles.content}>
        {feedback ? <div className={styles.feedback}><CheckCircle2 size={18} />{feedback}</div> : null}
        {erro ? <div className={styles.feedback} style={{ borderColor: "var(--crm-danger-border)", background: "var(--crm-danger-bg)", color: "var(--crm-danger-text)" }}><AlertTriangle size={18} />{erro}</div> : null}

        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <span className={styles.eyebrow}><Workflow size={15} /> Dados reais</span>
            <h1>Automatize consultas externas com controle e rastreabilidade.</h1>
            <p>Cadastre a conexão do sistema, configure o endpoint e associe um template aprovado. Métricas só aparecem depois de execuções reais.</p>
            <div className={styles.heroActions}>
              <button className={styles.primaryButton} onClick={() => setModal("rotina")} disabled={!integracoes.length}><Plus size={18} /> Nova automação</button>
              <button className={styles.secondaryButton} onClick={() => setModal("integracao")}><Code2 size={18} /> Nova conexão</button>
              <button className={styles.secondaryButton} onClick={() => void carregar()} disabled={carregando}><RefreshCw size={17} /> Atualizar</button>
            </div>
          </div>
          <div className={styles.flowPreview} aria-label="Fluxo da automação">
            <div className={styles.flowNode}><Database size={20} /><span>API externa</span></div>
            <ArrowRight size={20} className={styles.flowArrow} />
            <div className={`${styles.flowNode} ${styles.flowNodeActive}`}><Filter size={20} /><span>Rotina</span></div>
            <ArrowRight size={20} className={styles.flowArrow} />
            <div className={styles.flowNode}><Send size={20} /><span>WhatsApp</span></div>
          </div>
        </section>

        <section className={styles.metricsGrid}>
          <article className={styles.metricCard}><div className={styles.metricIcon}><Zap size={20} /></div><div><span>Rotinas ativas</span><strong>{metricas.rotinas_ativas}</strong><small>de {metricas.total_rotinas} configuradas</small></div></article>
          <article className={styles.metricCard}><div className={styles.metricIcon}><Send size={20} /></div><div><span>Envios em 30 dias</span><strong>{metricas.enviados_30_dias}</strong><small>mensagens registradas</small></div></article>
          <article className={styles.metricCard}><div className={styles.metricIcon}><Activity size={20} /></div><div><span>Taxa de execução</span><strong>{metricas.taxa_execucao === null ? "—" : `${metricas.taxa_execucao}%`}</strong><small>{metricas.taxa_execucao === null ? "sem execuções concluídas" : "últimos 30 dias"}</small></div></article>
          <article className={styles.metricCard}><div className={`${styles.metricIcon} ${metricas.com_erro ? styles.metricIconDanger : ""}`}><AlertTriangle size={20} /></div><div><span>Precisam de atenção</span><strong>{metricas.com_erro}</strong><small>{metricas.com_erro ? "verifique os erros" : "nenhuma falha registrada"}</small></div></article>
        </section>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}><div><span className={styles.sectionLabel}>ROTINAS REAIS</span><h2>Automações configuradas</h2><p>Somente registros persistidos para a empresa atual.</p></div></div>
          <div className={styles.toolbar}>
            <label className={styles.searchBox}><Search size={18} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, consulta ou endpoint" /></label>
            <label className={styles.filterSelect}><Filter size={17} /><select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}><option value="todas">Todos os status</option><option value="ativa">Ativas</option><option value="pausada">Pausadas</option><option value="erro">Com erro</option></select></label>
          </div>

          {carregando ? <div style={{ padding: 40, textAlign: "center" }}><Loader2 className="animate-spin" /> Carregando dados reais...</div> : null}
          {!carregando && !rotinasFiltradas.length ? <div style={{ padding: 42, textAlign: "center", color: "var(--crm-text-muted)" }}><Workflow size={34} /><h3>Nenhuma automação configurada</h3><p>Cadastre uma conexão e crie a primeira rotina. Nenhum exemplo fictício será exibido.</p></div> : null}

          <div className={styles.routineList}>
            {rotinasFiltradas.map((rotina) => (
              <article className={styles.routineCard} key={rotina.id}>
                <div className={styles.routineMain}><div className={styles.routineIcon}><Workflow size={22} /></div><div className={styles.routineInfo}><div className={styles.routineTitleLine}><h3>{rotina.nome}</h3><span className={`${styles.statusBadge} ${styles[`status_${rotina.status}`]}`}>{statusLabel(rotina.status)}</span></div><p>{rotina.metodo} {rotina.endpoint}</p><div className={styles.routineTags}><span><Database size={14} />{rotina.consulta_chave}</span><span><Send size={14} />{templates.find((item) => item.id === rotina.template_id)?.nome || "Sem template"}</span></div></div></div>
                <div className={styles.routineSchedule}><span>Próxima execução</span><strong>{formatarData(rotina.proxima_execucao_em)}</strong><small>{rotina.frequencia} às {rotina.horario.slice(0, 5)}</small></div>
                <div className={styles.routineResult}><span>Última execução</span><strong>{formatarData(rotina.ultima_execucao_em)}</strong><small>{rotina.total_processados || 0} processados</small></div>
                <div className={styles.routineActions}><button title={rotina.status === "ativa" ? "Pausar" : "Ativar"} onClick={() => void alternarStatus(rotina)} disabled={salvando}>{rotina.status === "ativa" ? <Pause size={17} /> : <Play size={17} />}</button><button title="Configuração persistida"><Settings2 size={17} /></button></div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.catalogCard}>
          <div className={styles.sectionHeader}><div><span className={styles.sectionLabel}>CONEXÕES CADASTRADAS</span><h2>Sistemas externos</h2><p>Os exemplos genéricos foram removidos. Aqui aparecem apenas conexões reais da empresa.</p></div><button className={styles.secondaryButton} onClick={() => setModal("integracao")}><Plus size={17} /> Adicionar conexão</button></div>
          <div className={styles.catalogGrid}>
            {integracoes.map((integracao) => <article className={styles.queryCard} key={integracao.id}><div className={styles.queryTop}><div className={styles.queryIcon}><Database size={20} /></div><span>{integracao.tipo}</span></div><h3>{integracao.nome}</h3><p>{integracao.base_url}</p><div className={styles.fieldPreview}><span>{integracao.status}</span>{integracao.codigo_empresa ? <span>empresa: {integracao.codigo_empresa}</span> : null}</div></article>)}
          </div>
        </section>
      </div>

      {modal ? <div className={styles.modalBackdrop} onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}><section className={styles.modal} role="dialog" aria-modal="true"><header className={styles.modalHeader}><div><span className={styles.modalBadge}>{modal === "integracao" ? <Code2 size={14} /> : <Workflow size={14} />}{modal === "integracao" ? "Nova conexão" : "Nova automação"}</span><h2>{modal === "integracao" ? "Cadastrar sistema externo" : "Configurar rotina"}</h2></div><button className={styles.closeButton} onClick={() => setModal(null)}><X size={20} /></button></header><div className={styles.modalBody}><div className={styles.stepContent}>
        {modal === "integracao" ? <>
          <label className={styles.formField}><span>Nome da conexão</span><input value={nomeIntegracao} onChange={(e) => setNomeIntegracao(e.target.value)} placeholder="Ex.: ERP do provedor" /></label>
          <label className={styles.formField}><span>URL base HTTPS</span><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.sistema.com.br" /></label>
          <label className={styles.formField}><span>Código da empresa (opcional)</span><input value={codigoEmpresa} onChange={(e) => setCodigoEmpresa(e.target.value)} /></label>
        </> : <>
          <label className={styles.formField}><span>Nome da automação</span><input value={nomeRotina} onChange={(e) => setNomeRotina(e.target.value)} /></label>
          <label className={styles.formField}><span>Conexão</span><select value={integracaoId} onChange={(e) => setIntegracaoId(e.target.value)}><option value="">Selecione</option>{integracoes.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
          <label className={styles.formField}><span>Identificador da consulta</span><input value={consultaChave} onChange={(e) => setConsultaChave(e.target.value)} placeholder="Ex.: clientes_inadimplentes" /></label>
          <label className={styles.formField}><span>Endpoint</span><input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="/clientes/inadimplentes" /></label>
          <label className={styles.formField}><span>Método</span><select value={metodo} onChange={(e) => setMetodo(e.target.value as "GET" | "POST")}><option>GET</option><option>POST</option></select></label>
          <label className={styles.formField}><span>Template aprovado</span><select value={templateId} onChange={(e) => setTemplateId(e.target.value)}><option value="">Sem template</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
          <label className={styles.formField}><span>Frequência</span><select value={frequencia} onChange={(e) => setFrequencia(e.target.value as typeof frequencia)}><option value="diaria">Diária</option><option value="semanal">Semanal</option><option value="mensal">Mensal</option></select></label>
          <label className={styles.formField}><span>Horário</span><input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} /></label>
        </>}
      </div></div><footer className={styles.modalFooter}><button className={styles.ghostButton} onClick={() => setModal(null)}>Cancelar</button><button className={styles.primaryButton} disabled={salvando} onClick={() => void (modal === "integracao" ? criarIntegracao() : criarRotina())}>{salvando ? <Loader2 size={17} /> : <CheckCircle2 size={17} />} Salvar</button></footer></section></div> : null}
    </main>
  );
}
