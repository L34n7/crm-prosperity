"use client";

import { useEffect, useMemo, useState } from "react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import { useHeaderUser } from "@/components/header-user-context";
import styles from "./setores.module.css";

type Setor = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
  total_usuarios?: number;
  criado_por?: {
    id: string;
    nome: string | null;
  } | null;
  atualizado_por?: {
    id: string;
    nome: string | null;
  } | null;
};

type SetorForm = {
  nome: string;
  descricao: string;
  ativo: boolean;
};

const formInicial: SetorForm = {
  nome: "",
  descricao: "",
  ativo: true,
};

function formatarData(data?: string) {
  if (!data) return "Não informado";

  return new Date(data).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SetoresPage() {
  const { permissoes } = useHeaderUser();
  const podeCriarSetores = permissoes.includes("setores.criar");
  const podeEditarSetores = permissoes.includes("setores.editar");
  const podeAlterarStatusSetores = permissoes.includes(
    "setores.alterar_status"
  );
  const [setores, setSetores] = useState<Setor[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [busca, setBusca] = useState("");

  const [modalAberto, setModalAberto] = useState(false);
  const [setorEditando, setSetorEditando] = useState<Setor | null>(null);
  const [form, setForm] = useState<SetorForm>(formInicial);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  async function carregarSetores() {
    try {
      setLoading(true);
      setErro("");

      const res = await fetch("/api/setores", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao carregar setores");
        return;
      }

      setSetores(data.setores || []);
    } catch {
      setErro("Erro ao carregar setores");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarSetores();
  }, []);

  const setoresFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) return setores;

    return setores.filter((setor) => {
      const nome = (setor.nome || "").toLowerCase();
      const descricao = (setor.descricao || "").toLowerCase();

      return nome.includes(termo) || descricao.includes(termo);
    });
  }, [setores, busca]);

  function abrirNovoSetor() {
    setErro("");
    setSucesso("");
    setSetorEditando(null);
    setForm(formInicial);
    setModalAberto(true);
  }

  function abrirEditarSetor(setor: Setor) {
    setErro("");
    setSucesso("");
    setSetorEditando(setor);
    setForm({
      nome: setor.nome || "",
      descricao: setor.descricao || "",
      ativo: !!setor.ativo,
    });
    setModalAberto(true);
  }

  function fecharModal() {
    if (salvando) return;
    setModalAberto(false);
    setSetorEditando(null);
    setForm(formInicial);
  }

  async function salvarSetor() {
    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        ativo: form.ativo,
      };

      if (!payload.nome) {
        setErro("O nome do setor é obrigatório.");
        return;
      }

      const url = setorEditando
        ? `/api/setores/${setorEditando.id}`
        : "/api/setores";

      const method = setorEditando ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao salvar setor");
        return;
      }

      setSucesso(
        data.message ||
          (setorEditando
            ? "Setor atualizado com sucesso."
            : "Setor criado com sucesso.")
      );

      fecharModal();
      await carregarSetores();
    } catch {
      setErro("Erro ao salvar setor");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Header
        title="Configuração de setores"
        subtitle="Organize áreas de atendimento e controle a ativação dos setores."
      />

      <div className={styles.pageContent}>
        <section className={styles.card}>
          <div className={styles.topBar}>
            <div>
              <p className={styles.eyebrow}>Gestão</p>
              <h2 className={styles.cardTitle}>Setores da empresa</h2>
              <p className={styles.cardDescription}>
                Crie, edite, ative ou inative setores conforme a operação da empresa.
              </p>
            </div>

            {podeCriarSetores && (
              <button className={styles.primaryButton} onClick={abrirNovoSetor}>
                Novo setor
              </button>
            )}
          </div>

          {erro && <div className={styles.errorAlert}>{erro}</div>}
          <FeedbackToast
            success={sucesso}
            onSuccessDismiss={() => setSucesso("")}
          />

          <div className={styles.toolbar}>
            <div className={styles.searchField}>
              <label className={styles.label}>Buscar setor</label>
              <input
                className={styles.searchInput}
                placeholder="Buscar por nome ou descrição..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            <div className={styles.resultBadge}>
              {setoresFiltrados.length} setor(es)
            </div>
          </div>

          {loading ? (
            <div className={styles.emptyCard}>Carregando setores...</div>
          ) : setoresFiltrados.length === 0 ? (
            <div className={styles.emptyCard}>Nenhum setor encontrado.</div>
          ) : (
            <div className={styles.list}>
              {setoresFiltrados.map((setor) => {
                const expandido = expandidoId === setor.id;

                return (
                  <article key={setor.id} className={styles.itemCard}>
                    <div className={styles.itemSummary}>
                      <div className={styles.itemLeft}>
                        <div className={styles.avatar}>
                          {setor.nome.slice(0, 2).toUpperCase()}
                        </div>

                        <div className={styles.itemIdentity}>
                          <div className={styles.itemTopRow}>
                            <h3 className={styles.itemTitle}>{setor.nome}</h3>
                            <span
                              className={`${styles.statusBadge} ${
                                setor.ativo ? styles.statusActive : styles.statusInactive
                              }`}
                            >
                              {setor.ativo ? "Ativo" : "Inativo"}
                            </span>
                          </div>

                          <p className={styles.itemDescription}>
                            {setor.descricao || "Sem descrição informada."}
                          </p>

                          <div className={styles.summaryMeta}>
                            <span className={styles.metaItem}>
                              <strong>Usuários vinculados:</strong>{" "}
                              {setor.total_usuarios ?? 0}
                            </span>
                            <span className={styles.metaItem}>
                              <strong>Criado por:</strong>{" "}
                              {setor.criado_por?.nome || "Não identificado"}
                            </span>
                            <span className={styles.metaItem}>
                              <strong>Última atualização:</strong>{" "}
                              {formatarData(setor.updated_at)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.itemRight}>
                        <button
                          className={styles.secondaryButton}
                          onClick={() =>
                            setExpandidoId((atual) =>
                              atual === setor.id ? null : setor.id
                            )
                          }
                        >
                          {expandido ? "Recolher" : "Expandir"}
                        </button>

                        {podeEditarSetores && (
                          <button
                            className={styles.secondaryButton}
                            onClick={() => abrirEditarSetor(setor)}
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    </div>

                    {expandido && (
                      <div className={styles.itemExpanded}>
                        <div className={styles.detailsGrid}>
                          <div className={styles.infoBlock}>
                            <span className={styles.infoLabel}>Criado por</span>
                            <span className={styles.infoValue}>
                              {setor.criado_por?.nome || "Não identificado"}
                            </span>
                            <span className={styles.infoDate}>
                              {formatarData(setor.created_at)}
                            </span>
                          </div>

                          <div className={styles.infoBlock}>
                            <span className={styles.infoLabel}>Atualizado por</span>
                            <span className={styles.infoValue}>
                              {setor.atualizado_por?.nome || "Não identificado"}
                            </span>
                            <span className={styles.infoDate}>
                              {formatarData(setor.updated_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {modalAberto && (
        <div className={styles.modalOverlay} onClick={fecharModal}>
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>
                  {setorEditando ? "Editar setor" : "Novo setor"}
                </h2>
                <p className={styles.modalSubtitle}>
                  Preencha as informações do setor de forma simples e clara.
                </p>
              </div>

              <button className={styles.closeButton} onClick={fecharModal}>
                Fechar
              </button>
            </div>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.label}>Nome do setor</span>
                <input
                  className={styles.input}
                  value={form.nome}
                  onChange={(e) =>
                    setForm((atual) => ({ ...atual, nome: e.target.value }))
                  }
                  placeholder="Ex.: Financeiro"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Descrição</span>
                <textarea
                  className={styles.textarea}
                  value={form.descricao}
                  onChange={(e) =>
                    setForm((atual) => ({
                      ...atual,
                      descricao: e.target.value,
                    }))
                  }
                  placeholder="Explique de forma simples a função do setor"
                  rows={4}
                />
              </label>

              <label className={styles.switchField}>
                <div>
                  <span className={styles.label}>Setor ativo</span>
                  <p className={styles.switchHint}>
                    Setores inativos deixam de aparecer para uso operacional.
                  </p>
                </div>

                <span className={styles.switchWrap}>
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    disabled={!podeAlterarStatusSetores}
                    onChange={(e) =>
                      setForm((atual) => ({
                        ...atual,
                        ativo: e.target.checked,
                      }))
                    }
                    className={styles.switchInput}
                  />
                  <span className={styles.switchSlider} />
                </span>
              </label>
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.ghostButton}
                onClick={fecharModal}
                disabled={salvando}
              >
                Cancelar
              </button>

              <button
                className={styles.primaryButton}
                onClick={salvarSetor}
                disabled={salvando}
              >
                {salvando
                  ? "Salvando..."
                  : setorEditando
                  ? "Salvar alterações"
                  : "Criar setor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
