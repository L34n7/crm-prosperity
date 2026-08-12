import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

export default async function ConversasAvisoLayout({
  children,
}: {
  children: ReactNode;
}) {
  await garantirPermissaoPagina("conversas.visualizar");
  return children;
}
