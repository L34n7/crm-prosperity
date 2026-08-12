"use client";

import { useEffect } from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import styles from "./PermanentDeleteModal.module.css";

type PermanentDeleteModalProps = {
  open: boolean;
  itemType: "perfil" | "setor";
  itemName: string;
  loading: boolean;
  error?: string;
  requirements: string[];
  onCancel: () => void;
  onConfirm: () => void;
};

export default function PermanentDeleteModal({
  open,
  itemType,
  itemName,
  loading,
  error,
  requirements,
  onCancel,
  onConfirm,
}: PermanentDeleteModalProps) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onCancel();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loading, onCancel, open]);

  if (!open) return null;

  const titulo = `Excluir ${itemType} definitivamente?`;

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onCancel();
      }}
    >
      <section
        className={styles.modal}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="permanent-delete-title"
        aria-describedby="permanent-delete-description"
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={onCancel}
          aria-label="Fechar confirmação de exclusão"
          disabled={loading}
        >
          <X size={19} />
        </button>

        <div className={styles.icon} aria-hidden="true">
          <AlertTriangle size={27} strokeWidth={2.2} />
        </div>

        <p className={styles.eyebrow}>Exclusão definitiva</p>
        <h2 id="permanent-delete-title" className={styles.title}>
          {titulo}
        </h2>
        <p id="permanent-delete-description" className={styles.description}>
          Esta ação é permanente e não poderá ser desfeita.
        </p>

        <div className={styles.itemCard}>
          <span>{itemType === "perfil" ? "Perfil selecionado" : "Setor selecionado"}</span>
          <strong>{itemName}</strong>
        </div>

        <div className={styles.requirements}>
          <div className={styles.requirementsTitle}>
            <AlertTriangle size={17} />
            <strong>Antes de excluir, o sistema verificará:</strong>
          </div>
          <ul>
            {requirements.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        </div>

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className={styles.spinner} size={17} />
                Excluindo...
              </>
            ) : (
              <>
                <Trash2 size={17} />
                Sim, excluir definitivamente
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
