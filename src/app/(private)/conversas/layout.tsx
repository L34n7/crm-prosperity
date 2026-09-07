import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";
import ConteudoIndisponivelAlignment from "./ConteudoIndisponivelAlignment";
import styles from "./conversas.module.css";

const mobileConversationListStyles = `
@media (max-width: 640px) {
  .${styles.sidebarCount} {
    display: none;
  }

  .${styles.sidebarTopRow} {
    align-items: center;
    margin-bottom: 8px;
  }

  .${styles.sidebar},
  .${styles.sidebarHeader},
  .${styles.sidebarBody},
  .${styles.virtualConversationList},
  .${styles.virtualConversationRow},
  .${styles.conversationItem} {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }

  .${styles.sidebarHeader} {
    overflow: hidden;
  }

  .${styles.sidebarBody} {
    overflow-x: hidden;
  }

  .${styles.quickFilters} {
    display: flex;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
    flex-wrap: nowrap;
    gap: 8px;
    margin-top: 6px;
    padding: 12px 2px 3px;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .${styles.quickFilters}::-webkit-scrollbar {
    display: none;
  }

  .${styles.quickChip} {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .${styles.conversationMain},
  .${styles.conversationTopLine},
  .${styles.conversationPreviewRow},
  .${styles.conversationBottomLine} {
    min-width: 0;
    max-width: 100%;
  }
}
`;

export default async function ConversasLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("conversas.visualizar");

  return (
    <>
      <style>{mobileConversationListStyles}</style>
      <ConteudoIndisponivelAlignment />
      {children}
    </>
  );
}
