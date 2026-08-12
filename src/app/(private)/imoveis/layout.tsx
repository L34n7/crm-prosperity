import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

export default async function ImoveisLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("imoveis.visualizar");
  return children;
}
