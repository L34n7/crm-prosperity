"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  CheckCircle2,
  Database,
  Filter,
  ListChecks,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Workflow,
  Zap,
} from "lucide-react";
import AutomationBuilderModal from "./AutomationBuilderModal";
import AutomationExecutionsModal from "./AutomationExecutionsModal";
import AutomationLifecycleModal from "./AutomationLifecycleModal";
import ExternalIntegrations from "./ExternalIntegrations";
import styles from "./automacoes-api.module.css";
import {
  acaoLabel,
  categoriaLabel,
  categorias,
  gatilhoLabel,
  metricasVazias,
  novoFormulario,
  opcoesVazias,
  statusLabel,
  type FormRotina,
  type Metricas,
  type Opcoes,
  type Rotina,
} from "./automation-catalog";

type Aba = "rotinas" | "integracoes";
type AcaoCiclo = { rotina: Rotina; modo: "pausar" | "arquivar" } | null;

export default function AutomacoesApiPage() {
  const [aba, setAba] = useState<Aba>("rotinas");
  const [rotinas, setRotinas] = useState<Rotina[]>([]);
  const [opcoes, setOpcoes] = useState<Opcoes>(opcoesVazias);
  const [metricas, setMetricas] = useState<Metricas>(metricasVazias);
  const [podeGerenciar, setPodeGerenciar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todas");
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas");
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<FormRotina>(novoFormulario);
  const [rotinaExecucoes, setRotinaExecucoes] = useState<Rotina | null>(null);
  const [acaoCiclo, setAcaoCiclo] = useState<AcaoCiclo>(null);

  const mostrarFeedback = useCallback((mensagem: string) => {
    setFeedback(mensagem);
    window.setTimeout(() => setFeedback(""), 3500);
  }, []);

  const mostrarErro = useCallback((mensagem: string) => {
    setErro(mensagem);
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const response = await fetch("/api/rotinas-automacao", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível carregar as automações.");
      }
      setRotinas(data.rotinas || []);
      setMetricas(data.metricas || metricasVazias);
      setOpcoes(data.opcoes || opcoesVazias);
      setPodeGerenciar(data.pode_gerenciar === true);
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
      const buscaOk =
        !termo ||
        rotina.nome.toLowerCase().includes(termo) ||
        rotina.descricao?.toLowerCase().includes(termo) ||
        rotina.gatilhos.some((item) => item.evento.toLowerCase().includes(termo));
      return (
        buscaOk &&
        (statusFiltro === "todas" || rotina.status === statusFiltro) &&
        (categoriaFiltro === "todas" || rotina.categoria === categoriaFiltro)
      );
    });
  }, [busca, categoriaFiltro, rotinas, statusFiltro]);

  function abrirNovaRotina() {
    setForm(novoFormulario());
    setErro("");
    setModalAberto(true);
  }

  function editarRotina(rotina: Rotina) {
    const gatilho = rotina.gatilhos[0] || novoFormulario().gatilho;
    setForm({
      id: rotina.id,
      nome: rotina.nome,
      descricao: rotina.descricao || "",
      categoria: rotina.categoria,
      status:
        rotina.status === "ativa"
          ? "ativa"
          : rotina.status === "rascunho"
            ? "rascunho"
            : "pausada",
      gatilho: { ...gatilho, configuracao_json: gatilho.configuracao_json || {} },
      condicoes: rotina.condicoes.map((item, ordem) => ({
        ...item,
        ordem,
        configuracao_json: item.configuracao_json || {},
      })),
      acoes: rotina.acoes.map((item, ordem) => ({
        ...item,
        ordem,
        configuracao_json: item.configuracao_json || {},
      })),
    });
    setErro("");
    setModalAberto(true);
  }

  function acaoInvalida() {
    return form.acoes.find((acao) => {
      const config = acao.configuracao_json;
      if (acao.tipo_acao === "fluxo.iniciar") return !config.fluxo_id;
      if (acao.tipo_acao === "whatsapp.enviar_template") {
        return !config.integracao_whatsapp_id || !config.template_id;
      }
      if (acao.tipo_acao === "email.enviar") {
        return !String(config.assunto || "").trim() || !String(config.mensagem || "").trim();
      }
      if (acao.tipo_acao === "contato.adicionar_etiqueta") return !config.etiqueta_id;
      if (acao.tipo_acao === "conversa.transferir_setor") return !config.setor_id;
      if (acao.tipo_acao === "integracao.consultar_api") {
        return !config.integracao_id || !String(config.endpoint || "").trim().startsWith("/");
      }
      return false;
    });
  }

  async function salvarRotina() {
    if (!form.nome.trim() || !form.gatilho.evento || !form.acoes.length) {
      setErro("Informe nome, gatilho e pelo menos uma ação.");
      return;
    }
    const invalida = acaoInvalida();
    if (invalida) {
      setErro(`Complete a configuração da ação “${acaoLabel(invalida.tipo_acao)}”.`);
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const response = await fetch("/api/rotinas-automacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id || null,
          rotina: {
            nome: form.nome.trim(),
            descricao: form.descricao.trim() || null,
            categoria: form.categoria,
            status: form.status,
            origem_tipo: "crm",
            configuracao_json: {},
            gatilhos: [form.gatilho],
            condicoes: form.condicoes.map((item, ordem) => ({ ...item, ordem })),
            acoes: form.acoes.map((item, ordem) => ({ ...item, ordem })),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível salvar a automação.");
      }
      setModalAberto(false);
      await carregar();
      mostrarFeedback(form.id ? "Automação atualizada com sucesso." : "Automação criada com sucesso.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar automação.");
    } finally {
      setSalvando(false);
    }
  }

  async function ativarRotina(rotina: Rotina) {
    setSalvando(true);
    setErro("");
    try {
      const response = await fetch(`/api/rotinas-automacao/${rotina.id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ativa", cancelar_pendentes: false }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Não foi possível ativar a automação.");
      await carregar();
      mostrarFeedback("Automação ativada. As assinaturas de eventos já estão atualizadas.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao ativar automação.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className={styles.page}>
      <Header
        title="Automações"
        subtitle="Automatize ações internas do CRM e integrações externas em um único lugar."
      />
      <div className={styles.content}>
        {feedback ? <div className={styles.feedback}><CheckCircle2 size={18} />{feedback}</div> : null}
        {erro ? <div className={styles.feedback} style={{ borderColor: "var(--crm-danger-border)", background: "var(--crm-danger-bg)", color: "var(--crm-danger-text)" }}><AlertTriangle size={18} />{erro}</div> : null}

        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <span className={styles.eyebrow}><Zap size={15} /> Motor de automação</span>
            <h1>Faça o CRM trabalhar sozinho quando algo acontecer.</h1>
            <p>Escolha o evento que inicia a rotina, defina as condições e combine ações do próprio CRM, Fluxos, WhatsApp, e-mail ou integrações externas.</p>
            <div className={styles.heroActions}>
              <button className={styles.primaryButton} onClick={abrirNovaRotina} disabled={!podeGerenciar}><Plus size={18} /> Nova automação</button>
              <button className={styles.secondaryButton} onClick={() => setAba("integracoes")}><Database size={18} /> Integrações</button>
              <button className={styles.secondaryButton} onClick={() => void carregar()} disabled={carregando}><RefreshCw size={17} /> Atualizar</button>
            </div>
          </div>
          <div className={styles.flowPreview} aria-label="Estrutura da automação">
            <div className={styles.flowNode}><Database size={20} /><span>Quando</span></div>
            <ArrowRight size={20} className={styles.flowArrow} />
            <div className={`${styles.flowNode} ${styles.flowNodeActive}`}><Filter size={20} /><span>Se</span></div>
            <ArrowRight size={20} className={styles.flowArrow} />
            <div className={styles.flowNode}><Zap size={20} /><span>Então</span></div>
          </div>
        </section>

        <section className={styles.metricsGrid}>
          <article className={styles.metricCard}><div className={styles.metricIcon}><Zap size={20} /></div><div><span>Rotinas ativas</span><strong>{metricas.rotinas_ativas}</strong><small>de {metricas.total_rotinas} configuradas</small></div></article>
          <article className={styles.metricCard}><div className={styles.metricIcon}><Activity size={20} /></div><div><span>Execuções em 30 dias</span><strong>{metricas.execucoes_30_dias}</strong><small>eventos processados</small></div></article>
          <article className={styles.metricCard}><div className={styles.metricIcon}><CheckCircle2 size={20} /></div><div><span>Taxa de execução</span><strong>{metricas.taxa_execucao === null ? "—" : `${metricas.taxa_execucao}%`}</strong><small>últimos 30 dias</small></div></article>
          <article className={styles.metricCard}><div className={`${styles.metricIcon} ${metricas.com_erro ? styles.metricIconDanger : ""}`}><AlertTriangle size={20} /></div><div><span>Precisam de atenção</span><strong>{metricas.com_erro}</strong><small>rotinas com falha</small></div></article>
        </section>

        <section className={styles.sectionCard}>
          <div className={styles.integrationTabs} role="tablist">
            <button className={aba === "rotinas" ? styles.integrationTabActive : ""} onClick={() => setAba("rotinas")}><Workflow size={17} /><span>Automações<small>Rotinas internas e externas</small></span></button>
            <button className={aba === "integracoes" ? styles.integrationTabActive : ""} onClick={() => setAba("integracoes")}><Database size={17} /><span>Integrações<small>Conexões com outros sistemas</small></span></button>
          </div>

          {aba === "rotinas" ? (
            <>
              <div className={styles.sectionHeader} style={{ marginTop: 20 }}>
                <div><span className={styles.sectionLabel}>ROTINAS DE AUTOMAÇÃO</span><h2>Automações configuradas</h2><p>Gatilho, condições, ações e execuções centralizados no mesmo módulo.</p></div>
                <button className={styles.primaryButton} onClick={abrirNovaRotina} disabled={!podeGerenciar}><Plus size={17} /> Criar automação</button>
              </div>
              <div className={styles.toolbar}>
                <label className={styles.searchBox}><Search size={18} /><input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar automação ou gatilho" /></label>
                <label className={styles.filterSelect}><Filter size={17} /><select value={categoriaFiltro} onChange={(event) => setCategoriaFiltro(event.target.value)}><option value="todas">Todas as áreas</option>{categorias.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
                <label className={styles.filterSelect}><Filter size={17} /><select value={statusFiltro} onChange={(event) => setStatusFiltro(event.target.value)}><option value="todas">Todos os status</option><option value="ativa">Ativas</option><option value="pausada">Pausadas</option><option value="rascunho">Rascunhos</option><option value="erro">Com erro</option></select></label>
              </div>
              {carregando ? <div style={{ padding: 40, textAlign: "center" }}><Loader2 className={styles.spinning} /> Carregando...</div> : null}
              {!carregando && !rotinasFiltradas.length ? <div style={{ padding: 42, textAlign: "center", color: "var(--crm-text-muted)" }}><Workflow size={34} /><h3>Nenhuma automação configurada</h3><p>Crie uma rotina escolhendo quando ela começa, quais condições precisa atender e o que deve fazer.</p></div> : null}
              <div className={styles.routineList}>
                {rotinasFiltradas.map((rotina) => (
                  <article className={styles.routineCard} key={rotina.id}>
                    <div className={styles.routineMain}>
                      <div className={styles.routineIcon}><Workflow size={22} /></div>
                      <div className={styles.routineInfo}>
                        <div className={styles.routineTitleLine}><h3>{rotina.nome}</h3><span className={`${styles.statusBadge} ${styles[`status_${rotina.status}`] || ""}`}>{statusLabel(rotina.status)}</span></div>
                        <p>{rotina.descricao || gatilhoLabel(rotina.gatilhos[0])}</p>
                        <div className={styles.routineTags}><span><Database size={14} />{categoriaLabel(rotina.categoria)}</span><span><Zap size={14} />{rotina.acoes.length} ação{rotina.acoes.length === 1 ? "" : "ões"}</span></div>
                      </div>
                    </div>
                    <div className={styles.routineSchedule}><span>Quando</span><strong>{gatilhoLabel(rotina.gatilhos[0])}</strong><small>{rotina.condicoes.length ? `${rotina.condicoes.length} condição(ões)` : "Sem condição"}</small></div>
                    <div className={styles.routineResult}><span>Execuções</span><strong>{rotina.metricas.execucoes_30_dias} em 30 dias</strong><small>{rotina.metricas.erros_30_dias ? `${rotina.metricas.erros_30_dias} com erro` : "Sem falhas registradas"}</small></div>
                    <div className={styles.routineActions}>
                      <button title="Ver execuções" onClick={() => setRotinaExecucoes(rotina)}><ListChecks size={17} /></button>
                      <button title="Editar" onClick={() => editarRotina(rotina)} disabled={!podeGerenciar || salvando}><Settings2 size={17} /></button>
                      <button
                        title={rotina.status === "ativa" ? "Pausar" : "Ativar"}
                        onClick={() => rotina.status === "ativa" ? setAcaoCiclo({ rotina, modo: "pausar" }) : void ativarRotina(rotina)}
                        disabled={!podeGerenciar || salvando}
                      >
                        {rotina.status === "ativa" ? <Pause size={17} /> : <Play size={17} />}
                      </button>
                      <button title="Arquivar" onClick={() => setAcaoCiclo({ rotina, modo: "arquivar" })} disabled={!podeGerenciar || salvando}><Archive size={17} /></button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : <ExternalIntegrations podeGerenciar={podeGerenciar} onFeedback={mostrarFeedback} onError={setErro} />}
        </section>
      </div>

      {modalAberto ? (
        <AutomationBuilderModal
          form={form}
          opcoes={opcoes}
          salvando={salvando}
          onChange={setForm}
          onClose={() => setModalAberto(false)}
          onSave={() => void salvarRotina()}
        />
      ) : null}

      {rotinaExecucoes ? (
        <AutomationExecutionsModal
          rotina={rotinaExecucoes}
          onClose={() => setRotinaExecucoes(null)}
          onFeedback={mostrarFeedback}
          onError={mostrarErro}
        />
      ) : null}

      {acaoCiclo ? (
        <AutomationLifecycleModal
          rotina={acaoCiclo.rotina}
          modo={acaoCiclo.modo}
          onClose={() => setAcaoCiclo(null)}
          onSuccess={carregar}
          onFeedback={mostrarFeedback}
          onError={mostrarErro}
        />
      ) : null}
    </main>
  );
}
