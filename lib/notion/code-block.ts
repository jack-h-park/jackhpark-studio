import type { Block } from "notion-types";

const MERMAID_LANGUAGES = new Set(["mermaid"]);

/** A code block's language as Notion stores it, trimmed and lower-cased; "" when unset. */
export function getCodeBlockLanguage(
  block: Pick<Block, "properties"> | undefined,
): string {
  const languageToken: unknown = block?.properties?.language?.[0]?.[0];
  return typeof languageToken === "string"
    ? languageToken.trim().toLowerCase()
    : "";
}

/**
 * True for a code block the site renders as a Mermaid diagram. The renderer and the RAG text
 * extractor both ask this, so a block shown as a picture is never indexed as diagram syntax.
 */
export function isMermaidCodeBlock(
  block: Pick<Block, "type" | "properties"> | undefined,
): boolean {
  return (
    block?.type === "code" && MERMAID_LANGUAGES.has(getCodeBlockLanguage(block))
  );
}
