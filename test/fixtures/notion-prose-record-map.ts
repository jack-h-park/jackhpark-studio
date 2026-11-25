import type { ExtendedRecordMap } from "notion-types";

/** Offline article fixture covering the block types a crawler should read. */
export const PROSE_PAGE_ID = "11111111-1111-4111-8111-111111111111";

const common = {
  alive: true,
  version: 1,
  created_time: 0,
  last_edited_time: 0,
  parent_id: PROSE_PAGE_ID,
  parent_table: "block",
};

function block(id: string, value: Record<string, unknown>) {
  return { role: "reader", value: { ...common, id, ...value } };
}

export function proseRecordMap(): ExtendedRecordMap {
  return {
    block: {
      [PROSE_PAGE_ID]: block(PROSE_PAGE_ID, {
        parent_id: "fixture-space",
        parent_table: "space",
        type: "page",
        properties: { title: [["Offline fixture"]] },
        content: [
          "heading",
          "text",
          "bullet",
          "callout",
          "table",
          "code",
          "math",
        ],
        format: { page_icon: "🧪" },
      }),
      heading: block("heading", {
        type: "header",
        properties: { title: [["Server rendered section heading"]] },
      }),
      text: block("text", {
        type: "text",
        properties: {
          title: [
            ["Deferred prose survives with inline math "],
            ["⁍", [["e", "a+b"]]],
          ],
        },
      }),
      bullet: block("bullet", {
        type: "bulleted_list",
        properties: { title: [["A bulleted list item"]] },
      }),
      callout: block("callout", {
        type: "callout",
        properties: { title: [["A callout worth reading"]] },
        format: { page_icon: "💡" },
      }),
      table: block("table", {
        type: "table",
        content: ["row"],
        format: { table_block_column_order: ["c1", "c2"] },
      }),
      row: block("row", {
        parent_id: "table",
        type: "table_row",
        properties: { c1: [["Table cell one"]], c2: [["Table cell two"]] },
      }),
      code: block("code", {
        type: "code",
        properties: {
          title: [["const fixtureValue = 7;"]],
          language: [["JavaScript"]],
        },
      }),
      math: block("math", {
        type: "equation",
        properties: { title: [["x^2 + y^2"]] },
      }),
    },
    collection: {},
    collection_view: {},
    collection_query: {},
    notion_user: {},
    signed_urls: {},
  } as unknown as ExtendedRecordMap;
}

/** Article strings that must reach a reader who runs no JavaScript. */
export const PROSE_TEXT = [
  "Server rendered section heading",
  "Deferred prose survives with inline math",
  "A bulleted list item",
  "A callout worth reading",
  "Table cell one",
  "Table cell two",
  "const fixtureValue = 7;",
  "x^2 + y^2",
];
