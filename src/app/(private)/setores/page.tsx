"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import styles from "./setores.module.css";

type Setor = {
  id: string;
  nome: string;
  descricao: string | null;
  status: "ativo" | "inativo";
  ordem_exibicao: number;
  created_at: string;
};

function getStatusLabel(status: Setor["status"]) {
  return status === "ativo" ? "Ativo" : "Inativo";
}

function getStatusClass(status: Setor["status"]) {
  return status === "ativo" ? styles.statusAtivo : styles.statusInativo;
}

function getIniciais(nome: string) {
  const partes = nome.trim().split(" ").filter(Boolean);

  if (partes.length === 0) return "ST";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

export default function SetoresPage() {
  const [setores, setSetores] = useState<Setor[]>([]);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editStatus, setEditStatus] = useState<"ativo" | "inativo">("ativo");

  async function carregarSetores() {
    setErro("");

    const res = await fetch("/api/setores", { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao carregar setores");
      return;
    }

    setSetores(data.setores || []);
  }

  async function criarSetor() {
    setMensagem("");
    setErro("");

    if (!nome.trim()) {
      setErro("Digite o nome do setor.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/setores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nome, descricao }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao criar setor");
        return;
      }

      setMensagem("Setor criado com sucesso.");
      setNome("");
      setDescricao("");
      await carregarSetores();
    } catch {
      setErro("Erro ao criar setor");
    } finally {
      setLoading(false);
    }
  }

  function iniciarEdicao(setor: Setor) {
    setEditandoId(setor.id);
    setExpandidoId(setor.id);
    setEditNome(setor.nome);
    setEditDescricao(setor.descricao || "");
    setEditStatus(setor.status);
    setMensagem("");
    setErro("");
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditNome("");
    setEditDescricao("");
    setEditStatus("ativo");
  }

  async function salvarEdicao() {
    if (!editandoId) return;

    setMensagem("");
    setErro("");

    if (!editNome.trim()) {
      setErro("Digite o nome do setor.");
      return;
    }

    const res = await fetch(`/api/setores/${editandoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome: editNome,
        descricao: editDescricao,
        status: editStatus,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao atualizar setor");
      return;
    }

    setMensagem("Setor atualizado com sucesso.");
    cancelarEdicao();
    carregarSetores();
  }

  async function alternarStatus(setor: Setor) {
    setMensagem("");
    setErro("");

    const novoStatus = setor.status === "ativo" ? "inativo" : "ativo";

    const res = await fetch(`/api/setores/${setor.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome: setor.nome,
        descricao: setor.descricao || "",
        status: novoStatus,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao alterar status");
      return;
    }

    setMensagem(
      `Setor ${novoStatus === "ativo" ? "ativado" : "inativado"} com sucesso.`
    );
    carregarSetores();
  }

  function toggleExpandir(setorId: string) {
    setExpandidoId((atual) => (atual === setorId ? null : setorId));
  }

  useEffect(() => {
    carregarSetores();
  }, []);

  return (
    <>
      <Header
        title="Setores"
        subtitle="Gerencie os setores da empresa com uma visualização mais organizada."
      />

      <div className={styles.pageContent}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Cadastro</p>
              <h2 className={styles.cardTitle}>Criar novo setor</h2>
              <p className={styles.cardDescription}>
                Cadastre setores para organizar a operação, distribuição e
                atendimento.
              </p>
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Nome</label>
              <input
                type="text"
                className={styles.input}
                placeholder="Ex.: Comercial"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div className={styles.fieldFull}>
              <label className={styles.label}>Descrição</label>
              <textarea
                className={styles.textarea}
                placeholder="Ex.: Atendimento comercial e vendas"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <div className={styles.actionsRow}>
            <button
              onClick={criarSetor}
              disabled={loading}
              className={styles.primaryButton}
            >
              {loading ? "Criando..." : "Criar setor"}
            </button>
          </div>
        </section>

        {mensagem && <div className={styles.alertSuccess}>{mensagem}</div>}
        {erro && <div className={styles.alertError}>{erro}</div>}

        <section className={styles.card}>
          <div className={styles.listHeader}>
            <div>
              <p className={styles.eyebrow}>Gestão</p>
              <h2 className={styles.cardTitle}>Setores cadastrados</h2>
              <p className={styles.cardDescription}>
                Visualize setores em cards resumidos e expanda somente quando
                precisar ver mais detalhes.
              </p>
            </div>

            <span className={styles.infoBadge}>{setores.length} setor(es)</span>
          </div>

          {setores.length === 0 ? (
            <div className={styles.emptyState}>
              Nenhum setor cadastrado ainda.
            </div>
          ) : (
            <div className={styles.list}>
              {setores.map((setor) => {
                const expandido = expandidoId === setor.id;
                const editando = editandoId === setor.id;

                return (
                  <article key={setor.id} className={styles.itemCard}>
                    <div className={styles.itemSummary}>
                      <div className={styles.itemLeft}>
                        <div className={styles.avatar}>
                          {getIniciais(setor.nome)}
                        </div>

                        <div className={styles.itemIdentity}>
                          <div className={styles.itemTopRow}>
                            <h3 className={styles.itemTitle}>{setor.nome}</h3>
                            <span
                              className={`${styles.statusBadge} ${getStatusClass(
                                setor.status
                              )}`}
                            >
                              {getStatusLabel(setor.status)}
                            </span>
                          </div>

                          <p className={styles.itemDescription}>
                            {setor.descricao || "Sem descrição"}
                          </p>
                        </div>
                      </div>

                      <div className={styles.itemRight}>
                        {!editando && (
                          <button
                            onClick={() => toggleExpandir(setor.id)}
                            className={styles.secondaryButton}
                          >
                            {expandido ? "Recolher" : "Expandir"}
                          </button>
                        )}

                        {!editando && (
                          <button
                            onClick={() => iniciarEdicao(setor)}
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
                                type="text"
                                className={styles.input}
                                value={editNome}
                                onChange={(e) => setEditNome(e.target.value)}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Status</label>
                              <select
                                className={styles.select}
                                value={editStatus}
                                onChange={(e) =>
                                  setEditStatus(
                                    e.target.value as "ativo" | "inativo"
                                  )
                                }
                              >
                                <option value="ativo">Ativo</option>
                                <option value="inativo">Inativo</option>
                              </select>
                            </div>

                            <div className={styles.fieldFull}>
                              <label className={styles.label}>Descrição</label>
                              <textarea
                                className={styles.textarea}
                                rows={4}
                                value={editDescricao}
                                onChange={(e) => setEditDescricao(e.target.value)}
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
                          <>
                            <div className={styles.detailsGrid}>
                              <div className={styles.infoBlock}>
                                <span className={styles.infoLabel}>Descrição</span>
                                <span className={styles.infoValue}>
                                  {setor.descricao || "Sem descrição"}
                                </span>
                              </div>

                              <div className={styles.infoBlock}>
                                <span className={styles.infoLabel}>Status</span>
                                <span className={styles.infoValue}>
                                  {getStatusLabel(setor.status)}
                                </span>
                              </div>

                              <div className={styles.infoBlock}>
                                <span className={styles.infoLabel}>
                                  Ordem de exibição
                                </span>
                                <span className={styles.infoValue}>
                                  {setor.ordem_exibicao}
                                </span>
                              </div>

                              <div className={styles.infoBlock}>
                                <span className={styles.infoLabel}>Criado em</span>
                                <span className={styles.infoValue}>
                                  {new Date(setor.created_at).toLocaleString("pt-BR")}
                                </span>
                              </div>
                            </div>

                            <div className={styles.expandedActions}>
                              <button
                                onClick={() => iniciarEdicao(setor)}
                                className={styles.secondaryButton}
                              >
                                Editar
                              </button>

                              <button
                                onClick={() => alternarStatus(setor)}
                                className={styles.secondaryButton}
                              >
                                {setor.status === "ativo" ? "Inativar" : "Ativar"}
                              </button>
                            </div>
                          </>
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