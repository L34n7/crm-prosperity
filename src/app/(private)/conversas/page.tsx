import { Suspense } from "react";

import ConversasPageContent from "./ConversasPageContent";

export default function ConversasPage() {
  return (
    <Suspense fallback={null}>
      <ConversasPageContent />
    </Suspense>
  );
}
