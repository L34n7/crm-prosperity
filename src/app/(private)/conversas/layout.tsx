import { Suspense, type ReactNode } from "react";
import CaptureInfoPanelVisible from "./CaptureInfoPanelVisible";
import ConteudoIndisponivelAlignment from "./ConteudoIndisponivelAlignment";

export default function ConversasLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ConteudoIndisponivelAlignment />
      <Suspense fallback={null}>
        <CaptureInfoPanelVisible />
      </Suspense>
      {children}
    </>
  );
}
