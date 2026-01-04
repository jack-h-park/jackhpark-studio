import type { InlineNode } from "../parse/types";
import { InlineRenderer } from "./InlineRenderer";

export function ParagraphNode({ children }: { children: InlineNode[] }) {
  return (
    <p className="ai-message__p mb-2 last:mb-0 leading-relaxed text-sm">
      <InlineRenderer nodes={children} />
    </p>
  );
}
