"use client";

import { LoaderCircle } from "lucide-react";
import type { Fluxo } from "../../types";
import styles from "../../fluxos.module.css";

type DeleteFlowModalProps = {
  fluxo: Fluxo;
  podeExcluir: boolean;
  apagando: boolean;
  onConfirmar: () => void;
  onFechar: () => void;
};

export default function DeleteFlowModal({
  fluxo,
  podeExcluir,
  apagando,
  onConfirmar,
  onFechar,
}: DeleteFlowModalProps) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Apagar definitivo</p>
            <h3 className={styles.modalTitle}>
              Essa ação não poderá ser desfeita
            </h3>
          </div>

          <button
            type="button"
            className={styles.closePanelButton}
            disabled={apagando}
            onClick={onFechar}
          >
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.dangerBox}>
            <strong>
              Você está prestes a apagar este fluxo definitivamente.
            </strong>
            <p>
              O fluxo <strong>{fluxo.nome}</strong> será removido do banco de
              dados junto com seus blocos, conexões e gatilhos relacionados.
              Essa ação não poderá ser desfeita.
            </p>

            {apagando && (
              <p
                className={styles.deletionProgress}
                role="status"
                aria-live="polite"
              >
                Aguarde enquanto removemos o fluxo e seus dados relacionados.
              </p>
            )}
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={apagando}
            onClick={onFechar}
          >
            Cancelar
          </button>

          {podeExcluir && (
            <button
              type="button"
              className={styles.dangerButton}
              onClick={onConfirmar}
              disabled={apagando}
              aria-busy={apagando}
            >
              {apagando ? (
                <>
                  <LoaderCircle
                    aria-hidden="true"
                    className={styles.buttonSpinner}
                    size={17}
                  />
                  Apagando...
                </>
              ) : (
                "Apagar definitivamente"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
