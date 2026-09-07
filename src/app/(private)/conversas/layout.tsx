import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";
import ConteudoIndisponivelAlignment from "./ConteudoIndisponivelAlignment";
import styles from "./conversas.module.css";
import mobileStyles from "./conversas-mobile.module.css";

const mobileConversationListStyles = `
@media (max-width: 1200px), (hover: none) and (pointer: coarse) {
  .${styles.sidebar} .${styles.sidebarCount} {
    display: none !important;
  }

  .${styles.sidebar} .${styles.sidebarTopRow} {
    align-items: center !important;
    margin-bottom: 8px !important;
  }

  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebar},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebarHeader},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebarBody},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.virtualConversationList},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.virtualConversationRow},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.conversationItem} {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }

  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebarHeader} {
    overflow: hidden !important;
  }

  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebarBody} {
    overflow-x: hidden !important;
  }

  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebar} .${styles.quickFilters} {
    display: flex !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    flex-wrap: nowrap !important;
    gap: 8px !important;
    margin-top: 6px !important;
    padding: 12px 2px 4px !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebar} .${styles.quickFilters}::-webkit-scrollbar {
    display: none;
  }

  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.sidebar} .${styles.quickFilters} > .${styles.quickChip} {
    flex: 0 0 auto !important;
    white-space: nowrap !important;
  }

  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.conversationMain},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.conversationTopLine},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.conversationPreviewRow},
  .${styles.pageContent}:not(.${styles.mobileDetailActive}) .${styles.conversationBottomLine} {
    min-width: 0 !important;
    max-width: 100% !important;
  }
}
`;

export default async function ConversasLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("conversas.visualizar");

  return (
    <>
      <style>{mobileConversationListStyles}</style>
      <ConteudoIndisponivelAlignment />
      <div className={mobileStyles.mobileScope}>{children}</div>
    </>
  );
}
