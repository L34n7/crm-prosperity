import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";
import "./automacoes-api-fonts.css";

export default async function AutomacoesApiLayout({
  children,
}: {
  children: ReactNode;
}) {
  await garantirPermissaoPagina("automacoes_api.visualizar");

  return (
    <div className="automacoes-api-font-scope" style={{ display: "contents" }}>
      {children}
    </div>
  );
}
