import { Suspense, type ReactNode } from "react";

import FluxoIaAtivacaoModal from "./FluxoIaAtivacaoModal";

export default function FluxosLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <FluxoIaAtivacaoModal />
      </Suspense>
    </>
  );
}
