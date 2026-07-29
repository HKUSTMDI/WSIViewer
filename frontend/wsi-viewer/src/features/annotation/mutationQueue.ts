const queues = new Map<string, Promise<void>>();

function mutationKey(slideId: string, annotationId: string): string {
  return JSON.stringify([slideId, annotationId]);
}

/**
 * Serializes mutations for one annotation while allowing unrelated
 * annotations to save in parallel. A rejected mutation never blocks the next
 * queued operation.
 */
export function enqueueAnnotationMutation<T>(
  slideId: string,
  annotationId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = mutationKey(slideId, annotationId);
  const previous = queues.get(key) ?? Promise.resolve();
  const result = previous.then(operation);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );

  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });

  return result;
}

/**
 * Acquires the same queue for every annotation in an atomic batch. This keeps
 * eraser batches ordered with detail edits and single-annotation mutations.
 */
export function enqueueAnnotationBatchMutation<T>(
  slideId: string,
  annotationIds: string[],
  operation: () => Promise<T>,
): Promise<T> {
  const keys = [...new Set(annotationIds)]
    .map((annotationId) => mutationKey(slideId, annotationId))
    .sort();
  if (keys.length === 0) return operation();

  const previous = keys.map((key) => queues.get(key) ?? Promise.resolve());
  const result = Promise.all(previous).then(operation);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );

  for (const key of keys) queues.set(key, settled);
  void settled.then(() => {
    for (const key of keys) {
      if (queues.get(key) === settled) queues.delete(key);
    }
  });

  return result;
}
