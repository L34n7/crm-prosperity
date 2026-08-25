"use client";

import type { Fluxo } from "../../types";
import styles from "../../fluxos.module.css";

type ArchiveFlowModalProps = {
  fluxo: Fluxo;
  podeArquivar: boolean;
  onConfirmar: () => void;
  onFechar: () => void;
};

export default function ArchiveFlowModal({
  fluxo,
  podeArquivar,
  onConfirmar,
  onFechar,
}: ArchiveFlowModalProps) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Arquivar fluxo</p>
            <h3 className={styles.modalTitle}>Confirmar arquivamento</h3>
          </div>

          <button
            type="button"
            className={styles.closePanelButton}
            onClick={onFechar}
          >
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.warningBox}>
            <strong>
              O fluxo será arquivado, não excluído definitivamente.
            </strong>
            <p>
              O fluxo <strong>{fluxo.nome}</strong> ficará com status{" "}
              <strong>arquivado</strong>. Ele não será executado e poderá ser
              restaurado depois ou excluido definitivo clicando em apagar.
            </p>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onFechar}
          >
            Cancelar
          </button>

          {podeArquivar && (
            <button
              type="button"
              className={styles.dangerButton}
              onClick={onConfirmar}
            >
              Arquivar fluxo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
