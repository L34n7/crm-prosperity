"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type GroupedReaction = {
  emoji: string;
  count: number;
};

type MessageDecoration = {
  messageId: string;
  reactions: GroupedReaction[];
  edited: boolean;
  revoked: boolean;
  previousContent: string | null;
  currentContent: string;
  deletedContent: string | null;
  outgoing: boolean;
};

type DecorationResponse = {
  ok?: boolean;
  decoracoes?: MessageDecoration[];
};

type MessageDomStructure = {
  bubble: HTMLElement;
  content: HTMLElement | null;
  meta: HTMLElement | null;
};

const HOST_ATTRIBUTE = "data-whatsapp-message-decoration-host";
const HIDDEN_ATTRIBUTE = "data-whatsapp-original-content-hidden";
const MESSAGE_ATTRIBUTE = "data-whatsapp-message-decoration-id";

function isHTMLElement(value: unknown): value is HTMLElement {
  return typeof HTMLElement !== "undefined" && value instanceof HTMLElement;
}

function directChildren(element: Element | null) {
  if (!element) return [] as HTMLElement[];
  return Array.from(element.children).filter(isHTMLElement);
}

function isDecorationHost(element: HTMLElement) {
  return element.getAttribute(HOST_ATTRIBUTE) === "true";
}

function getMessageDomStructure(row: HTMLElement): MessageDomStructure | null {
  const rowChildren = directChildren(row).filter((item) => !isDecorationHost(item));
  const bubble = rowChildren[0] || null;
  if (!bubble) return null;

  const bubbleChildren = directChildren(bubble).filter(
    (item) => !isDecorationHost(item),
  );

  if (bubbleChildren.length === 0) {
    return { bubble, content: null, meta: null };
  }

  const meta = bubbleChildren[bubbleChildren.length - 1] || null;
  const contentRow =
    bubbleChildren.length >= 2
      ? bubbleChildren[bubbleChildren.length - 2]
      : bubbleChildren[0];

  const contentChildren = directChildren(contentRow).filter(
    (item) => !isDecorationHost(item),
  );
  const content = contentChildren[0] || contentRow || null;

  return { bubble, content, meta };
}

function createHost(messageId: string, kind: string, tag = "div") {
  const host = document.createElement(tag);
  host.setAttribute(HOST_ATTRIBUTE, "true");
  host.setAttribute(MESSAGE_ATTRIBUTE, messageId);
  host.dataset.whatsappDecorationKind = kind;
  return host;
}

function cleanupDecorations() {
  document
    .querySelectorAll<HTMLElement>(`[${HOST_ATTRIBUTE}="true"]`)
    .forEach((host) => host.remove());

  document
    .querySelectorAll<HTMLElement>(`[${HIDDEN_ATTRIBUTE}="true"]`)
    .forEach((element) => {
      element.removeAttribute(HIDDEN_ATTRIBUTE);
      element.style.removeProperty("display");
    });
}

function textElement(
  tag: "div" | "span" | "p",
  text: string,
  styles: Partial<CSSStyleDeclaration> = {},
) {
  const element = document.createElement(tag);
  element.textContent = text;
  Object.assign(element.style, styles);
  return element;
}

function renderEditedOrDeleted(
  structure: MessageDomStructure,
  decoration: MessageDecoration,
) {
  const { content } = structure;
  if (!content?.parentElement) return false;

  content.setAttribute(HIDDEN_ATTRIBUTE, "true");
  content.style.setProperty("display", "none", "important");

  const host = createHost(decoration.messageId, "content");
  Object.assign(host.style, {
    flex: "1 1 auto",
    minWidth: "0",
    maxWidth: "100%",
  });

  if (decoration.revoked) {
    const card = document.createElement("div");
    Object.assign(card.style, {
      display: "flex",
      flexDirection: "column",
      gap: "5px",
      minWidth: "0",
      padding: "7px 9px",
      border: "1px dashed var(--crm-border, #cbd5e1)",
      borderRadius: "9px",
      background: "var(--crm-surface-soft, rgba(148, 163, 184, 0.10))",
    });

    card.appendChild(
      textElement("p", decoration.deletedContent || "Conteúdo removido", {
        margin: "0",
        color: "var(--crm-text-strong, inherit)",
        fontSize: "14px",
        lineHeight: "1.4",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        textDecoration: "line-through",
        opacity: "0.72",
      }),
    );

    card.appendChild(
      textElement("span", "Apagada pelo contato", {
        color: "var(--crm-text-muted, #64748b)",
        fontSize: "10px",
        fontStyle: "italic",
        fontWeight: "700",
        lineHeight: "1.2",
      }),
    );

    host.appendChild(card);
  } else if (decoration.edited) {
    const card = document.createElement("div");
    Object.assign(card.style, {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      minWidth: "0",
      maxWidth: "100%",
    });

    if (decoration.previousContent) {
      const previous = document.createElement("div");
      Object.assign(previous.style, {
        padding: "6px 8px",
        borderLeft: "3px solid var(--crm-border, #cbd5e1)",
        borderRadius: "7px",
        background: "var(--crm-surface-soft, rgba(148, 163, 184, 0.10))",
        opacity: "0.78",
      });
      previous.appendChild(
        textElement("span", "Antes", {
          display: "block",
          marginBottom: "2px",
          color: "var(--crm-text-muted, #64748b)",
          fontSize: "9px",
          fontWeight: "800",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }),
      );
      previous.appendChild(
        textElement("p", decoration.previousContent, {
          margin: "0",
          color: "var(--crm-text-strong, inherit)",
          fontSize: "14px",
          lineHeight: "1.4",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }),
      );
      card.appendChild(previous);
    }

    const current = document.createElement("div");
    Object.assign(current.style, {
      padding: "6px 8px",
      borderLeft: "3px solid var(--crm-primary, #0891b2)",
      borderRadius: "7px",
      background: "var(--crm-primary-soft, rgba(8, 145, 178, 0.08))",
    });
    current.appendChild(
      textElement("span", "Agora", {
        display: "block",
        marginBottom: "2px",
        color: "var(--crm-text-muted, #64748b)",
        fontSize: "9px",
        fontWeight: "800",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }),
    );
    current.appendChild(
      textElement("p", decoration.currentContent || "Mensagem editada", {
        margin: "0",
        color: "var(--crm-text-strong, inherit)",
        fontSize: "14px",
        lineHeight: "1.4",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
      }),
    );
    card.appendChild(current);
    host.appendChild(card);
  }

  content.insertAdjacentElement("afterend", host);
  return true;
}

function renderState(structure: MessageDomStructure, decoration: MessageDecoration) {
  const { meta } = structure;
  if (!meta) return false;

  const host = createHost(decoration.messageId, "state", "span");
  host.textContent = decoration.revoked ? "apagada" : "editada";
  Object.assign(host.style, {
    display: "inline-flex",
    alignItems: "center",
    marginLeft: "4px",
    color: "var(--crm-text-muted, #64748b)",
    fontSize: "10px",
    fontStyle: "italic",
    fontWeight: "650",
    lineHeight: "1",
    whiteSpace: "nowrap",
    opacity: decoration.revoked ? "0.9" : "1",
  });
  meta.appendChild(host);
  return true;
}

function renderReactions(structure: MessageDomStructure, decoration: MessageDecoration) {
  if (!decoration.reactions.length) return false;

  const host = createHost(decoration.messageId, "reactions");
  host.setAttribute("aria-label", "Reações da mensagem");
  Object.assign(host.style, {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: decoration.outgoing ? "flex-end" : "flex-start",
    gap: "4px",
    width: "fit-content",
    maxWidth: "100%",
    marginTop: "4px",
    marginLeft: decoration.outgoing ? "auto" : "0",
    position: "relative",
    zIndex: "3",
  });

  for (const reaction of decoration.reactions) {
    const chip = document.createElement("span");
    chip.title = `${reaction.count} reação${reaction.count === 1 ? "" : "ões"} ${reaction.emoji}`;
    Object.assign(chip.style, {
      minWidth: "28px",
      minHeight: "23px",
      padding: "2px 7px",
      border: "1px solid var(--crm-border, #cbd5e1)",
      borderRadius: "999px",
      background: "var(--crm-surface, #ffffff)",
      color: "var(--crm-text-strong, #0f172a)",
      boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "4px",
      fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
      fontSize: "15px",
      lineHeight: "1",
    });

    chip.appendChild(textElement("span", reaction.emoji));

    if (reaction.count > 1) {
      chip.appendChild(
        textElement("span", String(reaction.count), {
          color: "var(--crm-text-muted, #64748b)",
          fontFamily: '"Segoe UI", sans-serif',
          fontSize: "10px",
          fontWeight: "800",
          lineHeight: "1",
        }),
      );
    }

    host.appendChild(chip);
  }

  structure.bubble.appendChild(host);
  return true;
}

export default function WhatsAppMessageDecorations() {
  const searchParams = useSearchParams();
  const conversaId =
    searchParams.get("id")?.trim() ||
    searchParams.get("conversaId")?.trim() ||
    "";

  const decorationsRef = useRef<Map<string, MessageDecoration>>(new Map());
  const applyingRef = useRef(false);
  const applyTimerRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const applyDecorations = useCallback(() => {
    if (typeof document === "undefined") return;

    applyingRef.current = true;
    cleanupDecorations();

    for (const decoration of decorationsRef.current.values()) {
      const row = document.getElementById(`mensagem-${decoration.messageId}`);
      if (!row) continue;

      const structure = getMessageDomStructure(row);
      if (!structure) continue;

      if (decoration.edited || decoration.revoked) {
        renderEditedOrDeleted(structure, decoration);
        renderState(structure, decoration);
      }

      renderReactions(structure, decoration);
    }

    window.setTimeout(() => {
      applyingRef.current = false;
    }, 0);
  }, []);

  const scheduleApply = useCallback(() => {
    if (typeof window === "undefined") return;

    if (applyTimerRef.current != null) {
      window.clearTimeout(applyTimerRef.current);
    }

    applyTimerRef.current = window.setTimeout(() => {
      applyTimerRef.current = null;
      window.requestAnimationFrame(applyDecorations);
    }, 30);
  }, [applyDecorations]);

  const loadDecorations = useCallback(async () => {
    if (!conversaId) return;

    try {
      const params = new URLSearchParams({ conversa_id: conversaId });
      const response = await fetch(
        `/api/mensagens/decoracoes?${params.toString()}`,
        { cache: "no-store" },
      );
      const data = (await response.json().catch(() => null)) as DecorationResponse | null;

      if (!response.ok || !data?.ok || !Array.isArray(data.decoracoes)) {
        return;
      }

      decorationsRef.current = new Map(
        data.decoracoes.map((decoration) => [decoration.messageId, decoration]),
      );
      scheduleApply();
    } catch {
      // A decoração é complementar e nunca deve bloquear a conversa.
    }
  }, [conversaId, scheduleApply]);

  const scheduleReload = useCallback(() => {
    if (typeof window === "undefined") return;

    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void loadDecorations();
    }, 120);
  }, [loadDecorations]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    cleanupDecorations();
    decorationsRef.current = new Map();

    if (!conversaId) return;

    void loadDecorations();

    const supabase = createClient();
    const channel = supabase
      .channel(`crm-whatsapp-message-decorations-v2:${conversaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mensagens",
          filter: `conversa_id=eq.${conversaId}`,
        },
        () => scheduleReload(),
      )
      .subscribe();

    const observer = new MutationObserver(() => {
      if (applyingRef.current) return;
      scheduleApply();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const applyInterval = window.setInterval(scheduleApply, 2500);
    const refreshInterval = window.setInterval(() => {
      void loadDecorations();
    }, 30000);

    const handleFocus = () => void loadDecorations();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void loadDecorations();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      observer.disconnect();
      void supabase.removeChannel(channel);
      window.clearInterval(applyInterval);
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);

      if (applyTimerRef.current != null) {
        window.clearTimeout(applyTimerRef.current);
        applyTimerRef.current = null;
      }
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      decorationsRef.current = new Map();
      cleanupDecorations();
    };
  }, [conversaId, loadDecorations, scheduleApply, scheduleReload]);

  return null;
}
