"use client";

import styles from "../../fluxos.module.css";

type CustoPreview = {
  categoria: string;
  valorTotalUsd: number;
  valorTotalBrlMin: number;
  valorTotalBrlMax: number;
};

type DisparoCostConfirmModalProps = {
  custo: CustoPreview | null;
  onCancelar: () => void;
  onConfirmar: () => void;
};

export default function DisparoCostConfirmModal({
  custo,
  onCancelar,
  onConfirmar,
}: DisparoCostConfirmModalProps) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Confirmação</p>
            <h3 className={styles.modalTitle}>Confirmar agendamento de disparo</h3>
          </div>

          <button
            type="button"
            className={styles.closePanelButton}
            onClick={onCancelar}
          >
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.warningBox}>
            <strong>Este bloco agenda um disparo oficial do WhatsApp.</strong>
            <p>Quando o disparo ocorrer:</p>
            <ul className={styles.warningList}>
              <li>Poderá gerar cobrança da Meta</li>
              <li>O envio será realizado automaticamente</li>
            </ul>

            {custo && (
              <div className={styles.modalCostPreviewBox}>
                <span>Estimativa para 1 contato</span>
                <strong>
                  R$ {custo.valorTotalBrlMin.toFixed(2)} ~ R$ {custo.valorTotalBrlMax.toFixed(2)}
                </strong>
                <small>
                  Categoria: {custo.categoria} · USD: US$ {custo.valorTotalUsd.toFixed(4)}
                </small>
              </div>
            )}

            <p>
              Use esse recurso apenas quando fizer sentido para recuperação ou continuidade do atendimento.
            </p>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancelar}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onConfirmar}
          >
            Continuar e aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
