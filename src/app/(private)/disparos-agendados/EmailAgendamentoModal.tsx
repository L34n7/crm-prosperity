"use client";

import { useEffect, useState } from "react";
import styles from "./disparos-agendados.module.css";

type CampanhaResumo = {
  id: string;
  nome: string;
  assunto: string;
  status: string;
  agendada_para: string | null;
  total_destinatarios: number;
  total_enviados: number;
  total_entregues: number;
};

type Destinatario = {
  id: string;
  email: string;
  nome: string | null;
  status: string;
  enviado_em: string | null;
  erro: string | null;
};

type Resposta = {
  ok: boolean;
  error?: string;
  campanha: CampanhaResumo;
  destinatarios: Destinatario[];
  paginacao: { pagina: number; total: number; total_paginas: number };
};

type Props = {
  campanhaId: string;
  titulo: string;
  onClose: () => void;
  onUpdated: () => void | Promise<void>;
};

const STATUS: Record<string, string> = {
  agendada: "Agendada",
  processando: "Enviando",
  pausada: "Pausada",
  enviada: "Envio concluído",
  cancelada: "Cancelada",
  falha: "Falha",
  pendente: "Pendente",
  enviado: "Aceito pelo Resend",
  entregue: "Entregue",
  aberto: "Aberto",
  clicado: "Clicado",
  bounce: "Devolvido",
  reclamacao: "Reclamação",
  suprimido: "Suprimido",
  cancelado: "Cancelado",
};

function formatarData(valor?: string | null) {
  if (!valor) return "—";
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(data);
}

export default function EmailAgendamentoModal({
  campanhaId,
  titulo,
  onClose,
  onUpdated,
}: Props) {
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [pagina, setPagina] = useState(1);
  const [versao, setVersao] = useState(0);
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [cancelando, setCancelando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [confirmarDestinatario, setConfirmarDestinatario] = useState<string | null>(null);
  const [confirmarCampanha, setConfirmarCampanha] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPagina(1);
      setBuscaAplicada(busca.trim());
    }, 320);
    return () => window.clearTimeout(timeout);
  }, [busca]);

  useEffect(() => {
    const controller = new AbortController();
    async function carregar() {
      setCarregando(true);
      try {
        const params = new URLSearchParams({
          pagina: String(pagina),
          busca: buscaAplicada,
          status: "todos",
          ordem: "asc",
        });
        const response = await fetch(
          `/api/email-marketing/campanhas/${encodeURIComponent(campanhaId)}/destinatarios?${params}`,
          { cache: "no-store", signal: controller.signal }
        );
        const json = (await response.json()) as Resposta;
        if (!response.ok || !json.ok) {
          throw new Error(json.error || "Não foi possível consultar os destinatários.");
        }
        if (!controller.signal.aborted) {
          setResposta(json);
          setErro("");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setErro(error instanceof Error ? error.message : "Erro ao consultar a campanha.");
        }
      } finally {
        if (!controller.signal.aborted) setCarregando(false);
      }
    }
    void carregar();
    return () => controller.abort();
  }, [campanhaId, pagina, buscaAplicada, versao]);

  async function enviarCancelamento(url: string) {
    setCancelando(true);
    setErro("");
    setSucesso("");
    try {
      const response = await fetch(url, { method: "PATCH" });
      const json = (await response.json()) as {
        ok?: boolean; error?: string; message?: string;
      };
      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Não foi possível cancelar o envio.");
      }
      setSucesso(json.message || "Cancelamento registrado.");
      setConfirmarDestinatario(null);
      setConfirmarCampanha(false);
      setVersao((atual) => atual + 1);
      await onUpdated();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao cancelar envio.");
    } finally {
      setCancelando(false);
    }
  }

  const resumo = resposta?.campanha;
  const permiteCancelar = ["agendada", "processando", "pausada"].includes(resumo?.status || "");

  return (
    <div className={styles.modalOverlay} onClick={() => !cancelando && onClose()}>
      <section
        className={`${styles.modalCard} ${styles.manualCampaignModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-agendada-modal-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>E-mail Marketing · Campanha agendada</p>
            <h3 id="email-agendada-modal-titulo" className={styles.modalTitle}>
              {resumo?.nome || titulo}
            </h3>
            <p className={styles.panelSubtitle}>
              {resumo?.assunto || "Campanha"} · {formatarData(resumo?.agendada_para)}
            </p>
          </div>
          <button type="button" className={styles.closePanelButton}
            disabled={cancelando} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className={styles.manualCampaignToolbar}>
          <div className={styles.manualCampaignSummary}>
            <span><strong>{resumo?.total_destinatarios ?? 0}</strong> destinatários</span>
            <span><strong>{resumo?.total_enviados ?? 0}</strong> aceitos pelo Resend</span>
            <span><strong>{resumo?.total_entregues ?? 0}</strong> entregues</span>
            <span>{STATUS[resumo?.status || ""] || "Carregando..."}</span>
          </div>
          <input type="search" className={styles.input}
            aria-label="Buscar destinatário de e-mail"
            placeholder="Buscar endereço de e-mail..."
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>

        {erro ? <div className={styles.warningBox} role="alert">{erro}</div> : null}
        {sucesso ? <div className={styles.groupCancelSummary} role="status">{sucesso}</div> : null}

        {confirmarCampanha ? (
          <div className={styles.warningBox} role="alert">
            <strong>Cancelar todos os e-mails ainda pendentes?</strong>
            <p>
              A campanha deixará de enviar novas mensagens. E-mails já aceitos
              pelo Resend ou que entraram em processamento não podem ser desfeitos.
              O usuário, a data e a hora serão registrados na auditoria.
            </p>
            <div className={styles.groupFooterActions}>
              <button type="button" className={styles.secondaryButton} disabled={cancelando}
                onClick={() => setConfirmarCampanha(false)}>Voltar</button>
              <button type="button" className={styles.dangerButton} disabled={cancelando}
                onClick={() => void enviarCancelamento(
                  `/api/email-marketing/campanhas/${encodeURIComponent(campanhaId)}/cancelar`
                )}>{cancelando ? "Cancelando..." : "Confirmar cancelamento"}</button>
            </div>
          </div>
        ) : null}

        <div className={styles.manualCampaignList}>
          {carregando ? (
            <div className={styles.manualCampaignEmpty}>Carregando destinatários...</div>
          ) : !resposta?.destinatarios.length ? (
            <div className={styles.manualCampaignEmpty}>
              Nenhum destinatário encontrado.
            </div>
          ) : (
            resposta.destinatarios.map((destinatario) => (
              <div key={destinatario.id} className={styles.manualCampaignItem}>
                <div className={styles.manualCampaignContact}>
                  <strong title={destinatario.email}>{destinatario.email}</strong>
                  <span>{destinatario.nome || "Destinatário"}</span>
                  {destinatario.erro && destinatario.status !== "cancelado" ? (
                    <span title={destinatario.erro}>{destinatario.erro}</span>
                  ) : null}
                </div>
                <div className={styles.manualCampaignItemMeta}>
                  <span>{formatarData(destinatario.enviado_em)}</span>
                  <span className={styles.badge}>
                    {STATUS[destinatario.status] || destinatario.status}
                  </span>
                </div>
                <div className={styles.manualCampaignItemAction}>
                  {permiteCancelar && destinatario.status === "pendente" ? (
                    <button
                      type="button"
                      className={
                        confirmarDestinatario === destinatario.id
                          ? styles.manualCancelConfirmButton
                          : styles.manualCancelButton
                      }
                      disabled={cancelando}
                      onClick={() => {
                        if (confirmarDestinatario !== destinatario.id) {
                          setConfirmarDestinatario(destinatario.id);
                          setConfirmarCampanha(false);
                          return;
                        }
                        void enviarCancelamento(
                          `/api/email-marketing/campanhas/${encodeURIComponent(campanhaId)}/destinatarios/${encodeURIComponent(destinatario.id)}/cancelar`
                        );
                      }}
                    >
                      {cancelando && confirmarDestinatario === destinatario.id
                        ? "Cancelando..."
                        : confirmarDestinatario === destinatario.id
                          ? "Confirmar"
                          : "Cancelar"}
                    </button>
                  ) : (
                    <span className={styles.manualCampaignDoneLabel}>
                      {destinatario.status === "processando"
                        ? "Em processamento"
                        : destinatario.status === "enviado"
                          ? "Entrega a confirmar"
                          : "Sem ações"}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.modalFooter}>
          <span className={styles.manualCampaignFooterInfo}>
            {resposta?.paginacao.total ?? 0} destinatário(s) ·
            Página {pagina} de {resposta?.paginacao.total_paginas ?? 1}
          </span>
          <button type="button" className={styles.secondaryButton}
            disabled={carregando || pagina === 1}
            onClick={() => setPagina((atual) => Math.max(1, atual - 1))}>
            Anterior
          </button>
          <button type="button" className={styles.secondaryButton}
            disabled={carregando || pagina >= (resposta?.paginacao.total_paginas ?? 1)}
            onClick={() => setPagina((atual) => atual + 1)}>
            Próxima
          </button>
          {permiteCancelar && !confirmarCampanha ? (
            <button type="button" className={styles.dangerButton}
              disabled={cancelando || carregando}
              onClick={() => {
                setConfirmarDestinatario(null);
                setConfirmarCampanha(true);
              }}>
              Cancelar campanha
            </button>
          ) : null}
          <button type="button" className={styles.secondaryButton}
            disabled={cancelando} onClick={onClose}>Fechar</button>
        </div>
      </section>
    </div>
  );
}
