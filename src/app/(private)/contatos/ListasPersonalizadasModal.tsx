"use client";

import { useEffect, useState } from "react";
import styles from "./contatos.module.css";

export type ListaCompartilhadaContato = {
  id: string;
  nome: string;
  created_at: string;
  updated_at?: string;
  total_contatos: number;
  exibir_atalho_conversas: boolean;
  ordem_exibicao: number | null;
};

type Props = {
  listas: ListaCompartilhadaContato[];
  onClose: () => void;
  onChanged: (mensagem: string) => Promise<void> | void;
};

export default function ListasPersonalizadasModal({ listas, onClose, onChanged }: Props) {
  const [ordenadas, setOrdenadas] = useState(listas);
  const [pagina, setPagina] = useState(0);
  const [nome, setNome] = useState("");
  const [atalhoNovo, setAtalhoNovo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [excluir, setExcluir] = useState<string | null>(null);

  useEffect(() => {
    setOrdenadas(listas);
    setPagina((atual) => Math.min(atual, Math.max(0, listas.length - 1)));
  }, [listas]);

  const indice = Math.min(pagina, Math.max(0, ordenadas.length - 1));
  const listaAtual = ordenadas[indice] ?? null;

  async function req(url: string, metodo: string, payload: unknown) {
    const resposta = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok || dados.ok !== true) {
      throw new Error(dados.error || "Não foi possível salvar a lista.");
    }
  }

  async function executar(acao: () => Promise<string>) {
    if (ocupado) return;
    setErro("");
    setOcupado(true);
    try {
      const mensagem = await acao();
      await onChanged(mensagem);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar lista.");
    } finally {
      setOcupado(false);
    }
  }

  function criar() {
    if (!nome.trim() || ocupado) return;
    void executar(async () => {
      await req("/api/contatos/listas-compartilhadas", "POST", {
        nome: nome.trim(),
        exibir_atalho_conversas: atalhoNovo,
      });
      setNome("");
      setAtalhoNovo(false);
      setPagina(ordenadas.length);
      return "Lista personalizada criada.";
    });
  }

  function alterar(lista: ListaCompartilhadaContato, dados: object) {
    void executar(async () => {
      await req(`/api/contatos/listas-compartilhadas/${lista.id}`, "PATCH", dados);
      setEditando(null);
      return "Lista personalizada atualizada.";
    });
  }

  function remover(lista: ListaCompartilhadaContato) {
    void executar(async () => {
      await req(`/api/contatos/listas-compartilhadas/${lista.id}`, "DELETE", {
        confirmar_exclusao: true,
      });
      setExcluir(null);
      setPagina((atual) => Math.max(0, atual - (atual === ordenadas.length - 1 ? 1 : 0)));
      return "Lista excluída. Os contatos foram preservados.";
    });
  }

  function mover(id: string, destino: number) {
    const origem = ordenadas.findIndex((lista) => lista.id === id);
    if (origem < 0 || destino < 0 || destino >= ordenadas.length || origem === destino || ocupado) return;
    const antes = [...ordenadas];
    const depois = [...ordenadas];
    const [movida] = depois.splice(origem, 1);
    depois.splice(destino, 0, movida);
    setOrdenadas(depois);
    setPagina(destino);
    void executar(async () => {
      try {
        await req("/api/contatos/listas-compartilhadas/ordem", "PUT", {
          lista_ids: depois.map((lista) => lista.id),
        });
      } catch (error) {
        setOrdenadas(antes);
        setPagina(origem);
        throw error;
      }
      return "Prioridade das listas salva.";
    });
  }

  function mudarPagina(destino: number) {
    if (ocupado || destino < 0 || destino >= ordenadas.length) return;
    setPagina(destino);
    setEditando(null);
    setExcluir(null);
    setErro("");
  }

  return (
    <div className={styles.modalOverlay} onClick={(event) => {
      if (event.target === event.currentTarget && !ocupado) onClose();
    }}>
      <div className={`${styles.modalCard} ${styles.personalListModal}`}
        role="dialog" aria-modal="true" aria-labelledby="titulo-listas-personalizadas">
        <div className={`${styles.modalHeader} ${styles.personalListHeader}`}>
          <div>
            <p className={styles.eyebrow}>Organização</p>
            <h2 className={styles.modalTitle} id="titulo-listas-personalizadas">Listas personalizadas</h2>
            <p className={styles.cardDescription}>
              Organize contatos, priorize listas e escolha os atalhos exibidos em Conversas.
            </p>
          </div>
          <button type="button" className={styles.modalCloseButton} onClick={onClose}
            disabled={ocupado} aria-label="Fechar">×</button>
        </div>

        {erro && <div className={styles.alertError} role="alert">{erro}</div>}

        <section className={`${styles.listManagerSection} ${styles.personalListCreation}`}>
          <div className={styles.personalListSectionHeading}>
            <strong>Nova lista</strong>
            <small>Crie grupos sem duplicar contatos.</small>
          </div>
          <label className={styles.label} htmlFor="nome-lista-personalizada">Nome da lista</label>
          <div className={styles.listManagerNameRow}>
            <input id="nome-lista-personalizada" className={styles.input} value={nome}
              maxLength={160} disabled={ocupado} placeholder="Ex.: Clientes VIP"
              onChange={(event) => setNome(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); criar(); } }} />
            <button type="button" className={styles.primaryButton} disabled={ocupado || !nome.trim()}
              onClick={criar}>Criar lista</button>
          </div>
          <label className={styles.personalListCreateToggle}>
            <input type="checkbox" checked={atalhoNovo} disabled={ocupado}
              onChange={(event) => setAtalhoNovo(event.target.checked)} />
            Exibir como atalho em Conversas
          </label>
        </section>

        <section className={`${styles.listManagerSection} ${styles.personalListExisting}`}>
          <div className={styles.personalListSectionHeading}>
            <strong>Suas listas</strong>
            <small>Organize a prioridade com ↑ ↓. Esta ordem também vale no filtro de Contatos.</small>
          </div>

          {listaAtual ? (
            <div className={styles.personalListRows}>
              <div className={styles.personalListRow} key={listaAtual.id}>
                <div className={styles.personalListRowPrimary}>
                  <div className={styles.personalListRowTop}>
                    <span className={styles.personalListPosition}>{indice + 1}º</span>
                    {editando === listaAtual.id ? (
                      <input className={`${styles.input} ${styles.personalListEditInput}`}
                        value={nomeEdicao} autoFocus maxLength={160}
                        aria-label={`Renomear ${listaAtual.nome}`}
                        onChange={(event) => setNomeEdicao(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setEditando(null);
                          if (event.key === "Enter" && nomeEdicao.trim()) {
                            event.preventDefault();
                            alterar(listaAtual, { nome: nomeEdicao.trim() });
                          }
                        }} />
                    ) : (
                      <span className={styles.personalListName}>
                        <strong title={listaAtual.nome}>{listaAtual.nome}</strong>
                        <small>{listaAtual.total_contatos} {listaAtual.total_contatos === 1 ? "contato" : "contatos"}</small>
                      </span>
                    )}
                  </div>

                  <div className={styles.personalListRowActions}>
                    {editando === listaAtual.id ? (
                      <>
                        <button type="button" className={styles.secondaryButton}
                          disabled={ocupado} onClick={() => setEditando(null)}>Cancelar</button>
                        <button type="button" className={styles.primaryButton}
                          disabled={ocupado || !nomeEdicao.trim() || nomeEdicao.trim() === listaAtual.nome}
                          onClick={() => alterar(listaAtual, { nome: nomeEdicao.trim() })}>Salvar</button>
                      </>
                    ) : excluir === listaAtual.id ? (
                      <>
                        <button type="button" className={styles.secondaryButton}
                          disabled={ocupado} onClick={() => setExcluir(null)}>Cancelar</button>
                        <button type="button" className={styles.dangerButton}
                          disabled={ocupado} onClick={() => remover(listaAtual)}>Confirmar</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className={styles.secondaryButton}
                          disabled={ocupado}
                          onClick={() => {
                            setEditando(listaAtual.id);
                            setNomeEdicao(listaAtual.nome);
                            setExcluir(null);
                          }}>Editar</button>
                        <button type="button" className={styles.dangerButton}
                          disabled={ocupado}
                          onClick={() => { setExcluir(listaAtual.id); setEditando(null); }}>Excluir</button>
                      </>
                    )}
                  </div>
                </div>

                {excluir === listaAtual.id && (
                  <p className={styles.personalListDeleteNotice} role="alert">
                    Excluir “{listaAtual.nome}”? Os contatos permanecem cadastrados e apenas os vínculos com a lista serão removidos.
                  </p>
                )}

                <div className={styles.personalListRowFooter}>
                  <label className={styles.personalListToggle}>
                    <input type="checkbox" disabled={ocupado}
                      checked={listaAtual.exibir_atalho_conversas}
                      onChange={() => alterar(listaAtual, {
                        exibir_atalho_conversas: !listaAtual.exibir_atalho_conversas,
                      })} />
                    <span>Exibir atalho</span>
                  </label>
                  <div className={styles.personalListPriority}>
                    <span>Prioridade</span>
                    <button type="button" className={styles.personalListMiniButton}
                      disabled={ocupado || indice === 0}
                      onClick={() => mover(listaAtual.id, indice - 1)}
                      aria-label={`Subir ${listaAtual.nome}`} title="Subir prioridade">↑</button>
                    <button type="button" className={styles.personalListMiniButton}
                      disabled={ocupado || indice === ordenadas.length - 1}
                      onClick={() => mover(listaAtual.id, indice + 1)}
                      aria-label={`Descer ${listaAtual.nome}`} title="Descer prioridade">↓</button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className={styles.personalListEmpty}>Nenhuma lista criada. Use o formulário acima para começar.</p>
          )}

          {ordenadas.length > 1 && (
            <nav className={styles.personalListPagination} aria-label="Páginas das listas personalizadas">
              <button type="button" className={styles.personalListPageButton}
                disabled={ocupado || indice === 0}
                onClick={() => mudarPagina(indice - 1)}>‹ Anterior</button>
              <span className={styles.personalListPageStatus} aria-live="polite">
                Lista <strong>{indice + 1}</strong> de <strong>{ordenadas.length}</strong>
              </span>
              <button type="button" className={styles.personalListPageButton}
                disabled={ocupado || indice === ordenadas.length - 1}
                onClick={() => mudarPagina(indice + 1)}>Próxima ›</button>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
