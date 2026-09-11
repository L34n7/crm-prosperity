import type { ReactNode } from "react";
import Header from "@/components/Header";

export default function AgentesIaLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header
        title="Agentes de IA"
        subtitle="Configure atendimento conversacional com ferramentas controladas do CRM e fallback seguro para Fluxos."
      />
      {children}
    </>
  );
}
