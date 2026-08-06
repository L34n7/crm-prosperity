import type { ReactNode } from "react";
import Header from "@/components/Header";
import "./agenda-template.css";

export default function AgendasTemplate({ children }: { children: ReactNode }) {
  return (
    <>
      <Header
        title="Agendamentos"
        subtitle="Organize compromissos, clientes, responsáveis e lembretes em uma agenda completa."
      />
      <div className="agendaTemplateShell">{children}</div>
    </>
  );
}
