"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CrmShell from "@/components/CrmShell";
import Header from "@/components/Header";
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

type LogAuditoria = {
  id: string;
  entidade: string;
  entidade_id: string;
  acao: string;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  detalhes?: Record<string, unknown> | null;
  created_at: string;
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

function formatarMudancasLog(log: LogAuditoria) {
  const detalhes = log.detalhes;

  if (!detalhes || typeof detalhes !== "object") {
    return [];
  }

  if (log.acao === "criado") {
    const mudancas: string[] = [];

    if ("nome" in detalhes && detalhes.nome) {
      mudancas.push(`Nome definido como "${String(detalhes.nome)}"`);
    }

    if ("descricao" in detalhes && detalhes.descricao) {
      mudancas.push("Descrição definida");
    }

    if ("ativo" in detalhes) {
      mudancas.push(detalhes.ativo ? "Criado como ativo" : "Criado como inativo");
    }

    return mudancas;
  }

  if (log.acao === "atualizado") {
    const antes =
      "antes" in detalhes && detalhes.antes && typeof detalhes.antes === "object"
        ? (detalhes.antes as Record<string, unknown>)
        : {};

    const depois =
      "depois" in detalhes && detalhes.depois && typeof detalhes.depois === "object"
        ? (detalhes.depois as Record<string, unknown>)
        : {};

    const mudancas: string[] = [];

    if (antes.nome !== depois.nome) {
      mudancas.push(
        `Nome alterado de "${String(antes.nome ?? "")}" para "${String(
          depois.nome ?? ""
        )}"`
      );
    }

    if (antes.descricao !== depois.descricao) {
      if (!antes.descricao && depois.descricao) {
        mudancas.push("Descrição adicionada");
      } else if (antes.descricao && !depois.descricao) {
        mudancas.push("Descrição removida");
      } else {
        mudancas.push("Descrição alterada");
      }
    }

    if (antes.ativo !== depois.ativo) {
      mudancas.push(depois.ativo ? "Perfil ativado" : "Perfil inativado");
    }

    return mudancas;
  }

  return [];
}

export default function PerfisPage() {
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [busca, setBusca] = useState("");

  const [modalAberto, setModalAberto] = useState(false);
  const [perfilEditando, setPerfilEditando] = useState<Perfil | null>(null);
  const [form, setForm] = useState<PerfilForm>(formInicial);

  const [logsPorPerfil, setLogsPorPerfil] = useState<Record<string, LogAuditoria[]>>(
    {}
  );
  const [loadingLogsId, setLoadingLogsId] = useState<string | null>(null);
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

  async function carregarLogsDoPerfil(perfilId: string) {
    try {
      setLoadingLogsId(perfilId);

      const res = await fetch(
        `/api/auditoria?entidade=perfil&entidade_id=${perfilId}`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok) {
        return;
      }

      setLogsPorPerfil((atual) => ({
        ...atual,
        [perfilId]: data.logs || [],
      }));
    } catch {
    } finally {
      setLoadingLogsId(null);
    }
  }

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

  async function toggleExpandir(perfilId: string) {
    const novoId = expandidoId === perfilId ? null : perfilId;
    setExpandidoId(novoId);

    if (novoId && !logsPorPerfil[perfilId]) {
      await carregarLogsDoPerfil(perfilId);
    }
  }

  return (
    <CrmShell>
      <Header
        title="Configuração de perfis"
        subtitle="Crie papéis de acesso, organize funções da equipe e acompanhe o histórico de alterações."
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

            <button className={styles.primaryButton} onClick={abrirNovoPerfil}>
              Novo perfil
            </button>
          </div>

          {erro && <div className={styles.errorAlert}>{erro}</div>}
          {sucesso && <div className={styles.successAlert}>{sucesso}</div>}

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
                const logs = logsPorPerfil[perfil.id] || [];

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
                          onClick={() => toggleExpandir(perfil.id)}
                        >
                          {expandido ? "Recolher" : "Expandir"}
                        </button>

                        <button
                          className={styles.secondaryButton}
                          onClick={() => abrirEditarPerfil(perfil)}
                        >
                          Editar
                        </button>

                        <Link
                          href={`/configuracoes/perfis/${perfil.id}/permissoes`}
                          className={styles.linkButton}
                        >
                          Permissões
                        </Link>
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

                        <div className={styles.timelineSection}>
                          <div className={styles.timelineHeader}>
                            <strong className={styles.timelineTitle}>Histórico</strong>
                            <button
                              className={styles.timelineButton}
                              onClick={() => carregarLogsDoPerfil(perfil.id)}
                              disabled={loadingLogsId === perfil.id}
                            >
                              {loadingLogsId === perfil.id
                                ? "Carregando..."
                                : "Atualizar histórico"}
                            </button>
                          </div>

                          {loadingLogsId === perfil.id && logs.length === 0 ? (
                            <div className={styles.timelineEmpty}>
                              Carregando histórico...
                            </div>
                          ) : logs.length === 0 ? (
                            <div className={styles.timelineEmpty}>
                              Nenhum histórico encontrado para este perfil.
                            </div>
                          ) : (
                            <div className={styles.timelineList}>
                              {logs.map((log) => {
                                const mudancas = formatarMudancasLog(log);

                                return (
                                  <div key={log.id} className={styles.timelineItem}>
                                    <div className={styles.timelineDot} />
                                    <div className={styles.timelineContent}>
                                      <strong className={styles.timelineItemTitle}>
                                        {log.acao === "criado"
                                          ? "Perfil criado"
                                          : "Perfil atualizado"}
                                      </strong>

                                      <span className={styles.timelineMeta}>
                                        por {log.usuario_nome || "Não identificado"} em{" "}
                                        {formatarData(log.created_at)}
                                      </span>

                                      {mudancas.length > 0 && (
                                        <ul className={styles.timelineChanges}>
                                          {mudancas.map((mudanca, index) => (
                                            <li
                                              key={index}
                                              className={styles.timelineChangeItem}
                                            >
                                              {mudanca}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
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
    </CrmShell>
  );
}