"use client";

import { Copy, Share2 } from "lucide-react";
import type { Fluxo } from "../../types";
import styles from "../../fluxos.module.css";

type ShareFlowModalProps = {
  fluxo: Fluxo;
  codigo: string;
  carregando: boolean;
  erro: string;
  onCopiar: () => void;
  onAtualizar: () => void;
  onFechar: () => void;
};

export default function ShareFlowModal({
  fluxo,
  codigo,
  carregando,
  erro,
  onCopiar,
  onAtualizar,
  onFechar,
}: ShareFlowModalProps) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Compartilhar fluxo</p>
            <h3 className={styles.modalTitle}>Codigo do fluxo</h3>
          </div>

          <button
            type="button"
            className={styles.closePanelButton}
            onClick={onFechar}
          >
            x
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.shareInfoBox}>
            <Share2 size={18} />
            <div>
              <strong>{fluxo.nome}</strong>
              <p>
                O código fica salvo neste fluxo e cria uma copia em rascunho na
                empresa que importar. Mídias não são copiadas.
              </p>
            </div>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Codigo para compartilhar</span>

            <div className={styles.codeCopyRow}>
              <input
                className={styles.codeInput}
                value={carregando ? "Carregando codigo..." : codigo}
                readOnly
              />

              <button
                type="button"
                className={styles.iconActionButton}
                title="Copiar codigo"
                onClick={onCopiar}
                disabled={!codigo}
              >
                <Copy size={18} strokeWidth={2.4} />
              </button>
            </div>
          </label>

          {erro && <div className={styles.errorAlert}>{erro}</div>}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onFechar}
          >
            Fechar
          </button>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={onAtualizar}
            disabled={carregando}
          >
            {carregando ? "Atualizando..." : "Atualizar compartilhamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
