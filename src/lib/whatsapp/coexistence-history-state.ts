export function calculateCoexistenceHistoryProgress(params: {
  total: number;
  processed: number;
  ignored?: number;
  fatalErrors: number;
  metaCompleted: boolean;
}) {
  const total = Math.max(0, params.total);
  const processed = Math.max(0, Math.min(params.processed, total));
  const ignored = Math.max(
    0,
    Math.min(params.ignored || 0, total - processed)
  );
  const fatalErrors = Math.max(
    0,
    Math.min(params.fatalErrors, total - processed - ignored)
  );
  const settled = processed + ignored;
  const allSettled = settled + fatalErrors >= total;
  const completed =
    params.metaCompleted && allSettled && fatalErrors === 0;
  const failed =
    params.metaCompleted && allSettled && fatalErrors > 0;
  const processingProgress =
    total > 0
      ? Math.min(100, Math.floor((settled / total) * 100))
      : params.metaCompleted
        ? 100
        : 0;

  return {
    total,
    processed,
    ignored,
    fatalErrors,
    allSettled,
    completed,
    failed,
    processingProgress,
    status: completed
      ? ("concluido" as const)
      : failed
        ? ("erro" as const)
        : ("processando" as const),
  };
}
