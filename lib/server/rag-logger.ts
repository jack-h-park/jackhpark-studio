import { ragLogger } from "@/lib/logging/logger";

export function logDebugRag(
  stage: string,
  payload?: Record<string, unknown>,
): void {
  ragLogger.debug(`[rag-debug:${stage}]`, payload ?? {});
}
