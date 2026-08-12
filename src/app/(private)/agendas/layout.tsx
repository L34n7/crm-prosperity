import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";
import "./agenda-layout.css";
import "./agenda-config-modal.css";

export default async function AgendasLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("agendas.visualizar");
  return children;
}
