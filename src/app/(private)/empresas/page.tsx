"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import styles from "./empresas.module.css";

type Plano = {
  id: string;
  nome: string;
  slug: string;
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
  planos?: {
    id: string;
    nome: string;
    slug: string;
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

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);

  const [nomeFantasia, setNomeFantasia] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [documento, setDocumento] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nomeResponsavel, setNomeResponsavel] = useState("");
  const [planoId, setPlanoId] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [logoUrl, setLogoUrl] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  const [editNomeFantasia, setEditNomeFantasia] = useState("");
  const [editRazaoSocial, setEditRazaoSocial] = useState("");
  const [editDocumento, setEditDocumento] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editNomeResponsavel, setEditNomeResponsavel] = useState("");
  const [editPlanoId, setEditPlanoId] = useState("");
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

  async function criarEmpresa() {
    setMensagem("");
    setErro("");

    if (!nomeFantasia.trim()) {
      setErro("Digite o nome fantasia.");
      return;
    }

    if (!email.trim()) {
      setErro("Digite o email.");
      return;
    }

    if (!planoId) {
      setErro("Selecione um plano.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/empresas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nome_fantasia: nomeFantasia,
          razao_social: razaoSocial,
          documento,
          email,
          telefone,
          nome_responsavel: nomeResponsavel,
          plano_id: planoId,
          timezone,
          logo_url: logoUrl,
          observacoes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao criar empresa");
        return;
      }

      setMensagem(data.message || "Empresa criada com sucesso.");
      setNomeFantasia("");
      setRazaoSocial("");
      setDocumento("");
      setEmail("");
      setTelefone("");
      setNomeResponsavel("");
      setPlanoId("");
      setTimezone("America/Sao_Paulo");
      setLogoUrl("");
      setObservacoes("");
      await carregarEmpresas();
    } catch {
      setErro("Erro ao criar empresa");
    } finally {
      setLoading(false);
    }
  }

  function iniciarEdicao(empresa: Empresa) {
    setEditandoId(empresa.id);
    setExpandidoId(empresa.id);
    setEditNomeFantasia(empresa.nome_fantasia);
    setEditRazaoSocial(empresa.razao_social || "");
    setEditDocumento(empresa.documento || "");
    setEditEmail(empresa.email);
    setEditTelefone(empresa.telefone || "");
    setEditNomeResponsavel(empresa.nome_responsavel || "");
    setEditPlanoId(empresa.plano_id);
    setEditTimezone(empresa.timezone || "America/Sao_Paulo");
    setEditLogoUrl(empresa.logo_url || "");
    setEditObservacoes(empresa.observacoes || "");
    setEditStatus(empresa.status);
    setMensagem("");
    setErro("");
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

  useEffect(() => {
    carregarEmpresas();
    carregarPlanos();
  }, []);

  return (
    <>
      <Header
        title="Empresas"
        subtitle="Gerencie empresas, planos, dados cadastrais e status da operação."
      />

      <div className={styles.pageContent}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Cadastro</p>
              <h2 className={styles.cardTitle}>Criar empresa</h2>
              <p className={styles.cardDescription}>
                Cadastre uma nova empresa com plano, dados de contato, timezone
                e observações internas.
              </p>
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Nome fantasia</label>
              <input
                className={styles.input}
                placeholder="Nome fantasia"
                value={nomeFantasia}
                onChange={(e) => setNomeFantasia(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Razão social</label>
              <input
                className={styles.input}
                placeholder="Razão social"
                value={razaoSocial}
                onChange={(e) => setRazaoSocial(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Documento</label>
              <input
                className={styles.input}
                placeholder="CPF/CNPJ"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input
                className={styles.input}
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Telefone</label>
              <input
                className={styles.input}
                placeholder="Telefone"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Nome do responsável</label>
              <input
                className={styles.input}
                placeholder="Nome do responsável"
                value={nomeResponsavel}
                onChange={(e) => setNomeResponsavel(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Plano</label>
              <select
                className={styles.select}
                value={planoId}
                onChange={(e) => setPlanoId(e.target.value)}
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
              <label className={styles.label}>Timezone</label>
              <input
                className={styles.input}
                placeholder="America/Sao_Paulo"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </div>

            <div className={styles.fieldFull}>
              <label className={styles.label}>URL da logo</label>
              <input
                className={styles.input}
                placeholder="URL da logo"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
              />
            </div>

            <div className={styles.fieldFull}>
              <label className={styles.label}>Observações</label>
              <textarea
                className={styles.textarea}
                placeholder="Observações"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <div className={styles.actionsRow}>
            <button
              onClick={criarEmpresa}
              disabled={loading}
              className={styles.primaryButton}
            >
              {loading ? "Criando..." : "Criar empresa"}
            </button>
          </div>
        </section>

        {mensagem && <div className={styles.alertSuccess}>{mensagem}</div>}
        {erro && <div className={styles.alertError}>{erro}</div>}

        <section className={styles.card}>
          <div className={styles.listHeader}>
            <div>
              <p className={styles.eyebrow}>Gestão</p>
              <h2 className={styles.cardTitle}>Empresas cadastradas</h2>
              <p className={styles.cardDescription}>
                Cards resumidos com expansão sob demanda para manter a tela mais
                organizada.
              </p>
            </div>

            <span className={styles.infoBadge}>{empresas.length} empresa(s)</span>
          </div>

          {empresas.length === 0 ? (
            <div className={styles.emptyState}>
              Nenhuma empresa cadastrada ainda.
            </div>
          ) : (
            <div className={styles.list}>
              {empresas.map((empresa) => {
                const expandido = expandidoId === empresa.id;
                const editando = editandoId === empresa.id;

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
                        {!editando && (
                          <button
                            onClick={() => toggleExpandir(empresa.id)}
                            className={styles.secondaryButton}
                          >
                            {expandido ? "Recolher" : "Expandir"}
                          </button>
                        )}

                        {!editando && (
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
                                onChange={(e) => setEditPlanoId(e.target.value)}
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
                              <label className={styles.label}>Status</label>
                              <select
                                className={styles.select}
                                value={editStatus}
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