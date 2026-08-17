"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, Loader2, Pause, X } from "lucide-react";
import { acaoLabel, formatarData, type Rotina } from "./automation-catalog";
import styles from "./automation-operations.module.css";

type Etapa = {
  id: string;
  ordem: number;
  titulo: string | null;
  tipo_acao: string | null;
  status: string;
  executar_em: string;
  cancelamento_solicitado_em: string | null;
};

type Execucao = {
  id: string;
  referencia: string | null;
  iniciada_em: string;
  etapas: Etapa[];
};

type Dados = { execucoes: Execucao[]; resumo: { etapas_ativas: number; etapas_pendentes: number; etapas_processando: number } };

function tituloEtapa(etapa: Etapa) {
  return etapa.titulo || (etapa.tipo_acao ? acaoLabel(etapa.tipo_acao) : `Etapa ${etapa.ordem + 1}`);
}

export default function AutomationLifecycleModal({
  rotina,
  modo,
  onClose,
  onSuccess,
  onFeedback,
  onError,
}: {
  rotina: Rotina;
  modo: "pausar" | "arquivar";
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  onFeedback: (mensagem: string) => void;
  onError: (mensagem: string) => void;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const response = await fetch(`/api/rotinas-automacao/${rotina.id}/execucoes`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Não foi possível verificar processos em andamento.");
      setDados(json);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erro ao verificar execuções.");
    } finally {
      setCarregando(false);
    }
  }, [onError, rotina.id]);

  useEffect(() => { void carregar(); }, [carregar]);

  const ativas = useMemo(() =>
    dados?.execucoes.flatMap((execucao) =>
      execucao.etapas
        .filter((etapa) => ["pendente", "processando"].includes(etapa.status))
        .map((etapa) => ({ ...etapa, execucao })),
    ) || [], [dados]);

  async function alterar(cancelarPendentes: boolean) {
    setSalvando(true);
    try {
      const status = modo === "pausar" ? "pausada" : "arquivada";
      const response = await fetch(`/api/rotinas-automacao/${rotina.id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, cancelar_pendentes: cancelarPendentes }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Não foi possível alterar a automação.");
      await onSuccess();
      onFeedback(
        modo === "pausar"
          ? cancelarPendentes ? "Automação pausada e processos pendentes cancelados." : "Automação pausada. Processos existentes foram mantidos."
          : cancelarPendentes ? "Automação arquivada e processos pendentes cancelados." : "Automação arquivada. Processos existentes foram mantidos.",
      );
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erro ao alterar automação.");
    } finally {
      setSalvando(false);
    }
  }

  const verbo = modo === "pausar" ? "Pausar" : "Excluir";
  const Icone = modo === "pausar" ? Pause : Archive;

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !salvando && onClose()}>
      <section className={`${styles.modal} ${styles.modalCompact}`} role="dialog" aria-modal="true">
        <header className={styles.header}>
          <div className={styles.headerText}>
            <span className={styles.eyebrow}><Icone size={14} /> {verbo} automação</span>
            <h2>{rotina.nome}</h2>
            <p>{modo === "pausar" ? "Novos gatilhos deixarão de iniciar esta automação imediatamente." : "A automação será arquivada e não receberá novos gatilhos, mantendo o histórico para auditoria."}</p>
          </div>
          <button className={styles.closeButton} onClick={onClose} disabled={salvando} aria-label="Fechar"><X size={19} /></button>
        </header>

        <div className={styles.body}>
          {carregando ? <div className={styles.loading}>Verificando processos em andamento...</div> : null}
          {!carregando && dados ? (
            <>
              <div className={styles.lifecycleNotice}>
                <AlertTriangle size={20} />
                <div>
                  <strong>{ativas.length ? `${ativas.length} etapa(s) ainda estão em andamento.` : "Não há etapas pendentes nesta automação."}</strong>
                  <p>{ativas.length ? "Você pode manter o que já foi iniciado ou cancelar as etapas pendentes. Etapas que já terminaram permanecem somente no histórico." : "A alteração pode ser feita sem afetar nenhum processo em andamento."}</p>
                </div>
              </div>

              {ativas.length ? (
                <div className={styles.activeList}>
                  {ativas.map((item) => (
                    <div className={styles.activeItem} key={item.id}>
                      <div className={styles.activeItemTop}>
                        <strong>{tituloEtapa(item)}</strong>
                        <span className={item.status === "processando" ? `${styles.badge} ${styles.badgePrimary}` : `${styles.badge} ${styles.badgeWarning}`}>
                          {item.status === "processando" ? "Processando" : "Pendente"}
                        </span>
                      </div>
                      <p>{item.execucao.referencia || `Execução ${item.execucao.id.slice(0, 8)}`} · {item.status === "pendente" ? `programada para ${formatarData(item.executar_em)}` : `iniciada em ${formatarData(item.execucao.iniciada_em)}`}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <footer className={styles.footer}>
          <button className={styles.secondaryButton} onClick={onClose} disabled={salvando}>Voltar</button>
          {ativas.length ? (
            <button className={styles.secondaryButton} onClick={() => void alterar(false)} disabled={salvando || carregando}>
              {salvando ? <Loader2 size={15} /> : <Icone size={15} />} {modo === "pausar" ? "Pausar e manter processos" : "Arquivar e manter processos"}
            </button>
          ) : null}
          <button className={modo === "arquivar" || ativas.length ? styles.dangerButton : styles.primaryButton} onClick={() => void alterar(ativas.length > 0)} disabled={salvando || carregando}>
            {salvando ? <Loader2 size={15} /> : <Icone size={15} />} {ativas.length ? (modo === "pausar" ? "Cancelar todos e pausar" : "Cancelar todos e arquivar") : (modo === "pausar" ? "Pausar automação" : "Arquivar automação")}
          </button>
        </footer>
      </section>
    </div>
  );
}
