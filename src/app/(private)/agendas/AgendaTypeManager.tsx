"use client";

import { useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./AgendaTypeManager.module.css";

type TipoPersonalizado = {
  id: string;
  nome: string;
  cor: string;
};

export default function AgendaTypeManager() {
  const [aberto, setAberto] = useState(false);
  const [tipos, setTipos] = useState<TipoPersonalizado[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [excluindoId, setExcluindoId] = useState("");
  const [confirmando, setConfirmando] = useState<TipoPersonalizado | null>(null);
  const [erro, setErro] = useState("");

  async function abrir() {
    setAberto(true);
    setCarregando(true);
    setErro("");
    setConfirmando(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(
        "agenda_etapa1_listar_tipos_personalizados"
      );
      if (error) throw new Error(error.message);
      setTipos(
        (Array.isArray(data) ? data : []).map((item: any) => ({
          id: String(item.id),
          nome: String(item.nome || "Tipo"),
          cor: String(item.cor || "#22c55e"),
        }))
      );
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar tipos.");
    } finally {
      setCarregando(false);
    }
  }

  async function excluir() {
    if (!confirmando || excluindoId) return;
    setExcluindoId(confirmando.id);
    setErro("");

    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("agenda_etapa1_excluir_tipo", {
        p_tipo_id: confirmando.id,
      });
      if (error) throw new Error(error.message);

      setTipos((atuais) => atuais.filter((tipo) => tipo.id !== confirmando.id));
      setConfirmando(null);

      // O módulo mantém os tipos em estado local. Recarregar após a exclusão
      // garante que selects e filtros deixem de oferecer o tipo imediatamente.
      window.location.reload();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao excluir tipo.");
      setExcluindoId("");
    }
  }

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => void abrir()}>
        <Trash2 size={15} />
        Excluir tipo
      </button>

      {aberto ? (
        <div
          className={styles.overlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !excluindoId) setAberto(false);
          }}
        >
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="agenda-type-manager-title">
            <header className={styles.header}>
              <div>
                <span>Tipos de agendamento</span>
                <h2 id="agenda-type-manager-title">Excluir tipo criado</h2>
                <p>Tipos excluídos deixam de aparecer para novos agendamentos, sem alterar compromissos antigos.</p>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setAberto(false)}
                disabled={Boolean(excluindoId)}
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
                      <span>Esse tipo não será mais oferecido em novos agendamentos.</span>
                    </div>
                  </div>
                  <p>Os agendamentos que já utilizam este tipo continuam preservados no histórico.</p>
                  <div className={styles.confirmActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => setConfirmando(null)}
                      disabled={Boolean(excluindoId)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => void excluir()}
                      disabled={Boolean(excluindoId)}
                    >
                      {excluindoId ? <Loader2 size={16} className={styles.spin} /> : <Trash2 size={16} />}
                      Confirmar exclusão
                    </button>
                  </div>
                </div>
              ) : carregando ? (
                <div className={styles.loading}><Loader2 size={18} className={styles.spin} /> Carregando tipos...</div>
              ) : tipos.length === 0 ? (
                <div className={styles.empty}>Nenhum tipo personalizado ativo para excluir.</div>
              ) : (
                <div className={styles.list}>
                  {tipos.map((tipo) => (
                    <div className={styles.row} key={tipo.id}>
                      <div className={styles.typeIdentity}>
                        <i style={{ background: tipo.cor }} />
                        <strong>{tipo.nome}</strong>
                      </div>
                      <button type="button" className={styles.deleteButton} onClick={() => setConfirmando(tipo)}>
                        <Trash2 size={15} /> Excluir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
