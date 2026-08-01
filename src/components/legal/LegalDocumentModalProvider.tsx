"use client";

import { useEffect, useState } from "react";
import LegalDocumentModal, {
  type DocumentoLegalId,
} from "./LegalDocumentModal";

const DOCUMENTO_POR_CAMINHO: Record<string, DocumentoLegalId> = {
  "/termos-de-servico": "termos",
  "/politica-de-privacidade": "privacidade",
};

function normalizarCaminho(pathname: string) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

export default function LegalDocumentModalProvider() {
  const [documento, setDocumento] = useState<DocumentoLegalId | null>(null);

  useEffect(() => {
    if (window.self !== window.top) return;

    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const alvo = event.target;
      if (!(alvo instanceof Element)) return;

      const link = alvo.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.dataset.legalModalIgnore === "true") return;

      let url: URL;

      try {
        url = new URL(link.href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;

      const documentoSelecionado =
        DOCUMENTO_POR_CAMINHO[normalizarCaminho(url.pathname)];

      if (!documentoSelecionado) return;

      event.preventDefault();
      event.stopPropagation();
      setDocumento(documentoSelecionado);
    }

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return (
    <LegalDocumentModal
      documento={documento}
      onClose={() => setDocumento(null)}
    />
  );
}
