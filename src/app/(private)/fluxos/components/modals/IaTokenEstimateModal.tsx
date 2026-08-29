"use client";

import type { PreviaGeracaoDescricaoIa } from "../../types";
import styles from "../../fluxos.module.css";

type IaTokenEstimateModalProps = {
  previa: PreviaGeracaoDescricaoIa;
  processando: boolean;
  formatarTokens: (valor: number) => string;
  onCancelar: () => void;
  onConfirmar: () => void;
  itemSingular?: string;
  itemPlural?: string;
  acaoLabel?: string;
};

export default function IaTokenEstimateModal({
  previa,
  processando,
  formatarTokens,
  onCancelar,
  onConfirmar,
  itemSingular = "conexão",
  itemPlural = "conexões",
  acaoLabel = "geração",
}: IaTokenEstimateModalProps) {
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Custo de tokens</p>
            <h3 className={styles.modalTitle}>{previa.titulo}</h3>
          </div>

          <button
            type="button"
            className={styles.closePanelButton}
            onClick={onCancelar}
            disabled={processando}
          >
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.tokenEstimateBox}>
            <span>Consumo estimado</span>
            <strong>
              {formatarTokens(previa.tokensMin)} ~ {formatarTokens(previa.tokensMax)} tokens
            </strong>
            <small>
              {previa.conexoes.length === 1
                ? `1 ${itemSingular} será gerado.`
                : `${previa.conexoes.length} ${itemPlural} serão gerados.`}
            </small>
          </div>

          <div className={styles.warningBox}>
            <strong>Essa é uma estimativa antes da chamada à IA.</strong>
            <p>
              O consumo real pode variar e será registrado automaticamente após a {acaoLabel}. A {acaoLabel} só começa depois da confirmação.
            </p>
          </div>

          <div className={styles.tokenEstimateList}>
            {previa.conexoes.map((conexao) => (
              <div key={conexao.edgeId} className={styles.tokenEstimateItem}>
                <span>{conexao.nome}</span>
                <strong>~{formatarTokens(conexao.tokensEstimados)} tokens</strong>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancelar}
            disabled={processando}
          >
            Cancelar
          </button>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={onConfirmar}
            disabled={processando}
          >
            {processando ? "Gerando..." : "Confirmar geração"}
          </button>
        </div>
      </div>
    </div>
  );
}
