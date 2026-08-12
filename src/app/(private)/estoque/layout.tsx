import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

export default async function EstoqueLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("estoque.visualizar");
  return children;
}
