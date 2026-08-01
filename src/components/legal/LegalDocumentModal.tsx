"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./LegalDocumentModal.module.css";

export type DocumentoLegalId = "termos" | "privacidade";

type LegalDocumentModalProps = {
  documento: DocumentoLegalId | null;
  onClose: () => void;
};

const DOCUMENTOS: Record<
  DocumentoLegalId,
  { titulo: string; href: string }
> = {
  termos: {
    titulo: "Termos de Serviço",
    href: "/termos-de-servico",
  },
  privacidade: {
    titulo: "Política de Privacidade",
    href: "/politica-de-privacidade",
  },
};

export default function LegalDocumentModal({
  documento,
  onClose,
}: LegalDocumentModalProps) {
  const [carregando, setCarregando] = useState(true);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (documento) setCarregando(true);
  }, [documento]);

  useEffect(() => {
    if (!documento) return;

    const elementoAnterior = document.activeElement as HTMLElement | null;
    const overflowAnterior = document.body.style.overflow;
    const animationFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = overflowAnterior;

      if (elementoAnterior?.isConnected) {
        elementoAnterior.focus({ preventScroll: true });
      }
    };
  }, [documento]);

  if (!documento || typeof document === "undefined") return null;

  const configuracao = DOCUMENTOS[documento];

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.header}>
          <div className={styles.headingGroup}>
            <span className={styles.eyebrow}>Documentos legais</span>
            <h2 id={titleId} className={styles.title}>
              {configuracao.titulo}
            </h2>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={`Fechar ${configuracao.titulo}`}
            title="Fechar"
          >
            <X size={21} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.content} aria-busy={carregando}>
          {carregando && (
            <div className={styles.loading} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <span>Carregando documento...</span>
            </div>
          )}

          <iframe
            key={configuracao.href}
            src={`${configuracao.href}?modal=1`}
            title={configuracao.titulo}
            className={`${styles.frame} ${
              carregando ? styles.frameLoading : ""
            }`}
            onLoad={() => setCarregando(false)}
          />
        </div>
      </section>
    </div>,
    document.body
  );
}
