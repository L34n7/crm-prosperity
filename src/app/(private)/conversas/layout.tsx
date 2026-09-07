import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";
import ConteudoIndisponivelAlignment from "./ConteudoIndisponivelAlignment";
import styles from "./conversas.module.css";

const mobileConversationListStyles = `
@media (max-width: 640px) {
  .${styles.sidebar} .${styles.sidebarCount} {
    display: none;
  }

  .${styles.sidebar} .${styles.sidebarTopRow} {
    align-items: center;
    margin-bottom: 8px;
  }

  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebar},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebarHeader},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebarBody},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.virtualConversationList},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.virtualConversationRow},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.conversationItem} {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }

  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebarHeader} {
    overflow: hidden;
  }

  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebarBody} {
    overflow-x: hidden;
  }

  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebar} .${styles.quickFilters} {
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

  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebar} .${styles.quickFilters}::-webkit-scrollbar {
    display: none;
  }

  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebar} .${styles.quickFilters} > .${styles.quickChip} {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.conversationMain},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.conversationTopLine},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.conversationPreviewRow},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.conversationBottomLine} {
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
