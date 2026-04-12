"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function PermissoesDoPerfilPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [perfilId, setPerfilId] = useState<string>("");
  const [perfil, setPerfil] = useState<PerfilInfo | null>(null);
  const [permissoes, setPermissoes] = useState<PermissaoItem[]>([]);
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

      setPerfil(data.perfil);
      setPermissoes(permissoesFormatadas);
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

    return Array.from(map.entries()).map(([grupo, itens]) => ({
      grupo,
      itens: itens.sort((a, b) => a.codigo.localeCompare(b.codigo)),
    }));
  }, [permissoes]);

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
        <header className={styles.hero}>
          <div>
            <a href="/configuracoes/perfis" className={styles.backLink}>
              ← Voltar para perfis
            </a>

            <h1 className={styles.title}>Permissões do perfil</h1>
            <p className={styles.subtitle}>
              Ajuste o que este perfil pode fazer dentro do sistema. Pense nas
              permissões como botões e ações liberadas para quem estiver usando
              este perfil.
            </p>

            <div className={styles.profileBox}>
              <strong>{perfil.nome}</strong>
              <span>{perfil.descricao || "Sem descrição"}</span>
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
        {sucesso && <div className={styles.successAlert}>{sucesso}</div>}

        <section className={styles.explainGrid}>
          <div className={styles.explainCard}>
            <h2>Como usar</h2>
            <p>
              Marque apenas o que esse perfil realmente precisa. Quanto mais
              simples o perfil, mais fácil fica administrar a operação.
            </p>
          </div>

          <div className={styles.explainCard}>
            <h2>Dica prática</h2>
            <p>
              Use perfis para controlar acesso geral. Regras mais específicas
              podem ser tratadas depois por política da empresa ou por usuário.
            </p>
          </div>
        </section>

        <section className={styles.groupsSection}>
          {grupos.map(({ grupo, itens }) => {
            const totalMarcadas = itens.filter((item) => item.marcada).length;
            const todasMarcadas = totalMarcadas === itens.length && itens.length > 0;

            return (
              <article key={grupo} className={styles.groupCard}>
                <div className={styles.groupHeader}>
                  <div>
                    <h2 className={styles.groupTitle}>{grupo}</h2>
                    <p className={styles.groupSubtitle}>
                      {totalMarcadas} de {itens.length} permissões marcadas
                    </p>
                  </div>

                  <div className={styles.groupActions}>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => marcarGrupo(grupo, true)}
                    >
                      Marcar todas
                    </button>
                    <button
                      className={styles.ghostButton}
                      onClick={() => marcarGrupo(grupo, false)}
                      disabled={!todasMarcadas && totalMarcadas === 0}
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div className={styles.permissionsGrid}>
                  {itens.map((item) => (
                    <label key={item.codigo} className={styles.permissionCard}>
                      <div className={styles.permissionText}>
                        <span className={styles.permissionCode}>{item.codigo}</span>
                        <span className={styles.permissionDescription}>
                          {item.descricao || "Sem descrição"}
                        </span>
                      </div>

                      <span className={styles.switchWrap}>
                        <input
                          type="checkbox"
                          checked={item.marcada}
                          onChange={() => alternarPermissao(item.codigo)}
                          className={styles.switchInput}
                        />
                        <span className={styles.switchSlider} />
                      </span>
                    </label>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}