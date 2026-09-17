import { Suspense } from "react";

import ConversasPageContent from "./ConversasPageContent";
import ConversationNotesTimelineBridge from "./ConversationNotesTimelineBridge";

export default function ConversasPage() {
  return (
    <Suspense fallback={null}>
      <ConversasPageContent />
      <ConversationNotesTimelineBridge />
    </Suspense>
  );
}
