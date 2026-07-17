import type { ChatMessage } from "@/components/chat/hooks/useChatSession";

// Client-only conversation export helpers. Kept framework-free so they can be
// unit-tested and reused across chat surfaces.

const ROLE_LABELS: Record<ChatMessage["role"], string> = {
  user: "You",
  assistant: "JackGPT",
};

/**
 * Serialize a conversation to Markdown. Skips empty placeholder messages and
 * error notices so an exported transcript reads like the real exchange.
 */
export function conversationToMarkdown(
  messages: ChatMessage[],
  options?: { title?: string; exportedAt?: number },
): string {
  const lines: string[] = [`# ${options?.title ?? "JackGPT conversation"}`];
  if (options?.exportedAt) {
    lines.push("", `_Exported ${new Date(options.exportedAt).toISOString()}_`);
  }

  for (const message of messages) {
    const content = message.content.trim();
    if (!content || message.isError) continue;
    lines.push("", `**${ROLE_LABELS[message.role]}:**`, "", content);

    if (message.role === "assistant" && message.citations?.length) {
      lines.push("", "_Sources:_");
      for (const [index, citation] of message.citations.entries()) {
        const title =
          (citation.title ?? "").trim() ||
          (citation.url ?? "").trim() ||
          `Source ${index + 1}`;
        const url = (citation.url ?? "").trim();
        lines.push(
          url
            ? `${index + 1}. [${title}](${url})`
            : `${index + 1}. ${title}`,
        );
      }
    }
  }

  return lines.join("\n").trim() + "\n";
}

/**
 * Trigger a client-side file download of `content`. No-op outside the browser.
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "text/markdown",
): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
