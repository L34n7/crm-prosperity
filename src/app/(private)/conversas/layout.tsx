import { Suspense, type ReactNode } from "react";
import CaptureInfoPanel from "./CaptureInfoPanel";
import ConteudoIndisponivelAlignment from "./ConteudoIndisponivelAlignment";

export default function ConversasLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ConteudoIndisponivelAlignment />
      <Suspense fallback={null}>
        <CaptureInfoPanel />
      </Suspense>
      {children}
    </>
  );
}
