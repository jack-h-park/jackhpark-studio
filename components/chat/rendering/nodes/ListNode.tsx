import type { InlineNode } from "../parse/types";
import { InlineRenderer } from "./InlineRenderer";

export function ListNode({
  ordered,
  items,
}: {
  ordered: boolean;
  items: InlineNode[][];
}) {
  const Tag = ordered ? "ol" : "ul";
  const listClass = ordered
    ? "ai-message__ol list-decimal"
    : "ai-message__ul list-disc";

  return (
    <Tag className={`${listClass} my-2 ml-4 pl-4 space-y-1 text-sm`}>
      {items.map((item, i) => (
        <li key={i} className="ai-message__li pl-1">
          <span>
            <InlineRenderer nodes={item} />
          </span>
        </li>
      ))}
    </Tag>
  );
}
