"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Copy,
  Link2,
  Megaphone,
  MousePointerClick,
  Plus,
  Power,
  RefreshCw,
  Route,
} from "lucide-react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import styles from "./rastreamento.module.css";

type Aba = "origens" | "campanhas" | "links" | "eventos";
type Status = "ativo" | "inativo";

type Origem = {
  id: string;
  nome: string;
  descricao: string | null;
  status: Status;
};

type Campanha = {
  id: string;
  nome: string;
  codigo: string;
  descricao: string | null;
  numero_whatsapp: string;
  mensagem_inicial: string;
  status: Status;
  rastreamento_origens?: { id: string; nome: string } | null;
};

type LinkRastreavel = {
  id: string;
  nome: string;
  slug: string;
  status: Status;
  public_url: string;
  total_cliques: number;
  rastreamento_campanhas?: {
    id: string;
    nome: string;
    codigo: string;
    rastreamento_origens?: { id: string; nome: string } | null;
  } | null;
};

type Evento = {
  id: string;
  tipo: string;
  valor: number | null;
  origem_registro: string;
  ocorrido_em: string;
  metadata_json?: EventoMetadata | string | null;
  contatos?: { id: string; nome: string | null; telefone: string } | null;
  rastreamento_origens?: { id: string; nome: string } | null;
  rastreamento_campanhas?: { id: string; nome: string } | null;
  rastreamento_links?: { id: string; nome: string; slug: string } | null;
};

type EventoMetadata = {
  fluxo_nome?: string | null;
  resultado_fluxo?: string | null;
  origem_anuncio?: string | null;
  meta_ctwa_clid?: string | null;
  meta_source_id?: string | null;
  meta_source_type?: string | null;
  meta_headline?: string | null;
};

type IntegracaoWhatsapp = {
  id: string;
  nome_conexao: string;
  numero: string;
  status: string;
};

type Contato = {
  id: string;
  nome: string | null;
  telefone: string;
};

const EVENTOS_LABEL: Record<string, string> = {
  clique_no_link: "Clique no link",
  lead_criado: "Lead criado",
  conversa_iniciada: "Conversa iniciada",
  primeira_mensagem_recebida: "Primeira mensagem recebida",
  lead_qualificado: "Lead qualificado",
  agendamento_criado: "Agendamento criado",
  agendamento_confirmado: "Agendamento confirmado",
  venda_realizada: "Venda realizada",
  venda_perdida: "Venda perdida",
  fluxo_iniciado: "Fluxo iniciado",
  fluxo_finalizado: "Fluxo finalizado",
  fluxo_transferido_atendimento: "Transferido para atendimento",
  fluxo_incompleto_timeout: "Fluxo incompleto por timeout",
};

const EVENTOS_MANUAIS = [
  { value: "venda_realizada", label: "Venda realizada", exigeValor: true },
  { value: "venda_perdida", label: "Venda perdida" },
  { value: "lead_qualificado", label: "Lead qualificado" },
  { value: "agendamento_criado", label: "Agendamento criado" },
  { value: "agendamento_confirmado", label: "Agendamento confirmado" },
];

const EVENTOS_POR_PAGINA = 10;

function eventoManualValido(tipo: string) {
  return EVENTOS_MANUAIS.some((evento) => evento.value === tipo);
}

function eventoExigeValor(tipo: string) {
  return EVENTOS_MANUAIS.some(
    (evento) => evento.value === tipo && evento.exigeValor
  );
}

async function lerResposta(response: Response) {
  const json = await response.json();

  if (!response.ok || !json.ok) {
    throw new Error(json.error || "Nao foi possivel concluir a operacao.");
  }

  return json;
}

function formatarData(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}

function formatarValor(valor: number | null) {
  if (valor == null) return null;

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

function obterMetadataEvento(evento: Evento): EventoMetadata {
  if (!evento.metadata_json) return {};

  if (typeof evento.metadata_json === "string") {
    try {
      return JSON.parse(evento.metadata_json) as EventoMetadata;
    } catch {
      return {};
    }
  }

  return evento.metadata_json;
}

function obterResultadoFluxo(evento: Evento) {
  const metadata = obterMetadataEvento(evento);
  const resultado = String(metadata.resultado_fluxo || "").toLowerCase();

  if (resultado === "positivo") {
    return { label: "Positivo", className: styles.eventResultPositive };
  }

  if (resultado === "negativo") {
    return { label: "Negativo", className: styles.eventResultNegative };
  }

  if (resultado === "neutro") {
    return { label: "Neutro", className: styles.eventResultNeutral };
  }

  if (evento.tipo === "fluxo_incompleto_timeout") {
    return { label: "Incompleto", className: styles.eventResultNeutral };
  }

  return null;
}

function limitarTexto(valor: string, limite: number) {
  return valor.length > limite ? `${valor.slice(0, limite - 1)}...` : valor;
}

function obterResumoMetaEvento(metadata: EventoMetadata) {
  const ehMeta =
    metadata.origem_anuncio === "meta_click_to_whatsapp" ||
    Boolean(metadata.meta_source_id || metadata.meta_headline);

  if (!ehMeta) return null;

  const headline = String(metadata.meta_headline || "").trim();
  const sourceId = String(metadata.meta_source_id || "").trim();
  const detalhe = headline || (sourceId ? `ID ${sourceId}` : "Click-to-WhatsApp");

  return {
    detalhe: limitarTexto(detalhe, 90),
    sourceId: sourceId ? limitarTexto(sourceId, 42) : null,
  };
}

function eventoContaComoVenda(evento: Evento) {
  if (evento.tipo === "venda_realizada") return true;

  const metadata = obterMetadataEvento(evento);

  return (
    evento.tipo === "fluxo_finalizado" &&
    String(metadata.resultado_fluxo || "").toLowerCase() === "positivo" &&
    Number(evento.valor || 0) > 0
  );
}

function StatusControl({
  status,
  onToggle,
}: {
  status: Status;
  onToggle: () => void;
}) {
  const ativo = status === "ativo";
  const acao = ativo ? "Inativar" : "Ativar";

  return (
    <div className={styles.statusActions}>
      <span className={ativo ? styles.statusActive : styles.statusInactive}>
        {status}
      </span>
      <button
        type="button"
        className={styles.statusToggleButton}
        onClick={onToggle}
        title={`${acao} item`}
        aria-label={`${acao} item`}
      >
        <Power size={13} />
        {acao}
      </button>
    </div>
  );
}

export default function RastreamentoPage() {
  const [aba, setAba] = useState<Aba>("eventos");
  const [origens, setOrigens] = useState<Origem[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [links, setLinks] = useState<LinkRastreavel[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [integracoes, setIntegracoes] = useState<IntegracaoWhatsapp[]>([]);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [origemNome, setOrigemNome] = useState("");
  const [origemDescricao, setOrigemDescricao] = useState("");

  const [campanhaNome, setCampanhaNome] = useState("");
  const [campanhaOrigemId, setCampanhaOrigemId] = useState("");
  const [campanhaIntegracaoId, setCampanhaIntegracaoId] = useState("");
  const [campanhaNumero, setCampanhaNumero] = useState("");
  const [campanhaCodigo, setCampanhaCodigo] = useState("");
  const [campanhaDescricao, setCampanhaDescricao] = useState("");
  const [campanhaMensagem, setCampanhaMensagem] = useState("");

  const [linkNome, setLinkNome] = useState("");
  const [linkCampanhaId, setLinkCampanhaId] = useState("");
  const [linkSlug, setLinkSlug] = useState("");

  const [eventoTipo, setEventoTipo] = useState("venda_realizada");
  const [eventoContatoId, setEventoContatoId] = useState("");
  const [eventoValor, setEventoValor] = useState("");
  const [eventoEditandoId, setEventoEditandoId] = useState<string | null>(null);
  const [modalEditarEventoAberto, setModalEditarEventoAberto] = useState(false);
  const [eventoEdicaoTipo, setEventoEdicaoTipo] = useState("venda_realizada");
  const [eventoEdicaoContatoId, setEventoEdicaoContatoId] = useState("");
  const [eventoEdicaoValor, setEventoEdicaoValor] = useState("");
  const [paginaEventos, setPaginaEventos] = useState(1);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    setErro("");

    try {
      const [
        origensResponse,
        campanhasResponse,
        linksResponse,
        eventosResponse,
        integracoesResponse,
        contatosResponse,
      ] = await Promise.all([
        fetch("/api/rastreamento/origens", { cache: "no-store" }).then(lerResposta),
        fetch("/api/rastreamento/campanhas", { cache: "no-store" }).then(lerResposta),
        fetch("/api/rastreamento/links", { cache: "no-store" }).then(lerResposta),
        fetch("/api/rastreamento/eventos", { cache: "no-store" }).then(lerResposta),
        fetch("/api/integracoes-whatsapp/listar", { cache: "no-store" }).then(lerResposta),
        fetch("/api/contatos?limite=500", { cache: "no-store" }).then(lerResposta),
      ]);

      setOrigens(origensResponse.origens || []);
      setCampanhas(campanhasResponse.campanhas || []);
      setLinks(linksResponse.links || []);
      setEventos(eventosResponse.eventos || []);
      setPaginaEventos(1);
      setIntegracoes(integracoesResponse.data || []);
      setContatos(contatosResponse.contatos || []);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar rastreamento.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const totalCliques = useMemo(
    () => links.reduce((total, link) => total + Number(link.total_cliques || 0), 0),
    [links]
  );

  const totalConversas = useMemo(
    () => eventos.filter((evento) => evento.tipo === "conversa_iniciada").length,
    [eventos]
  );

  const totalVendas = useMemo(
    () => eventos.filter(eventoContaComoVenda).length,
    [eventos]
  );

  const totalPaginasEventos = useMemo(
    () => Math.max(1, Math.ceil(eventos.length / EVENTOS_POR_PAGINA)),
    [eventos.length]
  );

  const paginaEventosAtual = Math.min(paginaEventos, totalPaginasEventos);
  const primeiroEventoExibido =
    eventos.length === 0 ? 0 : (paginaEventosAtual - 1) * EVENTOS_POR_PAGINA + 1;
  const ultimoEventoExibido = Math.min(
    paginaEventosAtual * EVENTOS_POR_PAGINA,
    eventos.length
  );
  const eventosPaginados = useMemo(() => {
    const inicio = (paginaEventosAtual - 1) * EVENTOS_POR_PAGINA;

    return eventos.slice(inicio, inicio + EVENTOS_POR_PAGINA);
  }, [eventos, paginaEventosAtual]);

  useEffect(() => {
    setPaginaEventos((paginaAtual) => Math.min(paginaAtual, totalPaginasEventos));
  }, [totalPaginasEventos]);

  function limparFeedback() {
    setErro("");
    setMensagem("");
  }

  async function criarOrigem(event: FormEvent) {
    event.preventDefault();
    limparFeedback();
    setSalvando(true);

    try {
      await fetch("/api/rastreamento/origens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: origemNome, descricao: origemDescricao }),
      }).then(lerResposta);

      setOrigemNome("");
      setOrigemDescricao("");
      setMensagem("Origem criada com sucesso.");
      await carregarDados();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao criar origem.");
    } finally {
      setSalvando(false);
    }
  }

  async function criarCampanha(event: FormEvent) {
    event.preventDefault();
    limparFeedback();
    setSalvando(true);

    try {
      await fetch("/api/rastreamento/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: campanhaNome,
          origem_id: campanhaOrigemId,
          integracao_whatsapp_id: campanhaIntegracaoId || null,
          numero_whatsapp: campanhaNumero,
          codigo: campanhaCodigo,
          descricao: campanhaDescricao,
          mensagem_inicial: campanhaMensagem,
        }),
      }).then(lerResposta);

      setCampanhaNome("");
      setCampanhaOrigemId("");
      setCampanhaIntegracaoId("");
      setCampanhaNumero("");
      setCampanhaCodigo("");
      setCampanhaDescricao("");
      setCampanhaMensagem("");
      setMensagem("Campanha criada com sucesso.");
      await carregarDados();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao criar campanha.");
    } finally {
      setSalvando(false);
    }
  }

  async function criarLink(event: FormEvent) {
    event.preventDefault();
    limparFeedback();
    setSalvando(true);

    try {
      await fetch("/api/rastreamento/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: linkNome,
          campanha_id: linkCampanhaId,
          slug: linkSlug,
        }),
      }).then(lerResposta);

      setLinkNome("");
      setLinkCampanhaId("");
      setLinkSlug("");
      setMensagem("Link rastreavel criado com sucesso.");
      await carregarDados();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao criar link.");
    } finally {
      setSalvando(false);
    }
  }

  function limparFormularioEvento() {
    setEventoTipo("venda_realizada");
    setEventoContatoId("");
    setEventoValor("");
  }

  function fecharModalEditarEvento() {
    setModalEditarEventoAberto(false);
    setEventoEditandoId(null);
    setEventoEdicaoTipo("venda_realizada");
    setEventoEdicaoContatoId("");
    setEventoEdicaoValor("");
  }

  function editarEvento(evento: Evento) {
    if (evento.origem_registro !== "manual") {
      setErro("Eventos automaticos nao podem ser editados.");
      return;
    }

    setEventoEditandoId(evento.id);
    setEventoEdicaoTipo(eventoManualValido(evento.tipo) ? evento.tipo : "venda_realizada");
    setEventoEdicaoContatoId(evento.contatos?.id || "");
    setEventoEdicaoValor(
      evento.valor === null || evento.valor === undefined ? "" : String(evento.valor)
    );
    setModalEditarEventoAberto(true);
    setMensagem("");
    setErro("");
  }

  async function salvarEvento(event: FormEvent) {
    event.preventDefault();
    limparFeedback();
    setSalvando(true);

    try {
      await fetch("/api/rastreamento/eventos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: eventoTipo,
          contato_id: eventoContatoId,
          valor: eventoExigeValor(eventoTipo) ? eventoValor : null,
        }),
      }).then(lerResposta);

      limparFormularioEvento();
      setMensagem("Evento comercial registrado.");
      await carregarDados();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar evento.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarEventoEditado(event: FormEvent) {
    event.preventDefault();

    if (!eventoEditandoId) return;

    limparFeedback();
    setSalvando(true);

    try {
      await fetch(`/api/rastreamento/eventos/${eventoEditandoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: eventoEdicaoTipo,
          contato_id: eventoEdicaoContatoId,
          valor: eventoExigeValor(eventoEdicaoTipo) ? eventoEdicaoValor : null,
        }),
      }).then(lerResposta);

      fecharModalEditarEvento();
      setMensagem("Evento comercial atualizado.");
      await carregarDados();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao editar evento.");
    } finally {
      setSalvando(false);
    }
  }

  async function apagarEvento(evento: Evento) {
    if (evento.origem_registro !== "manual") {
      setErro("Eventos automaticos nao podem ser apagados.");
      return;
    }

    const confirmou = window.confirm(
      "Apagar este evento comercial? Esta acao nao pode ser desfeita."
    );

    if (!confirmou) return;

    limparFeedback();

    try {
      await fetch(`/api/rastreamento/eventos/${evento.id}`, {
        method: "DELETE",
      }).then(lerResposta);

      if (eventoEditandoId === evento.id) {
        fecharModalEditarEvento();
      }

      setMensagem("Evento comercial apagado.");
      await carregarDados();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao apagar evento.");
    }
  }

  async function alternarStatus(
    recurso: "origens" | "campanhas" | "links",
    id: string,
    statusAtual: Status
  ) {
    limparFeedback();

    try {
      await fetch(`/api/rastreamento/${recurso}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusAtual === "ativo" ? "inativo" : "ativo" }),
      }).then(lerResposta);

      setMensagem("Status atualizado.");
      await carregarDados();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao atualizar status.");
    }
  }

  async function copiarLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMensagem("Link copiado.");
    } catch {
      setErro("Nao foi possivel copiar o link.");
    }
  }

  function selecionarIntegracao(id: string) {
    setCampanhaIntegracaoId(id);
    const integracao = integracoes.find((item) => item.id === id);

    if (integracao?.numero) {
      setCampanhaNumero(integracao.numero);
    }
  }

  return (
    <>
      <Header
        title="Rastreamento de Leads"
        subtitle="Origens, campanhas, links rastreaveis e eventos internos"
      />

      <main className={styles.pageContent}>
        <FeedbackToast
          success={mensagem}
          onSuccessDismiss={() => setMensagem("")}
        />

        <section className={styles.hero}>
          <div className={styles.heroIcon}>
            <MousePointerClick size={24} />
          </div>
          <div>
            <p className={styles.eyebrow}>Pixel interno do CRM</p>
            <h1>Saiba qual campanha iniciou cada conversa</h1>
            <p>
              Gere links para anuncios, registre cliques e conecte automaticamente
              a origem ao contato quando a mensagem chegar no WhatsApp.
            </p>
          </div>
          <button className={styles.refreshButton} type="button" onClick={carregarDados}>
            <RefreshCw size={16} />
            Atualizar
          </button>
        </section>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <Route size={19} />
            <span>Origens ativas</span>
            <strong>{origens.filter((item) => item.status === "ativo").length}</strong>
          </article>
          <article className={styles.summaryCard}>
            <MousePointerClick size={19} />
            <span>Cliques registrados</span>
            <strong>{totalCliques}</strong>
          </article>
          <article className={styles.summaryCard}>
            <Activity size={19} />
            <span>Conversas iniciadas</span>
            <strong>{totalConversas}</strong>
          </article>
          <article className={styles.summaryCard}>
            <Megaphone size={19} />
            <span>Vendas registradas</span>
            <strong>{totalVendas}</strong>
          </article>
        </section>

        {erro && <div className={styles.alertError}>{erro}</div>}

        <nav className={styles.tabs}>
          {[
            ["eventos", "Eventos", Activity],
            ["origens", "Origens", Route],
            ["campanhas", "Campanhas", Megaphone],
            ["links", "Links rastreaveis", Link2],
          ].map(([id, label, Icon]) => {
            const TabIcon = Icon as typeof Route;
            return (
              <button
                key={String(id)}
                type="button"
                className={aba === id ? styles.tabActive : styles.tab}
                onClick={() => setAba(id as Aba)}
              >
                <TabIcon size={16} />
                {String(label)}
              </button>
            );
          })}
        </nav>

        {loading ? (
          <section className={styles.card}>Carregando rastreamento...</section>
        ) : (
          <>
            {aba === "origens" && (
              <section className={styles.contentGrid}>
                <form className={styles.card} onSubmit={criarOrigem}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.eyebrow}>Classificacao</p>
                      <h2>Nova origem</h2>
                    </div>
                    <Plus size={20} />
                  </div>
                  <label className={styles.field}>
                    <span>Nome</span>
                    <input
                      value={origemNome}
                      onChange={(event) => setOrigemNome(event.target.value)}
                      placeholder="Ex.: Instagram Ads"
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Descricao</span>
                    <textarea
                      value={origemDescricao}
                      onChange={(event) => setOrigemDescricao(event.target.value)}
                      placeholder="Como essa origem sera utilizada"
                    />
                  </label>
                  <button className={styles.primaryButton} disabled={salvando}>
                    Criar origem
                  </button>
                </form>

                <section className={styles.card}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.eyebrow}>Canais cadastrados</p>
                      <h2>Origens de trafego</h2>
                    </div>
                    <span className={styles.countBadge}>{origens.length}</span>
                  </div>
                  <div className={styles.list}>
                    {origens.map((origem) => (
                      <article className={styles.listItem} key={origem.id}>
                        <div>
                          <strong>{origem.nome}</strong>
                          <p>{origem.descricao || "Sem descricao"}</p>
                        </div>
                        <StatusControl
                          status={origem.status}
                          onToggle={() =>
                            alternarStatus("origens", origem.id, origem.status)
                          }
                        />
                      </article>
                    ))}
                  </div>
                </section>
              </section>
            )}

            {aba === "campanhas" && (
              <section className={styles.contentGrid}>
                <form className={styles.card} onSubmit={criarCampanha}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.eyebrow}>Atribuicao</p>
                      <h2>Nova campanha</h2>
                    </div>
                    <Plus size={20} />
                  </div>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Nome</span>
                      <input value={campanhaNome} onChange={(event) => setCampanhaNome(event.target.value)} placeholder="Ex.: Black Friday" />
                    </label>
                    <label className={styles.field}>
                      <span>Origem</span>
                      <select value={campanhaOrigemId} onChange={(event) => setCampanhaOrigemId(event.target.value)}>
                        <option value="">Selecione</option>
                        {origens.filter((item) => item.status === "ativo").map((origem) => (
                          <option key={origem.id} value={origem.id}>{origem.nome}</option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Integracao WhatsApp</span>
                      <select value={campanhaIntegracaoId} onChange={(event) => selecionarIntegracao(event.target.value)}>
                        <option value="">Informar numero manualmente</option>
                        {integracoes.map((integracao) => (
                          <option key={integracao.id} value={integracao.id}>
                            {integracao.nome_conexao} - {integracao.numero}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Numero WhatsApp com DDI</span>
                      <input value={campanhaNumero} onChange={(event) => setCampanhaNumero(event.target.value)} placeholder="5531999999999" />
                    </label>
                    <label className={styles.field}>
                      <span>Codigo opcional</span>
                      <input value={campanhaCodigo} onChange={(event) => setCampanhaCodigo(event.target.value)} placeholder="Gerado automaticamente" />
                    </label>
                    <label className={styles.field}>
                      <span>Descricao</span>
                      <input value={campanhaDescricao} onChange={(event) => setCampanhaDescricao(event.target.value)} placeholder="Contexto interno" />
                    </label>
                    <label className={`${styles.field} ${styles.fieldFull}`}>
                      <span>Mensagem inicial</span>
                      <textarea value={campanhaMensagem} onChange={(event) => setCampanhaMensagem(event.target.value)} placeholder="Ola, tenho interesse na campanha Black Friday." />
                    </label>
                  </div>
                  <button className={styles.primaryButton} disabled={salvando}>
                    Criar campanha
                  </button>
                </form>

                <section className={styles.card}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.eyebrow}>Acoes de marketing</p>
                      <h2>Campanhas</h2>
                    </div>
                    <span className={styles.countBadge}>{campanhas.length}</span>
                  </div>
                  <div className={styles.list}>
                    {campanhas.map((campanha) => (
                      <article className={styles.listItem} key={campanha.id}>
                        <div>
                          <strong>{campanha.nome}</strong>
                          <p>{campanha.rastreamento_origens?.nome || "Sem origem"} | Codigo: {campanha.codigo}</p>
                        </div>
                        <StatusControl
                          status={campanha.status}
                          onToggle={() =>
                            alternarStatus("campanhas", campanha.id, campanha.status)
                          }
                        />
                      </article>
                    ))}
                  </div>
                </section>
              </section>
            )}

            {aba === "links" && (
              <section className={styles.contentGrid}>
                <form className={styles.card} onSubmit={criarLink}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.eyebrow}>Redirecionamento</p>
                      <h2>Novo link rastreavel</h2>
                    </div>
                    <Plus size={20} />
                  </div>
                  <label className={styles.field}>
                    <span>Nome do link</span>
                    <input value={linkNome} onChange={(event) => setLinkNome(event.target.value)} placeholder="Ex.: Black Friday Stories" />
                  </label>
                  <label className={styles.field}>
                    <span>Campanha</span>
                    <select value={linkCampanhaId} onChange={(event) => setLinkCampanhaId(event.target.value)}>
                      <option value="">Selecione</option>
                      {campanhas.filter((item) => item.status === "ativo").map((campanha) => (
                        <option key={campanha.id} value={campanha.id}>{campanha.nome}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Identificador opcional</span>
                    <input value={linkSlug} onChange={(event) => setLinkSlug(event.target.value)} placeholder="black-friday-stories" />
                  </label>
                  <button className={styles.primaryButton} disabled={salvando}>
                    Gerar link
                  </button>
                </form>

                <section className={styles.card}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.eyebrow}>Links publicados</p>
                      <h2>Links rastreaveis</h2>
                    </div>
                    <span className={styles.countBadge}>{links.length}</span>
                  </div>
                  <div className={styles.list}>
                    {links.map((link) => (
                      <article className={styles.linkItem} key={link.id}>
                        <div className={styles.linkTop}>
                          <div>
                            <strong>{link.nome}</strong>
                            <p>{link.rastreamento_campanhas?.nome || "Sem campanha"} | {link.total_cliques} clique(s)</p>
                          </div>
                          <StatusControl
                            status={link.status}
                            onToggle={() =>
                              alternarStatus("links", link.id, link.status)
                            }
                          />
                        </div>
                        <div className={styles.urlRow}>
                          <code>{link.public_url}</code>
                          <button type="button" onClick={() => copiarLink(link.public_url)}>
                            <Copy size={15} />
                            Copiar
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </section>
            )}

            {aba === "eventos" && (
              <section className={styles.eventsLayout}>
                <form className={styles.card} onSubmit={salvarEvento}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.eyebrow}>Registro comercial</p>
                      <h2>Adicionar evento</h2>
                    </div>
                    <Plus size={20} />
                  </div>
                  <label className={styles.field}>
                    <span>Evento</span>
                    <select
                      value={eventoTipo}
                      onChange={(event) => {
                        const novoTipo = event.target.value;
                        setEventoTipo(novoTipo);

                        if (!eventoExigeValor(novoTipo)) {
                          setEventoValor("");
                        }
                      }}
                    >
                      {EVENTOS_MANUAIS.map((eventoManual) => (
                        <option key={eventoManual.value} value={eventoManual.value}>
                          {eventoManual.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Contato</span>
                    <select value={eventoContatoId} onChange={(event) => setEventoContatoId(event.target.value)}>
                      <option value="">Selecione</option>
                      {contatos.map((contato) => (
                        <option key={contato.id} value={contato.id}>
                          {contato.nome || "Sem nome"} - {contato.telefone}
                        </option>
                      ))}
                    </select>
                  </label>
                  {eventoExigeValor(eventoTipo) && (
                    <label className={styles.field}>
                      <span>Valor em reais</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={eventoValor}
                        onChange={(event) => setEventoValor(event.target.value)}
                        placeholder="497,00"
                      />
                    </label>
                  )}
                  <div className={styles.formActions}>
                    <button className={styles.primaryButton} disabled={salvando}>
                      Registrar evento
                    </button>
                  </div>
                </form>

                <section className={styles.card}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.eyebrow}>Jornada do lead</p>
                      <h2>Eventos recentes</h2>
                    </div>
                    <span className={styles.countBadge}>{eventos.length}</span>
                  </div>
                  <div className={styles.eventList}>
                    {eventosPaginados.length === 0 && (
                      <div className={styles.emptyState}>
                        Nenhum evento registrado ainda.
                      </div>
                    )}

                    {eventosPaginados.map((evento) => {
                      const metadata = obterMetadataEvento(evento);
                      const resultadoFluxo = obterResultadoFluxo(evento);
                      const resumoMeta = obterResumoMetaEvento(metadata);

                      return (
                        <article className={styles.eventItem} key={evento.id}>
                          <div className={styles.eventIcon}><Activity size={15} /></div>
                          <div className={styles.eventContent}>
                            <div className={styles.eventTitleRow}>
                              <strong>{EVENTOS_LABEL[evento.tipo] || evento.tipo}</strong>
                              {metadata.fluxo_nome && (
                                <span className={styles.eventFlowName}>
                                  {metadata.fluxo_nome}
                                </span>
                              )}
                              {resultadoFluxo && (
                                <span
                                  className={`${styles.eventResultBadge} ${resultadoFluxo.className}`}
                                >
                                  {resultadoFluxo.label}
                                </span>
                              )}
                              {resumoMeta && (
                                <span className={styles.eventMetaSourceBadge}>
                                  Anuncio Meta
                                </span>
                              )}
                            </div>
                            <p>
                              {evento.contatos?.nome || evento.contatos?.telefone || "Visitante ainda nao identificado"}
                              {evento.rastreamento_campanhas?.nome ? ` | ${evento.rastreamento_campanhas.nome}` : ""}
                              {evento.origem_registro === "manual" ? " | Manual" : ""}
                            </p>
                            {resumoMeta && (
                              <p className={styles.eventAdSummary}>
                                {resumoMeta.detalhe}
                                {resumoMeta.sourceId
                                  ? ` | ID anuncio: ${resumoMeta.sourceId}`
                                  : ""}
                              </p>
                            )}
                          </div>
                          <div className={styles.eventMeta}>
                            {formatarValor(evento.valor) && <b>{formatarValor(evento.valor)}</b>}
                            <span>{formatarData(evento.ocorrido_em)}</span>
                            {evento.origem_registro === "manual" && (
                              <div className={styles.eventActions}>
                                <button
                                  type="button"
                                  className={styles.eventActionButton}
                                  onClick={() => editarEvento(evento)}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className={styles.eventActionDangerButton}
                                  onClick={() => apagarEvento(evento)}
                                >
                                  Apagar
                                </button>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  {eventos.length > EVENTOS_POR_PAGINA && (
                    <div className={styles.paginationRow}>
                      <span>
                        Mostrando {primeiroEventoExibido}-{ultimoEventoExibido} de{" "}
                        {eventos.length}
                      </span>
                      <div className={styles.paginationActions}>
                        <button
                          type="button"
                          onClick={() =>
                            setPaginaEventos((paginaAtual) =>
                              Math.max(1, paginaAtual - 1)
                            )
                          }
                          disabled={paginaEventosAtual === 1}
                        >
                          Anterior
                        </button>
                        <strong>
                          Pagina {paginaEventosAtual} de {totalPaginasEventos}
                        </strong>
                        <button
                          type="button"
                          onClick={() =>
                            setPaginaEventos((paginaAtual) =>
                              Math.min(totalPaginasEventos, paginaAtual + 1)
                            )
                          }
                          disabled={paginaEventosAtual === totalPaginasEventos}
                        >
                          Proxima
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </section>
            )}
          </>
        )}
      </main>

      {modalEditarEventoAberto && (
        <div className={styles.modalOverlay} onClick={fecharModalEditarEvento}>
          <form
            className={styles.modalCard}
            onClick={(event) => event.stopPropagation()}
            onSubmit={salvarEventoEditado}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Registro comercial</p>
                <h3>Editar evento</h3>
                <p>Corrija o resultado manual registrado pelo atendente.</p>
              </div>

              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={fecharModalEditarEvento}
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <label className={styles.field}>
                <span>Evento</span>
                <select
                  value={eventoEdicaoTipo}
                  onChange={(event) => {
                    const novoTipo = event.target.value;
                    setEventoEdicaoTipo(novoTipo);

                    if (!eventoExigeValor(novoTipo)) {
                      setEventoEdicaoValor("");
                    }
                  }}
                >
                  {EVENTOS_MANUAIS.map((eventoManual) => (
                    <option key={eventoManual.value} value={eventoManual.value}>
                      {eventoManual.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Contato</span>
                <select
                  value={eventoEdicaoContatoId}
                  onChange={(event) => setEventoEdicaoContatoId(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {contatos.map((contato) => (
                    <option key={contato.id} value={contato.id}>
                      {contato.nome || "Sem nome"} - {contato.telefone}
                    </option>
                  ))}
                </select>
              </label>

              {eventoExigeValor(eventoEdicaoTipo) && (
                <label className={styles.field}>
                  <span>Valor em reais</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={eventoEdicaoValor}
                    onChange={(event) => setEventoEdicaoValor(event.target.value)}
                    placeholder="497,00"
                  />
                </label>
              )}

              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={fecharModalEditarEvento}
                  disabled={salvando}
                >
                  Cancelar
                </button>

                <button className={styles.primaryButton} disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
