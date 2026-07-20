import ConversasPage from "../conversas/page";
import UnsupportedMessageEnhancer from "./UnsupportedMessageEnhancer";

export default function ConversasComAvisoUnsupportedPage() {
  return (
    <>
      <UnsupportedMessageEnhancer />
      <ConversasPage />
    </>
  );
}
