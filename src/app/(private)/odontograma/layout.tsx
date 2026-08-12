import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

export default async function OdontogramaLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("odontograma.visualizar");
  return children;
}
