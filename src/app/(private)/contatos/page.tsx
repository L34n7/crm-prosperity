"use client";

import { useEffect, useState } from "react";
import CrmShell from "@/components/CrmShell";
import Header from "@/components/Header";
import styles from "./contatos.module.css";

type EmpresaOpcao = {
  id: string;
  nome_fantasia: string;
};

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
  created_at: string;
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
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [origem, setOrigem] = useState("");
  const [campanha, setCampanha] = useState("");
  const [statusLead, setStatusLead] = useState<StatusLead>("novo");
  const [observacoes, setObservacoes] = useState("");
  const [empresaId, setEmpresaId] = useState("");

  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca, setBusca] = useState("");

  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editOrigem, setEditOrigem] = useState("");
  const [editCampanha, setEditCampanha] = useState("");
  const [editStatusLead, setEditStatusLead] = useState<StatusLead>("novo");
  const [editObservacoes, setEditObservacoes] = useState("");
  const [editEmpresaId, setEditEmpresaId] = useState("");

  async function carregarEmpresas() {
    const res = await fetch("/api/empresas/opcoes", { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) return;

    setEmpresas(data.empresas || []);
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

    const queryString = params.toString();
    const url = queryString ? `/api/contatos?${queryString}` : "/api/contatos";

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao carregar contatos");
      return;
    }

    setContatos(data.contatos || []);
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
          empresa_id: empresaId || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao criar contato");
        return;
      }

      setMensagem(data.message || "Contato criado com sucesso.");
      setNome("");
      setTelefone("");
      setEmail("");
      setOrigem("");
      setCampanha("");
      setStatusLead("novo");
      setObservacoes("");
      setEmpresaId("");
      await carregarContatos();
    } catch {
      setErro("Erro ao criar contato");
    } finally {
      setLoading(false);
    }
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
    setEditEmpresaId(contato.empresa_id || "");
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
    setEditEmpresaId("");
  }

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
        empresa_id: editEmpresaId || null,
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

  function toggleExpandir(contatoId: string) {
    setExpandidoId((atual) => (atual === contatoId ? null : contatoId));
  }

  useEffect(() => {
    carregarEmpresas();
  }, []);

  useEffect(() => {
    carregarContatos();
  }, [filtroStatus]);

  return (
    <CrmShell>
      <Header
        title="Contatos"
        subtitle="Gerencie contatos, origem dos leads, campanhas e status de atendimento."
      />

      <div className={styles.pageContent}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Cadastro</p>
              <h2 className={styles.cardTitle}>Criar contato</h2>
              <p className={styles.cardDescription}>
                Cadastre novos contatos com origem, campanha, empresa e status do lead.
              </p>
            </div>
          </div>

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
                onChange={(e) => setTelefone(e.target.value)}
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
              <input
                className={styles.input}
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                placeholder="WhatsApp, Instagram, Site..."
              />
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

            <div className={styles.field}>
              <label className={styles.label}>Empresa</label>
              <select
                className={styles.select}
                value={empresaId}
                onChange={(e) => setEmpresaId(e.target.value)}
              >
                <option value="">Usar empresa do usuário atual</option>
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nome_fantasia}
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

          <div className={styles.actionsRow}>
            <button
              onClick={criarContato}
              disabled={loading}
              className={styles.primaryButton}
            >
              {loading ? "Criando..." : "Criar contato"}
            </button>
          </div>
        </section>

        {mensagem && <div className={styles.alertSuccess}>{mensagem}</div>}
        {erro && <div className={styles.alertError}>{erro}</div>}

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Filtros</p>
              <h2 className={styles.cardTitle}>Buscar contatos</h2>
              <p className={styles.cardDescription}>
                Filtre por status e pesquise por nome, telefone ou email.
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

          <div className={styles.actionsRow}>
            <button onClick={carregarContatos} className={styles.secondaryButton}>
              Buscar
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

            <span className={styles.infoBadge}>{contatos.length} contato(s)</span>
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
                const empresaNome =
                  empresas.find((empresa) => empresa.id === contato.empresa_id)
                    ?.nome_fantasia ?? "—";

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
                              <strong>Empresa:</strong> {empresaNome}
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
                              <input
                                className={styles.input}
                                value={editOrigem}
                                onChange={(e) => setEditOrigem(e.target.value)}
                                placeholder="Origem"
                              />
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

                            <div className={styles.field}>
                              <label className={styles.label}>Empresa</label>
                              <select
                                className={styles.select}
                                value={editEmpresaId}
                                onChange={(e) => setEditEmpresaId(e.target.value)}
                              >
                                <option value="">Selecione uma empresa</option>
                                {empresas.map((empresa) => (
                                  <option key={empresa.id} value={empresa.id}>
                                    {empresa.nome_fantasia}
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
                              <span className={styles.infoLabel}>Empresa</span>
                              <span className={styles.infoValue}>
                                {empresaNome}
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
    </CrmShell>
  );
}