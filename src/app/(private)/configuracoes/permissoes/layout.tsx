import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

export default async function PermissoesLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("permissoes.visualizar");
  return children;
}
