"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Loader2,
  RefreshCw,
  Workflow,
  X,
} from "lucide-react";
import { acaoLabel, formatarData, type Rotina } from "./automation-catalog";
import styles from "./automation-operations.module.css";

type Job = {
  id: string;
  execucao_id: string | null;
  acao_id: string | null;
  ordem: number;
  titulo: string | null;
  canal: string | null;
  depende_de_job_id: string | null;
  executar_em: string;
  status: string;
  status_exibicao: string;
  tentativas: number;
  max_tentativas: number;
  proxima_tentativa_em: string | null;
  erro: string | null;
  executado_em: string | null;
  cancelado_em: string | null;
  cancelamento_solicitado_em: string | null;
  tipo_acao: string | null;
};

type Execucao = {
  id: string;
  evento_chave: string | null;
  entidade_tipo: string | null;
  entidade_id: string | null;
  status: string;
  erro: string | null;
  iniciada_em: string;
  finalizada_em: string | null;
  referencia: string | null;
  resumo: {
    total: number;
    pendentes: number;
    processando: number;
    concluidas: number;
    canceladas: number;
    erros: number;
  };
  etapas: Job[];
};

type Dados = {
  pode_gerenciar: boolean;
  resumo: {
    execucoes: number;
    em_andamento: number;
    concluidas: number;
    com_erro: number;
    canceladas: number;
    etapas_ativas: number;
  };
  execucoes: Execucao[];
};

function statusLabel(status: string) {
  if (status === "iniciada") return "Iniciada";
  if (status === "processando") return "Processando";
  if (status === "concluida" || status === "concluido") return "Concluída";
  if (status === "pendente") return "Pendente";
  if (status === "ignorada") return "Ignorada";
  if (status === "cancelada" || status === "cancelado") return "Cancelada";
  if (status === "cancelamento_solicitado") return "Cancelamento solicitado";
  if (status === "erro") return "Erro";
  return status;
}

function badgeClass(status: string) {
  if (["concluida", "concluido"].includes(status)) return `${styles.badge} ${styles.badgeSuccess}`;
  if (["erro"].includes(status)) return `${styles.badge} ${styles.badgeDanger}`;
  if (["pendente", "cancelamento_solicitado"].includes(status)) return `${styles.badge} ${styles.badgeWarning}`;
  if (["processando", "iniciada"].includes(status)) return `${styles.badge} ${styles.badgePrimary}`;
  return styles.badge;
}

function tituloJob(job: Job) {
  if (job.titulo?.trim()) return job.titulo;
  if (job.tipo_acao) return acaoLabel(job.tipo_acao);
  return `Etapa ${job.ordem + 1}`;
}

function descricaoJob(job: Job) {
  if (job.status === "pendente") return `Programada para ${formatarData(job.executar_em)}`;
  if (job.status === "processando") {
    return job.cancelamento_solicitado_em
      ? `Cancelamento solicitado em ${formatarData(job.cancelamento_solicitado_em)}`
      : "Em processamento agora";
  }
  if (job.status === "concluido") return `Concluída em ${formatarData(job.executado_em)}`;
  if (job.status === "cancelado") return `Cancelada em ${formatarData(job.cancelado_em)}`;
  if (job.status === "erro") return job.erro || "A etapa terminou com erro.";
  return formatarData(job.executar_em);
}

export default function AutomationExecutionsModal({
  rotina,
  onClose,
  onFeedback,
  onError,
}: {
  rotina: Rotina;
  onClose: () => void;
  onFeedback: (mensagem: string) => void;
  onError: (mensagem: string) => void;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState<Job | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const response = await fetch(`/api/rotinas-automacao/${rotina.id}/execucoes`, {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Não foi possível carregar as execuções.");
      setDados(json);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erro ao carregar execuções.");
    } finally {
      setCarregando(false);
    }
  }, [onError, rotina.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const dependentesPorJob = useMemo(() => {
    const mapa = new Map<string, number>();
    const jobs = dados?.execucoes.flatMap((execucao) => execucao.etapas) || [];
    const filhos = new Map<string, string[]>();
    for (const job of jobs) {
      if (!job.depende_de_job_id) continue;
      filhos.set(job.depende_de_job_id, [...(filhos.get(job.depende_de_job_id) || []), job.id]);
    }
    const contar = (id: string, visitados = new Set<string>()): number => {
      if (visitados.has(id)) return 0;
      visitados.add(id);
      return (filhos.get(id) || []).reduce((total, filho) => 1 + total + contar(filho, visitados), 0);
    };
    for (const job of jobs) mapa.set(job.id, contar(job.id));
    return mapa;
  }, [dados]);

  function alternar(execucaoId: string) {
    setAbertas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(execucaoId)) proximo.delete(execucaoId);
      else proximo.add(execucaoId);
      return proximo;
    });
  }

  async function cancelarJob(job: Job) {
    setCancelando(job.id);
    try {
      const response = await fetch(`/api/rotinas-automacao/jobs/${job.id}/cancelar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelar_dependentes: true }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Não foi possível cancelar a etapa.");
      setConfirmar(null);
      await carregar();
      const dependentes = Number(json.resultado?.dependentes || 0);
      onFeedback(dependentes ? `Etapa e ${dependentes} dependente(s) cancelada(s).` : "Etapa cancelada.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erro ao cancelar etapa.");
    } finally {
      setCancelando(null);
    }
  }

  const resumo = dados?.resumo;

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label={`Execuções de ${rotina.nome}`}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <span className={styles.eyebrow}><Activity size={14} /> Execuções da automação</span>
            <h2>{rotina.nome}</h2>
            <p>Acompanhe cada execução e cada etapa operacional, incluindo ações pendentes, concluídas, canceladas e com erro.</p>
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Fechar"><X size={19} /></button>
        </header>

        <div className={styles.body}>
          {resumo ? (
            <div className={styles.metrics}>
              <div className={styles.metric}><span>Execuções</span><strong>{resumo.execucoes}</strong></div>
              <div className={styles.metric}><span>Em andamento</span><strong>{resumo.em_andamento}</strong></div>
              <div className={styles.metric}><span>Concluídas</span><strong>{resumo.concluidas}</strong></div>
              <div className={styles.metric}><span>Etapas ativas</span><strong>{resumo.etapas_ativas}</strong></div>
              <div className={styles.metric}><span>Com erro</span><strong>{resumo.com_erro}</strong></div>
            </div>
          ) : null}

          <div className={styles.toolbar}>
            <p>As execuções mais recentes aparecem primeiro. Etapas futuras permanecem rastreáveis até serem concluídas ou canceladas.</p>
            <button className={styles.refreshButton} onClick={() => void carregar()} disabled={carregando}>
              {carregando ? <Loader2 size={15} /> : <RefreshCw size={15} />} Atualizar
            </button>
          </div>

          {carregando && !dados ? <div className={styles.loading}>Carregando execuções...</div> : null}
          {!carregando && dados && !dados.execucoes.length ? <div className={styles.empty}>Esta automação ainda não possui execuções registradas.</div> : null}

          <div className={styles.list}>
            {dados?.execucoes.map((execucao) => {
              const aberta = abertas.has(execucao.id);
              return (
                <article className={styles.groupCard} key={execucao.id}>
                  <button className={styles.groupHeader} onClick={() => alternar(execucao.id)}>
                    <div className={styles.groupIdentity}>
                      <div className={styles.groupTitleRow}>
                        <div className={styles.groupIcon}><Workflow size={20} /></div>
                        <div className={styles.groupTitle}>
                          <strong>{execucao.referencia || `Execução ${execucao.id.slice(0, 8)}`}</strong>
                          <small>{execucao.evento_chave || "Evento da automação"} · {formatarData(execucao.iniciada_em)}</small>
                        </div>
                      </div>
                      <div className={styles.groupStatus}>
                        <span className={badgeClass(execucao.status)}>{statusLabel(execucao.status)}</span>
                        {aberta ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                      </div>
                    </div>
                    <div className={styles.groupStats}>
                      <span><strong>{execucao.resumo.total}</strong> etapas</span>
                      {execucao.resumo.concluidas ? <span>{execucao.resumo.concluidas} concluídas</span> : null}
                      {execucao.resumo.pendentes + execucao.resumo.processando ? <span>{execucao.resumo.pendentes + execucao.resumo.processando} pendentes</span> : null}
                      {execucao.resumo.erros ? <span>{execucao.resumo.erros} com erro</span> : null}
                      {execucao.resumo.canceladas ? <span>{execucao.resumo.canceladas} canceladas</span> : null}
                    </div>
                  </button>

                  {aberta ? (
                    <div className={styles.groupItems}>
                      {!execucao.etapas.length ? <div className={styles.empty}>Nenhuma etapa materializada nesta execução.</div> : null}
                      {execucao.etapas.map((job, index) => {
                        const cancelavel = ["pendente", "processando"].includes(job.status) && dados.pode_gerenciar;
                        return (
                          <div className={styles.groupItem} key={job.id}>
                            <div className={styles.stepIndex}>{String(index + 1).padStart(2, "0")}</div>
                            <div className={styles.stepInfo}>
                              <strong>{tituloJob(job)}</strong>
                              <small>{descricaoJob(job)}{job.canal ? ` · ${job.canal === "email" ? "E-mail" : job.canal === "whatsapp" ? "WhatsApp" : job.canal}` : ""}</small>
                            </div>
                            <div className={styles.stepActions}>
                              <span className={badgeClass(job.status_exibicao)}>
                                {job.status === "concluido" ? <CheckCircle2 size={12} /> : job.status === "erro" ? <AlertTriangle size={12} /> : job.status === "cancelado" ? <Ban size={12} /> : <Clock3 size={12} />}
                                {statusLabel(job.status_exibicao)}
                              </span>
                              {cancelavel ? <button className={styles.cancelStep} onClick={() => setConfirmar(job)} disabled={cancelando === job.id}>Cancelar</button> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        {confirmar ? (
          <div className={styles.confirmBackdrop}>
            <div className={styles.confirmCard}>
              <h3>Cancelar esta etapa?</h3>
              <p>
                “{tituloJob(confirmar)}” será cancelada. {dependentesPorJob.get(confirmar.id) ? `Também existem ${dependentesPorJob.get(confirmar.id)} etapa(s) dependente(s), que serão canceladas para não deixar a execução inconsistente.` : "Não há etapas dependentes registradas."}
              </p>
              <div className={styles.confirmActions}>
                <button className={styles.secondaryButton} onClick={() => setConfirmar(null)} disabled={Boolean(cancelando)}>Voltar</button>
                <button className={styles.dangerButton} onClick={() => void cancelarJob(confirmar)} disabled={Boolean(cancelando)}>
                  {cancelando ? <Loader2 size={15} /> : <Ban size={15} />} Cancelar etapa
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
