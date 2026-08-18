import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";
import ConteudoIndisponivelAlignment from "./ConteudoIndisponivelAlignment";

export default async function ConversasLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("conversas.visualizar");

  return (
    <>
      <ConteudoIndisponivelAlignment />
      {children}
    </>
  );
}
