"use client";

import { useEffect, useState } from "react";
import styles from "./contatos.module.css";

export type ListaCompartilhadaContato = {
  id: string;
  nome: string;
  created_at: string;
  updated_at?: string;
  total_contatos: number;
};

type Props = {
  listas: ListaCompartilhadaContato[];
  onClose: () => void;
  onChanged: (
    mensagem: string,
    listaExcluidaId?: string
  ) => void | Promise<void>;
};

export default function GerenciarListasCompartilhadasModal({
  listas,
  onClose,
  onChanged,
}: Props) {
  const [nomeNovaLista, setNomeNovaLista] = useState("");
  const [criando, setCriando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] =
    useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !criando && !salvandoId && !excluindoId) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [criando, excluindoId, onClose, salvandoId]);

  async function criarLista() {
    const nome = nomeNovaLista.trim();
    if (!nome) return;

    setCriando(true);
    setErro("");

    try {
      const response = await fetch("/api/contatos/listas-compartilhadas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || "Não foi possível criar a lista.");
        return;
      }

      setNomeNovaLista("");
      await onChanged(data.message || "Lista criada com sucesso.");
    } catch {
      setErro("Não foi possível criar a lista.");
    } finally {
      setCriando(false);
    }
  }

  async function salvarNome(listaId: string) {
    const nome = nomeEdicao.trim();
    if (!nome) return;

    setSalvandoId(listaId);
    setErro("");

    try {
      const response = await fetch(
        `/api/contatos/listas-compartilhadas/${listaId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || "Não foi possível atualizar a lista.");
        return;
      }

      setEditandoId(null);
      setNomeEdicao("");
      await onChanged(data.message || "Lista atualizada com sucesso.");
    } catch {
      setErro("Não foi possível atualizar a lista.");
    } finally {
      setSalvandoId(null);
    }
  }

  async function excluirLista(lista: ListaCompartilhadaContato) {
    setExcluindoId(lista.id);
    setErro("");

    try {
      const response = await fetch(
        `/api/contatos/listas-compartilhadas/${lista.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmar_exclusao: true }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || "Não foi possível excluir a lista.");
        return;
      }

      setConfirmandoExclusaoId(null);
      await onChanged(
        data.message || `Lista "${lista.nome}" excluída.`,
        lista.id
      );
    } catch {
      setErro("Não foi possível excluir a lista.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modalCard} ${styles.listManagerModal}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Listas</p>
            <h2 className={styles.modalTitle}>Gerenciar listas</h2>
            <p className={styles.cardDescription}>
              As mesmas listas e contatos são usados nos módulos Contatos e
              Conversas.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={styles.modalCloseButton}
            aria-label="Fechar modal"
            disabled={criando || Boolean(salvandoId) || Boolean(excluindoId)}
          >
            ×
          </button>
        </div>

        {erro && <div className={styles.alertError}>{erro}</div>}

        <div className={styles.listManagerSection}>
          <label className={styles.label}>Criar nova lista</label>
          <div className={styles.listManagerNameRow}>
            <input
              className={styles.input}
              value={nomeNovaLista}
              maxLength={160}
              placeholder="Ex.: Interessados em lançamento"
              onChange={(event) => {
                setNomeNovaLista(event.target.value);
                if (erro) setErro("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && nomeNovaLista.trim()) {
                  event.preventDefault();
                  criarLista();
                }
              }}
              disabled={criando}
            />
            <button
              type="button"
              className={styles.primaryButton}
              onClick={criarLista}
              disabled={criando || !nomeNovaLista.trim()}
            >
              {criando ? "Criando..." : "Criar lista"}
            </button>
          </div>
        </div>

        <div className={styles.listManagerDivider} />

        <div className={styles.listManagerSection}>
          <div>
            <span className={styles.label}>Listas existentes</span>
            <p className={styles.cardDescription}>
              Excluir uma lista remove apenas os vínculos. Os contatos são
              preservados.
            </p>
          </div>

          {listas.length === 0 ? (
            <div className={styles.listDeleteLoading}>
              Nenhuma lista criada ainda.
            </div>
          ) : (
            <div className={styles.sharedListManagerList}>
              {listas.map((lista) => (
                <div key={lista.id} className={styles.sharedListManagerItem}>
                  {editandoId === lista.id ? (
                    <div className={styles.sharedListEditArea}>
                      <input
                        className={styles.input}
                        value={nomeEdicao}
                        maxLength={160}
                        autoFocus
                        onChange={(event) => setNomeEdicao(event.target.value)}
                      />
                      <div className={styles.sharedListItemActions}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => {
                            setEditandoId(null);
                            setNomeEdicao("");
                          }}
                          disabled={salvandoId === lista.id}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => salvarNome(lista.id)}
                          disabled={
                            salvandoId === lista.id ||
                            !nomeEdicao.trim() ||
                            nomeEdicao.trim() === lista.nome
                          }
                        >
                          {salvandoId === lista.id ? "Salvando..." : "Salvar"}
                        </button>
                      </div>
                    </div>
                  ) : confirmandoExclusaoId === lista.id ? (
                    <div className={styles.sharedListDeleteConfirm}>
                      <div>
                        <strong>Excluir “{lista.nome}”?</strong>
                        <p>
                          {lista.total_contatos} contato(s) serão
                          desvinculados. Nenhum contato será apagado.
                        </p>
                      </div>
                      <div className={styles.sharedListItemActions}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => setConfirmandoExclusaoId(null)}
                          disabled={excluindoId === lista.id}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={() => excluirLista(lista)}
                          disabled={excluindoId === lista.id}
                        >
                          {excluindoId === lista.id ? "Excluindo..." : "Excluir"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={styles.sharedListItemInfo}>
                        <strong>{lista.nome}</strong>
                        <span>
                          {lista.total_contatos}{" "}
                          {lista.total_contatos === 1 ? "contato" : "contatos"}
                        </span>
                      </div>
                      <div className={styles.sharedListItemActions}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => {
                            setConfirmandoExclusaoId(null);
                            setEditandoId(lista.id);
                            setNomeEdicao(lista.nome);
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={() => {
                            setEditandoId(null);
                            setNomeEdicao("");
                            setConfirmandoExclusaoId(lista.id);
                          }}
                        >
                          Excluir
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
