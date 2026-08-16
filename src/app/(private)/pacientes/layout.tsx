import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

export default async function PacientesLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("prontuarios.visualizar");
  return children;
}
