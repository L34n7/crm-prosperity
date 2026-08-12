import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("dashboard.visualizar");
  return children;
}
