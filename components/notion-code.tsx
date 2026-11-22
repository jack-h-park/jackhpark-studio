"use client";

import { getTextContent } from "notion-utils";
import * as React from "react";
import { Code as DefaultCode } from "react-notion-x/build/third-party/code";

import { isMermaidCodeBlock } from "@/lib/notion/code-block";

import { MermaidDiagram } from "./notion-mermaid";

type NotionCodeProps = React.ComponentProps<typeof DefaultCode>;

export function NotionCode(props: NotionCodeProps) {
  const { block } = props;
  const isMermaid = React.useMemo(() => isMermaidCodeBlock(block), [block]);
  const code = React.useMemo(
    () => getTextContent(block?.properties?.title ?? []),
    [block],
  );
  const [isSourceOpen, setIsSourceOpen] = React.useState(false);
  const sourceId = React.useId();

  if (isMermaid) {
    return (
      <div className="notion-mermaid-block">
        <MermaidDiagram blockId={block.id} code={code} />
        <details
          className="notion-mermaid-source"
          onToggle={(event) => {
            setIsSourceOpen(event.currentTarget.open);
          }}
        >
          <summary>
            {isSourceOpen ? "Hide Mermaid source" : "Show Mermaid source"}
          </summary>
          <pre
            aria-live="polite"
            aria-label="Mermaid source code"
            id={sourceId}
          >
            <code>{code}</code>
          </pre>
        </details>
      </div>
    );
  }

  return <DefaultCode {...props} />;
}
