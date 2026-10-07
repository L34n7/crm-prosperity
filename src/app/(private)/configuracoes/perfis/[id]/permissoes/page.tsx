"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Search,
  ShieldCheck,
} from "lucide-react";
import FeedbackToast from "@/components/FeedbackToast";
import styles from "./permissoes.module.css";

type PermissaoItem = {
  codigo: string;
  descricao: string | null;
  grupo: string;
  marcada: boolean;
};

type PerfilInfo = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
};

type ApiResponse = {
  ok: boolean;
  perfil: PerfilInfo;
  permissoes: PermissaoItem[];
};

function getGrupoFromCodigo(codigo: string) {
  const prefixo = codigo.split(".")[0] || "outros";

  switch (prefixo) {
    case "conversas":
      return "Conversas";
    case "mensagens":
      return "Mensagens";
    case "usuarios":
      return "Usuários";
    case "setores":
      return "Setores";
    case "perfis":
      return "Perfis";
    case "relatorios":
      return "Relatórios";
    case "sistema":
      return "Sistema";
    default:
      return "Outros";
  }
}

function normalizarBusca(valor: string) {
  return valor
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getModuloId(grupo: string) {
  return `modulo-${normalizarBusca(grupo)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export default function PermissoesDoPerfilPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [perfilId, setPerfilId] = useState("");
  const [perfil, setPerfil] = useState<PerfilInfo | null>(null);
  const [permissoes, setPermissoes] = useState<PermissaoItem[]>([]);
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    async function resolverParams() {
      const resolved = await params;
      setPerfilId(resolved.id);
    }

    resolverParams();
  }, [params]);

  async function carregarDados(id: string) {
    try {
      setLoading(true);
      setErro("");

      const res = await fetch(`/api/perfis/${id}/permissoes`, {
        cache: "no-store",
      });

      const data = (await res.json()) as ApiResponse & { error?: string };

      if (!res.ok || !data.ok) {
        setErro(data.error || "Erro ao carregar permissões do perfil");
        return;
      }

      const permissoesFormatadas = (data.permissoes || []).map((item) => ({
        ...item,
        grupo: item.grupo || getGrupoFromCodigo(item.codigo),
      }));

      const modulos = Array.from(
        new Set(permissoesFormatadas.map((item) => item.grupo || "Outros"))
      );

      setPerfil(data.perfil);
      setPermissoes(permissoesFormatadas);
      setGruposAbertos(new Set(modulos));
    } catch {
      setErro("Erro ao carregar permissões do perfil");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!perfilId) return;
    carregarDados(perfilId);
  }, [perfilId]);

  const grupos = useMemo(() => {
    const map = new Map<string, PermissaoItem[]>();

    for (const permissao of permissoes) {
      const grupo = permissao.grupo || "Outros";
      const lista = map.get(grupo) || [];
      lista.push(permissao);
      map.set(grupo, lista);
    }

    return Array.from(map.entries())
      .map(([grupo, itens]) => ({
        grupo,
        itens: [...itens].sort((a, b) =>
          (a.descricao || a.codigo).localeCompare(
            b.descricao || b.codigo,
            "pt-BR"
          )
        ),
      }))
      .sort((a, b) => a.grupo.localeCompare(b.grupo, "pt-BR"));
  }, [permissoes]);

  const termoBusca = normalizarBusca(busca);

  const gruposFiltrados = useMemo(() => {
    if (!termoBusca) {
      return grupos.map((grupo) => ({
        ...grupo,
        itensVisiveis: grupo.itens,
      }));
    }

    return grupos.flatMap((grupo) => {
      const encontrouModulo = normalizarBusca(grupo.grupo).includes(termoBusca);
      const itensVisiveis = encontrouModulo
        ? grupo.itens
        : grupo.itens.filter((item) => {
            const texto = normalizarBusca(
              `${item.descricao || ""} ${item.codigo}`
            );
            return texto.includes(termoBusca);
          });

      if (itensVisiveis.length === 0) return [];

      return [
        {
          ...grupo,
          itensVisiveis,
        },
      ];
    });
  }, [grupos, termoBusca]);

  const totalMarcadas = permissoes.filter((item) => item.marcada).length;

  function alternarPermissao(codigo: string) {
    setPermissoes((atual) =>
      atual.map((item) =>
        item.codigo === codigo ? { ...item, marcada: !item.marcada } : item
      )
    );
  }

  function marcarGrupo(grupo: string, valor: boolean) {
    setPermissoes((atual) =>
      atual.map((item) =>
        item.grupo === grupo ? { ...item, marcada: valor } : item
      )
    );
  }

  function alternarGrupo(grupo: string) {
    setGruposAbertos((atual) => {
      const proximo = new Set(atual);

      if (proximo.has(grupo)) {
        proximo.delete(grupo);
      } else {
        proximo.add(grupo);
      }

      return proximo;
    });
  }

  function irParaModulo(grupo: string) {
    setBusca("");
    setGruposAbertos((atual) => new Set(atual).add(grupo));

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(getModuloId(grupo))?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }

  async function salvarPermissoes() {
    if (!perfilId) return;

    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      const codigosMarcados = permissoes
        .filter((item) => item.marcada)
        .map((item) => item.codigo);

      const res = await fetch(`/api/perfis/${perfilId}/permissoes`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          permissoes: codigosMarcados,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao salvar permissões");
        return;
      }

      setSucesso(data.message || "Permissões salvas com sucesso.");
      await carregarDados(perfilId);
    } catch {
      setErro("Erro ao salvar permissões");
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.loadingCard}>Carregando permissões...</div>
        </div>
      </main>
    );
  }

  if (!perfil) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.errorCard}>
            {erro || "Perfil não encontrado."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.pageHeader}>
          <div className={styles.headerContent}>
            <Link href="/configuracoes/perfis" className={styles.backLink}>
              <ArrowLeft size={16} />
              <span>Perfis</span>
            </Link>

            <div className={styles.titleRow}>
              <div>
                <p className={styles.eyebrow}>Configurações de acesso</p>
                <h1 className={styles.title}>Permissões do perfil</h1>
                <p className={styles.subtitle}>
                  Organize o que cada perfil pode visualizar e executar no CRM.
                </p>
              </div>

              <div className={styles.profileBadge}>
                <span className={styles.profileIcon}>
                  <ShieldCheck size={17} />
                </span>
                <span>
                  <small>Perfil</small>
                  <strong>{perfil.nome}</strong>
                </span>
              </div>
            </div>
          </div>

          <button
            className={styles.primaryButton}
            onClick={salvarPermissoes}
            disabled={salvando}
          >
            {salvando ? "Salvando..." : "Salvar permissões"}
          </button>
        </header>

        {erro && <div className={styles.errorAlert}>{erro}</div>}
        <FeedbackToast
          success={sucesso}
          onSuccessDismiss={() => setSucesso("")}
        />

        <section className={styles.searchPanel}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input
              type="search"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar por permissão ou módulo..."
              aria-label="Buscar permissões"
            />
          </div>

          <div className={styles.searchMeta}>
            <span>{grupos.length} módulos</span>
            <span className={styles.metaDivider} />
            <span>
              {totalMarcadas} de {permissoes.length} ativas
            </span>
          </div>
        </section>

        <div className={styles.contentGrid}>
          <section className={styles.modulesColumn}>
            {gruposFiltrados.length === 0 ? (
              <div className={styles.emptySearch}>
                Nenhuma permissão ou módulo encontrado para “{busca}”.
              </div>
            ) : (
              gruposFiltrados.map(({ grupo, itens, itensVisiveis }) => {
                const marcadas = itens.filter((item) => item.marcada).length;
                const todasMarcadas =
                  marcadas === itens.length && itens.length > 0;
                const aberto = termoBusca ? true : gruposAbertos.has(grupo);

                return (
                  <article
                    key={grupo}
                    id={getModuloId(grupo)}
                    className={styles.moduleCard}
                  >
                    <div className={styles.moduleHeader}>
                      <button
                        type="button"
                        className={styles.moduleToggle}
                        onClick={() => alternarGrupo(grupo)}
                        aria-expanded={aberto}
                      >
                        <span className={styles.moduleIdentity}>
                          <span className={styles.moduleName}>{grupo}</span>
                          <span className={styles.moduleCount}>
                            {marcadas} de {itens.length} ativas
                          </span>
                        </span>

                        <span className={styles.chevron}>
                          {aberto ? (
                            <ChevronUp size={18} />
                          ) : (
                            <ChevronDown size={18} />
                          )}
                        </span>
                      </button>

                      <div className={styles.groupActions}>
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={() => marcarGrupo(grupo, true)}
                          disabled={todasMarcadas}
                        >
                          Marcar todas
                        </button>
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={() => marcarGrupo(grupo, false)}
                          disabled={marcadas === 0}
                        >
                          Limpar
                        </button>
                      </div>
                    </div>

                    {aberto && (
                      <div className={styles.moduleBody}>
                        <div className={styles.permissionsGrid}>
                          {itensVisiveis.map((item) => (
                            <label
                              key={item.codigo}
                              className={styles.permissionCard}
                            >
                              <span className={styles.permissionText}>
                                <span className={styles.permissionName}>
                                  {item.descricao || item.codigo}
                                </span>
                                <span className={styles.permissionCode}>
                                  {item.codigo}
                                </span>
                              </span>

                              <span className={styles.switchWrap}>
                                <input
                                  type="checkbox"
                                  checked={item.marcada}
                                  onChange={() =>
                                    alternarPermissao(item.codigo)
                                  }
                                  className={styles.switchInput}
                                />
                                <span className={styles.switchSlider} />
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>

          <aside className={styles.summaryAside}>
            <div className={styles.summaryCard}>
              <p className={styles.summaryTitle}>Módulos</p>

              <nav className={styles.summaryNav} aria-label="Sumário de módulos">
                {grupos.map(({ grupo, itens }) => {
                  const marcadas = itens.filter((item) => item.marcada).length;

                  return (
                    <button
                      type="button"
                      key={grupo}
                      className={styles.summaryLink}
                      onClick={() => irParaModulo(grupo)}
                    >
                      <span>{grupo}</span>
                      <small>
                        {marcadas}/{itens.length}
                      </small>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
