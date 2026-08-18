"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./WhatsAppMessageDecorations.module.css";

type ReactionMetadata = {
  emoji?: unknown;
  remetente?: unknown;
  evento_id?: unknown;
  timestamp?: unknown;
};

type EditHistoryMetadata = {
  conteudo?: unknown;
  tipo_mensagem?: unknown;
  substituido_em?: unknown;
  evento_id?: unknown;
};

type MessageMetadata = {
  reacoes_whatsapp?: unknown;
  mensagem_editada_whatsapp?: unknown;
  mensagem_revogada_whatsapp?: unknown;
  historico_edicoes_whatsapp?: unknown;
  conteudo_antes_revogacao?: unknown;
};

type MessageRow = {
  id?: string | null;
  conversa_id?: string | null;
  conteudo?: string | null;
  origem?: string | null;
  remetente_tipo?: string | null;
  metadata_json?: MessageMetadata | null;
};

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

type DecorationKind = "content" | "state" | "reactions";

type MessageDomStructure = {
  bubble: HTMLElement;
  content: HTMLElement | null;
  meta: HTMLElement | null;
};

const HOST_ATTRIBUTE = "data-whatsapp-message-decoration-host";
const MESSAGE_ATTRIBUTE = "data-whatsapp-message-decoration-id";
const HIDDEN_CONTENT_ATTRIBUTE = "data-whatsapp-original-content-hidden";
const SIGNATURE_ATTRIBUTE = "data-whatsapp-decoration-signature";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseReactions(value: unknown): GroupedReaction[] {
  if (!Array.isArray(value)) return [];

  const grouped = new Map<string, number>();

  for (const item of value) {
    if (!isObject(item)) continue;

    const reaction = item as ReactionMetadata;
    const emoji = stringValue(reaction.emoji);
    if (!emoji) continue;

    grouped.set(emoji, (grouped.get(emoji) || 0) + 1);
  }

  return Array.from(grouped.entries()).map(([emoji, count]) => ({
    emoji,
    count,
  }));
}

function getPreviousEditedContent(value: unknown) {
  if (!Array.isArray(value)) return null;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const item = value[index];
    if (!isObject(item)) continue;

    const historyItem = item as EditHistoryMetadata;
    const content = stringValue(historyItem.conteudo);
    if (content) return content;
  }

  return null;
}

function parseDecoration(message: MessageRow): MessageDecoration | null {
  const messageId = stringValue(message.id);
  if (!messageId) return null;

  const metadata = isObject(message.metadata_json)
    ? (message.metadata_json as MessageMetadata)
    : {};

  const reactions = parseReactions(metadata.reacoes_whatsapp);
  const edited = metadata.mensagem_editada_whatsapp === true;
  const revoked = metadata.mensagem_revogada_whatsapp === true;

  if (!edited && !revoked && reactions.length === 0) return null;

  const currentContent = stringValue(message.conteudo);
  const previousContent = edited
    ? getPreviousEditedContent(metadata.historico_edicoes_whatsapp)
    : null;
  const deletedContent = revoked
    ? stringValue(metadata.conteudo_antes_revogacao) || currentContent || null
    : null;

  return {
    messageId,
    reactions,
    edited,
    revoked,
    previousContent,
    currentContent,
    deletedContent,
    outgoing: message.origem === "enviada",
  };
}

function mergeDecoration(
  current: Map<string, MessageDecoration>,
  message: MessageRow,
) {
  const next = new Map(current);
  const messageId = stringValue(message.id);

  if (!messageId) return next;

  const decoration = parseDecoration(message);
  if (decoration) next.set(messageId, decoration);
  else next.delete(messageId);

  return next;
}

function elementChildren(element: Element | null) {
  if (!element) return [];

  return Array.from(element.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
}

function isDecorationHost(element: HTMLElement) {
  return element.getAttribute(HOST_ATTRIBUTE) === "true";
}

function getMessageDomStructure(row: HTMLElement): MessageDomStructure | null {
  // Não usamos nomes das classes do CSS Module aqui. Em produção o Next/Turbopack
  // pode transformar esses nomes e seletores como [class*=messageBubble] deixam de
  // localizar os elementos. A estrutura abaixo usa apenas o DOM estável da timeline.
  const bubble = elementChildren(row).find((element) => !isDecorationHost(element));
  if (!bubble) return null;

  const originalBubbleChildren = elementChildren(bubble).filter(
    (element) => !isDecorationHost(element),
  );

  if (originalBubbleChildren.length === 0) {
    return {
      bubble,
      content: null,
      meta: null,
    };
  }

  // O último filho original do balão é messageMetaBottom. O anterior é
  // messageContentRow; seu primeiro filho é messageContentFlex.
  const meta = originalBubbleChildren[originalBubbleChildren.length - 1] || null;
  const contentRow =
    originalBubbleChildren.length >= 2
      ? originalBubbleChildren[originalBubbleChildren.length - 2]
      : null;

  const content = contentRow
    ? elementChildren(contentRow).find((element) => !isDecorationHost(element)) || null
    : null;

  return {
    bubble,
    content,
    meta,
  };
}

function findHost(
  parent: HTMLElement,
  messageId: string,
  kind: DecorationKind,
) {
  const hosts = parent.querySelectorAll<HTMLElement>(
    `[${HOST_ATTRIBUTE}="true"]`,
  );

  for (const host of hosts) {
    if (
      host.getAttribute(MESSAGE_ATTRIBUTE) === messageId &&
      host.dataset.whatsappDecorationKind === kind
    ) {
      return host;
    }
  }

  return null;
}

function ensureHost(
  parent: HTMLElement,
  messageId: string,
  kind: DecorationKind,
  tagName: "div" | "span",
) {
  const existing = findHost(parent, messageId, kind);
  if (existing) return existing;

  const host = document.createElement(tagName);
  host.setAttribute(HOST_ATTRIBUTE, "true");
  host.setAttribute(MESSAGE_ATTRIBUTE, messageId);
  host.dataset.whatsappDecorationKind = kind;
  return host;
}

function removeHosts(messageId: string, kind?: DecorationKind) {
  document
    .querySelectorAll<HTMLElement>(`[${HOST_ATTRIBUTE}="true"]`)
    .forEach((host) => {
      if (host.getAttribute(MESSAGE_ATTRIBUTE) !== messageId) return;
      if (kind && host.dataset.whatsappDecorationKind !== kind) return;
      host.remove();
    });
}

function cleanupAllDecorations() {
  document
    .querySelectorAll<HTMLElement>(`[${HOST_ATTRIBUTE}="true"]`)
    .forEach((host) => host.remove());

  document
    .querySelectorAll<HTMLElement>(`[${HIDDEN_CONTENT_ATTRIBUTE}="true"]`)
    .forEach((element) => element.removeAttribute(HIDDEN_CONTENT_ATTRIBUTE));
}

function applySignature(
  host: HTMLElement,
  signature: string,
  render: () => void,
) {
  if (host.getAttribute(SIGNATURE_ATTRIBUTE) === signature) return;

  host.replaceChildren();
  render();
  host.setAttribute(SIGNATURE_ATTRIBUTE, signature);
}

function createTextElement(
  tagName: "div" | "span" | "p",
  className: string,
  text: string,
) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function renderMutationContent(
  host: HTMLElement,
  decoration: MessageDecoration,
) {
  host.className = styles.mutationContentHost;

  const signature = JSON.stringify([
    decoration.revoked,
    decoration.edited,
    decoration.previousContent,
    decoration.currentContent,
    decoration.deletedContent,
  ]);

  applySignature(host, signature, () => {
    if (decoration.revoked) {
      const card = document.createElement("div");
      card.className = styles.deletedContentCard;

      card.appendChild(
        createTextElement(
          "p",
          styles.deletedOriginalText,
          decoration.deletedContent || "Conteúdo removido",
        ),
      );
      card.appendChild(
        createTextElement(
          "span",
          styles.deletedBadge,
          "Apagada pelo contato",
        ),
      );

      host.appendChild(card);
      return;
    }

    if (!decoration.edited) return;

    const card = document.createElement("div");
    card.className = styles.editedContentCard;

    if (decoration.previousContent) {
      const previous = document.createElement("div");
      previous.className = styles.editVersionPrevious;
      previous.appendChild(
        createTextElement("span", styles.editVersionLabel, "Antes"),
      );
      previous.appendChild(
        createTextElement(
          "p",
          styles.editVersionText,
          decoration.previousContent,
        ),
      );
      card.appendChild(previous);
    }

    const current = document.createElement("div");
    current.className = styles.editVersionCurrent;
    current.appendChild(
      createTextElement("span", styles.editVersionLabel, "Agora"),
    );
    current.appendChild(
      createTextElement(
        "p",
        styles.editVersionText,
        decoration.currentContent || "Mensagem editada",
      ),
    );
    card.appendChild(current);

    host.appendChild(card);
  });
}

function renderStateLabel(host: HTMLElement, decoration: MessageDecoration) {
  const text = decoration.revoked ? "apagada" : "editada";
  const signature = `${text}:${decoration.revoked ? "1" : "0"}`;

  host.className = `${styles.stateLabel} ${
    decoration.revoked ? styles.stateDeleted : ""
  }`;

  applySignature(host, signature, () => {
    host.textContent = text;
  });
}

function renderReactions(host: HTMLElement, decoration: MessageDecoration) {
  host.className = `${styles.reactionList} ${
    decoration.outgoing ? styles.reactionListOutgoing : ""
  }`;
  host.setAttribute("aria-label", "Reações da mensagem");

  const signature = JSON.stringify([
    decoration.outgoing,
    decoration.reactions.map((reaction) => [reaction.emoji, reaction.count]),
  ]);

  applySignature(host, signature, () => {
    for (const reaction of decoration.reactions) {
      const chip = document.createElement("span");
      chip.className = styles.reactionChip;
      chip.title = `${reaction.count} reação${
        reaction.count === 1 ? "" : "ões"
      } ${reaction.emoji}`;

      chip.appendChild(
        createTextElement("span", styles.reactionEmoji, reaction.emoji),
      );

      if (reaction.count > 1) {
        chip.appendChild(
          createTextElement(
            "span",
            styles.reactionCount,
            String(reaction.count),
          ),
        );
      }

      host.appendChild(chip);
    }
  });
}

export default function WhatsAppMessageDecorations() {
  const searchParams = useSearchParams();
  const conversaId =
    searchParams.get("id")?.trim() ||
    searchParams.get("conversaId")?.trim() ||
    "";

  const decorationsRef = useRef<Map<string, MessageDecoration>>(new Map());
  const syncFrameRef = useRef<number | null>(null);

  const syncDecorations = useCallback(() => {
    if (typeof document === "undefined") return;

    const decorations = decorationsRef.current;
    const activeIds = new Set(decorations.keys());

    document
      .querySelectorAll<HTMLElement>(`[${HOST_ATTRIBUTE}="true"]`)
      .forEach((host) => {
        const messageId = host.getAttribute(MESSAGE_ATTRIBUTE) || "";
        if (!activeIds.has(messageId)) host.remove();
      });

    document
      .querySelectorAll<HTMLElement>(`[${HIDDEN_CONTENT_ATTRIBUTE}="true"]`)
      .forEach((content) => {
        const row = content.closest<HTMLElement>('[id^="mensagem-"]');
        const messageId = row?.id.replace(/^mensagem-/, "") || "";
        const decoration = decorations.get(messageId);

        if (!decoration || (!decoration.edited && !decoration.revoked)) {
          content.removeAttribute(HIDDEN_CONTENT_ATTRIBUTE);
        }
      });

    for (const decoration of decorations.values()) {
      const row = document.getElementById(`mensagem-${decoration.messageId}`);
      if (!row) continue;

      const structure = getMessageDomStructure(row);
      if (!structure) continue;

      const { bubble, content, meta } = structure;
      const mutated = decoration.edited || decoration.revoked;

      if (mutated && content?.parentElement) {
        content.setAttribute(HIDDEN_CONTENT_ATTRIBUTE, "true");

        const host = ensureHost(
          content.parentElement,
          decoration.messageId,
          "content",
          "div",
        );

        if (content.nextElementSibling !== host) {
          content.insertAdjacentElement("afterend", host);
        }

        renderMutationContent(host, decoration);
      } else {
        content?.removeAttribute(HIDDEN_CONTENT_ATTRIBUTE);
        removeHosts(decoration.messageId, "content");
      }

      if (mutated && meta) {
        const host = ensureHost(
          meta,
          decoration.messageId,
          "state",
          "span",
        );

        if (host.parentElement !== meta || !host.isConnected) {
          meta.appendChild(host);
        }

        renderStateLabel(host, decoration);
      } else {
        removeHosts(decoration.messageId, "state");
      }

      if (decoration.reactions.length > 0) {
        const host = ensureHost(
          bubble,
          decoration.messageId,
          "reactions",
          "div",
        );

        if (host.parentElement !== bubble || !host.isConnected) {
          bubble.appendChild(host);
        }

        renderReactions(host, decoration);
      } else {
        removeHosts(decoration.messageId, "reactions");
      }
    }
  }, []);

  const scheduleSync = useCallback(() => {
    if (typeof window === "undefined") return;
    if (syncFrameRef.current != null) return;

    syncFrameRef.current = window.requestAnimationFrame(() => {
      syncFrameRef.current = null;
      syncDecorations();
    });
  }, [syncDecorations]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    cleanupAllDecorations();
    decorationsRef.current = new Map();

    if (!conversaId) return;

    let cancelled = false;

    async function loadDecorations() {
      try {
        const params = new URLSearchParams({
          conversa_id: conversaId,
          limite: "100",
        });
        const response = await fetch(`/api/mensagens?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);

        if (cancelled || !response.ok || !Array.isArray(data?.mensagens)) {
          return;
        }

        const next = new Map<string, MessageDecoration>();

        for (const message of data.mensagens as MessageRow[]) {
          if (stringValue(message.conversa_id) !== conversaId) continue;

          const decoration = parseDecoration(message);
          if (decoration) next.set(decoration.messageId, decoration);
        }

        decorationsRef.current = next;
        scheduleSync();
      } catch {
        // A decoração é complementar e não pode bloquear o atendimento.
      }
    }

    void loadDecorations();

    const supabase = createClient();
    const channel = supabase
      .channel(`crm-whatsapp-message-decorations:${conversaId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mensagens",
          filter: `conversa_id=eq.${conversaId}`,
        },
        (payload) => {
          decorationsRef.current = mergeDecoration(
            decorationsRef.current,
            payload.new as MessageRow,
          );
          scheduleSync();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "mensagens",
          filter: `conversa_id=eq.${conversaId}`,
        },
        (payload) => {
          decorationsRef.current = mergeDecoration(
            decorationsRef.current,
            payload.new as MessageRow,
          );
          scheduleSync();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "mensagens",
          filter: `conversa_id=eq.${conversaId}`,
        },
        (payload) => {
          const messageId = stringValue((payload.old as MessageRow)?.id);
          if (!messageId) return;

          const next = new Map(decorationsRef.current);
          next.delete(messageId);
          decorationsRef.current = next;
          removeHosts(messageId);
          scheduleSync();
        },
      )
      .subscribe();

    const observer = new MutationObserver(() => {
      scheduleSync();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    scheduleSync();

    return () => {
      cancelled = true;
      observer.disconnect();
      void supabase.removeChannel(channel);

      if (syncFrameRef.current != null) {
        window.cancelAnimationFrame(syncFrameRef.current);
        syncFrameRef.current = null;
      }

      decorationsRef.current = new Map();
      cleanupAllDecorations();
    };
  }, [conversaId, scheduleSync]);

  return null;
}
