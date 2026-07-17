"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Header from "@/components/Header";
import FeedbackToast from "@/components/FeedbackToast";
import styles from "./kanban.module.css";

type ClassificacaoLead = "novo" | "qualificado" | "convertido" | "perdido";

type ContatoKanban = {
  id: string;
  nome: string | null;
  whatsapp_profile_name: string | null;
  telefone: string | null;
  email: string | null;
  origem: string | null;
  campanha: string | null;
  classificacao: ClassificacaoLead | null;
  classificacao_atualizada_em: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ColunaKanban = {
  id: ClassificacaoLead;
  titulo: string;
  total: number;
  contatos: ContatoKanban[];
};

const CLASSIFICACOES: Array<{ id: ClassificacaoLead; titulo: string }> = [
  { id: "novo", titulo: "Novo" },
  { id: "qualificado", titulo: "Qualificado" },
  { id: "convertido", titulo: "Convertido" },
  { id: "perdido", titulo: "Perdido" },
];

function criarColunasVazias(): ColunaKanban[] {
  return CLASSIFICACOES.map((coluna) => ({
    ...coluna,
    total: 0,
    contatos: [],
  }));
}

function formatarData(valor: string | null) {
  if (!valor) return "Sem atualização";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}

function obterNomeContato(contato: ContatoKanban) {
  return (
    contato.nome?.trim() ||
    contato.whatsapp_profile_name?.trim() ||
    contato.telefone?.trim() ||
    "Contato sem nome"
  );
}

function obterIniciais(contato: ContatoKanban) {
  const nome = obterNomeContato(contato).replace(/\D+$/g, "").trim();
  const partes = nome.split(/\s+/).filter(Boolean);

  if (partes.length === 0) return "C";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

function moverContatoEntreColunas(
  colunas: ColunaKanban[],
  contatoId: string,
  destino: ClassificacaoLead
) {
  let contatoMovido: ContatoKanban | null = null;
  let origem: ClassificacaoLead | null = null;

  const semContato = colunas.map((coluna) => {
    const contatos = coluna.contatos.filter((contato) => {
      if (contato.id !== contatoId) return true;

      contatoMovido = {
        ...contato,
        classificacao: destino,
        classificacao_atualizada_em: new Date().toISOString(),
      };
      origem = coluna.id;

      return false;
    });

    return {
      ...coluna,
      total:
        coluna.id === origem && coluna.total > contatos.length
          ? Math.max(0, coluna.total - 1)
          : coluna.total,
      contatos,
    };
  });

  if (!contatoMovido || origem === destino) {
    return colunas;
  }

  return semContato.map((coluna) => {
    if (coluna.id !== destino || !contatoMovido) return coluna;

    return {
      ...coluna,
      total: coluna.total + 1,
      contatos: [contatoMovido, ...coluna.contatos],
    };
  });
}

export default function KanbanPage() {
  const [colunas, setColunas] = useState<ColunaKanban[]>(criarColunasVazias);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [loading, setLoading] = useState(true);
  const [movendoContatoId, setMovendoContatoId] = useState<string | null>(null);
  const [dragContatoId, setDragContatoId] = useState<string | null>(null);
  const [dragOverColuna, setDragOverColuna] =
    useState<ClassificacaoLead | null>(null);
  const [feedback, setFeedback] = useState({ success: "", error: "" });

  const totalContatos = useMemo(
    () => colunas.reduce((total, coluna) => total + coluna.total, 0),
    [colunas]
  );

  const carregarKanban = useCallback(async () => {
    setLoading(true);
    setFeedback({ success: "", error: "" });

    try {
      const params = new URLSearchParams();

      if (buscaAplicada) {
        params.set("busca", buscaAplicada);
      }

      const response = await fetch(`/api/kanban/leads?${params.toString()}`);
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Não foi possível carregar o Kanban.");
      }

      setColunas(json.colunas || criarColunasVazias());
    } catch (error) {
      setFeedback({
        success: "",
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o Kanban.",
      });
    } finally {
      setLoading(false);
    }
  }, [buscaAplicada]);

  useEffect(() => {
    carregarKanban();
  }, [carregarKanban]);

  async function moverContato(
    contatoId: string,
    classificacao: ClassificacaoLead
  ) {
    const contatoAtual = colunas
      .flatMap((coluna) => coluna.contatos)
      .find((contato) => contato.id === contatoId);

    if (!contatoAtual || contatoAtual.classificacao === classificacao) return;

    const snapshot = colunas;
    setMovendoContatoId(contatoId);
    setColunas((atuais) =>
      moverContatoEntreColunas(atuais, contatoId, classificacao)
    );

    try {
      const response = await fetch("/api/kanban/leads", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contato_id: contatoId,
          classificacao,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Não foi possível mover o lead.");
      }

      setFeedback({
        success: "Lead movido com sucesso.",
        error: "",
      });
    } catch (error) {
      setColunas(snapshot);
      setFeedback({
        success: "",
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível mover o lead.",
      });
    } finally {
      setMovendoContatoId(null);
      setDragContatoId(null);
      setDragOverColuna(null);
    }
  }

  function aplicarBusca(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBuscaAplicada(busca.trim());
  }

  return (
    <>
      <Header
        title="Kanban"
        subtitle="Acompanhe os leads por classificação global"
      />

      <main className={styles.pageContent}>
        <FeedbackToast
          success={feedback.success}
          error={feedback.error}
          onSuccessDismiss={() => setFeedback((atual) => ({ ...atual, success: "" }))}
          onErrorDismiss={() => setFeedback((atual) => ({ ...atual, error: "" }))}
        />

        <section className={styles.toolbar}>
          <div>
            <p className={styles.eyebrow}>Pipeline comercial</p>
            <h2 className={styles.title}>Leads por etapa</h2>
            <p className={styles.description}>
              Mover um card altera a classificação do contato em todo o CRM.
            </p>
          </div>

          <form className={styles.searchForm} onSubmit={aplicarBusca}>
            <input
              className={styles.searchInput}
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar nome, telefone, origem ou campanha"
            />
            <button className={styles.searchButton} type="submit">
              Buscar
            </button>
            {buscaAplicada && (
              <button
                className={styles.clearButton}
                type="button"
                onClick={() => {
                  setBusca("");
                  setBuscaAplicada("");
                }}
              >
                Limpar
              </button>
            )}
          </form>
        </section>

        <section className={styles.summaryGrid} aria-label="Resumo do Kanban">
          <div className={styles.summaryItem}>
            <span>Total no quadro</span>
            <strong>{totalContatos}</strong>
          </div>
          {colunas.map((coluna) => (
            <div key={coluna.id} className={styles.summaryItem}>
              <span>{coluna.titulo}</span>
              <strong>{coluna.total}</strong>
            </div>
          ))}
        </section>

        <section className={styles.board} aria-busy={loading}>
          {colunas.map((coluna) => (
            <div
              key={coluna.id}
              className={`${styles.column} ${styles[`column_${coluna.id}`]} ${
                dragOverColuna === coluna.id ? styles.columnDragOver : ""
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverColuna(coluna.id);
              }}
              onDragLeave={() => setDragOverColuna(null)}
              onDrop={(event) => {
                event.preventDefault();
                if (dragContatoId) {
                  moverContato(dragContatoId, coluna.id);
                }
              }}
            >
              <div className={styles.columnHeader}>
                <div>
                  <h3>{coluna.titulo}</h3>
                  <p>{coluna.total} lead(s)</p>
                </div>
                <span className={styles.columnDot} />
              </div>

              <div className={styles.cardList}>
                {loading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className={styles.cardSkeleton} />
                  ))
                ) : coluna.contatos.length > 0 ? (
                  coluna.contatos.map((contato) => (
                    <article
                      key={contato.id}
                      className={`${styles.leadCard} ${
                        movendoContatoId === contato.id ? styles.cardMoving : ""
                      }`}
                      draggable={movendoContatoId !== contato.id}
                      onDragStart={() => setDragContatoId(contato.id)}
                      onDragEnd={() => {
                        setDragContatoId(null);
                        setDragOverColuna(null);
                      }}
                    >
                      <div className={styles.cardTop}>
                        <div className={styles.avatar}>
                          {obterIniciais(contato)}
                        </div>
                        <div className={styles.cardIdentity}>
                          <h4>{obterNomeContato(contato)}</h4>
                          <p>{contato.telefone || "Sem telefone"}</p>
                        </div>
                      </div>

                      <div className={styles.cardMeta}>
                        <span>{contato.origem || "Origem não informada"}</span>
                        <span>{contato.campanha || "Sem campanha"}</span>
                      </div>

                      <div className={styles.cardFooter}>
                        <span>
                          Atualizado em{" "}
                          {formatarData(
                            contato.classificacao_atualizada_em ||
                              contato.updated_at ||
                              contato.created_at
                          )}
                        </span>
                      </div>

                      <label className={styles.mobileMove}>
                        Mover para
                        <select
                          value={contato.classificacao || coluna.id}
                          disabled={movendoContatoId === contato.id}
                          onChange={(event) =>
                            moverContato(
                              contato.id,
                              event.target.value as ClassificacaoLead
                            )
                          }
                        >
                          {CLASSIFICACOES.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.titulo}
                            </option>
                          ))}
                        </select>
                      </label>
                    </article>
                  ))
                ) : (
                  <div className={styles.emptyColumn}>
                    Nenhum lead nesta etapa.
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
