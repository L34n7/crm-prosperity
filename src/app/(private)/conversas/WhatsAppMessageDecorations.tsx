"use client";

import {
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

type DecorationHosts = {
  messageId: string;
  contentHost: HTMLElement | null;
  stateHost: HTMLElement | null;
  reactionHost: HTMLElement | null;
};

const HOST_ATTRIBUTE = "data-whatsapp-message-decoration-host";
const MESSAGE_ATTRIBUTE = "data-whatsapp-message-decoration-id";
const MUTATED_CONTENT_ATTRIBUTE = "data-whatsapp-message-mutated-content";

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

function hostSelector(messageId: string, kind: string) {
  return `[${HOST_ATTRIBUTE}="true"][${MESSAGE_ATTRIBUTE}="${messageId}"][data-whatsapp-decoration-kind="${kind}"]`;
}

function createHost(
  parent: HTMLElement,
  messageId: string,
  kind: "content" | "state" | "reactions",
) {
  const existing = parent.querySelector<HTMLElement>(
    hostSelector(messageId, kind),
  );
  if (existing) return existing;

  const host = document.createElement(kind === "state" ? "span" : "div");
  host.setAttribute(HOST_ATTRIBUTE, "true");
  host.setAttribute(MESSAGE_ATTRIBUTE, messageId);
  host.dataset.whatsappDecorationKind = kind;
  parent.appendChild(host);
  return host;
}

function removeHost(messageId: string, kind: string) {
  document
    .querySelectorAll<HTMLElement>(hostSelector(messageId, kind))
    .forEach((host) => host.remove());
}

function removeAllHosts() {
  document
    .querySelectorAll<HTMLElement>(`[${HOST_ATTRIBUTE}="true"]`)
    .forEach((host) => host.remove());

  document
    .querySelectorAll<HTMLElement>(`[${MUTATED_CONTENT_ATTRIBUTE}="true"]`)
    .forEach((element) => {
      element.removeAttribute(MUTATED_CONTENT_ATTRIBUTE);
    });
}

function MutationContent({ decoration }: { decoration: MessageDecoration }) {
  if (decoration.revoked) {
    return (
      <div className={styles.deletedContentCard}>
        <p className={styles.deletedOriginalText}>
          {decoration.deletedContent || "Conteúdo removido"}
        </p>
        <span className={styles.deletedBadge}>Apagada pelo contato</span>
      </div>
    );
  }

  if (!decoration.edited) return null;

  return (
    <div className={styles.editedContentCard}>
      {decoration.previousContent ? (
        <div className={styles.editVersionPrevious}>
          <span className={styles.editVersionLabel}>Antes</span>
          <p className={styles.editVersionText}>{decoration.previousContent}</p>
        </div>
      ) : null}

      <div className={styles.editVersionCurrent}>
        <span className={styles.editVersionLabel}>Agora</span>
        <p className={styles.editVersionText}>
          {decoration.currentContent || "Mensagem editada"}
        </p>
      </div>
    </div>
  );
}

export default function WhatsAppMessageDecorations() {
  const searchParams = useSearchParams();
  const conversaId =
    searchParams.get("id")?.trim() ||
    searchParams.get("conversaId")?.trim() ||
    "";

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

    document
      .querySelectorAll<HTMLElement>(`[${MUTATED_CONTENT_ATTRIBUTE}="true"]`)
      .forEach((element) => {
        const row = element.closest<HTMLElement>('[id^="mensagem-"]');
        const messageId = row?.id.replace(/^mensagem-/, "") || "";
        const decoration = decorationsRef.current.get(messageId);

        if (!decoration?.edited && !decoration?.revoked) {
          element.removeAttribute(MUTATED_CONTENT_ATTRIBUTE);
        }
      });

    const nextHosts: DecorationHosts[] = [];

    for (const decoration of decorationsRef.current.values()) {
      const row = document.getElementById(`mensagem-${decoration.messageId}`);
      if (!row) continue;

      const bubble = row.querySelector<HTMLElement>('[class*="messageBubble"]');
      if (!bubble) continue;

      const contentFlex = bubble.querySelector<HTMLElement>(
        '[class*="messageContentFlex"]',
      );
      const metaBottom = bubble.querySelector<HTMLElement>(
        '[class*="messageMetaBottom"]',
      );

      let contentHost: HTMLElement | null = null;
      let stateHost: HTMLElement | null = null;
      let reactionHost: HTMLElement | null = null;

      if ((decoration.edited || decoration.revoked) && contentFlex) {
        contentFlex.setAttribute(MUTATED_CONTENT_ATTRIBUTE, "true");
        contentHost = createHost(
          contentFlex,
          decoration.messageId,
          "content",
        );
      } else {
        contentFlex?.removeAttribute(MUTATED_CONTENT_ATTRIBUTE);
        removeHost(decoration.messageId, "content");
      }

      if ((decoration.edited || decoration.revoked) && metaBottom) {
        stateHost = createHost(
          metaBottom,
          decoration.messageId,
          "state",
        );
      } else {
        removeHost(decoration.messageId, "state");
      }

      if (decoration.reactions.length > 0) {
        reactionHost = createHost(
          bubble,
          decoration.messageId,
          "reactions",
        );
      } else {
        removeHost(decoration.messageId, "reactions");
      }

      nextHosts.push({
        messageId: decoration.messageId,
        contentHost,
        stateHost,
        reactionHost,
      });
    }

    const signature = nextHosts
      .map(
        (item) =>
          `${item.messageId}:${item.contentHost ? "c" : ""}:${
            item.stateHost ? "s" : ""
          }:${item.reactionHost ? "r" : ""}`,
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

        setDecorations(next);
      } catch {
        // Os adornos são complementares e não podem bloquear o atendimento.
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
          const messageId = stringValue((payload.old as MessageRow)?.id);
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
      setHosts([]);
      removeAllHosts();
    };
  }, [conversaId, scheduleSync]);

  return (
    <>
      {hosts.map((host) => {
        const decoration = decorations.get(host.messageId);
        if (!decoration) return null;

        return (
          <span key={host.messageId}>
            {host.contentHost
              ? createPortal(
                  <MutationContent decoration={decoration} />,
                  host.contentHost,
                )
              : null}

            {host.stateHost
              ? createPortal(
                  <span
                    className={`${styles.stateLabel} ${
                      decoration.revoked ? styles.stateDeleted : ""
                    }`}
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
                        title={`${reaction.count} reação${
                          reaction.count === 1 ? "" : "ões"
                        } ${reaction.emoji}`}
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
          </span>
        );
      })}
    </>
  );
}
