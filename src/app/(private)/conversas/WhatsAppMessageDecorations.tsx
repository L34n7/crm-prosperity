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

type DecorationTargets = {
  messageId: string;
  bubble: HTMLElement;
  content: HTMLElement | null;
  meta: HTMLElement | null;
};

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

function sameTargets(current: DecorationTargets[], next: DecorationTargets[]) {
  if (current.length !== next.length) return false;

  const currentById = new Map(current.map((item) => [item.messageId, item]));

  return next.every((nextItem) => {
    const currentItem = currentById.get(nextItem.messageId);

    return (
      !!currentItem &&
      currentItem.bubble === nextItem.bubble &&
      currentItem.content === nextItem.content &&
      currentItem.meta === nextItem.meta
    );
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

function ReactionList({ decoration }: { decoration: MessageDecoration }) {
  if (decoration.reactions.length === 0) return null;

  return (
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
          <span className={styles.reactionEmoji}>{reaction.emoji}</span>
          {reaction.count > 1 ? (
            <span className={styles.reactionCount}>{reaction.count}</span>
          ) : null}
        </span>
      ))}
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
  const [targets, setTargets] = useState<DecorationTargets[]>([]);
  const decorationsRef = useRef(decorations);
  const targetsRef = useRef<DecorationTargets[]>([]);
  const syncFrameRef = useRef<number | null>(null);

  const replaceTargets = useCallback((nextTargets: DecorationTargets[]) => {
    if (sameTargets(targetsRef.current, nextTargets)) return;

    targetsRef.current = nextTargets;
    setTargets(nextTargets);
  }, []);

  const syncTargets = useCallback(() => {
    if (typeof document === "undefined") return;

    const nextTargets: DecorationTargets[] = [];

    for (const decoration of decorationsRef.current.values()) {
      const row = document.getElementById(`mensagem-${decoration.messageId}`);
      if (!row) continue;

      const bubble = row.querySelector<HTMLElement>('[class*="messageBubble"]');
      if (!bubble) continue;

      const content = bubble.querySelector<HTMLElement>(
        '[class*="messageContentFlex"]',
      );
      const meta = bubble.querySelector<HTMLElement>(
        '[class*="messageMetaBottom"]',
      );

      nextTargets.push({
        messageId: decoration.messageId,
        bubble,
        content,
        meta,
      });
    }

    replaceTargets(nextTargets);
  }, [replaceTargets]);

  const scheduleSync = useCallback(() => {
    if (typeof window === "undefined") return;
    if (syncFrameRef.current != null) return;

    syncFrameRef.current = window.requestAnimationFrame(() => {
      syncFrameRef.current = null;
      syncTargets();
    });
  }, [syncTargets]);

  useLayoutEffect(() => {
    decorationsRef.current = decorations;
    scheduleSync();
  }, [decorations, scheduleSync]);

  useEffect(() => {
    if (!conversaId) {
      decorationsRef.current = new Map();
      setDecorations(new Map());
      targetsRef.current = [];
      setTargets([]);
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

        decorationsRef.current = next;
        setDecorations(next);
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
          setDecorations((current) => {
            const next = mergeDecoration(current, payload.new as MessageRow);
            decorationsRef.current = next;
            return next;
          });
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
          setDecorations((current) => {
            const next = mergeDecoration(current, payload.new as MessageRow);
            decorationsRef.current = next;
            return next;
          });
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
            decorationsRef.current = next;
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [conversaId, scheduleSync]);

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

      targetsRef.current = [];
      setTargets([]);
    };
  }, [conversaId, scheduleSync]);

  return (
    <>
      {targets.map((target) => {
        const decoration = decorations.get(target.messageId);
        if (!decoration) return null;

        return (
          <span key={target.messageId}>
            {(decoration.edited || decoration.revoked) && target.content
              ? createPortal(
                  <MutationContent decoration={decoration} />,
                  target.content,
                )
              : null}

            {(decoration.edited || decoration.revoked) && target.meta
              ? createPortal(
                  <span
                    className={`${styles.stateLabel} ${
                      decoration.revoked ? styles.stateDeleted : ""
                    }`}
                  >
                    {decoration.revoked ? "apagada" : "editada"}
                  </span>,
                  target.meta,
                )
              : null}

            {decoration.reactions.length > 0
              ? createPortal(
                  <ReactionList decoration={decoration} />,
                  target.bubble,
                )
              : null}
          </span>
        );
      })}
    </>
  );
}
