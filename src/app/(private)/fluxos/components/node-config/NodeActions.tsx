"use client";

import styles from "../../fluxos.module.css";

type NodeActionsProps = {
  podeExcluir: boolean;
  confirmandoExclusao: boolean;
  onPedirExclusao: () => void;
  onConfirmarExclusao: () => void;
  onCancelar: () => void;
  onAplicar: () => void;
};

export default function NodeActions({
  podeExcluir,
  confirmandoExclusao,
  onPedirExclusao,
  onConfirmarExclusao,
  onCancelar,
  onAplicar,
}: NodeActionsProps) {
  return (
    <>
      <div className={styles.actionButtonsRow}>
        {podeExcluir &&
          (confirmandoExclusao ? (
            <button
              type="button"
              className={styles.deleteNodeConfirmButton}
              onClick={onConfirmarExclusao}
            >
              Excluir
            </button>
          ) : (
            <button
              type="button"
              className={styles.deleteNodeIconButton}
              onClick={onPedirExclusao}
              title="Excluir bloco"
            >
              🗑
            </button>
          ))}

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
          onClick={onAplicar}
        >
          Aplicar no bloco
        </button>
      </div>

      <p className={styles.help}>
        Depois de aplicar, clique em Salvar fluxo para gravar no banco.
      </p>
    </>
  );
}
