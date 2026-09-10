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

const agentIaMessageStyles = `
.${styles.messageBubbleIncoming}:has(> .${styles.messageMetaTop}) {
  background: color-mix(
    in srgb,
    var(--crm-primary) 22%,
    var(--crm-surface)
  );
  color: var(--crm-text-strong);
  border: 1px solid var(--crm-primary-border);
  border-top-left-radius: 4px;
  box-shadow:
    inset 3px 0 0 var(--crm-primary),
    0 1px 1px var(--crm-ui-private-shadow-rgb-0-0-0-0-08);
}

.${styles.messageBubbleIncoming}:has(> .${styles.messageMetaTop}) .${styles.senderLabel} {
  color: var(--crm-primary-text);
  font-weight: 800;
}
`;

const disparoIndividualResponsiveStyles = `
.${styles.disparoManageVariablesRow} {
  margin-top: 4px !important;
}

.${styles.disparoManageVariablesButton} {
  width: fit-content !important;
  min-height: 34px !important;
  height: 34px !important;
  gap: 6px !important;
  padding: 0 11px !important;
  border: 1px solid var(--crm-border) !important;
  border-radius: 10px !important;
  background: var(--crm-surface) !important;
  color: var(--crm-text-strong) !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  box-shadow: none !important;
  transform: none !important;
}

.${styles.disparoManageVariablesButton} svg {
  width: 13px;
  height: 13px;
}

@media (hover: hover) and (pointer: fine) {
  .${styles.disparoManageVariablesButton}:hover {
    border-color: var(--crm-border-strong) !important;
    background: var(--crm-surface-soft) !important;
  }
}

@media (max-height: 820px), (max-width: 1200px) {
  .${styles.disparoCardExpandido} {
    max-height: none !important;
    overflow: visible !important;
    overscroll-behavior: auto !important;
    scrollbar-gutter: auto !important;
    padding-right: 0 !important;
  }

  .${styles.disparoQuickBottomRow} {
    position: static !important;
    bottom: auto !important;
    z-index: auto !important;
    padding-top: 0 !important;
    background: none !important;
  }

  .${styles.timelineArea} {
    overflow-y: auto !important;
    overscroll-behavior-y: contain;
  }
}

@media (max-width: 768px) {
  .${styles.disparoManageVariablesRow} {
    width: auto !important;
  }

  .${styles.disparoManageVariablesButton} {
    width: fit-content !important;
    max-width: 100%;
  }
}
`;

export default async function ConversasLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("conversas.visualizar");

  return (
    <>
      <style>{mobileConversationListStyles}</style>
      <style>{agentIaMessageStyles}</style>
      <style>{disparoIndividualResponsiveStyles}</style>
      <ConteudoIndisponivelAlignment />
      <div className={mobileStyles.mobileScope}>{children}</div>
    </>
  );
}
