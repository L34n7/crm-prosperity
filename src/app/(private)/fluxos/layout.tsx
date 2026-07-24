import { Suspense, type ReactNode } from "react";

import AssistenteFluxosClientGuard from "./AssistenteFluxosClientGuard";
import FluxoIaAtivacaoModal from "./FluxoIaAtivacaoModal";

export default function FluxosLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AssistenteFluxosClientGuard />
      <Suspense fallback={null}>
        <FluxoIaAtivacaoModal />
      </Suspense>
    </>
  );
}
