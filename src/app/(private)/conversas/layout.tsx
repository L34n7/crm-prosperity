import type { ReactNode } from "react";
import ConteudoIndisponivelAlignment from "./ConteudoIndisponivelAlignment";

export default function ConversasLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ConteudoIndisponivelAlignment />
      {children}
    </>
  );
}
