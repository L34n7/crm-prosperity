import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

export default async function MensagensLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("mensagens.visualizar");
  return children;
}
