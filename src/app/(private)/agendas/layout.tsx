import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";
import AgendaFeedbackResolution from "./AgendaFeedbackResolution";
import AgendaTypeManager from "./AgendaTypeManager";
import "./agenda-layout.css";
import "./agenda-config-modal.css";

export default async function AgendasLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("agendas.visualizar");
  return (
    <>
      <AgendaTypeManager />
      <AgendaFeedbackResolution />
      {children}
    </>
  );
}
