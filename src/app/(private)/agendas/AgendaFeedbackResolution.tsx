"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Ban,
  Check,
  CircleDollarSign,
  ListPlus,
  RefreshCw,
  UserRound,
  X,
} from "lucide-react";
import styles from "./AgendaFeedbackResolution.module.css";

type FinalStatus = "realizado" | "faltou" | "cancelado";
type AtendimentoClassificacao = "qualificado" | "convertido" | "perdido";

type ListaOption = {
  id: string;
  nome: string;
};

type FeedbackItem = {
  id: string;
  agenda_id?: string | null;
  titulo?: string | null;
  nome_cliente?: string | null;
  contato_id?: string | null;
  conversa_id?: string | null;
  contatos?:
    | { id?: string; nome?: string | null; classificacao?: string | null }
    | Array<{ id?: string; nome?: string | null; classificacao?: string | null }>
    | null;
};

type Draft = {
  agendamentoId: string;
  contatoId: string | null;
  nomeCliente: string;
  status: FinalStatus;
  resultado: string;
  observacoesInternas: string;
  classificacao: AtendimentoClassificacao;
  valorVenda: string;
  listaId: string;
};

const classificacoes = new Set<AtendimentoClassificacao>([
  "qualificado",
  "convertido",
  "perdido",
]);

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

export default function AgendaFeedbackResolution() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [listas, setListas] = useState<ListaOption[]>([]);
  const [actionsTarget, setActionsTarget] = useState<Element | null>(null);
  const [modalTarget, setModalTarget] = useState<Element | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const feedbackAtual = feedbacks[0] || null;

  const loadFeedback = useCallback(async () => {
    try {
      const response = await fetch("/api/agendas/feedback", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.ok) return;
      setFeedbacks(Array.isArray(data.pendencias) ? data.pendencias : []);
      setListas(Array.isArray(data.listas) ? data.listas : []);
    } catch {
      // Mantém a Agenda utilizável mesmo se a consulta de feedback falhar.
    }
  }, []);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  useEffect(() => {
    const resolveTargets = () => {
      const target = document.querySelector(".feedbackActions");
      const root = document.querySelector(".a2");

      setActionsTarget(target);
      setModalTarget(root);

      if (target instanceof HTMLElement) {
        target.classList.add(styles.actionsHost);
      }

      document
        .querySelectorAll<HTMLElement>(
          ".feedbackActions .feedbackSuccess:not([data-agenda-feedback-resolution]), .feedbackActions .feedbackMissed:not([data-agenda-feedback-resolution])",
        )
        .forEach((button) => {
          button.style.display = "none";
        });
    };

    resolveTargets();
    const observer = new MutationObserver(resolveTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document
        .querySelector(".feedbackActions")
        ?.classList.remove(styles.actionsHost);
    };
  }, [feedbacks.length]);

  const nomeCliente = useMemo(() => {
    if (!feedbackAtual) return "Contato";
    const contato = relationOne(feedbackAtual.contatos);
    return feedbackAtual.nome_cliente || contato?.nome || "Contato";
  }, [feedbackAtual]);

  const abrirModal = (status: FinalStatus) => {
    if (!feedbackAtual) return;
    const contato = relationOne(feedbackAtual.contatos);
    const rawClassificacao = String(contato?.classificacao || "").toLowerCase();
    const classificacao = classificacoes.has(
      rawClassificacao as AtendimentoClassificacao,
    )
      ? (rawClassificacao as AtendimentoClassificacao)
      : "qualificado";

    setError("");
    setDraft({
      agendamentoId: feedbackAtual.id,
      contatoId: feedbackAtual.contato_id || contato?.id || null,
      nomeCliente,
      status,
      resultado: "",
      observacoesInternas: "",
      classificacao,
      valorVenda: "",
      listaId: "",
    });
  };

  const salvar = async () => {
    if (!draft) return;
    const valorVenda =
      draft.classificacao === "convertido" ? Number(draft.valorVenda) : null;
    if (
      draft.classificacao === "convertido" &&
      (!Number.isFinite(valorVenda) || Number(valorVenda) <= 0)
    ) {
      setError("Informe um valor de venda maior que zero.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      const response = await fetch("/api/agendas/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agendamento_id: draft.agendamentoId,
          resposta: draft.status,
          resultado: draft.resultado,
          observacoes_internas: draft.observacoesInternas,
          classificacao_atendimento: draft.classificacao,
          valor_venda: valorVenda,
          lista_id: draft.listaId || null,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Não foi possível finalizar o atendimento.");
      }

      setDraft(null);
      await loadFeedback();
      window.location.reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível finalizar o atendimento.",
      );
    } finally {
      setBusy(false);
    }
  };

  const modal = draft ? (
    <div
      className="modalbg"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) setDraft(null);
      }}
    >
      <div
        className={`modal ${styles.modal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agenda-feedback-resolution-title"
      >
        <div className="dhead">
          <div className={styles.modalIcon}>
            <CircleDollarSign size={19} />
          </div>
          <div>
            <h2 id="agenda-feedback-resolution-title">Finalizar atendimento</h2>
            <p>
              Registre o resultado do agendamento de {draft.nomeCliente} e a
              classificação comercial do contato.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => setDraft(null)}
            disabled={busy}
            aria-label="Fechar"
          >
            <X size={15} />
          </button>
        </div>

        <div className="body">
          <section className="section">
            <h3>
              <Check size={15} />
              Resultado e informações internas
            </h3>
            <div className="form">
              <div className="field">
                <label>Status final</label>
                <select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            status: event.target.value as FinalStatus,
                          }
                        : current,
                    )
                  }
                >
                  <option value="realizado">Realizado</option>
                  <option value="faltou">Não realizado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div className="field">
                <label>Resumo do resultado</label>
                <input
                  value={draft.resultado}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, resultado: event.target.value }
                        : current,
                    )
                  }
                  placeholder="Ex.: proposta enviada"
                />
              </div>
              <div className="field full">
                <label>Observações internas</label>
                <textarea
                  value={draft.observacoesInternas}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            observacoesInternas: event.target.value,
                          }
                        : current,
                    )
                  }
                />
              </div>
            </div>
          </section>

          <section className={`section ${styles.commercialSection}`}>
            <h3>
              <UserRound size={15} />
              Classificação do atendimento
            </h3>
            <p className={styles.sectionHint}>
              A classificação será salva diretamente no contato vinculado ao
              agendamento.
            </p>
            <div className="form">
              <div className="field full">
                <label>Classificação</label>
                <select
                  value={draft.classificacao}
                  onChange={(event) => {
                    const classificacao =
                      event.target.value as AtendimentoClassificacao;
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            classificacao,
                            valorVenda:
                              classificacao === "convertido"
                                ? current.valorVenda
                                : "",
                          }
                        : current,
                    );
                  }}
                >
                  <option value="qualificado">Qualificado</option>
                  <option value="convertido">Convertido</option>
                  <option value="perdido">Perdido</option>
                </select>
              </div>

              {draft.classificacao === "convertido" ? (
                <div className="field full">
                  <label>Valor da venda*</label>
                  <div className={styles.moneyField}>
                    <span>R$</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={draft.valorVenda}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? { ...current, valorVenda: event.target.value }
                            : current,
                        )
                      }
                      placeholder="0,00"
                    />
                  </div>
                  <small className={styles.saleHint}>
                    Será registrado como Resultado comercial nos detalhes do
                    contato.
                  </small>
                </div>
              ) : null}
            </div>
          </section>

          <section className={`section ${styles.listSection}`}>
            <h3>
              <ListPlus size={15} />
              Organização do contato
            </h3>
            <p className={styles.sectionHint}>
              Opcionalmente, adicione o contato a uma das listas usadas no módulo
              Conversas.
            </p>
            <div className="form">
              <div className="field full">
                <label>Definir contato em lista</label>
                <select
                  value={draft.listaId}
                  disabled={!draft.contatoId || listas.length === 0}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, listaId: event.target.value }
                        : current,
                    )
                  }
                >
                  <option value="">Não alterar lista</option>
                  {listas.map((lista) => (
                    <option key={lista.id} value={lista.id}>
                      {lista.nome}
                    </option>
                  ))}
                </select>
                <small className={styles.saleHint}>
                  {!draft.contatoId
                    ? "Este agendamento não possui um contato vinculado."
                    : listas.length === 0
                      ? "Nenhuma lista foi criada no módulo Conversas."
                      : "A lista só será aplicada quando você salvar o resultado."}
                </small>
              </div>
            </div>
          </section>

          {error ? <div className={styles.error}>{error}</div> : null}
        </div>

        <div className="foot">
          <button
            type="button"
            className="btn"
            onClick={() => setDraft(null)}
            disabled={busy}
          >
            Voltar
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void salvar()}
            disabled={busy}
          >
            {busy ? (
              <RefreshCw className="spin" size={15} />
            ) : (
              <Check size={15} />
            )}
            Salvar resultado
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {actionsTarget && feedbackAtual
        ? createPortal(
            <div className={styles.actionGroup}>
              <button
                type="button"
                className="btn feedbackSuccess"
                data-agenda-feedback-resolution="true"
                onClick={() => abrirModal("realizado")}
              >
                <Check size={13} />
                Realizado
              </button>
              <button
                type="button"
                className="btn feedbackMissed"
                data-agenda-feedback-resolution="true"
                onClick={() => abrirModal("faltou")}
              >
                <X size={13} />
                Não realizado
              </button>
              <button
                type="button"
                className={`btn danger ${styles.cancelButton}`}
                data-agenda-feedback-resolution="true"
                onClick={() => abrirModal("cancelado")}
              >
                <Ban size={13} />
                Cancelado
              </button>
            </div>,
            actionsTarget,
          )
        : null}

      {modal && modalTarget ? createPortal(modal, modalTarget) : null}
    </>
  );
}
