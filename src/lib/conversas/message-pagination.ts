export type RecentMessagePage<T> = {
  messages: T[];
  hasMoreHistory: boolean;
};

export function buildRecentMessagePage<T>(
  messagesDescending: T[],
  limit: number
): RecentMessagePage<T> {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.trunc(limit))
    : 30;

  return {
    messages: messagesDescending.slice(0, safeLimit).reverse(),
    hasMoreHistory: messagesDescending.length > safeLimit,
  };
}
