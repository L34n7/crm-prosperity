import type { ReactNode } from "react";
import "./automacoes-api-fonts.css";

export default function AutomacoesApiLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="automacoes-api-font-scope" style={{ display: "contents" }}>
      {children}
    </div>
  );
}
