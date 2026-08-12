import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

const CONTACT_CAPTURE_GRID_STYLES = `
  [class*="captureInfoList"] {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    align-items: stretch !important;
    gap: 8px !important;
  }

  [class*="captureInfoItem"] {
    min-width: 0 !important;
    height: 100% !important;
    align-items: stretch !important;
    gap: 10px !important;
    padding: 10px 11px !important;
  }

  [class*="captureInfoItem"] [class*="captureInfoContent"] {
    min-width: 0 !important;
    flex: 1 1 auto !important;
  }

  [class*="captureInfoItem"] [class*="captureInfoValue"] {
    line-height: 1.35 !important;
  }

  [class*="captureInfoItem"] [class*="captureInfoContent"] small {
    margin-top: 3px !important;
    font-size: 11px !important;
    line-height: 1.35 !important;
  }

  [class*="captureInfoItem"] [class*="captureInfoActions"] {
    display: flex !important;
    flex: 0 0 auto !important;
    flex-direction: column !important;
    align-items: stretch !important;
    justify-content: center !important;
    gap: 4px !important;
  }

  [class*="captureInfoItem"] [class*="captureInfoActions"] button {
    min-width: 58px !important;
    margin: 0 !important;
    padding: 6px 8px !important;
    line-height: 1.2 !important;
    text-align: center !important;
  }

  [class*="captureInfoItem"] [class*="captureEditRow"] {
    width: 100% !important;
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 6px !important;
  }

  [class*="captureInfoItem"] [class*="captureEditRow"] [class*="input"] {
    grid-column: 1 / -1 !important;
    width: 100% !important;
    min-width: 0 !important;
  }

  @media (max-width: 1100px) {
    [class*="captureInfoList"] {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
  }

  @media (max-width: 720px) {
    [class*="captureInfoList"] {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    [class*="captureInfoItem"] {
      flex-direction: row !important;
    }
  }
`;

export default async function ContatosLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("contatos.visualizar");

  return (
    <>
      {children}
      <style>{CONTACT_CAPTURE_GRID_STYLES}</style>
    </>
  );
}
