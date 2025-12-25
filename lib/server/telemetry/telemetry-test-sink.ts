const ingestionBatches: unknown[] = [];

export function pushIngestionBatch(batchBody: unknown): void {
  ingestionBatches.push(batchBody);
}

export function drainIngestionBatches(): unknown[] {
  const drained = [...ingestionBatches];
  ingestionBatches.length = 0;
  return drained;
}

export function resetIngestionBatches(): void {
  ingestionBatches.length = 0;
}
