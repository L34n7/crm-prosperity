"use client";

import Image from "next/image";
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
  { titulo: string; href: string; descricao: string }
> = {
  termos: {
    titulo: "Termos de Serviço",
    href: "/termos-de-servico",
    descricao: "Condições de uso, contratação e responsabilidades da plataforma.",
  },
  privacidade: {
    titulo: "Política de Privacidade",
    href: "/politica-de-privacidade",
    descricao: "Como o CRM Prosperity trata dados pessoais e protege a privacidade.",
  },
};

const ESTILOS_DOCUMENTO_MODAL = `
  :root {
    color-scheme: light !important;
  }

  html {
    background: var(--crm-ui-public-surface-hex-f8fafc) !important;
    scroll-behavior: smooth;
  }

  body {
    min-height: 100% !important;
    margin: 0 !important;
    background: var(--crm-ui-public-surface-hex-f8fafc) !important;
    color: var(--crm-ui-public-content-hex-334155) !important;
    font-family: Arial, Helvetica, sans-serif !important;
  }

  body > main {
    width: min(900px, 100%) !important;
    max-width: 900px !important;
    min-height: 100vh !important;
    margin: 0 auto !important;
    padding: 30px 38px 64px !important;
    box-sizing: border-box !important;
    background: var(--crm-ui-public-surface-hex-ffffff) !important;
    color: var(--crm-ui-public-content-hex-334155) !important;
    font-size: 12.5px !important;
    line-height: 1.62 !important;
  }

  body > main h1 {
    margin: 0 0 18px !important;
    padding: 0 0 16px !important;
    border-bottom: 1px solid var(--crm-ui-public-border-hex-dbe2ea) !important;
    color: var(--crm-ui-public-content-hex-0f172a) !important;
    font-size: 23px !important;
    line-height: 1.25 !important;
    font-weight: 800 !important;
    letter-spacing: -0.025em !important;
  }

  body > main h2 {
    margin: 23px 0 8px !important;
    color: var(--crm-ui-public-content-hex-0f172a) !important;
    font-size: 15.5px !important;
    line-height: 1.35 !important;
    font-weight: 800 !important;
    letter-spacing: -0.01em !important;
  }

  body > main h3,
  body > main h4 {
    margin: 18px 0 7px !important;
    color: var(--crm-ui-public-content-hex-0f172a) !important;
    font-size: 13.5px !important;
    line-height: 1.4 !important;
    font-weight: 800 !important;
  }

  body > main p,
  body > main li,
  body > main td,
  body > main th,
  body > main a,
  body > main span {
    font-size: 12.5px !important;
    line-height: 1.62 !important;
  }

  body > main p {
    margin: 0 0 11px !important;
  }

  body > main ul,
  body > main ol {
    margin: 8px 0 14px !important;
    padding-left: 22px !important;
  }

  body > main li {
    margin-bottom: 5px !important;
  }

  body > main strong {
    color: var(--crm-ui-public-content-hex-0f172a) !important;
    font-weight: 800 !important;
  }

  body > main a {
    color: var(--crm-ui-public-content-hex-047857) !important;
    font-weight: 700 !important;
  }

  * {
    scrollbar-width: thin;
    scrollbar-color: var(--crm-ui-public-content-hex-059669)
      var(--crm-ui-public-surface-hex-f8fafc);
  }

  *::-webkit-scrollbar {
    width: 9px;
    height: 9px;
  }

  *::-webkit-scrollbar-track {
    background: var(--crm-ui-public-surface-hex-f8fafc);
  }

  *::-webkit-scrollbar-thumb {
    border: 2px solid var(--crm-ui-public-surface-hex-f8fafc);
    border-radius: 999px;
    background: var(--crm-ui-public-content-hex-059669);
  }

  @media (max-width: 720px) {
    body > main {
      padding: 24px 20px 52px !important;
      font-size: 12px !important;
    }

    body > main h1 {
      font-size: 20px !important;
    }

    body > main h2 {
      font-size: 15px !important;
    }

    body > main p,
    body > main li,
    body > main td,
    body > main th,
    body > main a,
    body > main span {
      font-size: 12px !important;
    }
  }
`;

export default function LegalDocumentModal({
  documento,
  onClose,
}: LegalDocumentModalProps) {
  const [carregando, setCarregando] = useState(true);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

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

  function prepararDocumento(frame: HTMLIFrameElement) {
    try {
      const frameDocument = frame.contentDocument;
      if (!frameDocument) return;

      let style = frameDocument.getElementById(
        "crm-legal-modal-styles"
      ) as HTMLStyleElement | null;

      if (!style) {
        style = frameDocument.createElement("style");
        style.id = "crm-legal-modal-styles";
        frameDocument.head.appendChild(style);
      }

      style.textContent = ESTILOS_DOCUMENTO_MODAL;
      frameDocument.documentElement.dataset.crmLegalModal = "true";
      frame.contentWindow?.scrollTo({ top: 0, behavior: "auto" });
    } finally {
      setCarregando(false);
    }
  }

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
        aria-describedby={descriptionId}
      >
        <header className={styles.header}>
          <div className={styles.brandBlock}>
            <span className={styles.logoWrap} aria-hidden="true">
              <Image
                src="/logo.png"
                alt=""
                width={62}
                height={61}
                className={styles.logo}
              />
            </span>

            <div className={styles.headingGroup}>
              <span className={styles.eyebrow}>
                CRM Prosperity · Central jurídica
              </span>
              <h2 id={titleId} className={styles.title}>
                {configuracao.titulo}
              </h2>
              <p id={descriptionId} className={styles.description}>
                {configuracao.descricao}
              </p>
            </div>
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
              <span>Preparando documento...</span>
            </div>
          )}

          <iframe
            key={configuracao.href}
            src={`${configuracao.href}?modal=1`}
            title={configuracao.titulo}
            className={`${styles.frame} ${
              carregando ? styles.frameLoading : ""
            }`}
            onLoad={(event) => prepararDocumento(event.currentTarget)}
          />
        </div>
      </section>
    </div>,
    document.body
  );
}
