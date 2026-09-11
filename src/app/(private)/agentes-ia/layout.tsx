import type { ReactNode } from "react";
import Header from "@/components/Header";
import HorarioAtendimentoAgentes from "@/components/agentes-ia/HorarioAtendimentoAgentes";

export default function AgentesIaLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header
        title="Agentes de IA"
        subtitle="Configure atendimento conversacional com ferramentas controladas do CRM e fallback seguro para Fluxos."
      />
      <HorarioAtendimentoAgentes />
      {children}
    </>
  );
}
