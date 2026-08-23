"use client";

import styles from "../../fluxos.module.css";

type NodeActionsProps = {
  podeExcluir: boolean;
  confirmandoExclusao: boolean;
  salvando?: boolean;
  onPedirExclusao: () => void;
  onConfirmarExclusao: () => void;
  onCancelar: () => void;
  onAplicar: () => void;
};

export default function NodeActions({
  podeExcluir,
  confirmandoExclusao,
  salvando = false,
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
              disabled={salvando}
            >
              Excluir
            </button>
          ) : (
            <button
              type="button"
              className={styles.deleteNodeIconButton}
              onClick={onPedirExclusao}
              title="Excluir bloco"
              disabled={salvando}
            >
              🗑
            </button>
          ))}

        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onCancelar}
          disabled={salvando}
        >
          Cancelar
        </button>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={onAplicar}
          disabled={salvando}
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
