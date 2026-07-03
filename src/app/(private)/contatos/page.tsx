"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import styles from "./contatos.module.css";

type ClassificacaoContato = "qualificado" | "convertido" | "perdido" | null;

type Contato = {
  id: string;
  empresa_id: string;
  nome: string | null;
  whatsapp_profile_name: string | null;
  telefone: string;
  email: string | null;
  origem: string | null;
  campanha: string | null;
  origem_exibicao?: string | null;
  observacoes: string | null;
  telefone_revisar: boolean;
  classificacao: ClassificacaoContato;
  classificacao_atualizada_em?: string | null;
  contato_novo: boolean;
  campanha_exibicao?: string | null;
  campanha_status?: "ativo" | "inativo" | null;
  campanha_origem_nome?: string | null;
  opt_in_whatsapp?: boolean;
  whatsapp_opt_out?: boolean;
  whatsapp_opt_out_geral?: boolean;
  whatsapp_opt_out_marketing?: boolean;
  whatsapp_opt_out_utility?: boolean;
  conversa_id?: string | null;
  conversa_status?: string | null;
  conversa_ultima_mensagem_em?: string | null;
  conversa_encerrada_em?: string | null;
  protocolo_atual?: string | null;
  protocolo_resultado?: string | null;
  contato_novo_no_inicio?: boolean;
  iniciado_com_bot?: boolean;
  finalizado_com_bot?: boolean | null;
  finalizado_por_tipo?: "bot" | "atendente" | "sistema" | null;
  finalizado_por_usuario_id?: string | null;
  finalizado_por_usuario_nome?: string | null;
  rastreamento_campanha_id?: string | null;
  created_at: string;
  updated_at?: string;
};

type CampanhaRastreamento = {
  id: string;
  nome: string;
  codigo: string | null;
  status: "ativo" | "inativo";
  rastreamento_origens?: { id: string; nome: string } | null;
};

type ItemPreviewImportacao = {
  linha?: number;
  nome?: string;
  telefone_normalizado?: string;
  telefone_original?: string;
  status_lead?: string;
  motivo?: string;
  [campo: string]: unknown;
};

const MANTER_VALOR_EM_MASSA = "__manter__";
const REMOVER_VALOR_EM_MASSA = "__remover__";

function getClassificacaoLabel(classificacao: ClassificacaoContato) {
  switch (classificacao) {
    case "qualificado":
      return "Qualificado";
    case "convertido":
      return "Convertido";
    case "perdido":
      return "Perdido";
    default:
      return "Sem classificação";
  }
}

function getClassificacaoClass(classificacao: ClassificacaoContato) {
  switch (classificacao) {
    case "qualificado":
      return styles.statusQualificado;
    case "convertido":
      return styles.statusCliente;
    case "perdido":
      return styles.statusPerdido;
    default:
      return styles.statusPadrao;
  }
}

function getStatusConversaLabel(status?: string | null) {
  switch (status) {
    case "aberta":
      return "Aberta";
    case "bot":
      return "Robô";
    case "fila":
      return "Fila";
    case "em_atendimento":
      return "Em atendimento";
    case "aguardando_cliente":
      return "Aguardando cliente";
    case "encerrado_manual":
      return "Encerrada manualmente";
    case "encerrado_24h":
      return "Encerrada após 24h";
    case "encerrado_aut":
      return "Encerrada pela automação";
    default:
      return "Sem conversa";
  }
}

function getStatusConversaClass(status?: string | null) {
  if (status === "em_atendimento") return styles.statusAtendimento;
  if (status === "fila") return styles.statusNovo;
  if (status === "bot") return styles.statusBot;
  if (status === "aguardando_cliente") return styles.statusAguardando;
  if (status?.startsWith("encerrado")) return styles.statusEncerrado;
  return styles.statusPadrao;
}

function getOptOutLabel(contato: Contato) {
  if (contato.whatsapp_opt_out_geral === true) return "Todos os disparos";

  const marketing = contato.whatsapp_opt_out_marketing === true;
  const utility = contato.whatsapp_opt_out_utility === true;

  if (marketing && utility) return "Marketing e Utility";
  if (marketing) return "Marketing";
  if (utility) return "Utility";
  return contato.whatsapp_opt_out === true ? "Sim" : "Não";
}

function getIniciais(nome?: string | null) {
  const valor = nome?.trim() || "Contato";
  const partes = valor.split(" ").filter(Boolean);

  if (partes.length === 0) return "CT";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

function getNomeCampanhaContato(contato: Contato) {
  return contato.campanha_exibicao || contato.campanha || "—";
}

function getNomeOrigemContato(contato: Contato) {
  return contato.origem_exibicao || contato.origem || "—";
}

function getLabelCampanhaRastreamento(campanha: CampanhaRastreamento) {
  const origem = campanha.rastreamento_origens?.nome;
  const status = campanha.status === "inativo" ? " - inativa" : "";

  return origem
    ? `${campanha.nome} (${origem})${status}`
    : `${campanha.nome}${status}`;
}

export default function ContatosPage() {
  const [contatos, setContatos] = useState<Contato[]>([]);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [origem, setOrigem] = useState("");
  const [campanha, setCampanha] = useState("");
  const [rastreamentoCampanhaId, setRastreamentoCampanhaId] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const [filtroClassificacoes, setFiltroClassificacoes] = useState<string[]>(
    []
  );
  const [filtroStatusConversa, setFiltroStatusConversa] = useState<string[]>(
    []
  );
  const [filtroApenasNovos, setFiltroApenasNovos] = useState(false);
  const [busca, setBusca] = useState("");

  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState(""); 
  const [erroModal, setErroModal] = useState("");

  const [modalCriarAberto, setModalCriarAberto] = useState(false);
  const buscaTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selecionarTodosRef = useRef<HTMLInputElement | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editOrigem, setEditOrigem] = useState("");
  const [editCampanha, setEditCampanha] = useState("");
  const [editRastreamentoCampanhaId, setEditRastreamentoCampanhaId] =
    useState("");
  const [editObservacoes, setEditObservacoes] = useState("");

  const [modalImportarAberto, setModalImportarAberto] = useState(false);
  const [arquivoImportacao, setArquivoImportacao] = useState<File | null>(null);
  const [importandoPreview, setImportandoPreview] = useState(false);
  const [confirmandoImportacao, setConfirmandoImportacao] = useState(false);
  const [erroImportacao, setErroImportacao] = useState("");
  const [mensagemImportacao, setMensagemImportacao] = useState("");

  const [opcoesOrigem, setOpcoesOrigem] = useState<string[]>([]);
  const [opcoesCampanha, setOpcoesCampanha] = useState<string[]>([]);
  const [campanhasRastreamento, setCampanhasRastreamento] = useState<
    CampanhaRastreamento[]
  >([]);
  const [filtroOrigem, setFiltroOrigem] = useState("");
  const [filtroCampanha, setFiltroCampanha] = useState("");
  const [filtroOptIn, setFiltroOptIn] = useState("");
  const [filtroOptOut, setFiltroOptOut] = useState("");
  const [filtroTelefoneRevisar, setFiltroTelefoneRevisar] = useState(false);
  const [ordenacao, setOrdenacao] = useState("recentes");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(50);

  const [totalContatos, setTotalContatos] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [filtrosAvancadosAbertos, setFiltrosAvancadosAbertos] = useState(false);
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false);
  const [contatoParaExcluir, setContatoParaExcluir] = useState<Contato | null>(null);
  const [excluindoContato, setExcluindoContato] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set()
  );
  const [campanhaEmMassa, setCampanhaEmMassa] = useState(
    MANTER_VALOR_EM_MASSA
  );
  const [origemEmMassa, setOrigemEmMassa] = useState(MANTER_VALOR_EM_MASSA);
  const [atualizandoEmMassa, setAtualizandoEmMassa] = useState(false);

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
    validos: ItemPreviewImportacao[];
    alertas: ItemPreviewImportacao[];
    duplicados_banco: ItemPreviewImportacao[];
    duplicados_arquivo: ItemPreviewImportacao[];
    invalidos: ItemPreviewImportacao[];
  } | null>(null);

  const campanhasLegadasSemVinculo = useMemo(() => {
    const nomesRastreamento = new Set(
      campanhasRastreamento.map((item) => item.nome.trim().toLowerCase())
    );

    return opcoesCampanha.filter(
      (nomeCampanha) => !nomesRastreamento.has(nomeCampanha.trim().toLowerCase())
    );
  }, [campanhasRastreamento, opcoesCampanha]);

  function selecionarCampanhaCadastro(campanhaId: string) {
    const campanhaSelecionada = campanhasRastreamento.find(
      (item) => item.id === campanhaId
    );

    setRastreamentoCampanhaId(campanhaId);
    setCampanha(campanhaSelecionada?.nome || "");

    if (campanhaSelecionada?.rastreamento_origens?.nome) {
      setOrigem(campanhaSelecionada.rastreamento_origens.nome);
    }
  }

  function selecionarCampanhaEdicao(campanhaId: string) {
    const campanhaSelecionada = campanhasRastreamento.find(
      (item) => item.id === campanhaId
    );

    setEditRastreamentoCampanhaId(campanhaId);
    setEditCampanha(campanhaSelecionada?.nome || "");

    if (campanhaSelecionada?.rastreamento_origens?.nome) {
      setEditOrigem(campanhaSelecionada.rastreamento_origens.nome);
    }
  }


  function limparFormularioCriacao() {
    setNome("");
    setTelefone("");
    setEmail("");
    setOrigem("");
    setCampanha("");
    setRastreamentoCampanhaId("");
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

    if (filtroClassificacoes.length > 0) {
      params.set("classificacoes", filtroClassificacoes.join(","));
    }

    if (filtroStatusConversa.length > 0) {
      params.set("status_conversa", filtroStatusConversa.join(","));
    }

    if (filtroApenasNovos) {
      params.set("contato_novo", "true");
    }

    if (busca.trim()) {
      params.set("busca", busca.trim());
    }

    if (filtroOrigem.trim()) {
      params.set("origem", filtroOrigem.trim());
    }

    if (filtroCampanha.startsWith("rastreamento:")) {
      params.set(
        "rastreamento_campanha_id",
        filtroCampanha.replace("rastreamento:", "")
      );
    } else if (filtroCampanha.trim()) {
      params.set("campanha", filtroCampanha.trim());
    }

    if (filtroTelefoneRevisar) {
      params.set("telefone_revisar", "true");
    }

    if (filtroOptIn) {
      params.set("opt_in", filtroOptIn);
    }

    if (filtroOptOut) {
      params.set("opt_out", filtroOptOut);
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

    const contatosCarregados = Array.isArray(data.contatos)
      ? data.contatos
      : [];
    const idsCarregados = new Set(
      contatosCarregados.map((contato: Contato) => contato.id)
    );

    setContatos(contatosCarregados);
    setSelecionados(
      (atuais) =>
        new Set(Array.from(atuais).filter((id) => idsCarregados.has(id)))
    );
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
          rastreamento_campanha_id: rastreamentoCampanhaId || null,
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

      if (filtroClassificacoes.length > 0) {
        params.set("classificacoes", filtroClassificacoes.join(","));
      }

      if (filtroStatusConversa.length > 0) {
        params.set("status_conversa", filtroStatusConversa.join(","));
      }

      if (filtroApenasNovos) {
        params.set("contato_novo", "true");
      }

      if (busca.trim()) {
        params.set("busca", busca.trim());
      }

      if (filtroOrigem.trim()) {
        params.set("origem", filtroOrigem.trim());
      }

      if (filtroCampanha.startsWith("rastreamento:")) {
        params.set(
          "rastreamento_campanha_id",
          filtroCampanha.replace("rastreamento:", "")
        );
      } else if (filtroCampanha.trim()) {
        params.set("campanha", filtroCampanha.trim());
      }

      if (filtroTelefoneRevisar) {
        params.set("telefone_revisar", "true");
      }

      if (filtroOptIn) {
        params.set("opt_in", filtroOptIn);
      }

      if (filtroOptOut) {
        params.set("opt_out", filtroOptOut);
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

  function iniciarEdicao(contato: Contato) {
    const campanhaVinculada =
      contato.rastreamento_campanha_id ||
      campanhasRastreamento.find(
        (campanhaItem) =>
          campanhaItem.nome.trim().toLowerCase() ===
          String(contato.campanha || "").trim().toLowerCase()
      )?.id ||
      "";

    setEditandoId(contato.id);
    setExpandidoId(contato.id);
    setEditNome(contato.nome || "");
    setEditTelefone(contato.telefone || "");
    setEditEmail(contato.email || "");
    setEditOrigem(contato.origem || "");
    setEditCampanha(contato.campanha || "");
    setEditRastreamentoCampanhaId(campanhaVinculada);
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
    setEditRastreamentoCampanhaId("");
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

    const payloadEdicao: Record<string, unknown> = {
      nome: editNome,
      telefone: editTelefone,
      email: editEmail,
      origem: editOrigem,
      campanha: editCampanha,
      observacoes: editObservacoes,
    };

    if (editRastreamentoCampanhaId || !editCampanha.trim()) {
      payloadEdicao.rastreamento_campanha_id =
        editRastreamentoCampanhaId || null;
    }

    const res = await fetch(`/api/contatos/${editandoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payloadEdicao),
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

  async function carregarOpcoesFiltros() {
    try {
      const res = await fetch("/api/contatos/opcoes", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        return;
      }

      const origens = Array.isArray(data.origens) ? data.origens : [];
      const campanhas = Array.isArray(data.campanhas) ? data.campanhas : [];
      const campanhasRastreamento = Array.isArray(data.campanhas_rastreamento)
        ? data.campanhas_rastreamento
        : [];

      setOpcoesOrigem(origens);
      setOpcoesCampanha(campanhas);
      setCampanhasRastreamento(campanhasRastreamento);
    } catch {
      // pode deixar silencioso
    }
  }

  function toggleExpandir(contatoId: string) {
    setExpandidoId((atual) => (atual === contatoId ? null : contatoId));
  }

  function abrirModalExcluir(contato: Contato) {
    setErro("");
    setMensagem("");
    setContatoParaExcluir(contato);
    setModalExcluirAberto(true);
  }

  function fecharModalExcluir() {
    if (excluindoContato) return;

    setModalExcluirAberto(false);
    setContatoParaExcluir(null);
  }

  async function excluirContato() {
    if (!contatoParaExcluir) return;

    setExcluindoContato(true);
    setErro("");
    setMensagem("");

    try {
      const res = await fetch(`/api/contatos/${contatoParaExcluir.id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao excluir contato.");
        return;
      }

      setMensagem(data.message || "Contato excluído com sucesso.");
      fecharModalExcluir();
      await carregarContatos();
    } catch {
      setErro("Erro ao excluir contato.");
    } finally {
      setExcluindoContato(false);
    }
  }

  function alternarContatoSelecionado(contatoId: string) {
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);

      if (proximos.has(contatoId)) {
        proximos.delete(contatoId);
      } else {
        proximos.add(contatoId);
      }

      return proximos;
    });
  }

  function alternarPaginaSelecionada() {
    const idsPagina = contatos.map((contato) => contato.id);
    const paginaInteiraSelecionada =
      idsPagina.length > 0 && idsPagina.every((id) => selecionados.has(id));

    setSelecionados((atuais) => {
      const proximos = new Set(atuais);

      idsPagina.forEach((id) => {
        if (paginaInteiraSelecionada) {
          proximos.delete(id);
        } else {
          proximos.add(id);
        }
      });

      return proximos;
    });
  }

  function limparSelecao() {
    setSelecionados(new Set());
    setCampanhaEmMassa(MANTER_VALOR_EM_MASSA);
    setOrigemEmMassa(MANTER_VALOR_EM_MASSA);
  }

  async function aplicarAlteracoesEmMassa() {
    if (selecionados.size === 0) {
      setErro("Selecione ao menos um contato.");
      return;
    }

    const payload: Record<string, unknown> = {
      ids: Array.from(selecionados),
    };

    if (campanhaEmMassa !== MANTER_VALOR_EM_MASSA) {
      payload.rastreamento_campanha_id =
        campanhaEmMassa === REMOVER_VALOR_EM_MASSA
          ? null
          : campanhaEmMassa;
    }

    if (origemEmMassa !== MANTER_VALOR_EM_MASSA) {
      payload.origem =
        origemEmMassa === REMOVER_VALOR_EM_MASSA ? null : origemEmMassa;
    }


    if (Object.keys(payload).length === 1) {
      setErro("Escolha ao menos uma alteração para aplicar.");
      return;
    }

    setAtualizandoEmMassa(true);
    setErro("");
    setMensagem("");

    try {
      const res = await fetch("/api/contatos/lote", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao atualizar os contatos.");
        return;
      }

      setMensagem(data.message || "Contatos atualizados com sucesso.");
      limparSelecao();
      await carregarContatos();
      await carregarOpcoesFiltros();
    } catch {
      setErro("Erro ao atualizar os contatos.");
    } finally {
      setAtualizandoEmMassa(false);
    }
  }

  function alternarFiltro(
    valor: string,
    atual: string[],
    atualizar: (valores: string[]) => void
  ) {
    atualizar(
      atual.includes(valor)
        ? atual.filter((item) => item !== valor)
        : [...atual, valor]
    );
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
    filtroClassificacoes,
    filtroStatusConversa,
    filtroApenasNovos,
    filtroOrigem,
    filtroCampanha,
    filtroOptIn,
    filtroOptOut,
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
    filtroClassificacoes,
    filtroStatusConversa,
    filtroApenasNovos,
    filtroOrigem,
    filtroCampanha,
    filtroOptIn,
    filtroOptOut,
    filtroTelefoneRevisar,
    ordenacao,
    itensPorPagina,
  ]);

  useEffect(() => {
    carregarOpcoesFiltros();
  }, []);

  const selecionadosNaPagina = contatos.filter((contato) =>
    selecionados.has(contato.id)
  ).length;
  const paginaInteiraSelecionada =
    contatos.length > 0 && selecionadosNaPagina === contatos.length;

  useEffect(() => {
    if (selecionarTodosRef.current) {
      selecionarTodosRef.current.indeterminate =
        selecionadosNaPagina > 0 && !paginaInteiraSelecionada;
    }
  }, [paginaInteiraSelecionada, selecionadosNaPagina]);

  return (
    <>
      <Header
        title="Contatos"
        subtitle="Gerencie contatos, origem dos leads, campanhas e status de atendimento."
      />

      <div className={styles.pageContent}>
      
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
              placeholder="Nome, WhatsApp, telefone ou email"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Campanha</label>
            <select
              className={styles.select}
              value={filtroCampanha}
              onChange={(e) => setFiltroCampanha(e.target.value)}
            >
              <option value="">Todas</option>

              {campanhasRastreamento.length === 0 &&
              campanhasLegadasSemVinculo.length === 0 ? (
                <option value="" disabled>
                  Sem campanhas
                </option>
              ) : (
                <>
                  {campanhasRastreamento.map((campanhaItem) => (
                    <option
                      key={campanhaItem.id}
                      value={`rastreamento:${campanhaItem.id}`}
                    >
                      {getLabelCampanhaRastreamento(campanhaItem)}
                    </option>
                  ))}

                  {campanhasLegadasSemVinculo.map((campanhaLegada) => (
                    <option key={campanhaLegada} value={campanhaLegada}>
                      {campanhaLegada}
                    </option>
                  ))}
                </>
              )}
            </select>
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
            <label className={styles.label}>Opt-in</label>
            <select
              className={styles.select}
              value={filtroOptIn}
              onChange={(e) => {
                setFiltroOptIn(e.target.value);
                setPaginaAtual(1);
              }}
            >
              <option value="">Todos</option>
              <option value="true">Com opt-in</option>
              <option value="false">Sem opt-in (lista fria)</option>
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Opt-out</label>
            <select
              className={styles.select}
              value={filtroOptOut}
              onChange={(e) => {
                setFiltroOptOut(e.target.value);
                setPaginaAtual(1);
              }}
            >
              <option value="">Todos</option>
              <option value="true">Com opt-out</option>
              <option value="false">Sem opt-out</option>
            </select>
          </div>

          <div className={styles.filterGroupsRow}>
            <div className={styles.filterGroupBox}>
              <label className={styles.label}>Status da conversa</label>

              <div className={styles.filterChecklist}>
                {[
                  ["aberta", "Aberta"],
                  ["fila", "Fila"],
                  ["bot", "Robô"],
                  ["em_atendimento", "Em atendimento"],
                  ["aguardando_cliente", "Aguardando cliente"],
                  ["encerrado_manual", "Encerrada manualmente"],
                  ["encerrado_24h", "Encerrada após 24h"],
                  ["encerrado_aut", "Encerrada pela automação"],
                  ["sem_conversa", "Sem conversa"],
                ].map(([valor, label]) => (
                  <label key={valor} className={styles.filterCheck}>
                    <input
                      type="checkbox"
                      checked={filtroStatusConversa.includes(valor)}
                      onChange={() =>
                        alternarFiltro(
                          valor,
                          filtroStatusConversa,
                          setFiltroStatusConversa
                        )
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.filterGroupBox}>
              <label className={styles.label}>Classificações</label>

              <div className={styles.filterChecklist}>
                <label className={styles.filterCheck}>
                  <input
                    type="checkbox"
                    checked={filtroApenasNovos}
                    onChange={(e) => setFiltroApenasNovos(e.target.checked)}
                  />
                  <span>Novo</span>
                </label>

                {[
                  ["qualificado", "Qualificado"],
                  ["convertido", "Convertido"],
                  ["perdido", "Perdido"],
                ].map(([valor, label]) => (
                  <label key={valor} className={styles.filterCheck}>
                    <input
                      type="checkbox"
                      checked={filtroClassificacoes.includes(valor)}
                      onChange={() =>
                        alternarFiltro(
                          valor,
                          filtroClassificacoes,
                          setFiltroClassificacoes
                        )
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

        </div>

        {filtrosAvancadosAbertos && (
          <div className={styles.advancedFiltersWrapper}>
            <div className={styles.filterGrid}>

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
              setFiltroClassificacoes([]);
              setFiltroStatusConversa([]);
              setFiltroApenasNovos(false);
              setFiltroOrigem("");
              setFiltroOptIn("");
              setFiltroOptOut("");
              setFiltroTelefoneRevisar(false);
              setOrdenacao("recentes");
              setItensPorPagina(50);
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

      {!modalCriarAberto && !modalImportarAberto && erro && (
        <div className={styles.alertError}>{erro}</div>
      )}
      <FeedbackToast
        success={mensagem}
        onSuccessDismiss={() => setMensagem("")}
      />
      
        <section className={styles.card}>
          <div className={styles.listHeader}>
            <div>
              <p className={styles.eyebrow}>Gestão</p>
              <h2 className={styles.cardTitle}>Contatos cadastrados</h2>
              <p className={styles.cardDescription}>
                Visualize, filtre, importe e edite seus contatos cadastrados.
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

          {selecionados.size > 0 && (
            <div className={`${styles.bulkToolbar} ${styles.bulkToolbarActive}`}>
              <div className={styles.bulkSelectionInfo}>
                <strong>{selecionados.size}</strong>
                <span>
                  {selecionados.size === 1
                    ? "contato selecionado"
                    : "contatos selecionados"}
                </span>
              </div>

              <div className={styles.bulkFields}>
                <label className={styles.bulkField}>
                  <span>Campanha</span>
                  <select
                    value={campanhaEmMassa}
                    onChange={(e) => setCampanhaEmMassa(e.target.value)}
                    disabled={atualizandoEmMassa}
                  >
                    <option value={MANTER_VALOR_EM_MASSA}>Não alterar</option>
                    <option value={REMOVER_VALOR_EM_MASSA}>Remover campanha</option>

                    {campanhasRastreamento.map((campanhaItem) => (
                      <option key={campanhaItem.id} value={campanhaItem.id}>
                        {getLabelCampanhaRastreamento(campanhaItem)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.bulkField}>
                  <span>Origem</span>
                  <select
                    value={origemEmMassa}
                    onChange={(e) => setOrigemEmMassa(e.target.value)}
                    disabled={atualizandoEmMassa}
                  >
                    <option value={MANTER_VALOR_EM_MASSA}>Não alterar</option>
                    <option value={REMOVER_VALOR_EM_MASSA}>Remover origem</option>

                    {opcoesOrigem.map((origem) => (
                      <option key={origem} value={origem}>
                        {origem}
                      </option>
                    ))}
                  </select>
                </label>

              </div>

              <div className={styles.bulkActions}>
                <button
                  type="button"
                  className={styles.bulkApplyButton}
                  onClick={aplicarAlteracoesEmMassa}
                  disabled={
                    atualizandoEmMassa ||
                    (campanhaEmMassa === MANTER_VALOR_EM_MASSA &&
                      origemEmMassa === MANTER_VALOR_EM_MASSA)
                  }
                >
                  {atualizandoEmMassa ? "Aplicando..." : "Aplicar alterações"}
                </button>

                <button
                  type="button"
                  className={styles.bulkClearButton}
                  onClick={limparSelecao}
                  disabled={atualizandoEmMassa}
                >
                  Limpar seleção
                </button>
              </div>
            </div>
          )}

          {contatos.length === 0 ? (
            <div className={styles.emptyState}>
              Nenhum contato cadastrado ainda.
            </div>
          ) : (
            <div className={styles.sheetScroll}>
              <div className={styles.sheet}>
                <div className={styles.sheetHeader} role="row">
                  <div className={styles.checkboxCell}>
                    <input
                      ref={selecionarTodosRef}
                      type="checkbox"
                      checked={paginaInteiraSelecionada}
                      onChange={alternarPaginaSelecionada}
                      aria-label="Selecionar todos os contatos desta página"
                    />
                  </div>
                  <span>Contato</span>
                  <span>Telefone</span>
                  <span>Classificação</span>
                  <span>Conversa</span>
                  <span>Opt-in</span>
                  <span>Opt-out</span>
                  <span>Origem</span>
                  <span>Campanha</span>
                  <span className={styles.sheetActionsLabel}>Ações</span>
                </div>

                <div className={styles.list}>
                  {contatos.map((contato) => {
                    const expandido = expandidoId === contato.id;
                    const editando = editandoId === contato.id;
                    const selecionado = selecionados.has(contato.id);

                    return (
                      <article
                        key={contato.id}
                        className={`${styles.itemCard} ${
                          selecionado ? styles.itemCardSelected : ""
                        }`}
                      >
                        <div className={styles.itemSummary} role="row">
                          <div className={styles.checkboxCell}>
                            <input
                              type="checkbox"
                              checked={selecionado}
                              onChange={() =>
                                alternarContatoSelecionado(contato.id)
                              }
                              aria-label={`Selecionar ${
                                contato.nome || contato.telefone
                              }`}
                            />
                          </div>

                          <div className={styles.contactCell}>
                            <div className={styles.avatar}>
                              {getIniciais(contato.nome)}
                            </div>

                            <div className={styles.itemIdentity}>
                              <div className={styles.itemTopRow}>
                                <h3 className={styles.itemTitle}>
                                  {contato.nome || "Sem nome"}
                                </h3>

                                {contato.contato_novo && (
                                  <span
                                    className={`${styles.statusBadge} ${styles.statusNovo}`}
                                  >
                                    Novo
                                  </span>
                                )}

                                {contato.telefone_revisar && (
                                  <span
                                    className={styles.reviewDot}
                                    title="Telefone para revisar"
                                    aria-label="Telefone para revisar"
                                  />
                                )}
                              </div>
                              <p className={styles.itemSubline}>
                                {contato.email ||
                                  contato.whatsapp_profile_name ||
                                  "Sem email"}
                              </p>
                            </div>
                          </div>

                          <span className={styles.sheetCell}>
                            {contato.telefone}
                          </span>

                          <div className={styles.sheetCell}>
                            {contato.classificacao ? (
                              <span
                                className={`${styles.statusBadge} ${getClassificacaoClass(
                                  contato.classificacao
                                )}`}
                              >
                                {getClassificacaoLabel(contato.classificacao)}
                              </span>
                            ) : (
                              <span className={styles.mutedCell}>—</span>
                            )}
                          </div>

                          <div className={styles.sheetCell}>
                            <span
                              className={`${styles.statusBadge} ${getStatusConversaClass(
                                contato.conversa_status
                              )}`}
                            >
                              {getStatusConversaLabel(contato.conversa_status)}
                            </span>
                          </div>

                          <div className={styles.sheetCell}>
                            <span
                              className={`${styles.statusBadge} ${
                                contato.opt_in_whatsapp === true
                                  ? styles.statusCliente
                                  : styles.statusPadrao
                              }`}
                            >
                              {contato.opt_in_whatsapp === true ? "Sim" : "Não"}
                            </span>
                          </div>

                          <div className={styles.sheetCell}>
                            <span
                              className={`${styles.statusBadge} ${
                                contato.whatsapp_opt_out === true
                                  ? styles.statusPerdido
                                  : styles.statusCliente
                              }`}
                              title={
                                contato.whatsapp_opt_out === true
                                  ? `Opt-out: ${getOptOutLabel(contato)}`
                                  : "Sem opt-out"
                              }
                            >
                              {getOptOutLabel(contato)}
                            </span>
                          </div>

                          <span
                            className={styles.sheetCell}
                            title={getNomeOrigemContato(contato)}
                          >
                            {getNomeOrigemContato(contato)}
                          </span>

                          <span
                            className={styles.sheetCell}
                            title={getNomeCampanhaContato(contato)}
                          >
                            {getNomeCampanhaContato(contato)}
                          </span>

                          <div className={styles.itemRight}>
                            {!editando && (
                              <button
                                type="button"
                                onClick={() => toggleExpandir(contato.id)}
                                className={styles.rowActionButton}
                              >
                                {expandido ? "Fechar" : "Detalhes"}
                              </button>
                            )}

                            {!editando && (
                              <button
                                type="button"
                                onClick={() => iniciarEdicao(contato)}
                                className={styles.rowActionButton}
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
                                value={editOrigem}
                                onChange={(e) => setEditOrigem(e.target.value)}
                              >
                                <option value="">Sem origem</option>
                                {opcoesOrigem.map((origem) => (
                                  <option key={origem} value={origem}>
                                    {origem}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Campanha</label>
                              <select
                                className={styles.select}
                                value={editRastreamentoCampanhaId}
                                onChange={(e) =>
                                  selecionarCampanhaEdicao(e.target.value)
                                }
                              >
                                {editCampanha && !editRastreamentoCampanhaId ? (
                                  <option value="">
                                    {editCampanha} (campanha antiga)
                                  </option>
                                ) : (
                                  <option value="">Sem campanha</option>
                                )}
                                {campanhasRastreamento.map((campanhaItem) => (
                                  <option key={campanhaItem.id} value={campanhaItem.id}>
                                    {getLabelCampanhaRastreamento(campanhaItem)}
                                  </option>
                                ))}
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
                              
                              <button
                                type="button"
                                onClick={() => abrirModalExcluir(contato)}
                                className={styles.dangerButton}
                              >
                                Excluir
                              </button>

                            </div>
                          </div>
                        ) : (
                          <div className={styles.detailsGrid}>
                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Classificação</span>
                              <span className={styles.infoValue}>
                                {getClassificacaoLabel(contato.classificacao)}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>
                                Status da conversa
                              </span>
                              <span className={styles.infoValue}>
                                {getStatusConversaLabel(contato.conversa_status)}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Opt-in</span>
                              <span className={styles.infoValue}>
                                {contato.opt_in_whatsapp === true
                                  ? "Contato com opt-in"
                                  : "Sem opt-in (lista fria)"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Opt-out</span>
                              <span className={styles.infoValue}>
                                {contato.whatsapp_opt_out === true
                                  ? getOptOutLabel(contato)
                                  : "Sem opt-out"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Protocolo atual</span>
                              <span className={styles.infoValue}>
                                {contato.protocolo_atual || "Sem protocolo"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>
                                Início do atendimento
                              </span>
                              <span className={styles.infoValue}>
                                {contato.iniciado_com_bot
                                  ? "Iniciado com o robô"
                                  : "Iniciado sem o robô"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>
                                Finalização
                              </span>
                              <span className={styles.infoValue}>
                                {contato.finalizado_por_tipo === "atendente"
                                  ? `Atendente: ${
                                      contato.finalizado_por_usuario_nome ||
                                      "não identificado"
                                    }`
                                  : contato.finalizado_por_tipo === "bot"
                                    ? "Finalizado pelo robô"
                                    : contato.finalizado_por_tipo === "sistema"
                                      ? "Finalizado pelo sistema"
                                      : "Atendimento em andamento"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Nome WhatsApp</span>
                              <span className={styles.infoValue}>
                                {contato.whatsapp_profile_name || "Sem nome WhatsApp"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Campanha</span>
                              <span className={styles.infoValue}>
                                {getNomeCampanhaContato(contato)}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Origem</span>
                              <span className={styles.infoValue}>
                                {getNomeOrigemContato(contato)}
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
              </div>
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

      {modalExcluirAberto && contatoParaExcluir && (
        <div
          className={styles.modalOverlay}
          onClick={fecharModalExcluir}
        >
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Atenção</p>
                <h2 className={styles.modalTitle}>Excluir contato</h2>
                <p className={styles.cardDescription}>
                  Esta ação não poderá ser desfeita.
                </p>
              </div>

              <button
                type="button"
                onClick={fecharModalExcluir}
                className={styles.modalCloseButton}
                aria-label="Fechar modal"
                disabled={excluindoContato}
              >
                ×
              </button>
            </div>

            <div className={styles.deleteWarningBox}>
              <strong>
                Tem certeza que deseja excluir este contato?
              </strong>

              <p>
                Ao excluir o contato{" "}
                <strong>{contatoParaExcluir.nome || contatoParaExcluir.telefone}</strong>,
                a <strong>conversa</strong> vinculada a ele e <strong> todas as mensagens </strong> também serão excluídas.
              </p>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={excluirContato}
                disabled={excluindoContato}
                className={styles.dangerButton}
              >
                {excluindoContato ? "Excluindo..." : "Sim, excluir contato"}
              </button>

              <button
                type="button"
                onClick={fecharModalExcluir}
                disabled={excluindoContato}
                className={styles.secondaryButton}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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
                  value={origem}
                  onChange={(e) => setOrigem(e.target.value)}
                >
                  <option value="">Sem origem</option>
                  {opcoesOrigem.map((origem) => (
                    <option key={origem} value={origem}>
                      {origem}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Campanha</label>
                <select
                  className={styles.select}
                  value={rastreamentoCampanhaId}
                  onChange={(e) => selecionarCampanhaCadastro(e.target.value)}
                >
                  <option value="">Sem campanha</option>
                  {campanhasRastreamento.map((campanhaItem) => (
                    <option key={campanhaItem.id} value={campanhaItem.id}>
                      {getLabelCampanhaRastreamento(campanhaItem)}
                    </option>
                  ))}
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
              <FeedbackToast
                success={mensagemImportacao}
                onSuccessDismiss={() => setMensagemImportacao("")}
              />
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
