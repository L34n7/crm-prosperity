import { Suspense, type ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";
import ConteudoIndisponivelAlignment from "./ConteudoIndisponivelAlignment";
import WhatsAppMessageDecorations from "./WhatsAppMessageDecorations";

export default async function ConversasLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("conversas.visualizar");

  return (
    <>
      <ConteudoIndisponivelAlignment />
      <Suspense fallback={null}>
        <WhatsAppMessageDecorations />
      </Suspense>
      {children}
    </>
  );
}
