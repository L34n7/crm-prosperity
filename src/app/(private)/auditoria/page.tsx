"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  RefreshCw,
  ScrollText,
  X,
} from "lucide-react";
import Header from "@/components/Header";
import styles from "./auditoria.module.css";

const ITENS_POR_PAGINA = 25;

const CATEGORIAS = [
  "permissoes",
  "usuarios",
  "conversas",
  "contatos",
  "disparos",
  "fluxos",
  "setores",
  "perfis",
  "sistema",
];

const ENTIDADES = [
  "setor",
  "perfil",
  "usuario",
  "permissao",
  "politica_empresa",
  "conversa",
  "contato",
  "disparo",
  "fluxo",
];

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type LogAuditoria = {
  id: string;
  categoria: string | null;
  entidade: string;
  entidade_id: string;
  acao: string;
  descricao: string | null;
  usuario_id: string | null;
  usuario_nome: string | null;
  detalhes: JsonValue;
  antes: JsonValue;
  depois: JsonValue;
  metadata: JsonValue;
  created_at: string;
};

type UsuarioOpcao = {
  id: string;
  nome: string | null;
  email: string | null;
};

type Filtros = {
  categoria: string;
  entidade: string;
  usuarioId: string;
  acao: string;
  dataDe: string;
  dataAte: string;
};

const FILTROS_INICIAIS: Filtros = {
  categoria: "",
  entidade: "",
  usuarioId: "",
  acao: "",
  dataDe: "",
  dataAte: "",
};

function formatarRotulo(valor: string | null) {
  if (!valor) return "Nao informado";

  return valor
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letra) => letra.toUpperCase());
}

function formatarDataHora(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(valor));
}

function formatarDataParametro(valor: string, fimDoDia = false) {
  if (!valor) return "";
  return new Date(`${valor}T${fimDoDia ? "23:59:59.999" : "00:00:00.000"}`).toISOString();
}

function temConteudo(valor: JsonValue) {
  if (valor === null) return false;
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === "object") return Object.keys(valor).length > 0;
  return true;
}

function JsonBlock({ titulo, valor }: { titulo: string; valor: JsonValue }) {
  if (!temConteudo(valor)) return null;

  return (
    <div className={styles.jsonCard}>
      <h4>{titulo}</h4>
      <pre>{JSON.stringify(valor, null, 2)}</pre>
    </div>
  );
}

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioOpcao[]>([]);
  const [filtrosFormulario, setFiltrosFormulario] =
    useState<Filtros>(FILTROS_INICIAIS);
  const [filtrosAplicados, setFiltrosAplicados] =
    useState<Filtros>(FILTROS_INICIAIS);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [logSelecionado, setLogSelecionado] = useState<LogAuditoria | null>(
    null
  );

  const carregarLogs = useCallback(async () => {
    try {
      setCarregando(true);
      setErro("");

      const params = new URLSearchParams({
        pagina: String(pagina),
        limit: String(ITENS_POR_PAGINA),
      });

      if (filtrosAplicados.categoria) {
        params.set("categoria", filtrosAplicados.categoria);
      }
      if (filtrosAplicados.entidade) {
        params.set("entidade", filtrosAplicados.entidade);
      }
      if (filtrosAplicados.usuarioId) {
        params.set("usuario_id", filtrosAplicados.usuarioId.trim());
      }
      if (filtrosAplicados.acao) {
        params.set("acao", filtrosAplicados.acao.trim());
      }
      if (filtrosAplicados.dataDe) {
        params.set("data_de", formatarDataParametro(filtrosAplicados.dataDe));
      }
      if (filtrosAplicados.dataAte) {
        params.set(
          "data_ate",
          formatarDataParametro(filtrosAplicados.dataAte, true)
        );
      }

      const resposta = await fetch(`/api/auditoria?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await resposta.json();

      if (!resposta.ok || !data.ok) {
        throw new Error(data.error || "Nao foi possivel carregar a auditoria");
      }

      setLogs(data.logs || []);
      setUsuarios(data.usuarios || []);
      setTotal(data.paginacao?.total || 0);
      setTotalPaginas(data.paginacao?.total_paginas || 1);
    } catch (error) {
      setLogs([]);
      setTotal(0);
      setTotalPaginas(1);
      setErro(
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar a auditoria"
      );
    } finally {
      setCarregando(false);
    }
  }, [filtrosAplicados, pagina]);

  useEffect(() => {
    carregarLogs();
  }, [carregarLogs]);

  function atualizarFiltro(chave: keyof Filtros, valor: string) {
    setFiltrosFormulario((atual) => ({ ...atual, [chave]: valor }));
  }

  function aplicarFiltros(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPagina(1);
    setFiltrosAplicados(filtrosFormulario);
  }

  function limparFiltros() {
    setFiltrosFormulario(FILTROS_INICIAIS);
    setFiltrosAplicados(FILTROS_INICIAIS);
    setPagina(1);
  }

  const primeiroItem = total === 0 ? 0 : (pagina - 1) * ITENS_POR_PAGINA + 1;
  const ultimoItem = Math.min(pagina * ITENS_POR_PAGINA, total);

  return (
    <>
      <Header
        title="Auditoria"
        subtitle="Acompanhe as alteracoes realizadas na operacao e consulte os detalhes de cada evento."
      />

      <main className={styles.pageContent}>
        <section className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <ScrollText size={24} />
          </div>
          <div>
            <p className={styles.eyebrow}>Rastreabilidade</p>
            <h2 className={styles.cardTitle}>Logs de auditoria</h2>
            <p className={styles.cardDescription}>
              Consulte quem realizou cada acao, quando ela ocorreu e quais dados
              foram alterados.
            </p>
          </div>
          <div className={styles.totalBadge}>
            <strong>{total}</strong>
            <span>eventos encontrados</span>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Consulta</p>
              <h2 className={styles.sectionTitle}>Filtrar eventos</h2>
            </div>
            <Filter size={20} />
          </div>

          <form className={styles.filtersGrid} onSubmit={aplicarFiltros}>
            <label className={styles.field}>
              <span>Categoria</span>
              <select
                value={filtrosFormulario.categoria}
                onChange={(event) =>
                  atualizarFiltro("categoria", event.target.value)
                }
              >
                <option value="">Todas</option>
                {CATEGORIAS.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {formatarRotulo(categoria)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Entidade</span>
              <select
                value={filtrosFormulario.entidade}
                onChange={(event) =>
                  atualizarFiltro("entidade", event.target.value)
                }
              >
                <option value="">Todas</option>
                {ENTIDADES.map((entidade) => (
                  <option key={entidade} value={entidade}>
                    {formatarRotulo(entidade)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Busque por acao</span>
              <input
                value={filtrosFormulario.acao}
                onChange={(event) => atualizarFiltro("acao", event.target.value)}
                placeholder="Ex.: fluxo, atualizado..."
              />
            </label>

            <label className={styles.field}>
              <span>Usuario</span>
              <select
                value={filtrosFormulario.usuarioId}
                onChange={(event) =>
                  atualizarFiltro("usuarioId", event.target.value)
                }
              >
                <option value="">Todos</option>
                {usuarios.map((usuario) => (
                  <option key={usuario.id} value={usuario.id}>
                    {usuario.nome || usuario.email || usuario.id}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Data inicial</span>
              <input
                type="date"
                value={filtrosFormulario.dataDe}
                onChange={(event) =>
                  atualizarFiltro("dataDe", event.target.value)
                }
              />
            </label>

            <label className={styles.field}>
              <span>Data final</span>
              <input
                type="date"
                value={filtrosFormulario.dataAte}
                onChange={(event) =>
                  atualizarFiltro("dataAte", event.target.value)
                }
              />
            </label>

            <div className={styles.filterActions}>
              <button type="submit" className={styles.primaryButton}>
                <Filter size={16} />
                Aplicar filtros
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={limparFiltros}
              >
                Limpar
              </button>
            </div>
          </form>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Historico</p>
              <h2 className={styles.sectionTitle}>Eventos registrados</h2>
            </div>
            <button
              type="button"
              className={styles.iconButton}
              onClick={carregarLogs}
              title="Atualizar lista"
              aria-label="Atualizar lista"
            >
              <RefreshCw size={17} />
            </button>
          </div>

          {erro ? <div className={styles.errorState}>{erro}</div> : null}

          {carregando ? (
            <div className={styles.emptyState}>Carregando auditoria...</div>
          ) : logs.length === 0 && !erro ? (
            <div className={styles.emptyState}>
              Nenhum evento encontrado para os filtros selecionados.
            </div>
          ) : !erro ? (
            <>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Data e hora</th>
                      <th>Usuario</th>
                      <th>Categoria</th>
                      <th>Acao</th>
                      <th>Entidade</th>
                      <th>Descricao</th>
                      <th aria-label="Acoes" />
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td className={styles.dateCell}>
                          {formatarDataHora(log.created_at)}
                        </td>
                        <td>
                          <strong>{log.usuario_nome || "Sistema"}</strong>
                          {log.usuario_id ? (
                            <span className={styles.secondaryText}>
                              {log.usuario_id}
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <span className={styles.categoryBadge}>
                            {formatarRotulo(log.categoria)}
                          </span>
                        </td>
                        <td>{formatarRotulo(log.acao)}</td>
                        <td>
                          <strong>{formatarRotulo(log.entidade)}</strong>
                          <span className={styles.secondaryText}>
                            {log.entidade_id}
                          </span>
                        </td>
                        <td className={styles.descriptionCell}>
                          {log.descricao || "Sem descricao"}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.viewButton}
                            onClick={() => setLogSelecionado(log)}
                          >
                            <Eye size={16} />
                            Detalhes
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.paginationBar}>
                <span>
                  Exibindo {primeiroItem} a {ultimoItem} de {total} eventos
                </span>
                <div className={styles.paginationActions}>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
                    disabled={pagina <= 1}
                    aria-label="Pagina anterior"
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>
                    Pagina {pagina} de {totalPaginas}
                  </span>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() =>
                      setPagina((atual) => Math.min(totalPaginas, atual + 1))
                    }
                    disabled={pagina >= totalPaginas}
                    aria-label="Proxima pagina"
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </main>

      {logSelecionado ? (
        <div
          className={styles.modalOverlay}
          onClick={() => setLogSelecionado(null)}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auditoria-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Detalhes do evento</p>
                <h2 id="auditoria-modal-title">
                  {formatarRotulo(logSelecionado.acao)}
                </h2>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setLogSelecionado(null)}
                aria-label="Fechar detalhes"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.detailsGrid}>
                <div>
                  <span>Data e hora</span>
                  <strong>{formatarDataHora(logSelecionado.created_at)}</strong>
                </div>
                <div>
                  <span>Usuario</span>
                  <strong>{logSelecionado.usuario_nome || "Sistema"}</strong>
                </div>
                <div>
                  <span>Categoria</span>
                  <strong>{formatarRotulo(logSelecionado.categoria)}</strong>
                </div>
                <div>
                  <span>Entidade</span>
                  <strong>{formatarRotulo(logSelecionado.entidade)}</strong>
                </div>
                <div>
                  <span>ID da entidade</span>
                  <strong>{logSelecionado.entidade_id}</strong>
                </div>
              </div>

              <div className={styles.descriptionBox}>
                <span>Descricao</span>
                <p>{logSelecionado.descricao || "Sem descricao registrada."}</p>
              </div>

              <div className={styles.jsonGrid}>
                <JsonBlock titulo="Dados anteriores" valor={logSelecionado.antes} />
                <JsonBlock titulo="Dados posteriores" valor={logSelecionado.depois} />
                <JsonBlock titulo="Detalhes" valor={logSelecionado.detalhes} />
                <JsonBlock titulo="Metadata" valor={logSelecionado.metadata} />
              </div>

            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
