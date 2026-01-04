import { useMemo } from "react";

import { CodeBlockNode } from "./nodes/CodeBlockNode";
import { ListNode } from "./nodes/ListNode";
import { ParagraphNode } from "./nodes/ParagraphNode";
import { parseMarkdownLite } from "./parse/parseMarkdownLite";

export type ChatMessageRendererProps = {
  content: string;
  policy?: "plain" | "lite" | "diagnostics";
  className?: string;
};

export function ChatMessageRenderer({
  content,
  policy = "lite",
  className,
}: ChatMessageRendererProps) {
  const nodes = useMemo(() => {
    if (policy === "plain") return null;

    return parseMarkdownLite(content, {
      allowCodeBlocks: policy === "diagnostics",
    });
  }, [content, policy]);

  if (policy === "plain" || !nodes) {
    return (
      <div className={className}>
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {nodes.map((node, i) => {
        const key = i;
        switch (node.type) {
          case "paragraph":
            return <ParagraphNode key={key}>{node.children}</ParagraphNode>;
          case "list":
            return (
              <ListNode key={key} ordered={node.ordered} items={node.items} />
            );
          case "codeblock":
            // Only rendered if parser produced it (so policy was diagnostics)
            return (
              <CodeBlockNode
                key={key}
                code={node.code}
                language={node.language}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
