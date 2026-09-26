"use client";

import { useEffect, useMemo, useState } from "react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import { useHeaderUser } from "@/components/header-user-context";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
import styles from "./empresas.module.css";

const OPCOES_LIMITE = Array.from({ length: 10 }, (_, index) => index + 1);

type Plano = {
  id: string;
  nome: string;
  slug: string;
  limite_usuarios: number | null;
  limite_integracoes_whatsapp: number | null;
};

type Nicho = {
  id: string;
  codigo: string;
  nome: string;
};

type StatusEmpresa = "ativa" | "inativa" | "suspensa" | "cancelada";

type SaldoTokensEmpresa = {
  limite_mensal: number | null;
  tokens_restantes: number | null;
  saldo_mensal_restante: number | null;
  saldo_avulso_restante: number;
  tokens_mensais_usados: number;
  tokens_avulsos_usados: number;
  periodo_inicio: string;
  periodo_fim: string;
  updated_at: string;
};

type LeadEmpresa = {
  id: string;
  nome: string;
  empresa: string | null;
  email: string;
  telefone: string | null;
  categoria: string;
  plano_slug: string;
  status: string;
  pago: boolean;
  created_at: string | null;
};

type Empresa = {
  id: string;
  nome_fantasia: string;
  razao_social: string | null;
  documento: string | null;
  email: string;
  telefone: string | null;
  nome_responsavel: string | null;
  status: StatusEmpresa;
  timezone: string;
  logo_url: string | null;
  observacoes: string | null;
  plano_id: string;
  limite_integracoes_whatsapp: number | null;
  limite_usuarios: number | null;
  assinatura_status?: string | null;
  empresa_tokens_ia?: SaldoTokensEmpresa | SaldoTokensEmpresa[] | null;
  nicho_id: string;
  nichos?: Nicho | null;
  planos?: {
    id: string;
    nome: string;
    slug: string;
    limite_usuarios: number | null;
    limite_integracoes_whatsapp: number | null;
  } | null;
};

function getStatusLabel(status: StatusEmpresa) {
  switch (status) {
    case "ativa":
      return "Ativa";
    case "inativa":
      return "Inativa";
    case "suspensa":
      return "Suspensa";
    case "cancelada":
      return "Cancelada";
    default:
      return status;
  }
}

function getStatusClass(status: StatusEmpresa) {
  switch (status) {
    case "ativa":
      return styles.statusAtiva;
    case "inativa":
      return styles.statusInativa;
    case "suspensa":
      return styles.statusSuspensa;
    case "cancelada":
      return styles.statusCancelada;
    default:
      return styles.statusPadrao;
  }
}

function getIniciais(nome: string) {
  const partes = nome.trim().split(" ").filter(Boolean);

  if (partes.length === 0) return "EM";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

function getOpcaoLimiteLabel(quantidade: number, limitePlano: number) {
  if (quantidade === limitePlano) {
    return `${quantidade} (incluído no plano)`;
  }

  if (quantidade > limitePlano) {
    const extras = quantidade - limitePlano;
    return `${quantidade} (${extras} extra${extras > 1 ? "s" : ""})`;
  }

  return String(quantidade);
}

function getSaldoTokensEmpresa(empresa: Empresa) {
  const saldo = empresa.empresa_tokens_ia;

  if (Array.isArray(saldo)) {
    return saldo[0] ?? null;
  }

  return saldo ?? null;
}

function formatarTokens(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "—";
  return new Intl.NumberFormat("pt-BR").format(valor);
}

function formatarDataLead(valor: string | null) {
  if (!valor) return "—";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}


export default function EmpresasPage() {
  const { permissoes } = useHeaderUser();
  const podeEditarEmpresas = permissoes.includes("empresas.editar");
  const podeAlterarStatusEmpresas = permissoes.includes(
    "empresas.alterar_status"
  );
  const podeAcessarTemporariamente = permissoes.includes(
    PERMISSAO_INTERNA_EMPRESAS
  );
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [nichos, setNichos] = useState<Nicho[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<StatusEmpresa | "todos">("todos");
  const [filtroPlano, setFiltroPlano] = useState("todos");
  const [filtroNicho, setFiltroNicho] = useState("todos");

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [reenviandoAcessoId, setReenviandoAcessoId] = useState<string | null>(null);
  const [acessandoEmpresaId, setAcessandoEmpresaId] = useState<string | null>(null);
  const [empresaTokensModal, setEmpresaTokensModal] = useState<Empresa | null>(null);
  const [acaoTokens, setAcaoTokens] = useState<
    "restaurar_mensal" | "adicionar_avulso"
  >("adicionar_avulso");
  const [quantidadeTokensExtras, setQuantidadeTokensExtras] = useState("100000");
  const [motivoTokens, setMotivoTokens] = useState("");
  const [ajustandoTokens, setAjustandoTokens] = useState(false);
  const [leadsModalAberto, setLeadsModalAberto] = useState(false);
  const [leadsEmpresa, setLeadsEmpresa] = useState<LeadEmpresa[]>([]);
  const [leadsCarregando, setLeadsCarregando] = useState(false);
  const [leadsErro, setLeadsErro] = useState("");
  const [leadsPagina, setLeadsPagina] = useState(1);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsTotalPaginas, setLeadsTotalPaginas] = useState(1);

  const [editNomeFantasia, setEditNomeFantasia] = useState("");
  const [editRazaoSocial, setEditRazaoSocial] = useState("");
  const [editDocumento, setEditDocumento] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editNomeResponsavel, setEditNomeResponsavel] = useState("");
  const [editPlanoId, setEditPlanoId] = useState("");
  const [editLimiteWhatsapp, setEditLimiteWhatsapp] = useState("1");
  const [editLimiteUsuarios, setEditLimiteUsuarios] = useState("2");
  const [editNichoId, setEditNichoId] = useState("");
  const [editTimezone, setEditTimezone] = useState("America/Sao_Paulo");
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [editObservacoes, setEditObservacoes] = useState("");
  const [editStatus, setEditStatus] = useState<StatusEmpresa>("ativa");

  async function carregarEmpresas() {
    setErro("");

    const res = await fetch("/api/empresas", { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao carregar empresas");
      return;
    }

    setEmpresas(data.empresas || []);
  }

  async function carregarPlanos() {
    const res = await fetch("/api/planos", { cache: "no-store" });

    if (!res.ok) return;

    const data = await res.json();
    setPlanos(data.planos || []);
  }

  async function carregarNichos() {
    const res = await fetch("/api/nichos", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setNichos(data.nichos || []);
  }

  function iniciarEdicao(empresa: Empresa) {
    const limiteWhatsappPlano =
      empresa.planos?.limite_integracoes_whatsapp ?? 1;
    const limiteUsuariosPlano = empresa.planos?.limite_usuarios ?? 2;

    setEditandoId(empresa.id);
    setExpandidoId(empresa.id);
    setEditNomeFantasia(empresa.nome_fantasia);
    setEditRazaoSocial(empresa.razao_social || "");
    setEditDocumento(empresa.documento || "");
    setEditEmail(empresa.email);
    setEditTelefone(empresa.telefone || "");
    setEditNomeResponsavel(empresa.nome_responsavel || "");
    setEditPlanoId(empresa.plano_id);
    setEditLimiteWhatsapp(
      String(empresa.limite_integracoes_whatsapp ?? limiteWhatsappPlano)
    );
    setEditLimiteUsuarios(
      String(empresa.limite_usuarios ?? limiteUsuariosPlano)
    );
    setEditNichoId(empresa.nicho_id);
    setEditTimezone(empresa.timezone || "America/Sao_Paulo");
    setEditLogoUrl(empresa.logo_url || "");
    setEditObservacoes(empresa.observacoes || "");
    setEditStatus(empresa.status);
    setMensagem("");
    setErro("");
  }

  function alterarPlanoEdicao(novoPlanoId: string) {
    const plano = planos.find((item) => item.id === novoPlanoId);
    const limiteWhatsappPlano = plano?.limite_integracoes_whatsapp ?? 1;
    const limiteUsuariosPlano = plano?.limite_usuarios ?? 2;

    setEditPlanoId(novoPlanoId);
    setEditLimiteWhatsapp((atual) =>
      String(Math.max(Number(atual) || 1, limiteWhatsappPlano))
    );
    setEditLimiteUsuarios((atual) =>
      String(Math.max(Number(atual) || 1, limiteUsuariosPlano))
    );
  }

  function cancelarEdicao() {
    setEditandoId(null);
  }

  async function salvarEdicao() {
    if (!editandoId) return;

    setMensagem("");
    setErro("");

    const res = await fetch(`/api/empresas/${editandoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome_fantasia: editNomeFantasia,
        razao_social: editRazaoSocial,
        documento: editDocumento,
        email: editEmail,
        telefone: editTelefone,
        nome_responsavel: editNomeResponsavel,
        plano_id: editPlanoId,
        limite_integracoes_whatsapp: Number(editLimiteWhatsapp),
        limite_usuarios: Number(editLimiteUsuarios),
        nicho_id: editNichoId,
        timezone: editTimezone,
        logo_url: editLogoUrl,
        observacoes: editObservacoes,
        status: editStatus,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao atualizar empresa");
      return;
    }

    setMensagem(data.message || "Empresa atualizada com sucesso.");
    setEditandoId(null);
    carregarEmpresas();
  }

  function toggleExpandir(empresaId: string) {
    setExpandidoId((atual) => (atual === empresaId ? null : empresaId));
  }

  async function reenviarPrimeiroAcessoAlternativo(empresa: Empresa) {
    const confirmado = window.confirm(
      `Enviar o acesso alternativo para ${empresa.email}? O link de primeiro acesso padrão continuará válido até ser utilizado ou expirar.`
    );

    if (!confirmado) return;

    setMensagem("");
    setErro("");
    setReenviandoAcessoId(empresa.id);

    try {
      const response = await fetch(
        `/api/empresas/${empresa.id}/reenviar-primeiro-acesso-alternativo`,
        { method: "POST" }
      );
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setErro(data.error || "Não foi possível enviar o acesso alternativo.");
        return;
      }

      setMensagem(
        data.message ||
          `Acesso alternativo enviado para ${empresa.email} com sucesso.`
      );
    } catch {
      setErro("Não foi possível enviar o acesso alternativo.");
    } finally {
      setReenviandoAcessoId(null);
    }
  }

  async function acessarTemporariamente(empresa: Empresa) {
    const confirmado = window.confirm(
      `Iniciar uma sessão administrativa temporária para ${empresa.nome_fantasia}? A sessão dura 30 minutos, não altera a senha do cliente e fica registrada na auditoria.`
    );

    if (!confirmado) return;

    setMensagem("");
    setErro("");
    setAcessandoEmpresaId(empresa.id);

    try {
      const response = await fetch("/api/empresas/acesso-temporario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresa.id }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setErro(data.error || "Não foi possível iniciar a sessão temporária.");
        return;
      }

      window.location.assign(data.redirect || "/painel/ao-vivo");
    } catch {
      setErro("Não foi possível iniciar a sessão temporária.");
    } finally {
      setAcessandoEmpresaId(null);
    }
  }

  function abrirAjusteTokens(
    empresa: Empresa,
    acao: "restaurar_mensal" | "adicionar_avulso"
  ) {
    setEmpresaTokensModal(empresa);
    setAcaoTokens(acao);
    setQuantidadeTokensExtras("100000");
    setMotivoTokens("");
    setMensagem("");
    setErro("");
  }

  function fecharAjusteTokens() {
    if (ajustandoTokens) return;
    setEmpresaTokensModal(null);
  }

  async function confirmarAjusteTokens() {
    if (!empresaTokensModal || ajustandoTokens) return;

    const quantidade =
      acaoTokens === "adicionar_avulso"
        ? Number(quantidadeTokensExtras)
        : null;

    if (
      acaoTokens === "adicionar_avulso" &&
      (!Number.isSafeInteger(Number(quantidade)) || Number(quantidade) <= 0)
    ) {
      setErro("Informe uma quantidade válida de tokens extras.");
      return;
    }

    setAjustandoTokens(true);
    setMensagem("");
    setErro("");

    try {
      const response = await fetch(
        `/api/empresas/${empresaTokensModal.id}/tokens`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            acao: acaoTokens,
            quantidade,
            motivo: motivoTokens,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setErro(data.error || "Não foi possível ajustar os tokens.");
        return;
      }

      if (data.saldo) {
        setEmpresas((atuais) =>
          atuais.map((empresa) =>
            empresa.id === empresaTokensModal.id
              ? { ...empresa, empresa_tokens_ia: data.saldo }
              : empresa
          )
        );
      } else {
        await carregarEmpresas();
      }

      setMensagem(data.message || "Tokens ajustados com sucesso.");
      setEmpresaTokensModal(null);
    } catch {
      setErro("Não foi possível ajustar os tokens da empresa.");
    } finally {
      setAjustandoTokens(false);
    }
  }

  async function carregarLeads(pagina = 1) {
    setLeadsCarregando(true);
    setLeadsErro("");

    try {
      const response = await fetch(
        `/api/empresas/leads?page=${pagina}&limit=25`,
        { cache: "no-store" }
      );
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setLeadsErro(data.error || "Não foi possível carregar os leads.");
        return;
      }

      setLeadsEmpresa(data.leads || []);
      setLeadsPagina(data.pagination?.page || pagina);
      setLeadsTotal(data.pagination?.total || 0);
      setLeadsTotalPaginas(data.pagination?.total_pages || 1);
    } catch {
      setLeadsErro("Não foi possível carregar os leads.");
    } finally {
      setLeadsCarregando(false);
    }
  }

  function abrirLeads() {
    setLeadsModalAberto(true);
    setLeadsEmpresa([]);
    setLeadsPagina(1);
    setLeadsTotal(0);
    setLeadsTotalPaginas(1);
    setLeadsErro("");
    void carregarLeads(1);
  }

  function fecharLeads() {
    if (leadsCarregando) return;
    setLeadsModalAberto(false);
    setLeadsEmpresa([]);
    setLeadsErro("");
  }

  function alterarPaginaLeads(novaPagina: number) {
    if (
      leadsCarregando ||
      novaPagina < 1 ||
      novaPagina > leadsTotalPaginas
    ) {
      return;
    }

    void carregarLeads(novaPagina);
  }

  useEffect(() => {
    carregarEmpresas();
    carregarPlanos();
    carregarNichos();
  }, []);

  useEffect(() => {
    if (!leadsModalAberto) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function fecharComEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !leadsCarregando) {
        setLeadsModalAberto(false);
      }
    }

    window.addEventListener("keydown", fecharComEscape);

    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", fecharComEscape);
    };
  }, [leadsModalAberto, leadsCarregando]);

  const empresasFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");

    return empresas.filter((empresa) => {
      const correspondeBusca =
        !termo ||
        [
          empresa.nome_fantasia,
          empresa.razao_social,
          empresa.documento,
          empresa.email,
          empresa.telefone,
          empresa.nome_responsavel,
          empresa.planos?.nome,
          empresa.nichos?.nome,
        ]
          .filter(Boolean)
          .some((valor) =>
            String(valor).toLocaleLowerCase("pt-BR").includes(termo)
          );

      const correspondeStatus =
        filtroStatus === "todos" || empresa.status === filtroStatus;
      const correspondePlano =
        filtroPlano === "todos" || empresa.plano_id === filtroPlano;
      const correspondeNicho =
        filtroNicho === "todos" || empresa.nicho_id === filtroNicho;

      return (
        correspondeBusca &&
        correspondeStatus &&
        correspondePlano &&
        correspondeNicho
      );
    });
  }, [busca, empresas, filtroNicho, filtroPlano, filtroStatus]);

  const filtrosAtivos =
    Boolean(busca.trim()) ||
    filtroStatus !== "todos" ||
    filtroPlano !== "todos" ||
    filtroNicho !== "todos";

  function limparFiltros() {
    setBusca("");
    setFiltroStatus("todos");
    setFiltroPlano("todos");
    setFiltroNicho("todos");
  }

  return (
    <>
      <Header
        title="Empresas"
        subtitle="Consulte, filtre e gerencie as empresas cadastradas no CRM."
      />

      <div className={styles.pageContent}>
        <FeedbackToast
          success={mensagem}
          onSuccessDismiss={() => setMensagem("")}
        />
        {erro && <div className={styles.alertError}>{erro}</div>}

        <section className={styles.card}>
          <div className={styles.listHeader}>
            <div>
              <p className={styles.eyebrow}>Gestão</p>
              <h2 className={styles.cardTitle}>Empresas cadastradas</h2>
              <p className={styles.cardDescription}>
                Use a busca e os filtros para localizar rapidamente uma empresa
                e expanda o card para visualizar ou editar os dados.
              </p>
            </div>

            <span className={styles.infoBadge}>
              {empresasFiltradas.length} de {empresas.length} empresa(s)
            </span>
          </div>

          <div className={styles.filtersPanel}>
            <div className={styles.searchField}>
              <label className={styles.filterLabel} htmlFor="busca-empresa">
                Buscar empresa
              </label>
              <input
                id="busca-empresa"
                className={styles.input}
                type="search"
                placeholder="Nome, e-mail, documento, telefone ou responsável..."
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
              />
            </div>

            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="filtro-status">
                Status
              </label>
              <select
                id="filtro-status"
                className={styles.select}
                value={filtroStatus}
                onChange={(event) =>
                  setFiltroStatus(
                    event.target.value as StatusEmpresa | "todos"
                  )
                }
              >
                <option value="todos">Todos</option>
                <option value="ativa">Ativas</option>
                <option value="inativa">Inativas</option>
                <option value="suspensa">Suspensas</option>
                <option value="cancelada">Canceladas</option>
              </select>
            </div>

            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="filtro-plano">
                Plano
              </label>
              <select
                id="filtro-plano"
                className={styles.select}
                value={filtroPlano}
                onChange={(event) => setFiltroPlano(event.target.value)}
              >
                <option value="todos">Todos os planos</option>
                {planos.map((plano) => (
                  <option key={plano.id} value={plano.id}>
                    {plano.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="filtro-segmento">
                Segmento
              </label>
              <select
                id="filtro-segmento"
                className={styles.select}
                value={filtroNicho}
                onChange={(event) => setFiltroNicho(event.target.value)}
              >
                <option value="todos">Todos os segmentos</option>
                {nichos.map((nicho) => (
                  <option key={nicho.id} value={nicho.id}>
                    {nicho.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={limparFiltros}
                disabled={!filtrosAtivos}
              >
                Limpar filtros
              </button>
            </div>
          </div>

          {empresas.length === 0 ? (
            <div className={styles.emptyState}>
              Nenhuma empresa cadastrada ainda.
            </div>
          ) : empresasFiltradas.length === 0 ? (
            <div className={styles.emptyState}>
              Nenhuma empresa encontrada com os filtros selecionados.
            </div>
          ) : (
            <div className={styles.list}>
              {empresasFiltradas.map((empresa) => {
                const expandido = expandidoId === empresa.id;
                const editando = editandoId === empresa.id;
                const planoEdicao = planos.find(
                  (plano) => plano.id === editPlanoId
                );
                const limiteWhatsappPlano = Math.max(
                  1,
                  planoEdicao?.limite_integracoes_whatsapp ??
                    empresa.planos?.limite_integracoes_whatsapp ??
                    1
                );
                const limiteUsuariosPlano = Math.max(
                  1,
                  planoEdicao?.limite_usuarios ??
                    empresa.planos?.limite_usuarios ??
                    2
                );
                const limiteWhatsappEfetivo =
                  empresa.limite_integracoes_whatsapp ??
                  empresa.planos?.limite_integracoes_whatsapp ??
                  1;
                const limiteUsuariosEfetivo =
                  empresa.limite_usuarios ??
                  empresa.planos?.limite_usuarios ??
                  2;
                const saldoTokensEmpresa = getSaldoTokensEmpresa(empresa);
                const saldoMensalTokens =
                  saldoTokensEmpresa?.saldo_mensal_restante ?? 0;
                const saldoAvulsoTokens =
                  saldoTokensEmpresa?.saldo_avulso_restante ?? 0;
                const totalTokensDisponiveis =
                  empresa.assinatura_status === "ativa"
                    ? saldoMensalTokens + saldoAvulsoTokens
                    : 0;

                return (
                  <article key={empresa.id} className={styles.itemCard}>
                    <div className={styles.itemSummary}>
                      <div className={styles.itemLeft}>
                        <div className={styles.avatar}>
                          {getIniciais(empresa.nome_fantasia)}
                        </div>

                        <div className={styles.itemIdentity}>
                          <div className={styles.itemTopRow}>
                            <h3 className={styles.itemTitle}>
                              {empresa.nome_fantasia}
                            </h3>
                            <span
                              className={`${styles.statusBadge} ${getStatusClass(
                                empresa.status
                              )}`}
                            >
                              {getStatusLabel(empresa.status)}
                            </span>
                          </div>

                          <p className={styles.itemSubline}>{empresa.email}</p>

                          <div className={styles.summaryMeta}>
                            <span className={styles.metaItem}>
                              <strong>Plano:</strong> {empresa.planos?.nome ?? "—"}
                            </span>
                            <span className={styles.metaItem}>
                              <strong>Segmento:</strong>{" "}
                              {empresa.nichos?.nome ?? "—"}
                            </span>
                            <span className={styles.metaItem}>
                              <strong>Responsável:</strong>{" "}
                              {empresa.nome_responsavel ?? "—"}
                            </span>
                            <span className={styles.metaItem}>
                              <strong>Timezone:</strong> {empresa.timezone || "—"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.itemRight}>
                        {!editando && podeAcessarTemporariamente && (
                          <button
                            type="button"
                            onClick={() => acessarTemporariamente(empresa)}
                            className={styles.supportButton}
                            disabled={acessandoEmpresaId === empresa.id}
                          >
                            {acessandoEmpresaId === empresa.id
                              ? "Acessando..."
                              : "Acessar ambiente"}
                          </button>
                        )}

                        {!editando && podeEditarEmpresas && (
                          <button
                            onClick={() => toggleExpandir(empresa.id)}
                            className={styles.secondaryButton}
                          >
                            {expandido ? "Recolher" : "Expandir"}
                          </button>
                        )}

                        {!editando && podeEditarEmpresas && (
                          <button
                            onClick={() => iniciarEdicao(empresa)}
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
                              <label className={styles.label}>Nome fantasia</label>
                              <input
                                className={styles.input}
                                value={editNomeFantasia}
                                onChange={(e) => setEditNomeFantasia(e.target.value)}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Razão social</label>
                              <input
                                className={styles.input}
                                value={editRazaoSocial}
                                onChange={(e) => setEditRazaoSocial(e.target.value)}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Documento</label>
                              <input
                                className={styles.input}
                                value={editDocumento}
                                onChange={(e) => setEditDocumento(e.target.value)}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Email</label>
                              <input
                                className={styles.input}
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Telefone</label>
                              <input
                                className={styles.input}
                                value={editTelefone}
                                onChange={(e) => setEditTelefone(e.target.value)}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Responsável</label>
                              <input
                                className={styles.input}
                                value={editNomeResponsavel}
                                onChange={(e) =>
                                  setEditNomeResponsavel(e.target.value)
                                }
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Plano</label>
                              <select
                                className={styles.select}
                                value={editPlanoId}
                                onChange={(e) => alterarPlanoEdicao(e.target.value)}
                              >
                                <option value="">Selecione um plano</option>
                                {planos.map((plano) => (
                                  <option key={plano.id} value={plano.id}>
                                    {plano.nome}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Segmento</label>
                              <select
                                className={styles.select}
                                value={editNichoId}
                                onChange={(e) => setEditNichoId(e.target.value)}
                              >
                                {nichos.map((nicho) => (
                                  <option key={nicho.id} value={nicho.id}>
                                    {nicho.nome}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>
                                Números WhatsApp liberados
                              </label>
                              <select
                                className={styles.select}
                                value={editLimiteWhatsapp}
                                onChange={(e) => setEditLimiteWhatsapp(e.target.value)}
                              >
                                {OPCOES_LIMITE.map((quantidade) => (
                                  <option
                                    key={quantidade}
                                    value={quantidade}
                                    disabled={quantidade < limiteWhatsappPlano}
                                  >
                                    {getOpcaoLimiteLabel(
                                      quantidade,
                                      limiteWhatsappPlano
                                    )}
                                  </option>
                                ))}
                              </select>
                              <span className={styles.eyebrow}>
                                Total permitido para a empresa. O plano inclui {limiteWhatsappPlano}.
                              </span>
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>
                                Usuários liberados
                              </label>
                              <select
                                className={styles.select}
                                value={editLimiteUsuarios}
                                onChange={(e) => setEditLimiteUsuarios(e.target.value)}
                              >
                                {OPCOES_LIMITE.map((quantidade) => (
                                  <option
                                    key={quantidade}
                                    value={quantidade}
                                    disabled={quantidade < limiteUsuariosPlano}
                                  >
                                    {getOpcaoLimiteLabel(
                                      quantidade,
                                      limiteUsuariosPlano
                                    )}
                                  </option>
                                ))}
                              </select>
                              <span className={styles.eyebrow}>
                                Total permitido para a empresa. O plano inclui {limiteUsuariosPlano}.
                              </span>
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Status</label>
                              <select
                                className={styles.select}
                                value={editStatus}
                                disabled={!podeAlterarStatusEmpresas}
                                onChange={(e) =>
                                  setEditStatus(e.target.value as StatusEmpresa)
                                }
                              >
                                <option value="ativa">Ativa</option>
                                <option value="inativa">Inativa</option>
                                <option value="suspensa">Suspensa</option>
                                <option value="cancelada">Cancelada</option>
                              </select>
                            </div>

                            <div className={styles.fieldFull}>
                              <label className={styles.label}>Timezone</label>
                              <input
                                className={styles.input}
                                value={editTimezone}
                                onChange={(e) => setEditTimezone(e.target.value)}
                              />
                            </div>

                            <div className={styles.fieldFull}>
                              <label className={styles.label}>URL da logo</label>
                              <input
                                className={styles.input}
                                value={editLogoUrl}
                                onChange={(e) => setEditLogoUrl(e.target.value)}
                              />
                            </div>

                            <div className={styles.fieldFull}>
                              <label className={styles.label}>Observações</label>
                              <textarea
                                className={styles.textarea}
                                rows={4}
                                value={editObservacoes}
                                onChange={(e) =>
                                  setEditObservacoes(e.target.value)
                                }
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
                              <span className={styles.infoLabel}>Razão social</span>
                              <span className={styles.infoValue}>
                                {empresa.razao_social || "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Documento</span>
                              <span className={styles.infoValue}>
                                {empresa.documento || "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Telefone</span>
                              <span className={styles.infoValue}>
                                {empresa.telefone || "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Plano</span>
                              <span className={styles.infoValue}>
                                {empresa.planos?.nome ?? "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>
                                Números WhatsApp
                              </span>
                              <span className={styles.infoValue}>
                                {limiteWhatsappEfetivo}
                                {empresa.limite_integracoes_whatsapp !== null
                                  ? " (liberação comercial)"
                                  : " (plano)"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>
                                Usuários liberados
                              </span>
                              <span className={styles.infoValue}>
                                {limiteUsuariosEfetivo}
                                {empresa.limite_usuarios !== null
                                  ? " (liberação comercial)"
                                  : " (plano)"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Timezone</span>
                              <span className={styles.infoValue}>
                                {empresa.timezone || "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Logo URL</span>
                              <span className={styles.infoValue}>
                                {empresa.logo_url || "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlockFull}>
                              <span className={styles.infoLabel}>Observações</span>
                              <span className={styles.infoValue}>
                                {empresa.observacoes || "Sem observações"}
                              </span>
                            </div>

                            {podeEditarEmpresas && (
                              <div className={styles.tokensManagementBlock}>
                                <div className={styles.tokensManagementHeader}>
                                  <div>
                                    <span className={styles.infoLabel}>
                                      Tokens de IA
                                    </span>
                                    <strong className={styles.tokensManagementTitle}>
                                      Gerenciar saldo da empresa
                                    </strong>
                                    <p className={styles.tokensManagementDescription}>
                                      Restaure a franquia mensal ou conceda saldo
                                      avulso sem alterar plano, vencimento ou pagamento.
                                    </p>
                                  </div>

                                  <span className={styles.tokensTotalBadge}>
                                    {formatarTokens(totalTokensDisponiveis)} disponíveis
                                  </span>
                                </div>

                                <div className={styles.tokensStatsGrid}>
                                  <div>
                                    <span>Franquia</span>
                                    <strong>
                                      {formatarTokens(
                                        saldoTokensEmpresa?.limite_mensal
                                      )}
                                    </strong>
                                  </div>
                                  <div>
                                    <span>Mensal restante</span>
                                    <strong>
                                      {formatarTokens(
                                        saldoTokensEmpresa?.saldo_mensal_restante
                                      )}
                                    </strong>
                                  </div>
                                  <div>
                                    <span>Saldo avulso</span>
                                    <strong>
                                      {formatarTokens(
                                        saldoTokensEmpresa?.saldo_avulso_restante
                                      )}
                                    </strong>
                                  </div>
                                </div>

                                <div className={styles.tokensManagementActions}>
                                  <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    onClick={() =>
                                      abrirAjusteTokens(
                                        empresa,
                                        "restaurar_mensal"
                                      )
                                    }
                                  >
                                    Restaurar tokens mensais
                                  </button>

                                  <button
                                    type="button"
                                    className={styles.primaryButton}
                                    onClick={() =>
                                      abrirAjusteTokens(
                                        empresa,
                                        "adicionar_avulso"
                                      )
                                    }
                                  >
                                    Adicionar tokens extras
                                  </button>
                                </div>
                              </div>
                            )}

                            {podeEditarEmpresas && (
                              <div className={styles.accessBlock}>
                                <div>
                                  <span className={styles.infoLabel}>
                                    Primeiro acesso
                                  </span>
                                  <span className={styles.infoValue}>
                                    Envie o modelo antigo do Supabase Auth como
                                    contingência. Esse link expira em 1 hora e só
                                    pode ser acessado uma única vez.
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  className={styles.secondaryButton}
                                  onClick={() =>
                                    reenviarPrimeiroAcessoAlternativo(empresa)
                                  }
                                  disabled={reenviandoAcessoId === empresa.id}
                                >
                                  {reenviandoAcessoId === empresa.id
                                    ? "Enviando..."
                                    : "Reenviar primeiro acesso alternativo"}
                                </button>
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
        </section>
      </div>

      <button
        type="button"
        className={styles.leadsLauncher}
        onClick={abrirLeads}
      >
        Leads
      </button>

      {leadsModalAberto && (
        <div
          className={styles.leadsModalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              fecharLeads();
            }
          }}
        >
          <section
            className={styles.leadsModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-leads-modal-title"
          >
            <div className={styles.leadsModalHeader}>
              <div>
                <span className={styles.leadsModalEyebrow}>Leads</span>
                <h2 id="company-leads-modal-title">
                  Leads da empresa
                </h2>
                <p>
                  Todos os leads cadastrados no CRM, do mais novo para o mais antigo.
                </p>
              </div>

              <div className={styles.leadsModalHeaderRight}>
                <span className={styles.leadsCountBadge}>
                  {leadsTotal} {leadsTotal === 1 ? "lead" : "leads"}
                </span>
                <button
                  type="button"
                  className={styles.leadsModalClose}
                  onClick={fecharLeads}
                  disabled={leadsCarregando}
                  aria-label="Fechar leads"
                >
                  ×
                </button>
              </div>
            </div>

            <div className={styles.leadsModalSummary}>
              <div>
                <span>Ordenação</span>
                <strong>Mais novos primeiro</strong>
              </div>
              <div>
                <span>Página</span>
                <strong>
                  {leadsPagina} de {leadsTotalPaginas}
                </strong>
              </div>
              <div>
                <span>Exibindo</span>
                <strong>{leadsEmpresa.length} registros</strong>
              </div>
            </div>

            <div className={styles.leadsTableShell}>
              {leadsCarregando ? (
                <div className={styles.leadsLoadingState}>
                  <span className={styles.leadsLoadingSpinner} />
                  <strong>Carregando leads...</strong>
                  <p>Buscando os registros mais recentes da empresa.</p>
                </div>
              ) : leadsErro ? (
                <div className={styles.leadsErrorState}>
                  <strong>Não foi possível carregar os leads</strong>
                  <p>{leadsErro}</p>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void carregarLeads(leadsPagina)}
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : leadsEmpresa.length === 0 ? (
                <div className={styles.leadsEmptyState}>
                  <div className={styles.leadsEmptyIcon}>L</div>
                  <strong>Nenhum lead vinculado</strong>
                  <p>
                    Ainda não existem leads cadastrados para esta empresa.
                  </p>
                </div>
              ) : (
                <div className={styles.leadsTableScroll}>
                  <table className={styles.leadsTable}>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Nome empresa</th>
                        <th>E-mail</th>
                        <th>Número</th>
                        <th>Categoria</th>
                        <th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leadsEmpresa.map((lead) => (
                        <tr key={lead.id}>
                          <td>
                            <div className={styles.leadIdentity}>
                              <span className={styles.leadAvatar}>
                                {getIniciais(lead.nome || "Lead")}
                              </span>
                              <strong>{lead.nome || "—"}</strong>
                            </div>
                          </td>
                          <td>
                            <span className={styles.leadCompany}>
                              {lead.empresa || "—"}
                            </span>
                          </td>
                          <td>
                            <span className={styles.leadEmail}>
                              {lead.email || "—"}
                            </span>
                          </td>
                          <td>
                            <span className={styles.leadPhone}>
                              {lead.telefone || "—"}
                            </span>
                          </td>
                          <td>
                            <span className={styles.leadCategoryBadge}>
                              {lead.categoria || "Não informado"}
                            </span>
                          </td>
                          <td>
                            <span className={styles.leadDate}>
                              {formatarDataLead(lead.created_at)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {!leadsCarregando && !leadsErro && leadsTotal > 0 && (
              <div className={styles.leadsPagination}>
                <span>
                  {(leadsPagina - 1) * 25 + 1}–
                  {Math.min(leadsPagina * 25, leadsTotal)} de {leadsTotal}
                </span>

                <div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => alterarPaginaLeads(leadsPagina - 1)}
                    disabled={leadsPagina <= 1}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => alterarPaginaLeads(leadsPagina + 1)}
                    disabled={leadsPagina >= leadsTotalPaginas}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {empresaTokensModal && (
        <div
          className={styles.tokenModalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              fecharAjusteTokens();
            }
          }}
        >
          <section
            className={styles.tokenModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="token-admin-modal-title"
          >
            <button
              type="button"
              className={styles.tokenModalClose}
              onClick={fecharAjusteTokens}
              disabled={ajustandoTokens}
              aria-label="Fechar"
            >
              ×
            </button>

            <span className={styles.tokenModalEyebrow}>Tokens de IA</span>
            <h2 id="token-admin-modal-title">
              Gerenciar tokens
            </h2>
            <p className={styles.tokenModalCompany}>
              {empresaTokensModal.nome_fantasia}
            </p>

            <div className={styles.tokenActionTabs}>
              <button
                type="button"
                className={
                  acaoTokens === "restaurar_mensal"
                    ? styles.tokenActionTabActive
                    : styles.tokenActionTab
                }
                onClick={() => setAcaoTokens("restaurar_mensal")}
                disabled={ajustandoTokens}
              >
                Restaurar mensal
              </button>
              <button
                type="button"
                className={
                  acaoTokens === "adicionar_avulso"
                    ? styles.tokenActionTabActive
                    : styles.tokenActionTab
                }
                onClick={() => setAcaoTokens("adicionar_avulso")}
                disabled={ajustandoTokens}
              >
                Adicionar extras
              </button>
            </div>

            {acaoTokens === "restaurar_mensal" ? (
              <div className={styles.tokenRestorePanel}>
                <span>Franquia mensal atual</span>
                <strong>
                  {formatarTokens(
                    getSaldoTokensEmpresa(empresaTokensModal)?.limite_mensal
                  )}
                </strong>
                <p>
                  Recompõe a franquia mensal deste ciclo para o limite total.
                  O saldo avulso é preservado e o vencimento não é alterado.
                </p>
              </div>
            ) : (
              <div className={styles.tokenAmountPanel}>
                <label className={styles.label} htmlFor="tokens-extras">
                  Quantidade de tokens extras
                </label>
                <input
                  id="tokens-extras"
                  className={styles.input}
                  type="number"
                  min="1"
                  max="1000000000"
                  step="1000"
                  value={quantidadeTokensExtras}
                  onChange={(event) =>
                    setQuantidadeTokensExtras(event.target.value)
                  }
                />

                <div className={styles.tokenQuickAmounts}>
                  {[50000, 100000, 200000, 500000].map((quantidade) => (
                    <button
                      key={quantidade}
                      type="button"
                      onClick={() =>
                        setQuantidadeTokensExtras(String(quantidade))
                      }
                      disabled={ajustandoTokens}
                    >
                      +{formatarTokens(quantidade)}
                    </button>
                  ))}
                </div>

                <p>
                  Tokens extras entram no saldo avulso, não expiram e são
                  consumidos antes da franquia mensal.
                </p>
              </div>
            )}

            <div className={styles.tokenReasonField}>
              <label className={styles.label} htmlFor="tokens-motivo">
                Motivo do ajuste <span>(opcional)</span>
              </label>
              <textarea
                id="tokens-motivo"
                className={styles.textarea}
                rows={3}
                maxLength={500}
                placeholder="Ex.: cortesia comercial, correção de saldo..."
                value={motivoTokens}
                onChange={(event) => setMotivoTokens(event.target.value)}
              />
            </div>

            <div className={styles.tokenModalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={fecharAjusteTokens}
                disabled={ajustandoTokens}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={confirmarAjusteTokens}
                disabled={ajustandoTokens}
              >
                {ajustandoTokens
                  ? "Aplicando..."
                  : acaoTokens === "restaurar_mensal"
                    ? "Restaurar franquia"
                    : "Adicionar tokens"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
