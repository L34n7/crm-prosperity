"use client";

import type { Key, ReactNode, RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

type VirtualizedConversationRowsProps<T> = {
  items: T[];
  scrollRef: RefObject<HTMLDivElement | null>;
  getKey: (item: T) => Key;
  children: (item: T, index: number) => ReactNode;
  listClassName?: string;
  rowClassName?: string;
};

export default function VirtualizedConversationRows<T>({
  items,
  scrollRef,
  getKey,
  children,
  listClassName,
  rowClassName,
}: VirtualizedConversationRowsProps<T>) {
  // TanStack Virtual gerencia medidas mutaveis fora do React Compiler.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 104,
    overscan: 6,
  });

  return (
    <div
      className={listClassName}
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const item = items[virtualItem.index];

        return (
          <div
            key={getKey(item)}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            className={rowClassName}
            style={{ transform: `translateY(${virtualItem.start}px)` }}
          >
            {children(item, virtualItem.index)}
          </div>
        );
      })}
    </div>
  );
}
