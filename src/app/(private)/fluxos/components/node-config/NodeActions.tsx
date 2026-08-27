"use client";

import { useContext, useState } from "react";
import {
  limparDraftCheckoutPagamento,
  prepararDraftCheckoutPagamentoParaAplicar,
} from "../../checkout-pagamento-draft";
import { PropertiesPanelNodeContext } from "../PropertiesPanel";
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
  const nodeEditado = useContext(PropertiesPanelNodeContext);
  const [erroCheckout, setErroCheckout] = useState("");

  function cancelar() {
    if (nodeEditado?.id) {
      limparDraftCheckoutPagamento(nodeEditado.id);
    }
    setErroCheckout("");
    onCancelar();
  }

  function confirmarExclusao() {
    if (nodeEditado?.id) {
      limparDraftCheckoutPagamento(nodeEditado.id);
    }
    setErroCheckout("");
    onConfirmarExclusao();
  }

  function aplicar() {
    setErroCheckout("");

    if (nodeEditado?.id) {
      const resultado = prepararDraftCheckoutPagamentoParaAplicar(
        nodeEditado.id
      );

      if (!resultado.ok) {
        setErroCheckout(resultado.error);
        return;
      }
    }

    onAplicar();
  }

  return (
    <>
      {erroCheckout && (
        <p
          className={styles.help}
          style={{
            color: "var(--crm-ui-private-content-hex-dc2626)",
            fontWeight: 700,
          }}
        >
          {erroCheckout}
        </p>
      )}

      <div className={styles.actionButtonsRow}>
        {podeExcluir &&
          (confirmandoExclusao ? (
            <button
              type="button"
              className={styles.deleteNodeConfirmButton}
              onClick={confirmarExclusao}
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
          onClick={cancelar}
        >
          Cancelar
        </button>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={aplicar}
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
