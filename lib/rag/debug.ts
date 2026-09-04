import { ingestionLogger } from "@/lib/logging/logger";

export function debugIngestionLog(label: string, payload: unknown) {
  ingestionLogger.debug(`[ingestion] ${label}`, payload);
}
