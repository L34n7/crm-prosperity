"use client";

import { useState } from "react";
import modalStyles from "./ExclusaoContatosEmMassa.module.css";
import styles from "./contatos.module.css";

type AnaliseExclusao = {
  total: number;
  contatos_com_conversa: number;
  conversas: number;
  exige_confirmacao: boolean;
};

type ExclusaoContatosEmMassaProps = {
  contatoIds: string[];
  disabled?: boolean;
  onConcluido: () => void | Promise<void>;
  onErro: (mensagem: string) => void;
  onMensagem: (mensagem: string) => void;
};

export default function ExclusaoContatosEmMassa({
  contatoIds,
  disabled = false,
  onConcluido,
  onErro,
  onMensagem,
}: ExclusaoContatosEmMassaProps) {
  const [modalAberto, setModalAberto] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [analise, setAnalise] = useState<AnaliseExclusao | null>(null);
  const [assumiuResponsabilidade, setAssumiuResponsabilidade] = useState(false);
  const [erroModal, setErroModal] = useState("");

  const temConversa = (analise?.contatos_com_conversa || 0) > 0;

  function fecharModal() {
    if (excluindo) return;

    setModalAberto(false);
    setAnalise(null);
    setAssumiuResponsabilidade(false);
    setErroModal("");
  }

  async function prepararExclusao() {
    if (contatoIds.length === 0 || analisando || excluindo) return;

    setAnalisando(true);
    setErroModal("");
    onErro("");
    onMensagem("");

    try {
      const response = await fetch("/api/contatos/lote/excluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: contatoIds }),
      });
      const data = await response.json();

      if (!response.ok) {
        onErro(data.error || "Erro ao verificar os contatos selecionados.");
        return;
      }

      setAnalise({
        total: Number(data.total || contatoIds.length),
        contatos_com_conversa: Number(data.contatos_com_conversa || 0),
        conversas: Number(data.conversas || 0),
        exige_confirmacao: data.exige_confirmacao === true,
      });
      setAssumiuResponsabilidade(false);
      setModalAberto(true);
    } catch {
      onErro("Erro ao verificar os contatos selecionados.");
    } finally {
      setAnalisando(false);
    }
  }

  async function confirmarExclusao() {
    if (!analise || contatoIds.length === 0) return;

    if (temConversa && !assumiuResponsabilidade) {
      setErroModal("Marque a confirmação de responsabilidade para continuar.");
      return;
    }

    setExcluindo(true);
    setErroModal("");
    onErro("");
    onMensagem("");

    try {
      const response = await fetch("/api/contatos/lote/excluir", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: contatoIds,
          confirmar_exclusao_conversas: temConversa && assumiuResponsabilidade,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409 && data.exige_confirmacao === true) {
          setAnalise({
            total: Number(data.total || contatoIds.length),
            contatos_com_conversa: Number(data.contatos_com_conversa || 0),
            conversas: Number(data.conversas || 0),
            exige_confirmacao: true,
          });
          setAssumiuResponsabilidade(false);
          setErroModal(
            data.error ||
              "Há contatos com conversa. Confirme a responsabilidade antes de excluir."
          );
          return;
        }

        setErroModal(data.error || "Erro ao excluir os contatos selecionados.");
        return;
      }

      onMensagem(
        data.message || `${data.excluidos || contatoIds.length} contato(s) excluído(s).`
      );
      setModalAberto(false);
      setAnalise(null);
      setAssumiuResponsabilidade(false);
      await onConcluido();
    } catch {
      setErroModal("Erro ao excluir os contatos selecionados.");
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.dangerButton}
        onClick={prepararExclusao}
        disabled={disabled || analisando || excluindo || contatoIds.length === 0}
      >
        {analisando ? "Verificando..." : "Excluir selecionados"}
      </button>

      {modalAberto && analise && (
        <div className={styles.modalOverlay} onClick={fecharModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Atenção</p>
                <h2 className={styles.modalTitle}>Excluir contatos selecionados</h2>
                <p className={styles.cardDescription}>
                  Esta ação não poderá ser desfeita.
                </p>
              </div>

              <button
                type="button"
                onClick={fecharModal}
                className={styles.modalCloseButton}
                aria-label="Fechar modal"
                disabled={excluindo}
              >
                ×
              </button>
            </div>

            {erroModal && <div className={styles.alertError}>{erroModal}</div>}

            <div className={styles.deleteWarningBox}>
              <strong>
                Tem certeza que deseja excluir {analise.total} contato(s)?
              </strong>

              {temConversa ? (
                <>
                  <p>
                    {analise.contatos_com_conversa} contato(s) selecionado(s) possuem
                    conversa vinculada. Ao excluir esses contatos, {analise.conversas}
                    conversa(s) e todas as mensagens relacionadas também serão excluídas
                    definitivamente.
                  </p>

                  <label className={modalStyles.responsibilityCheck}>
                    <input
                      type="checkbox"
                      checked={assumiuResponsabilidade}
                      onChange={(event) => {
                        setAssumiuResponsabilidade(event.target.checked);
                        if (event.target.checked) setErroModal("");
                      }}
                      disabled={excluindo}
                    />
                    <span>
                      Estou ciente de que as conversas e mensagens vinculadas a esses
                      contatos também serão apagadas e assumo a responsabilidade por esta
                      exclusão.
                    </span>
                  </label>
                </>
              ) : (
                <p>Os contatos selecionados serão excluídos permanentemente.</p>
              )}
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={confirmarExclusao}
                disabled={excluindo || (temConversa && !assumiuResponsabilidade)}
              >
                {excluindo ? "Excluindo..." : `Excluir ${analise.total} contato(s)`}
              </button>

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={fecharModal}
                disabled={excluindo}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
