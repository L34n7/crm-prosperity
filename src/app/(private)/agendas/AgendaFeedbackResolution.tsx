"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Ban,
  CalendarPlus,
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

type TipoOption = {
  id: string;
  nome: string;
};

type ResponsavelOption = {
  id: string;
  nome: string | null;
  email?: string | null;
};

type ResultadoComercialAnterior = {
  id: string;
  classificacao: AtendimentoClassificacao;
  valor_venda: number | null;
  agendamento_id: string;
  created_at: string;
};

type FeedbackItem = {
  id: string;
  agenda_id?: string | null;
  titulo?: string | null;
  tipo_id?: string | null;
  responsavel_id?: string | null;
  inicio_at?: string | null;
  nome_cliente?: string | null;
  contato_id?: string | null;
  conversa_id?: string | null;
  contatos?:
    | {
        id?: string;
        nome?: string | null;
        telefone?: string | null;
        email?: string | null;
        classificacao?: string | null;
      }
    | Array<{
        id?: string;
        nome?: string | null;
        telefone?: string | null;
        email?: string | null;
        classificacao?: string | null;
      }>
    | null;
  resultado_comercial_anterior?: ResultadoComercialAnterior | null;
};

type Draft = {
  agendamentoId: string;
  contatoId: string | null;
  nomeCliente: string;
  telefoneCliente: string;
  inicioAt: string;
  tipoReuniao: string;
  status: FinalStatus;
  resultado: string;
  observacoesInternas: string;
  classificacao: AtendimentoClassificacao;
  valorVenda: string;
  modoResultadoComercial: "" | "manter" | "novo";
  resultadoComercialAnterior: ResultadoComercialAnterior | null;
  listaId: string;
  marcarProximo: boolean;
  proximoTitulo: string;
  proximoTipoId: string;
  proximoData: string;
  proximoHora: string;
  proximoResponsavelId: string;
  proximoDescricao: string;
};

const classificacoes = new Set<AtendimentoClassificacao>([
  "qualificado",
  "convertido",
  "perdido",
]);

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function horarioDoAgendamento(value?: string | null) {
  if (!value) return "09:00";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "09:00";
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}


function dataHoraDoAgendamento(value?: string | null) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";

  const data = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  return `${data} · ${hora}`;
}

export default function AgendaFeedbackResolution() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [listas, setListas] = useState<ListaOption[]>([]);
  const [tipos, setTipos] = useState<TipoOption[]>([]);
  const [responsaveis, setResponsaveis] = useState<ResponsavelOption[]>([]);
  const [usuarioAtualId, setUsuarioAtualId] = useState("");
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
      setTipos(Array.isArray(data.tipos) ? data.tipos : []);
      setResponsaveis(
        Array.isArray(data.responsaveis) ? data.responsaveis : [],
      );
      setUsuarioAtualId(String(data.usuario_atual_id || ""));
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

  const abrirModal = useCallback(
    (status: FinalStatus, feedback: FeedbackItem | null = feedbackAtual) => {
      if (!feedback) return;

      const contato = relationOne(feedback.contatos);
      const resultadoComercialAnterior =
        feedback.resultado_comercial_anterior || null;
      const rawClassificacao = String(
        resultadoComercialAnterior?.classificacao ||
          contato?.classificacao ||
          "",
      ).toLowerCase();
      const classificacao = classificacoes.has(
        rawClassificacao as AtendimentoClassificacao,
      )
        ? (rawClassificacao as AtendimentoClassificacao)
        : "qualificado";
      const nome =
        feedback.nome_cliente || contato?.nome || "Contato";
      const telefone = String(contato?.telefone || "").trim();
      const tipoReuniao =
        tipos.find((item) => item.id === feedback.tipo_id)?.nome ||
        feedback.titulo ||
        "Não informado";

      setError("");
      setDraft({
        agendamentoId: feedback.id,
        contatoId: feedback.contato_id || contato?.id || null,
        nomeCliente: nome,
        telefoneCliente: telefone,
        inicioAt: String(feedback.inicio_at || ""),
        tipoReuniao,
        status,
        resultado: "",
        observacoesInternas: "",
        classificacao,
        valorVenda: "",
        modoResultadoComercial: resultadoComercialAnterior ? "" : "novo",
        resultadoComercialAnterior,
        listaId: "",
        marcarProximo: false,
        proximoTitulo: feedback.titulo || "Próximo atendimento",
        proximoTipoId: feedback.tipo_id || "",
        proximoData: "",
        proximoHora: horarioDoAgendamento(feedback.inicio_at),
        proximoResponsavelId:
          feedback.responsavel_id || usuarioAtualId || "",
        proximoDescricao: "",
      });
    },
    [feedbackAtual, tipos, usuarioAtualId],
  );

  useEffect(() => {
    const abrirPorEvento = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        agendamentoId?: string;
      }>;
      const agendamentoId = String(
        customEvent.detail?.agendamentoId || "",
      ).trim();

      if (!agendamentoId) return;

      let feedback =
        feedbacks.find((item) => item.id === agendamentoId) || null;

      if (!feedback) {
        try {
          const response = await fetch(
            `/api/agendas/feedback?agendamento_id=${encodeURIComponent(
              agendamentoId,
            )}`,
            { cache: "no-store" },
          );
          const data = await response.json();

          if (!response.ok || !data?.ok) {
            throw new Error(
              data?.error || "Não foi possível abrir este atendimento.",
            );
          }

          feedback = Array.isArray(data.pendencias)
            ? data.pendencias[0] || null
            : null;

          if (Array.isArray(data.listas)) setListas(data.listas);
          if (Array.isArray(data.tipos)) setTipos(data.tipos);
          if (Array.isArray(data.responsaveis)) {
            setResponsaveis(data.responsaveis);
          }
          setUsuarioAtualId(String(data.usuario_atual_id || ""));
        } catch (cause) {
          console.error(
            "[AGENDA FEEDBACK] Erro ao abrir atendimento pelos detalhes:",
            cause,
          );
          return;
        }
      }

      if (feedback) {
        abrirModal("realizado", feedback);
      }
    };

    window.addEventListener(
      "crm:agenda-feedback:open",
      abrirPorEvento as EventListener,
    );

    return () =>
      window.removeEventListener(
        "crm:agenda-feedback:open",
        abrirPorEvento as EventListener,
      );
  }, [feedbacks, abrirModal]);

  const salvar = async () => {
    if (!draft) return;

    if (
      draft.resultadoComercialAnterior &&
      !draft.modoResultadoComercial
    ) {
      setError(
        "Informe se deseja manter o resultado comercial anterior ou registrar um novo resultado.",
      );
      return;
    }

    const registrarNovoResultado =
      !draft.resultadoComercialAnterior ||
      draft.modoResultadoComercial === "novo";
    const valorVenda =
      registrarNovoResultado && draft.classificacao === "convertido"
        ? Number(draft.valorVenda)
        : null;

    if (
      registrarNovoResultado &&
      draft.classificacao === "convertido" &&
      (!Number.isFinite(valorVenda) || Number(valorVenda) <= 0)
    ) {
      setError("Informe um valor de venda maior que zero.");
      return;
    }

    let proximoAtendimento: Record<string, string | null> | null = null;
    if (draft.marcarProximo) {
      if (!draft.contatoId) {
        setError(
          "Este agendamento não possui contato vinculado para marcar o próximo atendimento.",
        );
        return;
      }
      if (!draft.proximoTitulo.trim()) {
        setError("Informe o título do próximo atendimento.");
        return;
      }
      if (!draft.proximoData || !draft.proximoHora) {
        setError("Informe a data e hora do próximo atendimento.");
        return;
      }

      const dataHora = new Date(
        `${draft.proximoData}T${draft.proximoHora}:00`,
      );
      if (Number.isNaN(dataHora.getTime())) {
        setError("Informe uma data e hora válidas para o próximo atendimento.");
        return;
      }
      if (dataHora.getTime() <= Date.now()) {
        setError("O próximo atendimento precisa estar no futuro.");
        return;
      }

      proximoAtendimento = {
        titulo: draft.proximoTitulo.trim(),
        tipo_id: draft.proximoTipoId || null,
        inicio_at: dataHora.toISOString(),
        responsavel_id: draft.proximoResponsavelId || null,
        descricao: draft.proximoDescricao.trim(),
      };
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
          modo_resultado_comercial:
            draft.modoResultadoComercial || "novo",
          classificacao_atendimento: draft.classificacao,
          valor_venda: valorVenda,
          lista_id: draft.listaId || null,
          proximo_atendimento: proximoAtendimento,
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
            <CircleDollarSign size={28} />
          </div>
          <div>
            <h2 id="agenda-feedback-resolution-title">Resultado agendamento</h2>
            <p>
              Registre o resultado do atendimento e a classificação comercial
              do contato.
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
          <div className={styles.appointmentSummary}>
            <div>
              <span>Cliente</span>
              <strong>{draft.nomeCliente}</strong>
            </div>
            <div>
              <span>Número</span>
              <strong>{draft.telefoneCliente || "Não informado"}</strong>
            </div>
            <div>
              <span>Data / hora</span>
              <strong>{dataHoraDoAgendamento(draft.inicioAt)}</strong>
            </div>
            <div>
              <span>Tipo de reunião</span>
              <strong>{draft.tipoReuniao}</strong>
            </div>
          </div>

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
                  maxLength={600}
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
                <small className={styles.saleHint}>
                  Ao salvar, esta observação também será registrada nas notas da
                  conversa do contato quando houver uma conversa vinculada.
                </small>
              </div>
            </div>
          </section>

          <section className={`section ${styles.commercialSection}`}>
            <h3>
              <UserRound size={15} />
              Resultado comercial
            </h3>

            {draft.resultadoComercialAnterior ? (
              <>
                <div className={styles.previousResult}>
                  <span>Resultado comercial anterior</span>
                  <strong>
                    {draft.resultadoComercialAnterior.classificacao ===
                    "convertido"
                      ? "Convertido"
                      : draft.resultadoComercialAnterior.classificacao ===
                          "perdido"
                        ? "Perdido"
                        : "Qualificado"}
                    {draft.resultadoComercialAnterior.classificacao ===
                      "convertido" &&
                    draft.resultadoComercialAnterior.valor_venda
                      ? ` · ${new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(
                          draft.resultadoComercialAnterior.valor_venda,
                        )}`
                      : ""}
                  </strong>
                  <small>
                    Este resultado continua sendo o atual até que você registre
                    um novo resultado comercial.
                  </small>
                </div>

                <p className={styles.sectionHint}>
                  Este atendimento gerou um novo resultado comercial?
                </p>

                <div className={styles.commercialDecision}>
                  <label
                    className={
                      draft.modoResultadoComercial === "manter"
                        ? styles.commercialDecisionActive
                        : ""
                    }
                  >
                    <input
                      type="radio"
                      name="modo-resultado-comercial"
                      checked={
                        draft.modoResultadoComercial === "manter"
                      }
                      onChange={() =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                modoResultadoComercial: "manter",
                                valorVenda: "",
                              }
                            : current,
                        )
                      }
                    />
                    <span>
                      <strong>Não, manter o resultado anterior</strong>
                      <small>
                        Não altera classificação nem registra outro valor.
                      </small>
                    </span>
                  </label>

                  <label
                    className={
                      draft.modoResultadoComercial === "novo"
                        ? styles.commercialDecisionActive
                        : ""
                    }
                  >
                    <input
                      type="radio"
                      name="modo-resultado-comercial"
                      checked={draft.modoResultadoComercial === "novo"}
                      onChange={() =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                modoResultadoComercial: "novo",
                              }
                            : current,
                        )
                      }
                    />
                    <span>
                      <strong>Sim, registrar um novo resultado</strong>
                      <small>
                        Permite classificar este atendimento como qualificado,
                        convertido ou perdido.
                      </small>
                    </span>
                  </label>
                </div>
              </>
            ) : (
              <div className={styles.firstResult}>
                <strong>Primeiro resultado comercial</strong>
                <span>
                  Como este contato ainda não possui resultado comercial de
                  atendimento, o registro abaixo é obrigatório.
                </span>
              </div>
            )}

            {draft.modoResultadoComercial === "novo" ? (
              <div className={`form ${styles.commercialForm}`}>
                <div className="field full">
                  <label>Novo resultado comercial</label>
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
                              ? {
                                  ...current,
                                  valorVenda: event.target.value,
                                }
                              : current,
                          )
                        }
                        placeholder="0,00"
                      />
                    </div>
                    <small className={styles.saleHint}>
                      O valor pertence somente a este novo resultado comercial.
                    </small>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className={`section ${styles.nextSection}`}>
            <h3>
              <CalendarPlus size={15} />
              Próximo atendimento
            </h3>
            <label className={styles.scheduleToggle}>
              <input
                type="checkbox"
                checked={draft.marcarProximo}
                disabled={!draft.contatoId}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, marcarProximo: event.target.checked }
                      : current,
                  )
                }
              />
              <span>Marcar o próximo atendimento?</span>
            </label>

            {!draft.contatoId ? (
              <p className={styles.sectionHint}>
                Este agendamento não possui um contato vinculado, por isso não é
                possível criar o próximo atendimento automaticamente.
              </p>
            ) : null}

            {draft.marcarProximo ? (
              <div className={`form ${styles.nextForm}`}>
                <div className="field full">
                  <label>Título</label>
                  <input
                    value={draft.proximoTitulo}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, proximoTitulo: event.target.value }
                          : current,
                      )
                    }
                    placeholder="Ex.: Reunião de follow-up"
                  />
                </div>

                <div className="field">
                  <label>Tipo</label>
                  <select
                    value={draft.proximoTipoId}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, proximoTipoId: event.target.value }
                          : current,
                      )
                    }
                  >
                    <option value="">Sem tipo</option>
                    {tipos.map((tipo) => (
                      <option key={tipo.id} value={tipo.id}>
                        {tipo.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Responsável</label>
                  <select
                    value={draft.proximoResponsavelId}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              proximoResponsavelId: event.target.value,
                            }
                          : current,
                      )
                    }
                  >
                    <option value="">Sem responsável</option>
                    {responsaveis.map((responsavel) => (
                      <option key={responsavel.id} value={responsavel.id}>
                        {responsavel.nome || responsavel.email || "Usuário"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Data</label>
                  <input
                    type="date"
                    value={draft.proximoData}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, proximoData: event.target.value }
                          : current,
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label>Hora</label>
                  <input
                    type="time"
                    value={draft.proximoHora}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, proximoHora: event.target.value }
                          : current,
                      )
                    }
                  />
                </div>

                <div className="field full">
                  <label>Descrição</label>
                  <textarea
                    value={draft.proximoDescricao}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              proximoDescricao: event.target.value,
                            }
                          : current,
                      )
                    }
                    placeholder="Informações para o próximo atendimento"
                  />
                  <small className={styles.saleHint}>
                    O novo agendamento será criado no mesmo calendário e para o
                    mesmo contato deste atendimento.
                  </small>
                </div>
              </div>
            ) : null}
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
                onClick={() => abrirModal("realizado", feedbackAtual)}
              >
                <Check size={13} />
                Realizado
              </button>
              <button
                type="button"
                className="btn feedbackMissed"
                data-agenda-feedback-resolution="true"
                onClick={() => abrirModal("faltou", feedbackAtual)}
              >
                <X size={13} />
                Não realizado
              </button>
              <button
                type="button"
                className={`btn danger ${styles.cancelButton}`}
                data-agenda-feedback-resolution="true"
                onClick={() => abrirModal("cancelado", feedbackAtual)}
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
