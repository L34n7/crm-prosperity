import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";
import ConteudoIndisponivelAlignment from "./ConteudoIndisponivelAlignment";
import mobileStyles from "./conversas-mobile.module.css";

export default async function ConversasLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("conversas.visualizar");

  return (
    <>
      <ConteudoIndisponivelAlignment />
      <div className={mobileStyles.mobileScope}>{children}</div>
    </>
  );
}
