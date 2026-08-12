import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

export default async function RastreamentoLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("rastreamento.visualizar");
  return children;
}
