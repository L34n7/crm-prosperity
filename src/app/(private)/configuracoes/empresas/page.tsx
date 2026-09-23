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

  useEffect(() => {
    carregarEmpresas();
    carregarPlanos();
    carregarNichos();
  }, []);

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
    </>
  );
}
