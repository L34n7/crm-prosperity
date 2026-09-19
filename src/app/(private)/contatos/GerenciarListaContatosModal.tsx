"use client";

import { useEffect, useState } from "react";
import styles from "./contatos.module.css";

type ListaContato = {
  id: string;
  nome: string;
  created_at: string;
};

type ModoGerenciamentoLista = "editar" | "excluir";

type AnaliseExclusaoLista = {
  total_contatos: number;
  contatos_exclusivos: number;
  contatos_compartilhados: number;
  contatos_com_conversa: number;
  conversas: number;
  agendamentos_bloqueadores: number;
  analises_arquivo_bloqueadoras: number;
  exclusao_bloqueada: boolean;
};

type GerenciarListaContatosModalProps = {
  lista: ListaContato;
  modo: ModoGerenciamentoLista;
  onClose: () => void;
  onAtualizada: (nome: string) => void | Promise<void>;
  onExcluida: (mensagem: string) => void | Promise<void>;
};

export default function GerenciarListaContatosModal({
  lista,
  modo,
  onClose,
  onAtualizada,
  onExcluida,
}: GerenciarListaContatosModalProps) {
  const [nome, setNome] = useState(lista.nome);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [analise, setAnalise] = useState<AnaliseExclusaoLista | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setNome(lista.nome);
    setAnalise(null);
    setErro("");
  }, [lista.id, lista.nome, modo]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !excluindo && !salvandoNome) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [excluindo, onClose, salvandoNome]);

  useEffect(() => {
    if (modo !== "excluir") return;

    let ativo = true;

    async function carregarAnaliseExclusao() {
      setAnalisando(true);
      setErro("");

      try {
        const response = await fetch(`/api/contatos/listas/${lista.id}`, {
          method: "GET",
          cache: "no-store",
        });
        const data = await response.json();

        if (!ativo) return;

        if (!response.ok) {
          setErro(data.error || "Não foi possível analisar a exclusão da lista.");
          return;
        }

        setAnalise({
          total_contatos: Number(data.analise?.total_contatos || 0),
          contatos_exclusivos: Number(data.analise?.contatos_exclusivos || 0),
          contatos_compartilhados: Number(
            data.analise?.contatos_compartilhados || 0
          ),
          contatos_com_conversa: Number(
            data.analise?.contatos_com_conversa || 0
          ),
          conversas: Number(data.analise?.conversas || 0),
          agendamentos_bloqueadores: Number(
            data.analise?.agendamentos_bloqueadores || 0
          ),
          analises_arquivo_bloqueadoras: Number(
            data.analise?.analises_arquivo_bloqueadoras || 0
          ),
          exclusao_bloqueada: data.analise?.exclusao_bloqueada === true,
        });
      } catch {
        if (ativo) {
          setErro("Não foi possível analisar a exclusão da lista.");
        }
      } finally {
        if (ativo) {
          setAnalisando(false);
        }
      }
    }

    carregarAnaliseExclusao();

    return () => {
      ativo = false;
    };
  }, [lista.id, modo]);

  async function salvarNome() {
    const nomeNormalizado = nome.trim();

    if (!nomeNormalizado) {
      setErro("Informe o nome da lista.");
      return;
    }

    setSalvandoNome(true);
    setErro("");

    try {
      const response = await fetch(`/api/contatos/listas/${lista.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeNormalizado }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || "Não foi possível atualizar o nome da lista.");
        return;
      }

      const nomeAtualizado = data.lista?.nome || nomeNormalizado;
      setNome(nomeAtualizado);
      await onAtualizada(nomeAtualizado);
      onClose();
    } catch {
      setErro("Não foi possível atualizar o nome da lista.");
    } finally {
      setSalvandoNome(false);
    }
  }

  async function confirmarExclusao() {
    if (!analise || analise.exclusao_bloqueada) return;

    setExcluindo(true);
    setErro("");

    try {
      const response = await fetch(`/api/contatos/listas/${lista.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmar_exclusao: true }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || "Não foi possível excluir a lista.");

        if (data.analise) {
          setAnalise({
            total_contatos: Number(data.analise.total_contatos || 0),
            contatos_exclusivos: Number(data.analise.contatos_exclusivos || 0),
            contatos_compartilhados: Number(
              data.analise.contatos_compartilhados || 0
            ),
            contatos_com_conversa: Number(
              data.analise.contatos_com_conversa || 0
            ),
            conversas: Number(data.analise.conversas || 0),
            agendamentos_bloqueadores: Number(
              data.analise.agendamentos_bloqueadores || 0
            ),
            analises_arquivo_bloqueadoras: Number(
              data.analise.analises_arquivo_bloqueadoras || 0
            ),
            exclusao_bloqueada: data.analise.exclusao_bloqueada === true,
          });
        }

        return;
      }

      await onExcluida(
        data.message || `Lista "${lista.nome}" excluída com sucesso.`
      );
    } catch {
      setErro("Não foi possível excluir a lista.");
    } finally {
      setExcluindo(false);
    }
  }

  const bloqueadores =
    (analise?.agendamentos_bloqueadores || 0) +
    (analise?.analises_arquivo_bloqueadoras || 0);

  const titulo = modo === "editar" ? "Editar nome da lista" : "Excluir lista";
  const descricao =
    modo === "editar"
      ? "Altere somente o nome usado para identificar esta lista."
      : "Revise o impacto da exclusão antes de confirmar.";

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modalCard} ${styles.listManagerModal}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Lista de contatos</p>
            <h2 className={styles.modalTitle}>{titulo}</h2>
            <p className={styles.cardDescription}>{descricao}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={styles.modalCloseButton}
            aria-label="Fechar modal"
            disabled={excluindo || salvandoNome}
          >
            ×
          </button>
        </div>

        {erro && <div className={styles.alertError}>{erro}</div>}

        {modo === "editar" ? (
          <div className={styles.listManagerSection}>
            <label className={styles.label}>Nome da lista</label>
            <div className={styles.listManagerNameRow}>
              <input
                type="text"
                className={styles.input}
                value={nome}
                maxLength={160}
                autoFocus
                onChange={(event) => {
                  setNome(event.target.value);
                  if (erro) setErro("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && nome.trim() !== lista.nome) {
                    event.preventDefault();
                    salvarNome();
                  }
                }}
                disabled={salvandoNome}
              />
              <button
                type="button"
                className={styles.primaryButton}
                onClick={salvarNome}
                disabled={
                  salvandoNome ||
                  !nome.trim() ||
                  nome.trim() === lista.nome
                }
              >
                {salvandoNome ? "Salvando..." : "Salvar nome"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.listManagerSection}>
            {analisando && (
              <div className={styles.listDeleteLoading}>
                Verificando contatos e conversas desta lista...
              </div>
            )}

            {!analisando && analise && (
              <div className={styles.listDeletePanel}>
                {analise.total_contatos === 0 ? (
                  <p>
                    Esta lista está vazia. Somente o cadastro da lista será
                    apagado.
                  </p>
                ) : (
                  <>
                    <p>
                      <strong>{analise.contatos_exclusivos}</strong> contato(s)
                      exclusivo(s) desta lista serão apagados do sistema.
                    </p>

                    <p>
                      <strong>{analise.contatos_compartilhados}</strong>{" "}
                      contato(s) também pertencem a outras listas e serão
                      preservados.
                    </p>
                  </>
                )}

                {analise.contatos_com_conversa > 0 && (
                  <div className={styles.listDeleteConversationWarning}>
                    <strong>Atenção às conversas</strong>
                    <p>
                      {analise.contatos_com_conversa} contato(s) exclusivo(s)
                      possuem conversa no sistema. Ao confirmar,{" "}
                      {analise.conversas} conversa(s) e suas mensagens também
                      serão apagadas definitivamente.
                    </p>
                  </div>
                )}

                {analise.exclusao_bloqueada && (
                  <div className={styles.listDeleteBlockedWarning}>
                    <strong>Exclusão bloqueada</strong>
                    <p>
                      Existem {bloqueadores} vínculo(s) que impedem apagar os
                      contatos exclusivos agora.
                    </p>
                    {analise.agendamentos_bloqueadores > 0 && (
                      <p>
                        Agendamentos vinculados:{" "}
                        {analise.agendamentos_bloqueadores}.
                      </p>
                    )}
                    {analise.analises_arquivo_bloqueadoras > 0 && (
                      <p>
                        Análises de arquivo vinculadas:{" "}
                        {analise.analises_arquivo_bloqueadoras}.
                      </p>
                    )}
                  </div>
                )}

                <div className={styles.listDeleteActions}>
                  {!analise.exclusao_bloqueada && (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={confirmarExclusao}
                      disabled={excluindo}
                    >
                      {excluindo
                        ? "Excluindo..."
                        : "Confirmar exclusão da lista"}
                    </button>
                  )}

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={onClose}
                    disabled={excluindo}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
