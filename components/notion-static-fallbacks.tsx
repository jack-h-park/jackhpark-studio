import type { Block } from "notion-types";
import { getBlockTitle } from "notion-utils";
import * as React from "react";
import { useNotionContext } from "react-notion-x";

// Server-safe stand-ins for the vendor components in notion-vendor-components.
// They render on the server and in the first client render, so hydration sees
// identical markup; NotionPageBody swaps in the real components after mount.
// Code and math keep their source text so no-JavaScript readers still get it.

export function StaticCode({ block }: { block: Block }) {
  const { recordMap } = useNotionContext();
  const code = getBlockTitle(block, recordMap);
  const language = (
    (block.properties as { language?: string[][] } | undefined)
      ?.language?.[0]?.[0] ?? ""
  ).toLowerCase();
  const languageClass = language ? `language-${language}` : undefined;

  return (
    <pre className={["notion-code", languageClass].filter(Boolean).join(" ")}>
      <code className={languageClass}>{code}</code>
    </pre>
  );
}

export function StaticEquation({
  block,
  math,
  inline = false,
  className,
}: {
  block?: Block;
  math?: string;
  inline?: boolean;
  className?: string;
}) {
  const { recordMap } = useNotionContext();
  const source = math || (block ? getBlockTitle(block, recordMap) : "");
  if (!source) return null;

  return (
    <span
      className={[
        "notion-equation",
        inline ? "notion-equation-inline" : "notion-equation-block",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {source}
    </span>
  );
}

/** Collections, PDFs, modals and tweets have no useful server form; they mount later. */
export function StaticEmpty() {
  return null;
}

export const staticFallbackComponents = {
  Code: StaticCode,
  Collection: StaticEmpty,
  Equation: StaticEquation,
  Pdf: StaticEmpty,
  Modal: StaticEmpty,
  Tweet: StaticEmpty,
};
