export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function sanitizeMessages(raw: unknown[]): ChatMessage[] {
  const result: ChatMessage[] = [];

  for (const entry of raw) {
    if (
      entry &&
      typeof entry === "object" &&
      "role" in entry &&
      "content" in entry &&
      (entry as { role?: unknown }).role !== "system"
    ) {
      const { role, content } = entry as {
        role?: unknown;
        content?: unknown;
      };
      if (
        (role === "user" || role === "assistant") &&
        typeof content === "string" &&
        content.trim().length > 0
      ) {
        result.push({ role, content: content.trim() });
      }
    }
  }

  return result;
}
