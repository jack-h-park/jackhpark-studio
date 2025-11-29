const DEBUG_RAG_STEPS =
  (process.env.DEBUG_RAG_STEPS ?? "").toLowerCase() === "true";

export function logDebugRag(
  stage: string,
  payload?: Record<string, unknown>,
): void {
  if (!DEBUG_RAG_STEPS) {
    return;
  }

  console.info(`[rag-debug:${stage}]`, payload ?? {});
}
