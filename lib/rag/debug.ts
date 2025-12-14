import { ingestionLogger } from "@/lib/logging/logger";

export function debugIngestionLog(label: string, payload: any) {
  ingestionLogger.debug(`[ingestion] ${label}`, payload);
}
