"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./WhatsAppMessageDecorations.module.css";

type ReactionMetadata = {
  emoji?: unknown;
  remetente?: unknown;
  evento_id?: unknown;
  timestamp?: unknown;
};

type MessageMetadata = {
  reacoes_whatsapp?: unknown;
  mensagem_editada_whatsapp?: unknown;
  mensagem_revogada_whatsapp?: unknown;
};

type MessageRow = {
  id?: string | null;
  conversa_id?: string | null;
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
  outgoing: boolean;
};

type DecorationHosts = {
  messageId: string;
  stateHost: HTMLElement | null;
  reactionHost: HTMLElement | null;
};

const HOST_ATTRIBUTE = "data-whatsapp-message-decoration-host";
const MESSAGE_ATTRIBUTE = "data-whatsapp-message-decoration-id";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseReactions(value: unknown): GroupedReaction[] {
  if (!Array.isArray(value)) return [];

  const grouped = new Map<string, number>();

  for (const item of value) {
    if (!isObject(item)) continue;

    const reaction = item as ReactionMetadata;
    const emoji = String(reaction.emoji || "").trim();
    if (!emoji) continue;

    grouped.set(emoji, (grouped.get(emoji) || 0) + 1);
  }

  return Array.from(grouped.entries()).map(([emoji, count]) => ({
    emoji,
    count,
  }));
}

function parseDecoration(message: MessageRow): MessageDecoration | null {
  const messageId = String(message.id || "").trim();
  if (!messageId) return null;

  const metadata = isObject(message.metadata_json)
    ? (message.metadata_json as MessageMetadata)
    : {};
  const reactions = parseReactions(metadata.reacoes_whatsapp);
  const edited = metadata.mensagem_editada_whatsapp === true;
  const revoked = metadata.mensagem_revogada_whatsapp === true;

  if (!edited && !revoked && reactions.length === 0) return null;

  return {
    messageId,
    reactions,
    edited,
    revoked,
    outgoing: message.origem === "enviada",
  };
}

function mergeDecoration(
  current: Map<string, MessageDecoration>,
  message: MessageRow,
) {
  const next = new Map(current);
  const messageId = String(message.id || "").trim();

  if (!messageId) return next;

  const decoration = parseDecoration(message);
  if (decoration) next.set(messageId, decoration);
  else next.delete(messageId);

  return next;
}

function removeAllHosts() {
  document
    .querySelectorAll<HTMLElement>(`[${HOST_ATTRIBUTE}="true"]`)
    .forEach((host) => host.remove());
}

function createHost(
  parent: HTMLElement,
  messageId: string,
  kind: "state" | "reactions",
) {
  const selector = `[${HOST_ATTRIBUTE}="true"][${MESSAGE_ATTRIBUTE}="${messageId}"][data-whatsapp-decoration-kind="${kind}"]`;
  const existing = parent.querySelector<HTMLElement>(selector);
  if (existing) return existing;

  const host = document.createElement(kind === "state" ? "span" : "div");
  host.setAttribute(HOST_ATTRIBUTE, "true");
  host.setAttribute(MESSAGE_ATTRIBUTE, messageId);
  host.dataset.whatsappDecorationKind = kind;
  parent.appendChild(host);
  return host;
}

export default function WhatsAppMessageDecorations() {
  const searchParams = useSearchParams();
  const conversaId = searchParams.get("id")?.trim() || "";
  const [decorations, setDecorations] = useState<Map<string, MessageDecoration>>(
    () => new Map(),
  );
  const [hosts, setHosts] = useState<DecorationHosts[]>([]);
  const syncFrameRef = useRef<number | null>(null);
  const hostsSignatureRef = useRef("");
  const decorationsRef = useRef(decorations);

  useEffect(() => {
    decorationsRef.current = decorations;
  }, [decorations]);

  const syncHosts = useCallback(() => {
    if (typeof document === "undefined") return;

    const activeIds = new Set(decorationsRef.current.keys());

    document
      .querySelectorAll<HTMLElement>(`[${HOST_ATTRIBUTE}="true"]`)
      .forEach((host) => {
        const messageId = host.getAttribute(MESSAGE_ATTRIBUTE) || "";
        if (!activeIds.has(messageId)) host.remove();
      });

    const nextHosts: DecorationHosts[] = [];

    for (const decoration of decorationsRef.current.values()) {
      const row = document.getElementById(`mensagem-${decoration.messageId}`);
      if (!row) continue;

      const bubble = row.querySelector<HTMLElement>('[class*="messageBubble"]');
      if (!bubble) continue;

      const metaBottom = bubble.querySelector<HTMLElement>(
        '[class*="messageMetaBottom"]',
      );

      let stateHost: HTMLElement | null = null;
      let reactionHost: HTMLElement | null = null;

      if ((decoration.edited || decoration.revoked) && metaBottom) {
        stateHost = createHost(
          metaBottom,
          decoration.messageId,
          "state",
        );
      }

      if (decoration.reactions.length > 0) {
        reactionHost = createHost(
          bubble,
          decoration.messageId,
          "reactions",
        );
      }

      nextHosts.push({
        messageId: decoration.messageId,
        stateHost,
        reactionHost,
      });
    }

    const signature = nextHosts
      .map(
        (item) =>
          `${item.messageId}:${item.stateHost ? "s" : ""}:${
            item.reactionHost ? "r" : ""
          }`,
      )
      .sort()
      .join("|");

    if (signature !== hostsSignatureRef.current) {
      hostsSignatureRef.current = signature;
      setHosts(nextHosts);
    }
  }, []);

  const scheduleSync = useCallback(() => {
    if (typeof window === "undefined") return;
    if (syncFrameRef.current != null) return;

    syncFrameRef.current = window.requestAnimationFrame(() => {
      syncFrameRef.current = null;
      syncHosts();
    });
  }, [syncHosts]);

  useEffect(() => {
    if (!conversaId) {
      setDecorations(new Map());
      hostsSignatureRef.current = "";
      setHosts([]);
      removeAllHosts();
      return;
    }

    let cancelled = false;

    async function loadDecorations() {
      try {
        const response = await fetch(
          `/api/mensagens?conversa_id=${encodeURIComponent(
            conversaId,
          )}&exportar=true`,
          { cache: "no-store" },
        );
        const data = await response.json().catch(() => null);

        if (cancelled || !response.ok || !Array.isArray(data?.mensagens)) {
          return;
        }

        const next = new Map<string, MessageDecoration>();

        for (const message of data.mensagens as MessageRow[]) {
          if (String(message.conversa_id || "") !== conversaId) continue;

          const decoration = parseDecoration(message);
          if (decoration) next.set(decoration.messageId, decoration);
        }

        setDecorations(next);
      } catch {
        // Os adornos são complementares e nunca devem bloquear o atendimento.
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
          setDecorations((current) =>
            mergeDecoration(current, payload.new as MessageRow),
          );
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
          setDecorations((current) =>
            mergeDecoration(current, payload.new as MessageRow),
          );
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
          const messageId = String((payload.old as MessageRow)?.id || "").trim();
          if (!messageId) return;

          setDecorations((current) => {
            const next = new Map(current);
            next.delete(messageId);
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [conversaId]);

  useLayoutEffect(() => {
    scheduleSync();
  }, [decorations, scheduleSync]);

  useEffect(() => {
    if (!conversaId || typeof MutationObserver === "undefined") return;

    const observer = new MutationObserver(() => {
      scheduleSync();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    scheduleSync();

    return () => {
      observer.disconnect();
      if (syncFrameRef.current != null) {
        window.cancelAnimationFrame(syncFrameRef.current);
        syncFrameRef.current = null;
      }
      hostsSignatureRef.current = "";
      removeAllHosts();
    };
  }, [conversaId, scheduleSync]);

  return (
    <>
      {hosts.map((host) => {
        const decoration = decorations.get(host.messageId);
        if (!decoration) return null;

        return (
          <Fragment key={host.messageId}>
            {host.stateHost
              ? createPortal(
                  <span
                    className={`${styles.stateLabel} ${
                      decoration.revoked ? styles.stateDeleted : ""
                    }`}
                    title={
                      decoration.revoked
                        ? "Mensagem apagada no WhatsApp"
                        : "Mensagem editada no WhatsApp"
                    }
                  >
                    {decoration.revoked ? "apagada" : "editada"}
                  </span>,
                  host.stateHost,
                )
              : null}

            {host.reactionHost && decoration.reactions.length > 0
              ? createPortal(
                  <div
                    className={`${styles.reactionList} ${
                      decoration.outgoing ? styles.reactionListOutgoing : ""
                    }`}
                    aria-label="Reações da mensagem"
                  >
                    {decoration.reactions.map((reaction) => (
                      <span
                        key={reaction.emoji}
                        className={styles.reactionChip}
                        title={
                          reaction.count === 1
                            ? `1 reação ${reaction.emoji}`
                            : `${reaction.count} reações ${reaction.emoji}`
                        }
                      >
                        <span className={styles.reactionEmoji}>
                          {reaction.emoji}
                        </span>
                        {reaction.count > 1 ? (
                          <span className={styles.reactionCount}>
                            {reaction.count}
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </div>,
                  host.reactionHost,
                )
              : null}
          </Fragment>
        );
      })}
    </>
  );
}
