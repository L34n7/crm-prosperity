"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import styles from "./contatos.module.css";

type StatusLead =
  | "novo"
  | "em_atendimento"
  | "qualificado"
  | "cliente"
  | "perdido";

type Contato = {
  id: string;
  empresa_id: string;
  nome: string | null;
  telefone: string;
  email: string | null;
  origem: string | null;
  campanha: string | null;
  status_lead: StatusLead;
  observacoes: string | null;
  telefone_revisar: boolean;
  created_at: string;
  updated_at?: string;
};

function getStatusLeadLabel(status: StatusLead) {
  switch (status) {
    case "novo":
      return "Novo";
    case "em_atendimento":
      return "Em atendimento";
    case "qualificado":
      return "Qualificado";
    case "cliente":
      return "Cliente";
    case "perdido":
      return "Perdido";
    default:
      return status;
  }
}

function getStatusLeadClass(status: StatusLead) {
  switch (status) {
    case "novo":
      return styles.statusNovo;
    case "em_atendimento":
      return styles.statusAtendimento;
    case "qualificado":
      return styles.statusQualificado;
    case "cliente":
      return styles.statusCliente;
    case "perdido":
      return styles.statusPerdido;
    default:
      return styles.statusPadrao;
  }
}

function getIniciais(nome?: string | null) {
  const valor = nome?.trim() || "Contato";
  const partes = valor.split(" ").filter(Boolean);

  if (partes.length === 0) return "CT";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

export default function ContatosPage() {
  const [contatos, setContatos] = useState<Contato[]>([]);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [origem, setOrigem] = useState("");
  const [campanha, setCampanha] = useState("");
  const [statusLead, setStatusLead] = useState<StatusLead>("novo");
  const [observacoes, setObservacoes] = useState("");

  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca, setBusca] = useState("");

  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState(""); 
  const [erroModal, setErroModal] = useState("");

  const [modalCriarAberto, setModalCriarAberto] = useState(false);
  const buscaTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editOrigem, setEditOrigem] = useState("");
  const [editCampanha, setEditCampanha] = useState("");
  const [editStatusLead, setEditStatusLead] = useState<StatusLead>("novo");
  const [editObservacoes, setEditObservacoes] = useState("");

  const [modalImportarAberto, setModalImportarAberto] = useState(false);
  const [arquivoImportacao, setArquivoImportacao] = useState<File | null>(null);
  const [importandoPreview, setImportandoPreview] = useState(false);
  const [confirmandoImportacao, setConfirmandoImportacao] = useState(false);
  const [erroImportacao, setErroImportacao] = useState("");
  const [mensagemImportacao, setMensagemImportacao] = useState("");

  const [opcoesOrigem, setOpcoesOrigem] = useState<string[]>([]);
  const [filtroOrigem, setFiltroOrigem] = useState("");
  const [filtroCampanha, setFiltroCampanha] = useState("");
  const [filtroTelefoneRevisar, setFiltroTelefoneRevisar] = useState(false);
  const [ordenacao, setOrdenacao] = useState("recentes");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(25);

  const [totalContatos, setTotalContatos] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [filtrosAvancadosAbertos, setFiltrosAvancadosAbertos] = useState(false);

  const [abaPreviewImportacao, setAbaPreviewImportacao] = useState<
    "alertas" | "validos" | "duplicados_banco" | "duplicados_arquivo" | "invalidos"
  >("alertas");

  const [paginaPreviewImportacao, setPaginaPreviewImportacao] = useState(1);
  const itensPorPaginaPreview = 5;

  const [previewImportacao, setPreviewImportacao] = useState<{
    resumo: {
      total: number;
      validos: number;
      alertas: number;
      duplicados_banco: number;
      duplicados_arquivo: number;
      invalidos: number;
    };
    validos: any[];
    alertas: any[];
    duplicados_banco: any[];
    duplicados_arquivo: any[];
    invalidos: any[];
  } | null>(null);


  function limparFormularioCriacao() {
    setNome("");
    setTelefone("");
    setEmail("");
    setOrigem("");
    setCampanha("");
    setStatusLead("novo");
    setObservacoes("");
  }

  function abrirModalCriacao() {
    setMensagem("");
    setErroModal(""); 
    limparFormularioCriacao();
    setModalCriarAberto(true);
  }

  function fecharModalCriacao() {
    setModalCriarAberto(false);
    limparFormularioCriacao();
  }

  async function carregarContatos() {
    setErro("");

    const params = new URLSearchParams();

    if (filtroStatus) {
      params.set("status_lead", filtroStatus);
    }

    if (busca.trim()) {
      params.set("busca", busca.trim());
    }

    if (filtroOrigem.trim()) {
      params.set("origem", filtroOrigem.trim());
    }

    if (filtroCampanha.trim()) {
      params.set("campanha", filtroCampanha.trim());
    }

    if (filtroTelefoneRevisar) {
      params.set("telefone_revisar", "true");
    }

    if (ordenacao) {
      params.set("ordenacao", ordenacao);
    }

    params.set("pagina", String(paginaAtual));
    params.set("limite", String(itensPorPagina));

    const queryString = params.toString();
    const url = `/api/contatos?${queryString}`;

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao carregar contatos");
      return;
    }

    setContatos(data.contatos || []);
    setTotalContatos(data.total || 0);
    setTotalPaginas(data.totalPaginas || 1);
  }

  async function criarContato() {
    setMensagem("");
    setErro("");

    if (!telefone.trim()) {
      setErro("Digite o telefone do contato.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/contatos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nome,
          telefone,
          email,
          origem,
          campanha,
          status_lead: statusLead,
          observacoes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErroModal(data.error || "Erro ao criar contato");
        return;
      }

      setMensagem(data.message || "Contato criado com sucesso.");
      fecharModalCriacao();
      await carregarContatos();
    } catch {
      setErro("Erro ao criar contato");
    } finally {
      setLoading(false);
    }
  }

  async function analisarArquivoImportacao() {
    if (!arquivoImportacao) {
      setErroImportacao("Selecione um arquivo CSV.");
      return;
    }

    setErroImportacao("");
    setMensagemImportacao("");
    setImportandoPreview(true);
    setPreviewImportacao(null);
    setAbaPreviewImportacao("alertas");
    setPaginaPreviewImportacao(1);

    try {
      const formData = new FormData();
      formData.append("file", arquivoImportacao);

      const res = await fetch("/api/contatos/importar/preview", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

    if (!res.ok) {
      setErroImportacao(data.error || "Erro ao analisar arquivo.");
      return;
    }

    setPreviewImportacao(data);

    if ((data.alertas || []).length > 0) {
      setAbaPreviewImportacao("alertas");
    } else if ((data.invalidos || []).length > 0) {
      setAbaPreviewImportacao("invalidos");
    } else if ((data.duplicados_banco || []).length > 0) {
      setAbaPreviewImportacao("duplicados_banco");
    } else if ((data.duplicados_arquivo || []).length > 0) {
      setAbaPreviewImportacao("duplicados_arquivo");
    } else {
      setAbaPreviewImportacao("validos");
    }

    setPaginaPreviewImportacao(1);
    } catch {
      setErroImportacao("Erro ao analisar arquivo.");
    } finally {
      setImportandoPreview(false);
    }
  }

  async function confirmarImportacaoContatos() {
    if (!previewImportacao?.validos?.length) {
      setErroImportacao("Nenhum contato válido para importar.");
      return;
    }

    setErroImportacao("");
    setMensagemImportacao("");
    setConfirmandoImportacao(true);

    try {
      const res = await fetch("/api/contatos/importar/confirmar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contatos: [
            ...(previewImportacao?.validos || []),
            ...(previewImportacao?.alertas || []),
          ],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErroImportacao(data.error || "Erro ao importar contatos.");
        return;
      }

      setMensagemImportacao(
        data.message || `${data.importados || 0} contato(s) importado(s) com sucesso.`
      );

      setArquivoImportacao(null);
      setPreviewImportacao(null);
      await carregarContatos();
    } catch {
      setErroImportacao("Erro ao importar contatos.");
    } finally {
      setConfirmandoImportacao(false);
    }
  }

  async function exportarContatos() {
    try {
      const params = new URLSearchParams();

      if (filtroStatus) {
        params.set("status_lead", filtroStatus);
      }

      const queryString = params.toString();
      const url = queryString
        ? `/api/contatos/exportar?${queryString}`
        : "/api/contatos/exportar";

      const res = await fetch(url);

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErro(data?.error || "Erro ao exportar contatos.");
        return;
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "contatos-crm.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(downloadUrl);
    } catch {
      setErro("Erro ao exportar contatos.");
    }
  }

  function baixarModeloCsv() {
    const conteudo =
      "nome,telefone,email,origem,campanha,status_lead,observacoes\n" +
      "Leandro Nunes,31975233266,teste@teste.com.br,whatsapp,Campanha Abril,novo,Cliente interessado\n" +
      "Maria Silva,31999999999,maria@email.com,instagram,Campanha Meta,qualificado,Quer orçamento";

    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "modelo-importacao-contatos.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  function iniciarEdicao(contato: Contato) {
    setEditandoId(contato.id);
    setExpandidoId(contato.id);
    setEditNome(contato.nome || "");
    setEditTelefone(contato.telefone || "");
    setEditEmail(contato.email || "");
    setEditOrigem(contato.origem || "");
    setEditCampanha(contato.campanha || "");
    setEditStatusLead(contato.status_lead);
    setEditObservacoes(contato.observacoes || "");
    setMensagem("");
    setErro("");
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditNome("");
    setEditTelefone("");
    setEditEmail("");
    setEditOrigem("");
    setEditCampanha("");
    setEditStatusLead("novo");
    setEditObservacoes("");
  }

  function abrirModalImportacao() {
    setErroImportacao("");
    setMensagemImportacao("");
    setArquivoImportacao(null);
    setPreviewImportacao(null);
    setModalImportarAberto(true);
    setAbaPreviewImportacao("alertas");
    setPaginaPreviewImportacao(1);
  }

  function fecharModalImportacao() {
    setModalImportarAberto(false);
    setErroImportacao("");
    setMensagemImportacao("");
    setArquivoImportacao(null);
    setPreviewImportacao(null);
    setAbaPreviewImportacao("alertas");
    setPaginaPreviewImportacao(1);
  }

  function getItensPreviewAtivos() {
    if (!previewImportacao) return [];

    switch (abaPreviewImportacao) {
      case "alertas":
        return previewImportacao.alertas || [];
      case "validos":
        return previewImportacao.validos || [];
      case "duplicados_banco":
        return previewImportacao.duplicados_banco || [];
      case "duplicados_arquivo":
        return previewImportacao.duplicados_arquivo || [];
      case "invalidos":
        return previewImportacao.invalidos || [];
      default:
        return [];
    }
  }

  function getTituloAbaPreview() {
    switch (abaPreviewImportacao) {
      case "alertas":
        return "Contatos com alerta";
      case "validos":
        return "Contatos válidos";
      case "duplicados_banco":
        return "Duplicados no banco";
      case "duplicados_arquivo":
        return "Duplicados no arquivo";
      case "invalidos":
        return "Linhas inválidas";
      default:
        return "Preview";
    }
  }

  const itensPreviewAtivos = getItensPreviewAtivos();
  const totalPaginasPreview = Math.max(
    1,
    Math.ceil(itensPreviewAtivos.length / itensPorPaginaPreview)
  );

  const paginaPreviewSegura = Math.min(paginaPreviewImportacao, totalPaginasPreview);
  const previewInicio = (paginaPreviewSegura - 1) * itensPorPaginaPreview;
  const previewFim = previewInicio + itensPorPaginaPreview;

  const itensPreviewPaginados = itensPreviewAtivos.slice(previewInicio, previewFim);

  async function salvarEdicao() {
    if (!editandoId) return;

    setMensagem("");
    setErro("");

    if (!editTelefone.trim()) {
      setErro("Digite o telefone do contato.");
      return;
    }

    const res = await fetch(`/api/contatos/${editandoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome: editNome,
        telefone: editTelefone,
        email: editEmail,
        origem: editOrigem,
        campanha: editCampanha,
        status_lead: editStatusLead,
        observacoes: editObservacoes,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao atualizar contato");
      return;
    }

    setMensagem(data.message || "Contato atualizado com sucesso.");
    cancelarEdicao();
    carregarContatos();
  }

  async function carregarOpcoesOrigem() {
    try {
      const res = await fetch("/api/contatos/opcoes");
      const data = await res.json();

      if (!res.ok) {
        return;
      }

      const origens = Array.isArray(data.origens) ? data.origens : [];
      setOpcoesOrigem(origens);
    } catch {
      // pode deixar silencioso
    }
  }

  function toggleExpandir(contatoId: string) {
    setExpandidoId((atual) => (atual === contatoId ? null : contatoId));
  }

  useEffect(() => {
    if (buscaTimeoutRef.current) {
      clearTimeout(buscaTimeoutRef.current);
    }

    buscaTimeoutRef.current = setTimeout(() => {
      carregarContatos();
    }, 350);

    return () => {
      if (buscaTimeoutRef.current) {
        clearTimeout(buscaTimeoutRef.current);
      }
    };
  }, [
    busca,
    filtroStatus,
    filtroOrigem,
    filtroCampanha,
    filtroTelefoneRevisar,
    ordenacao,
    paginaAtual,
    itensPorPagina,
  ]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (modalCriarAberto) {
        fecharModalCriacao();
      }

      if (modalImportarAberto) {
        fecharModalImportacao();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalCriarAberto, modalImportarAberto]);

  useEffect(() => {
    setPaginaAtual(1);
  }, [
    busca,
    filtroStatus,
    filtroOrigem,
    filtroCampanha,
    filtroTelefoneRevisar,
    ordenacao,
    itensPorPagina,
  ]);

  useEffect(() => {
    carregarOpcoesOrigem();
  }, []);

  return (
    <>
      <Header
        title="Contatos"
        subtitle="Gerencie contatos, origem dos leads, campanhas e status de atendimento."
      />

      <div className={styles.pageContent}>

      {!modalCriarAberto && !modalImportarAberto && erro && (
        <div className={styles.alertError}>{erro}</div>
      )}
      {!modalCriarAberto && !modalImportarAberto && mensagem && (
        <div className={styles.alertSuccess}>{mensagem}</div>
      )}
        
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>Filtros</p>
            <h2 className={styles.cardTitle}>Buscar contatos</h2>
            <p className={styles.cardDescription}>
              Use a busca rápida ou expanda para ver mais filtros.
            </p>
          </div>
        </div>

        <div className={styles.filterGrid}>
          <div className={styles.field}>
            <label className={styles.label}>Buscar</label>
            <input
              className={styles.input}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();

                  if (buscaTimeoutRef.current) {
                    clearTimeout(buscaTimeoutRef.current);
                  }

                  carregarContatos();
                }
              }}
              placeholder="Nome, telefone ou email"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Status</label>
            <select
              className={styles.select}
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="novo">Novo</option>
              <option value="em_atendimento">Em atendimento</option>
              <option value="qualificado">Qualificado</option>
              <option value="cliente">Cliente</option>
              <option value="perdido">Perdido</option>
            </select>
          </div>
        </div>

        {filtrosAvancadosAbertos && (
          <div className={styles.advancedFiltersWrapper}>
            <div className={styles.filterGrid}>

              <div className={styles.field}>
                <label className={styles.label}>Campanha</label>
                <input
                  className={styles.input}
                  value={filtroCampanha}
                  onChange={(e) => setFiltroCampanha(e.target.value)}
                  placeholder="Nome da campanha"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Origem</label>
                <select
                  className={styles.select}
                  value={filtroOrigem}
                  onChange={(e) => setFiltroOrigem(e.target.value)}
                >
                  <option value="">Todas</option>
                  {opcoesOrigem.map((origem) => (
                    <option key={origem} value={origem}>
                      {origem}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Ordenação</label>
                <select
                  className={styles.select}
                  value={ordenacao}
                  onChange={(e) => setOrdenacao(e.target.value)}
                >
                  <option value="recentes">Mais recentes</option>
                  <option value="antigos">Mais antigos</option>
                  <option value="nome_asc">Nome A → Z</option>
                  <option value="nome_desc">Nome Z → A</option>
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Telefone para revisar</label>

                <button
                  type="button"
                  className={`${styles.reviewFilterFlag} ${
                    filtroTelefoneRevisar ? styles.reviewFilterFlagActive : ""
                  }`}
                  onClick={() => {
                    setFiltroTelefoneRevisar((prev) => !prev);
                    setPaginaAtual(1);
                  }}
                  aria-pressed={filtroTelefoneRevisar}
                >
                  <span className={styles.reviewFilterDot} />
                  <span>
                    {filtroTelefoneRevisar
                      ? "Exibindo apenas contatos com revisão"
                      : "Mostrar contatos com revisão"}
                  </span>
                </button>
              </div>
              
              <div className={styles.field}>
                <label className={styles.label}>Itens por página</label>
                <select
                  className={styles.select}
                  value={String(itensPorPagina)}
                  onChange={(e) => setItensPorPagina(Number(e.target.value))}
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div className={styles.actionsRow}>
          <button
            onClick={carregarContatos} 
            className={styles.ButtonBuscar}>
            Buscar
          </button>

          <button
            type="button"
            onClick={() => {
              setBusca("");
              setFiltroCampanha("");
              setFiltroStatus("");
              setFiltroOrigem("");
              setFiltroTelefoneRevisar(false);
              setOrdenacao("recentes");
              setItensPorPagina(25);
              setPaginaAtual(1);
            }}
            className={styles.secondaryButton}
          >
            Limpar filtros
          </button>

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setFiltrosAvancadosAbertos((prev) => !prev)}
            aria-expanded={filtrosAvancadosAbertos}
          >
            {filtrosAvancadosAbertos ? "Ocultar filtros avançados" : "Mais filtros"}
          </button>
        </div>
      </section>

        <section className={styles.card}>
          <div className={styles.listHeader}>
            <div>
              <p className={styles.eyebrow}>Gestão</p>
              <h2 className={styles.cardTitle}>Contatos cadastrados</h2>
              <p className={styles.cardDescription}>
                Cards resumidos com expansão sob demanda para manter a tela mais limpa.
              </p>
            </div>

            <div className={styles.listHeaderActions}>
              <span className={styles.infoBadge}>{totalContatos} contato(s)</span>

              <button
                type="button"
                onClick={exportarContatos}
                className={styles.secondaryButton}
              >
                Exportar contatos
              </button>

              <button
                type="button"
                onClick={abrirModalImportacao}
                className={styles.secondaryButton}
              >
                Importar contatos
              </button>

              <button
                type="button"
                onClick={abrirModalCriacao}
                className={styles.createContactButton}
              >
                <span className={styles.createContactButtonIcon}>＋</span>
                <span>Novo contato</span>
              </button>
            </div>
          </div>

          {contatos.length === 0 ? (
            <div className={styles.emptyState}>
              Nenhum contato cadastrado ainda.
            </div>
          ) : (
            <div className={styles.list}>
              {contatos.map((contato) => {
                const expandido = expandidoId === contato.id;
                const editando = editandoId === contato.id;

                return (
                  <article key={contato.id} className={styles.itemCard}>
                    <div className={styles.itemSummary}>
                      <div className={styles.itemLeft}>
                        <div className={styles.avatar}>
                          {getIniciais(contato.nome)}
                        </div>

                        <div className={styles.itemIdentity}>
                          <div className={styles.itemTopRow}>
                            <h3 className={styles.itemTitle}>
                              {contato.nome || "Sem nome"}
                            </h3>

                            <span
                              className={`${styles.statusBadge} ${getStatusLeadClass(
                                contato.status_lead
                              )}`}
                            >
                              {getStatusLeadLabel(contato.status_lead)}
                            </span>

                            {contato.telefone_revisar && (
                              <span className={`${styles.statusBadge} ${styles.statusRevisarTelefone}`}>
                                Revisar telefone
                              </span>
                            )}
                          </div>

                          <p className={styles.itemSubline}>{contato.telefone}</p>

                          <div className={styles.summaryMeta}>
                            <span className={styles.metaItem}>
                              <strong>Email:</strong> {contato.email || "Sem email"}
                            </span>
                            <span className={styles.metaItem}>
                              <strong>Origem:</strong> {contato.origem || "—"}
                            </span>
                            <span className={styles.metaItem}>
                              <strong>Campanha:</strong> {contato.campanha || "—"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.itemRight}>
                        {!editando && (
                          <button
                            onClick={() => toggleExpandir(contato.id)}
                            className={styles.secondaryButton}
                          >
                            {expandido ? "Recolher" : "Expandir"}
                          </button>
                        )}

                        {!editando && (
                          <button
                            onClick={() => iniciarEdicao(contato)}
                            className={styles.secondaryButton}
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    </div>

                    {(expandido || editando) && (
                      <div className={styles.itemExpanded}>
                        {editando ? (
                          <div className={styles.editGrid}>
                            <div className={styles.field}>
                              <label className={styles.label}>Nome</label>
                              <input
                                className={styles.input}
                                value={editNome}
                                onChange={(e) => setEditNome(e.target.value)}
                                placeholder="Nome"
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Telefone</label>
                              <input
                                className={styles.input}
                                value={editTelefone}
                                onChange={(e) => setEditTelefone(e.target.value)}
                                placeholder="Telefone"
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Email</label>
                              <input
                                className={styles.input}
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                placeholder="Email"
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Origem</label>
                              <select
                                className={styles.select}
                                value={filtroOrigem}
                                onChange={(e) => setFiltroOrigem(e.target.value)}
                              >
                                <option value="">Todas</option>
                                {opcoesOrigem.map((origem) => (
                                  <option key={origem} value={origem}>
                                    {origem}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Campanha</label>
                              <input
                                className={styles.input}
                                value={editCampanha}
                                onChange={(e) => setEditCampanha(e.target.value)}
                                placeholder="Campanha"
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Status</label>
                              <select
                                className={styles.select}
                                value={editStatusLead}
                                onChange={(e) =>
                                  setEditStatusLead(e.target.value as StatusLead)
                                }
                              >
                                <option value="novo">Novo</option>
                                <option value="em_atendimento">Em atendimento</option>
                                <option value="qualificado">Qualificado</option>
                                <option value="cliente">Cliente</option>
                                <option value="perdido">Perdido</option>
                              </select>
                            </div>

                            <div className={styles.fieldFull}>
                              <label className={styles.label}>Observações</label>
                              <textarea
                                className={styles.textarea}
                                rows={4}
                                value={editObservacoes}
                                onChange={(e) => setEditObservacoes(e.target.value)}
                                placeholder="Observações"
                              />
                            </div>

                            <div className={styles.editActions}>
                              <button
                                onClick={salvarEdicao}
                                className={styles.primaryButton}
                              >
                                Salvar
                              </button>

                              <button
                                onClick={cancelarEdicao}
                                className={styles.secondaryButton}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={styles.detailsGrid}>
                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Campanha</span>
                              <span className={styles.infoValue}>
                                {contato.campanha || "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Origem</span>
                              <span className={styles.infoValue}>
                                {contato.origem || "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Email</span>
                              <span className={styles.infoValue}>
                                {contato.email || "Sem email"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Criado em</span>
                              <span className={styles.infoValue}>
                                {new Date(contato.created_at).toLocaleString("pt-BR")}
                              </span>
                            </div>

                            <div className={styles.infoBlockFull}>
                              <span className={styles.infoLabel}>Observações</span>
                              <span className={styles.infoValue}>
                                {contato.observacoes || "Sem observações"}
                              </span>
                            </div>

                            {contato.telefone_revisar && (
                              <div className={styles.infoBlockFull}>
                                <span className={styles.infoLabel}>Alerta</span>
                                <span className={styles.infoValue}>
                                  Este contato foi marcado para revisão de telefone.
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <div className={styles.paginationBar}>
            <div className={styles.paginationInfo}>
              Exibindo {contatos.length} de {totalContatos} contato(s)
            </div>

            <div className={styles.paginationActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setPaginaAtual((prev) => Math.max(1, prev - 1))}
                disabled={paginaAtual <= 1}
              >
                Anterior
              </button>

              <span className={styles.pageIndicator}>
                Página {paginaAtual} de {totalPaginas}
              </span>

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() =>
                  setPaginaAtual((prev) => Math.min(totalPaginas, prev + 1))
                }
                disabled={paginaAtual >= totalPaginas}
              >
                Próxima
              </button>
            </div>
          </div>
        </section>
      </div>

      {modalCriarAberto && (
        <div
          className={styles.modalOverlay}
          onClick={fecharModalCriacao}
        >
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Cadastro</p>
                <h2 className={styles.modalTitle}>Novo contato</h2>
                <p className={styles.cardDescription}>
                  Preencha os dados principais do contato.
                </p>
              </div>

              <button
                type="button"
                onClick={fecharModalCriacao}
                className={styles.modalCloseButton}
                aria-label="Fechar modal"
              >
                ×
              </button>
            </div>

            {erroModal && <div className={styles.alertError}>{erroModal}</div>}
            {mensagem && <div className={styles.alertSuccess}>{mensagem}</div>}

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label}>Nome</label>
                <input
                  className={styles.input}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome do contato"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Telefone *</label>
                <input
                  className={styles.input}
                  value={telefone}
                  onChange={(e) => {
                    setTelefone(e.target.value);
                    if (erroModal) setErroModal("");
                  }}
                  placeholder="31999999999"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@contato.com"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Origem</label>
                <select
                  className={styles.select}
                  value={filtroOrigem}
                  onChange={(e) => setFiltroOrigem(e.target.value)}
                >
                  <option value="">Todas</option>
                  {opcoesOrigem.map((origem) => (
                    <option key={origem} value={origem}>
                      {origem}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Campanha</label>
                <input
                  className={styles.input}
                  value={campanha}
                  onChange={(e) => setCampanha(e.target.value)}
                  placeholder="Nome da campanha"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Status do lead</label>
                <select
                  className={styles.select}
                  value={statusLead}
                  onChange={(e) => setStatusLead(e.target.value as StatusLead)}
                >
                  <option value="novo">Novo</option>
                  <option value="em_atendimento">Em atendimento</option>
                  <option value="qualificado">Qualificado</option>
                  <option value="cliente">Cliente</option>
                  <option value="perdido">Perdido</option>
                </select>
              </div>

              <div className={styles.fieldFull}>
                <label className={styles.label}>Observações</label>
                <textarea
                  className={styles.textarea}
                  rows={4}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Observações sobre o contato"
                />
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={criarContato}
                disabled={loading}
                className={styles.primaryButton}
              >
                {loading ? "Criando..." : "Criar contato"}
              </button>

              <button
                type="button"
                onClick={fecharModalCriacao}
                disabled={loading}
                className={styles.secondaryButton}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}


      {modalImportarAberto && (
        <div
          className={styles.modalOverlay}
          onClick={fecharModalImportacao}
        >
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Importação</p>
                <h2 className={styles.modalTitle}>Importar contatos</h2>
                <p className={styles.cardDescription}>
                  Envie um arquivo CSV para analisar contatos, identificar duplicados e importar apenas os válidos.
                </p>
              </div>

              <button
                type="button"
                onClick={fecharModalImportacao}
                className={styles.modalCloseButton}
                aria-label="Fechar modal"
              >
                ×
              </button>
            </div>

            {erroImportacao && (
              <div className={styles.alertError}>{erroImportacao}</div>
            )}

            {mensagemImportacao && (
              <div className={styles.alertSuccess}>{mensagemImportacao}</div>
            )}

            <div className={styles.formGrid}>
              <div className={styles.fieldFull}>
                <label className={styles.label}>Arquivo CSV ou Excel</label>
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  className={styles.input}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setArquivoImportacao(file);
                    setErroImportacao("");
                    setMensagemImportacao("");
                    setPreviewImportacao(null);
                  }}
                />
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={async () => {
                  const res = await fetch("/api/contatos/importar/modelo-excel");

                  if (!res.ok) {
                    setErroImportacao("Erro ao baixar modelo Excel.");
                    return;
                  }

                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);

                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "modelo-importacao-contatos.xlsx";
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);

                  URL.revokeObjectURL(url);
                }}
                className={styles.secondaryButton}
              >
                Baixar modelo Excel
              </button>

              <button
                type="button"
                onClick={analisarArquivoImportacao}
                disabled={importandoPreview}
                className={styles.primaryButton}
              >
                {importandoPreview ? "Analisando..." : "Analisar arquivo"}
              </button>

              <button
                type="button"
                onClick={fecharModalImportacao}
                className={styles.secondaryButton}
              >
                Fechar
              </button>
            </div>

            {previewImportacao && (
              <div className={styles.importPreviewWrapper}>
                <div className={styles.importSummaryGrid}>
                  <div className={styles.infoBlock}>
                    <span className={styles.infoLabel}>Total</span>
                    <span className={styles.infoValue}>
                      {previewImportacao.resumo.total}
                    </span>
                  </div>

                  <div className={styles.infoBlock}>
                    <span className={styles.infoLabel}>Alertas</span>
                    <span className={styles.infoValue}>
                      {previewImportacao.resumo.alertas}
                    </span>
                  </div>

                  <div className={styles.infoBlock}>
                    <span className={styles.infoLabel}>Válidos</span>
                    <span className={styles.infoValue}>
                      {previewImportacao.resumo.validos}
                    </span>
                  </div>

                  <div className={styles.infoBlock}>
                    <span className={styles.infoLabel}>Duplicados no banco</span>
                    <span className={styles.infoValue}>
                      {previewImportacao.resumo.duplicados_banco}
                    </span>
                  </div>

                  <div className={styles.infoBlock}>
                    <span className={styles.infoLabel}>Duplicados no arquivo</span>
                    <span className={styles.infoValue}>
                      {previewImportacao.resumo.duplicados_arquivo}
                    </span>
                  </div>

                  <div className={styles.infoBlock}>
                    <span className={styles.infoLabel}>Inválidos</span>
                    <span className={styles.infoValue}>
                      {previewImportacao.resumo.invalidos}
                    </span>
                  </div>
                </div>

                <div className={styles.importTabs}>
                  <button
                    type="button"
                    className={`${styles.importTabButton} ${
                      abaPreviewImportacao === "alertas" ? styles.importTabButtonActive : ""
                    }`}
                    onClick={() => {
                      setAbaPreviewImportacao("alertas");
                      setPaginaPreviewImportacao(1);
                    }}
                  >
                    Alertas ({previewImportacao.alertas.length})
                  </button>

                  <button
                    type="button"
                    className={`${styles.importTabButton} ${
                      abaPreviewImportacao === "validos" ? styles.importTabButtonActive : ""
                    }`}
                    onClick={() => {
                      setAbaPreviewImportacao("validos");
                      setPaginaPreviewImportacao(1);
                    }}
                  >
                    Válidos ({previewImportacao.validos.length})
                  </button>

                  <button
                    type="button"
                    className={`${styles.importTabButton} ${
                      abaPreviewImportacao === "duplicados_banco"
                        ? styles.importTabButtonActive
                        : ""
                    }`}
                    onClick={() => {
                      setAbaPreviewImportacao("duplicados_banco");
                      setPaginaPreviewImportacao(1);
                    }}
                  >
                    Duplicados no banco ({previewImportacao.duplicados_banco.length})
                  </button>

                  <button
                    type="button"
                    className={`${styles.importTabButton} ${
                      abaPreviewImportacao === "duplicados_arquivo"
                        ? styles.importTabButtonActive
                        : ""
                    }`}
                    onClick={() => {
                      setAbaPreviewImportacao("duplicados_arquivo");
                      setPaginaPreviewImportacao(1);
                    }}
                  >
                    Duplicados no arquivo ({previewImportacao.duplicados_arquivo.length})
                  </button>

                  <button
                    type="button"
                    className={`${styles.importTabButton} ${
                      abaPreviewImportacao === "invalidos" ? styles.importTabButtonActive : ""
                    }`}
                    onClick={() => {
                      setAbaPreviewImportacao("invalidos");
                      setPaginaPreviewImportacao(1);
                    }}
                  >
                    Inválidos ({previewImportacao.invalidos.length})
                  </button>
                </div>

                <div className={styles.importSection}>
                  <h3 className={styles.importSectionTitle}>{getTituloAbaPreview()}</h3>

                  {itensPreviewAtivos.length === 0 ? (
                    <div className={styles.emptyState}>Nenhum item nesta categoria.</div>
                  ) : (
                    <>
                      <div className={styles.list}>
                        {itensPreviewPaginados.map((item, index) => (
                          <div
                            key={`${abaPreviewImportacao}-${item.linha || index}-${index}`}
                            className={styles.itemCard}
                          >
                            <div className={styles.itemSummary}>
                              <div className={styles.itemLeft}>
                                <div className={styles.itemIdentity}>
                                  <h3 className={styles.itemTitle}>
                                    {item.nome || "Sem nome"}
                                  </h3>

                                  <p className={styles.itemSubline}>
                                    {item.telefone_normalizado ||
                                      item.telefone_original ||
                                      "Sem telefone"}
                                  </p>

                                  <div className={styles.summaryMeta}>
                                    <span className={styles.metaItem}>
                                      <strong>Linha:</strong> {item.linha}
                                    </span>

                                    {item.status_lead && (
                                      <span className={styles.metaItem}>
                                        <strong>Status:</strong> {item.status_lead}
                                      </span>
                                    )}

                                    {item.telefone_original &&
                                      item.telefone_normalizado &&
                                      item.telefone_original !== item.telefone_normalizado && (
                                        <span className={styles.metaItem}>
                                          <strong>Original:</strong> {item.telefone_original}
                                        </span>
                                      )}

                                    {item.motivo && (
                                      <span className={styles.metaItem}>
                                        <strong>Motivo:</strong> {item.motivo}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className={styles.paginationBar}>
                        <div className={styles.paginationInfo}>
                          Exibindo {itensPreviewPaginados.length} de {itensPreviewAtivos.length} item(ns)
                        </div>

                        <div className={styles.paginationActions}>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() =>
                              setPaginaPreviewImportacao((prev) => Math.max(1, prev - 1))
                            }
                            disabled={paginaPreviewSegura <= 1}
                          >
                            Anterior
                          </button>

                          <span className={styles.pageIndicator}>
                            Página {paginaPreviewSegura} de {totalPaginasPreview}
                          </span>

                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() =>
                              setPaginaPreviewImportacao((prev) =>
                                Math.min(totalPaginasPreview, prev + 1)
                              )
                            }
                            disabled={paginaPreviewSegura >= totalPaginasPreview}
                          >
                            Próxima
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    onClick={confirmarImportacaoContatos}
                    disabled={
                      confirmandoImportacao ||
                      (previewImportacao.validos.length + previewImportacao.alertas.length === 0)
                    }
                    className={styles.primaryButton}
                  >
                    {confirmandoImportacao
                      ? "Importando..."
                      : `Importar ${
                          previewImportacao.validos.length + previewImportacao.alertas.length
                        } contato(s)`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}