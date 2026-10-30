"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  MailCheck,
  MousePointerClick,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import styles from "./email-marketing.module.css";

type CampanhaResumo = {
  id: string;
  nome: string;
  assunto: string;
  status: string;
  total_destinatarios: number;
  total_enviados: number;
  total_entregues: number;
  total_abertos: number;
  total_cliques: number;
  agendada_para: string | null;
};

type Destinatario = {
  id: string;
  email: string;
  nome: string | null;
  status: string;
  erro: string | null;
  enviado_em: string | null;
  entregue_em: string | null;
  aberto_em: string | null;
  clicado_em: string | null;
  bounce_em: string | null;
  reclamacao_em: string | null;
  suprimido_em: string | null;
  descadastrado_em: string | null;
  created_at: string;
  tentativas: number;
};

type RespostaDetalhes = {
  ok: boolean;
  error?: string;
  campanha: CampanhaResumo;
  destinatarios: Destinatario[];
  paginacao: {
    pagina: number;
    por_pagina: number;
    total: number;
    total_paginas: number;
  };
};

type Props = {
  campanha: CampanhaResumo;
  onClose: () => void;
};

const filtros = [
  { value: "todos", label: "Todos os status" },
  { value: "pendente", label: "Pendentes" },
  { value: "enviado", label: "Enviados" },
  { value: "entregue", label: "Entregues" },
  { value: "aberto", label: "Abertos" },
  { value: "clicado", label: "Com clique" },
  { value: "falha", label: "Falhas de envio" },
  { value: "bounce", label: "Devolvidos (bounce)" },
  { value: "suprimido", label: "Suprimidos" },
  { value: "reclamacao", label: "Reclamações" },
  { value: "descadastrado", label: "Descadastrados" },
];

const statusNomes: Record<string, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  processando: "Processando",
  enviado: "Enviado",
  entregue: "Entregue",
  aberto: "Aberto",
  clicado: "Clicado",
  falha: "Falha",
  bounce: "Devolvido",
  suprimido: "Suprimido",
  reclamacao: "Reclamação",
  descadastrado: "Descadastrado",
};

function formatarData(valor: string | null | undefined) {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(data);
}

function statusProblema(status: string) {
  return ["falha", "bounce", "suprimido", "reclamacao"].includes(status);
}

export default function CampanhaDetalhesModal({ campanha, onClose }: Props) {
  const [montado, setMontado] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [status, setStatus] = useState("todos");
  const [ordem, setOrdem] = useState<"asc" | "desc">("desc");
  const [pagina, setPagina] = useState(1);
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [resposta, setResposta] = useState<RespostaDetalhes | null>(null);

  useEffect(() => {
    setMontado(true);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const fecharEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", fecharEsc);
    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener("keydown", fecharEsc);
    };
  }, [onClose]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPagina(1);
      setBuscaAplicada(busca.trim());
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [busca]);

  useEffect(() => {
    const controle = new AbortController();
    const params = new URLSearchParams({
      pagina: String(pagina),
      busca: buscaAplicada,
      status,
      ordem,
    });

    async function carregar() {
      setCarregando(true);
      setErro("");
      setResposta(null);
      try {
        const response = await fetch(
          `/api/email-marketing/campanhas/${encodeURIComponent(campanha.id)}/destinatarios?${params.toString()}`,
          { cache: "no-store", signal: controle.signal }
        );
        const data = (await response.json()) as RespostaDetalhes;
        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Não foi possível carregar os detalhes.");
        }
        if (!controle.signal.aborted) {
          setResposta(data);
        }
      } catch (error) {
        if (!controle.signal.aborted) {
          setErro(error instanceof Error ? error.message : "Erro ao consultar destinatários.");
        }
      } finally {
        if (!controle.signal.aborted) setCarregando(false);
      }
    }
    void carregar();
    return () => controle.abort();
  }, [campanha.id, buscaAplicada, status, ordem, pagina, versao]);

  if (!montado) return null;

  const resumo = resposta?.campanha || campanha;
  const total = resposta?.paginacao.total ?? 0;
  const totalPaginas = resposta?.paginacao.total_paginas ?? 1;

  return createPortal(
    <div
      className={styles.campaignDetailOverlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.campaignDetailModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="campanha-detalhes-titulo"
      >
        <div className={styles.campaignDetailHeader}>
          <div className={styles.campaignDetailHeading}>
            <span className={styles.sectionLabel}>RELATÓRIO DA CAMPANHA</span>
            <h2 id="campanha-detalhes-titulo">{resumo.nome}</h2>
            <p>{resumo.assunto}</p>
            <small>
              Envio programado: {formatarData(resumo.agendada_para)} · Horários de Brasília
            </small>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.campaignDetailClose}
            aria-label="Fechar detalhes da campanha"
          >
            <X size={20} />
          </button>
        </div>

        <div className={styles.campaignDetailScrollable}>
          <div className={styles.campaignDetailMetrics}>
            <div><span>Destinatários</span><strong>{resumo.total_destinatarios}</strong></div>
            <div><span>Enviados</span><strong>{resumo.total_enviados}</strong></div>
            <div><span>Entregues</span><strong>{resumo.total_entregues}</strong></div>
            <div><span>Abertos (estim.)</span><strong>{resumo.total_abertos}</strong></div>
            <div><span>Cliques</span><strong>{resumo.total_cliques}</strong></div>
          </div>

          <div className={styles.campaignDetailToolbar}>
            <label className={styles.searchBox}>
              <Search size={17} />
              <input
                type="search"
                placeholder="Buscar pelo e-mail do destinatário"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                aria-label="Buscar por e-mail"
              />
            </label>
            <label className={styles.campaignDetailFilter}>
              <span>Status</span>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPagina(1);
                }}
              >
                {filtros.map((filtro) => (
                  <option value={filtro.value} key={filtro.value}>
                    {filtro.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.campaignDetailReload}
              onClick={() => setVersao((v) => v + 1)}
              disabled={carregando}
              title="Atualizar destinatários"
            >
              <RefreshCw size={16} />
              Atualizar
            </button>
          </div>

          <div className={styles.campaignDetailTableWrap}>
            <table className={styles.campaignDetailTable}>
              <thead>
                <tr>
                  <th>Destinatário</th>
                  <th>Status do envio</th>
                  <th>Eventos confirmados</th>
                  <th>
                    <button
                      type="button"
                      className={styles.campaignDateOrder}
                      onClick={() => {
                        setOrdem((atual) => atual === "desc" ? "asc" : "desc");
                        setPagina(1);
                      }}
                      title="Alternar ordenação por data de envio"
                    >
                      Data de envio {ordem === "desc" ? <ArrowDown size={13}/> : <ArrowUp size={13}/>}
                    </button>
                  </th>
                  <th>Aberto em (estim.)</th>
                  <th>Clicado em</th>
                </tr>
              </thead>
              <tbody>
                {resposta?.destinatarios.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong className={styles.campaignDetailEmail} title={item.email}>
                        {item.email}
                      </strong>
                      {item.nome && <small>{item.nome}</small>}
                    </td>
                    <td>
                      <span className={
                        statusProblema(item.status)
                          ? styles.campaignRecipientError
                          : styles.campaignRecipientStatus
                      }>
                        {statusProblema(item.status)
                          ? <AlertCircle size={12} />
                          : <Clock3 size={12} />}
                        {statusNomes[item.status] || item.status}
                      </span>
                      {item.erro && <small className={styles.campaignRecipientReason} title={item.erro}>{item.erro}</small>}
                    </td>
                    <td>
                      <div className={styles.campaignEventBadges}>
                        {item.entregue_em
                          ? <span className={styles.campaignDeliveredBadge} title={`Entrega confirmada: ${formatarData(item.entregue_em)}`}><MailCheck size={12}/> Entregue</span>
                          : null}
                        {item.aberto_em
                          ? <span className={styles.campaignOpenedBadge} title={`Abertura estimada: ${formatarData(item.aberto_em)}`}><Eye size={12}/> Aberto</span>
                          : null}
                        {item.clicado_em
                          ? <span className={styles.campaignClickedBadge} title={`Clique: ${formatarData(item.clicado_em)}`}><MousePointerClick size={12}/> Clique</span>
                          : null}
                        {!item.entregue_em && !item.aberto_em && !item.clicado_em
                          ? <span className={styles.campaignNoEvents}><Check size={12}/> Sem eventos adicionais</span>
                          : null}
                      </div>
                    </td>
                    <td className={styles.campaignDetailDate}>{formatarData(item.enviado_em || item.created_at)}</td>
                    <td className={styles.campaignDetailDate}>{formatarData(item.aberto_em)}</td>
                    <td className={styles.campaignDetailDate}>{formatarData(item.clicado_em)}</td>
                  </tr>
                ))}
                {!carregando && !erro && (!resposta?.destinatarios.length) && (
                  <tr>
                    <td colSpan={6} className={styles.campaignDetailEmpty}>
                      {buscaAplicada || status !== "todos"
                        ? "Nenhum destinatário corresponde aos filtros."
                        : "Esta campanha ainda não possui destinatários registrados."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {carregando && (
              <div className={styles.campaignDetailLoading} role="status">
                <RefreshCw size={16} className={styles.campaignLoadingSpinner} />
                Carregando destinatários...
              </div>
            )}
            {erro && (
              <div className={styles.campaignDetailLoading} role="alert">
                <AlertCircle size={17} />
                {erro}
                <button type="button" onClick={() => setVersao((v) => v + 1)}>Tentar novamente</button>
              </div>
            )}
          </div>

          <div className={styles.campaignDetailPagination}>
            <div>
              <strong>{total}</strong> destinatário(s) encontrado(s) · 20 por página
              <small>Aberturas são estimativas: alguns provedores carregam imagens automaticamente.</small>
            </div>
            <div className={styles.campaignDetailPageActions}>
              <button
                type="button"
                disabled={pagina <= 1 || carregando}
                onClick={() => setPagina((v) => Math.max(1, v - 1))}
              ><ChevronLeft size={16} /> Anterior</button>
              <span>Página {pagina} de {totalPaginas}</span>
              <button
                type="button"
                disabled={pagina >= totalPaginas || carregando}
                onClick={() => setPagina((v) => v + 1)}
              >Próxima <ChevronRight size={16} /></button>
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
