/**
 * LangChain stream chunk normalization utilities.
 *
 * Converts heterogeneous LangChain chunk shapes (string, object, array content)
 * into plain strings for downstream streaming logic.
 */

function messageContentToString(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry: unknown) => {
        if (typeof entry === "string") {
          return entry;
        }

        if (entry && typeof entry === "object") {
          // LangChain MessageContent-like shapes
          const candidate = entry as {
            type?: string;
            text?: unknown;
            content?: unknown;
            data?: { text?: unknown };
          };

          // Common pattern: { type: "text", text: "..." }
          if (typeof candidate.text === "string") {
            return candidate.text;
          }

          // Some providers may put text in `content`
          if (typeof candidate.content === "string") {
            return candidate.content;
          }

          // Fallback: sometimes nested under data.text
          if (candidate.data && typeof candidate.data.text === "string") {
            return candidate.data.text;
          }
        }

        return "";
      })
      .join("");
  }

  return "";
}

export function renderStreamChunk(chunk: unknown): string | null {
  if (!chunk) {
    return null;
  }

  // Already a plain string
  if (typeof chunk === "string") {
    return chunk;
  }

  if (typeof chunk !== "object") {
    return null;
  }

  const anyChunk = chunk as {
    content?: unknown;
    text?: unknown;
    lc_kwargs?: { content?: unknown };
  };

  // Prefer the raw LangChain kwargs content when available (e.g., ChatOllama)
  const rawContent =
    anyChunk.lc_kwargs?.content ?? anyChunk.content ?? anyChunk.text;

  const text = messageContentToString(rawContent);
  return text.length > 0 ? text : null;
}

export function escapeForPromptTemplate(value: string): string {
  return value.replaceAll("{", "{{").replaceAll("}", "}}");
}
