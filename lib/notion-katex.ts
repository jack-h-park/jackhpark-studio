import type { ExtendedRecordMap } from "notion-types";

const MATH_LIKE_PATTERN = /\\(frac|int|sum|sqrt|begin\{align)/i;

/**
 * Detect whether a Notion recordMap contains any math content that would
 * require KaTeX. Checks for equation blocks, inline equation decorations, and
 * common LaTeX-like fragments.
 */
export function hasKaTeXContent(recordMap: ExtendedRecordMap): boolean {
  if (!recordMap || !recordMap.block) {
    return false;
  }

  for (const block of Object.values(recordMap.block)) {
    const value = (block as any)?.value;
    if (!value) {
      continue;
    }

    if (value.type === "equation") {
      return true;
    }

    const properties = value.properties;
    if (!properties || typeof properties !== "object") {
      continue;
    }

    for (const propertyValue of Object.values(properties)) {
      if (!Array.isArray(propertyValue)) {
        continue;
      }

      for (const fragment of propertyValue) {
        if (!Array.isArray(fragment)) {
          continue;
        }

        const [text, decorations] = fragment as [unknown, unknown];

        if (Array.isArray(decorations)) {
          for (const decoration of decorations) {
            if (Array.isArray(decoration) && decoration[0] === "e") {
              return true;
            }
          }
        }

        if (typeof text === "string" && MATH_LIKE_PATTERN.test(text)) {
          return true;
        }
      }
    }
  }

  return false;
}
