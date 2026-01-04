import type { InlineNode } from "../parse/types";

export function InlineRenderer({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        const key = i;
        switch (node.type) {
          case "text":
            return <span key={key}>{node.text}</span>;
          case "strong":
            return (
              <strong
                key={key}
                className="ai-strong font-semibold text-ai-foreground"
              >
                <InlineRenderer nodes={node.children} />
              </strong>
            );
          case "em":
            return (
              <em key={key} className="ai-em italic text-ai-foreground">
                <InlineRenderer nodes={node.children} />
              </em>
            );
          case "inlineCode":
            return (
              <code
                key={key}
                className="ai-inline-code rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold"
              >
                {node.code}
              </code>
            );
          case "link":
            return (
              <a
                key={key}
                href={node.href}
                target="_blank"
                rel="noopener noreferrer"
                className="ai-link text-primary underline underline-offset-4 hover:no-underline"
              >
                {node.label}
              </a>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
