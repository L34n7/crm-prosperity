import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

export default async function CadastrosLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("pessoas.visualizar");
  return children;
}
