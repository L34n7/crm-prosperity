"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import { useHeaderUser } from "@/components/header-user-context";
import styles from "./perfis.module.css";

type Perfil = {
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

type PerfilForm = {
  nome: string;
  descricao: string;
  ativo: boolean;
};

const formInicial: PerfilForm = {
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

export default function PerfisPage() {
  const { permissoes } = useHeaderUser();
  const podeCriarPerfis = permissoes.includes("perfis.criar");
  const podeEditarPerfis = permissoes.includes("perfis.editar");
  const podeAlterarStatusPerfis = permissoes.includes("perfis.alterar_status");
  const podeAlterarPermissoesPerfis = permissoes.includes(
    "perfis.alterar_permissoes"
  );
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [busca, setBusca] = useState("");

  const [modalAberto, setModalAberto] = useState(false);
  const [perfilEditando, setPerfilEditando] = useState<Perfil | null>(null);
  const [form, setForm] = useState<PerfilForm>(formInicial);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  async function carregarPerfis() {
    try {
      setLoading(true);
      setErro("");

      const res = await fetch("/api/perfis", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao carregar perfis");
        return;
      }

      setPerfis(data.perfis || []);
    } catch {
      setErro("Erro ao carregar perfis");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarPerfis();
  }, []);

  const perfisFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) return perfis;

    return perfis.filter((perfil) => {
      const nome = (perfil.nome || "").toLowerCase();
      const descricao = (perfil.descricao || "").toLowerCase();

      return nome.includes(termo) || descricao.includes(termo);
    });
  }, [perfis, busca]);

  function abrirNovoPerfil() {
    setErro("");
    setSucesso("");
    setPerfilEditando(null);
    setForm(formInicial);
    setModalAberto(true);
  }

  function abrirEditarPerfil(perfil: Perfil) {
    setErro("");
    setSucesso("");
    setPerfilEditando(perfil);
    setForm({
      nome: perfil.nome || "",
      descricao: perfil.descricao || "",
      ativo: !!perfil.ativo,
    });
    setModalAberto(true);
  }

  function fecharModal() {
    if (salvando) return;
    setModalAberto(false);
    setPerfilEditando(null);
    setForm(formInicial);
  }

  async function salvarPerfil() {
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
        setErro("O nome do perfil é obrigatório.");
        return;
      }

      const url = perfilEditando
        ? `/api/perfis/${perfilEditando.id}`
        : "/api/perfis";

      const method = perfilEditando ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao salvar perfil");
        return;
      }

      setSucesso(
        data.message ||
          (perfilEditando
            ? "Perfil atualizado com sucesso."
            : "Perfil criado com sucesso.")
      );

      fecharModal();
      await carregarPerfis();
    } catch {
      setErro("Erro ao salvar perfil");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Header
        title="Configuração de perfis"
        subtitle="Crie papéis de acesso e organize funções da equipe."
      />

      <div className={styles.pageContent}>
        <section className={styles.card}>
          <div className={styles.topBar}>
            <div>
              <p className={styles.eyebrow}>Gestão</p>
              <h2 className={styles.cardTitle}>Perfis da empresa</h2>
              <p className={styles.cardDescription}>
                Cada perfil representa uma função na operação, como atendente,
                supervisor ou administrador.
              </p>
            </div>

            {podeCriarPerfis && (
              <button className={styles.primaryButton} onClick={abrirNovoPerfil}>
                Novo perfil
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
              <label className={styles.label}>Buscar perfil</label>
              <input
                className={styles.searchInput}
                placeholder="Buscar por nome ou descrição..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            <div className={styles.resultBadge}>
              {perfisFiltrados.length} perfil(is)
            </div>
          </div>

          {loading ? (
            <div className={styles.emptyCard}>Carregando perfis...</div>
          ) : perfisFiltrados.length === 0 ? (
            <div className={styles.emptyCard}>Nenhum perfil encontrado.</div>
          ) : (
            <div className={styles.list}>
              {perfisFiltrados.map((perfil) => {
                const expandido = expandidoId === perfil.id;

                return (
                  <article key={perfil.id} className={styles.itemCard}>
                    <div className={styles.itemSummary}>
                      <div className={styles.itemLeft}>
                        <div className={styles.avatar}>
                          {perfil.nome.slice(0, 2).toUpperCase()}
                        </div>

                        <div className={styles.itemIdentity}>
                          <div className={styles.itemTopRow}>
                            <h3 className={styles.itemTitle}>{perfil.nome}</h3>
                            <span
                              className={`${styles.statusBadge} ${
                                perfil.ativo ? styles.statusActive : styles.statusInactive
                              }`}
                            >
                              {perfil.ativo ? "Ativo" : "Inativo"}
                            </span>
                          </div>

                          <p className={styles.itemDescription}>
                            {perfil.descricao || "Sem descrição informada."}
                          </p>

                          <div className={styles.summaryMeta}>
                            <span className={styles.metaItem}>
                              <strong>Usuários vinculados:</strong>{" "}
                              {perfil.total_usuarios ?? 0}
                            </span>
                            <span className={styles.metaItem}>
                              <strong>Criado por:</strong>{" "}
                              {perfil.criado_por?.nome || "Não identificado"}
                            </span>
                            <span className={styles.metaItem}>
                              <strong>Última atualização:</strong>{" "}
                              {formatarData(perfil.updated_at)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.itemRight}>
                        <button
                          className={styles.secondaryButton}
                          onClick={() =>
                            setExpandidoId((atual) =>
                              atual === perfil.id ? null : perfil.id
                            )
                          }
                        >
                          {expandido ? "Recolher" : "Expandir"}
                        </button>

                        {podeEditarPerfis && (
                          <button
                            className={styles.secondaryButton}
                            onClick={() => abrirEditarPerfil(perfil)}
                          >
                            Editar
                          </button>
                        )}

                        {podeAlterarPermissoesPerfis && <Link
                          href={`/configuracoes/perfis/${perfil.id}/permissoes`}
                          className={styles.linkButton}
                        >
                          Permissões
                        </Link>}
                      </div>
                    </div>

                    {expandido && (
                      <div className={styles.itemExpanded}>
                        <div className={styles.detailsGrid}>
                          <div className={styles.infoBlock}>
                            <span className={styles.infoLabel}>Criado por</span>
                            <span className={styles.infoValue}>
                              {perfil.criado_por?.nome || "Não identificado"}
                            </span>
                            <span className={styles.infoDate}>
                              {formatarData(perfil.created_at)}
                            </span>
                          </div>

                          <div className={styles.infoBlock}>
                            <span className={styles.infoLabel}>Atualizado por</span>
                            <span className={styles.infoValue}>
                              {perfil.atualizado_por?.nome || "Não identificado"}
                            </span>
                            <span className={styles.infoDate}>
                              {formatarData(perfil.updated_at)}
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
                  {perfilEditando ? "Editar perfil" : "Novo perfil"}
                </h2>
                <p className={styles.modalSubtitle}>
                  Dê um nome claro para o papel e explique quando ele deve ser usado.
                </p>
              </div>

              <button className={styles.closeButton} onClick={fecharModal}>
                Fechar
              </button>
            </div>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.label}>Nome do perfil</span>
                <input
                  className={styles.input}
                  value={form.nome}
                  onChange={(e) =>
                    setForm((atual) => ({ ...atual, nome: e.target.value }))
                  }
                  placeholder="Ex.: Supervisor"
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
                  placeholder="Explique a função desse perfil na operação"
                  rows={4}
                />
              </label>

              <label className={styles.switchField}>
                <div>
                  <span className={styles.label}>Perfil ativo</span>
                  <p className={styles.switchHint}>
                    Perfis inativos deixam de ser usados em novas configurações.
                  </p>
                </div>

                <span className={styles.switchWrap}>
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    disabled={!podeAlterarStatusPerfis}
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
                onClick={salvarPerfil}
                disabled={salvando}
              >
                {salvando
                  ? "Salvando..."
                  : perfilEditando
                  ? "Salvar alterações"
                  : "Criar perfil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
