"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./AgendaTypeManager.module.css";

export type TipoPersonalizado = {
  id: string;
  nome: string;
  cor: string;
};

type AgendaTypeManagerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTypeUpdated?: (tipo: TipoPersonalizado) => void;
  onTypeDeleted?: (tipoId: string) => void;
};

export default function AgendaTypeManager({
  open,
  onOpenChange,
  onTypeUpdated,
  onTypeDeleted,
}: AgendaTypeManagerProps) {
  const [tipos, setTipos] = useState<TipoPersonalizado[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [excluindoId, setExcluindoId] = useState("");
  const [salvandoId, setSalvandoId] = useState("");
  const [confirmando, setConfirmando] = useState<TipoPersonalizado | null>(null);
  const [editandoId, setEditandoId] = useState("");
  const [editandoNome, setEditandoNome] = useState("");
  const [erro, setErro] = useState("");

  const ocupado = Boolean(excluindoId || salvandoId);

  useEffect(() => {
    if (!open) return;

    let active = true;
    setCarregando(true);
    setErro("");
    setConfirmando(null);
    setEditandoId("");
    setEditandoNome("");

    void (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc(
          "agenda_etapa1_listar_tipos_personalizados",
        );
        if (error) throw new Error(error.message);
        if (!active) return;

        setTipos(
          (Array.isArray(data) ? data : []).map((item: unknown) => {
            const tipo = item as Record<string, unknown>;
            return {
              id: String(tipo.id || ""),
              nome: String(tipo.nome || "Tipo"),
              cor: String(tipo.cor || "#22c55e"),
            };
          }),
        );
      } catch (error) {
        if (!active) return;
        setErro(
          error instanceof Error ? error.message : "Erro ao carregar tipos.",
        );
      } finally {
        if (active) setCarregando(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [open]);

  function fechar() {
    if (ocupado) return;
    setConfirmando(null);
    setEditandoId("");
    setEditandoNome("");
    onOpenChange(false);
  }

  function iniciarEdicao(tipo: TipoPersonalizado) {
    if (ocupado) return;
    setErro("");
    setConfirmando(null);
    setEditandoId(tipo.id);
    setEditandoNome(tipo.nome);
  }

  async function aplicarEdicao(tipo: TipoPersonalizado) {
    if (ocupado || editandoId !== tipo.id) return;

    const nome = editandoNome.trim();
    if (!nome) {
      setErro("Informe o nome do tipo.");
      return;
    }

    if (nome === tipo.nome) {
      setEditandoId("");
      setEditandoNome("");
      return;
    }

    setSalvandoId(tipo.id);
    setErro("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("agenda_etapa1_salvar_tipo", {
        p_tipo_id: tipo.id,
        p_nome: nome,
        p_cor: tipo.cor,
        p_icone: "calendar",
      });
      if (error) throw new Error(error.message);

      const retorno = (data || {}) as Record<string, unknown>;
      const atualizado: TipoPersonalizado = {
        id: String(retorno.id || tipo.id),
        nome: String(retorno.nome || nome),
        cor: String(retorno.cor || tipo.cor),
      };

      setTipos((atuais) =>
        atuais.map((item) => (item.id === tipo.id ? atualizado : item)),
      );
      setEditandoId("");
      setEditandoNome("");
      onTypeUpdated?.(atualizado);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao editar tipo.");
    } finally {
      setSalvandoId("");
    }
  }

  async function excluir() {
    if (!confirmando || ocupado) return;

    setExcluindoId(confirmando.id);
    setErro("");

    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("agenda_etapa1_excluir_tipo", {
        p_tipo_id: confirmando.id,
      });
      if (error) throw new Error(error.message);

      const excluidoId = confirmando.id;
      setTipos((atuais) => atuais.filter((tipo) => tipo.id !== excluidoId));
      setConfirmando(null);
      if (editandoId === excluidoId) {
        setEditandoId("");
        setEditandoNome("");
      }
      onTypeDeleted?.(excluidoId);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao excluir tipo.");
    } finally {
      setExcluindoId("");
    }
  }

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) fechar();
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agenda-type-manager-title"
      >
        <header className={styles.header}>
          <div className={styles.headerIcon} aria-hidden="true">
            <CalendarPlus size={19} />
          </div>
          <div className={styles.headerContent}>
            <h2 id="agenda-type-manager-title">Tipos criados</h2>
            <p>
              Edite o nome ou exclua tipos personalizados. Agendamentos antigos
              continuam preservados quando um tipo é excluído.
            </p>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            onClick={fechar}
            disabled={ocupado}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        <div className={styles.body}>
          {erro ? <div className={styles.error}>{erro}</div> : null}

          {confirmando ? (
            <div className={styles.confirmCard}>
              <div className={styles.typeIdentity}>
                <i style={{ background: confirmando.cor }} />
                <div>
                  <strong>{confirmando.nome}</strong>
                  <span>
                    Esse tipo não será mais oferecido em novos agendamentos.
                  </span>
                </div>
              </div>
              <p>
                Os agendamentos que já utilizam este tipo continuam preservados
                no histórico.
              </p>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setConfirmando(null)}
                  disabled={ocupado}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => void excluir()}
                  disabled={ocupado}
                >
                  {excluindoId ? (
                    <Loader2 size={16} className={styles.spin} />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  Confirmar exclusão
                </button>
              </div>
            </div>
          ) : carregando ? (
            <div className={styles.loading}>
              <Loader2 size={18} className={styles.spin} />
              Carregando tipos...
            </div>
          ) : tipos.length === 0 ? (
            <div className={styles.empty}>
              Nenhum tipo personalizado criado.
            </div>
          ) : (
            <div className={styles.list}>
              {tipos.map((tipo) => {
                const editando = editandoId === tipo.id;
                const salvando = salvandoId === tipo.id;

                return (
                  <div
                    className={[
                      styles.row,
                      editando ? styles.rowEditing : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={tipo.id}
                  >
                    <div className={styles.typeIdentity}>
                      <i style={{ background: tipo.cor }} />
                      <div className={styles.typeNameArea}>
                        {editando ? (
                          <input
                            className={styles.editInput}
                            autoFocus
                            maxLength={80}
                            value={editandoNome}
                            onChange={(event) =>
                              setEditandoNome(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void aplicarEdicao(tipo);
                              }
                              if (event.key === "Escape" && !salvando) {
                                setEditandoId("");
                                setEditandoNome("");
                              }
                            }}
                            aria-label={`Editar nome de ${tipo.nome}`}
                          />
                        ) : (
                          <strong>{tipo.nome}</strong>
                        )}
                      </div>
                    </div>

                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => {
                          setEditandoId("");
                          setEditandoNome("");
                          setConfirmando(tipo);
                        }}
                        disabled={ocupado}
                      >
                        <Trash2 size={15} />
                        Excluir
                      </button>

                      {editando ? (
                        <button
                          type="button"
                          className={styles.applyButton}
                          onClick={() => void aplicarEdicao(tipo)}
                          disabled={ocupado || !editandoNome.trim()}
                        >
                          {salvando ? (
                            <Loader2 size={15} className={styles.spin} />
                          ) : (
                            <Check size={15} />
                          )}
                          Aplicar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => iniciarEdicao(tipo)}
                          disabled={ocupado}
                          aria-label={`Editar ${tipo.nome}`}
                          title="Editar tipo"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
