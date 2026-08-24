"use client";

import { CopyPlus } from "lucide-react";
import styles from "../../fluxos.module.css";

type ImportFlowModalProps = {
  codigo: string;
  importando: boolean;
  erro: string;
  podeCriar: boolean;
  onCodigoChange: (value: string) => void;
  onImportar: () => void;
  onFechar: () => void;
};

export default function ImportFlowModal({
  codigo,
  importando,
  erro,
  podeCriar,
  onCodigoChange,
  onImportar,
  onFechar,
}: ImportFlowModalProps) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Importar fluxo</p>
            <h3 className={styles.modalTitle}>Colar codigo</h3>
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
          <div className={styles.shareInfoBox}>
            <CopyPlus size={18} />
            <div>
              <strong>Importar copia do fluxo</strong>
              <p>
                A copia sera criada como rascunho nesta empresa, sem arquivos
                de midia.
              </p>
            </div>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Codigo recebido</span>
            <input
              className={styles.input}
              value={codigo}
              onChange={(event) => onCodigoChange(event.target.value)}
              placeholder="FLX-XXXX-XXXX-XXXX"
            />
          </label>

          {erro && <div className={styles.errorAlert}>{erro}</div>}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onFechar}
            disabled={importando}
          >
            Cancelar
          </button>

          {podeCriar && (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={onImportar}
              disabled={importando}
            >
              {importando ? "Importando..." : "Importar fluxo"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
