import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";
import PainelNavigation from "./PainelNavigation";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("dashboard.visualizar");

  return (
    <>
      <PainelNavigation />
      {children}
    </>
  );
}
