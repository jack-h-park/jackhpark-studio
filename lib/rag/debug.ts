export const DEBUG_INGESTION =
  process.env.DEBUG_INGESTION === "1" ||
  process.env.DEBUG_INGESTION === "true" ||
  process.env.DEBUG_INGESTION === "yes";

export function debugIngestionLog(label: string, payload: any) {
  if (!DEBUG_INGESTION) return;
  console.debug(`[ingestion] ${label}`, payload);
}
