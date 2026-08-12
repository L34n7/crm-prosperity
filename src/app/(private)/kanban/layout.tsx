import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

export default async function KanbanLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("kanban.visualizar");
  return children;
}
