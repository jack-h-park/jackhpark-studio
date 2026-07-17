import type { Decoration, ExtendedRecordMap } from "notion-types";

const text = (value: string): Decoration[] => [[value]];

export const fixturePageId = "28299029-c0b4-81ce-8999-d425287d3db6";
export const fixtureChildPageId = "28299029-c0b4-81ce-8999-d425287d3db7";
export const fixtureCollectionId = "28299029-c0b4-81ce-8999-d425287d3db8";
export const fixtureViewId = "28299029-c0b4-81ce-8999-d425287d3db9";

export function buildNotionContractRecordMap(): ExtendedRecordMap {
  return {
    block: {
      [fixturePageId]: {
        value: {
          id: fixturePageId,
          type: "page",
          parent_id: fixtureCollectionId,
          parent_table: "collection",
          last_edited_time: "2026-04-18T10:00:00.000Z",
          properties: {
            title: text("Jack H. Park Portfolio"),
            docType: text("profile"),
            persona: text("professional"),
            public: text("true"),
            tags: [[["rag"]], [["notion"]]],
          },
          content: [fixtureChildPageId],
          format: {
            page_icon: "✨",
            page_cover: "color_blue",
          },
        },
      },
      [fixtureChildPageId]: {
        value: {
          id: fixtureChildPageId,
          type: "text",
          parent_id: fixturePageId,
          parent_table: "block",
          properties: {
            title: text("Enterprise mobility and security background."),
          },
        },
      },
    },
    collection: {
      [fixtureCollectionId]: {
        value: {
          value: {
            id: fixtureCollectionId,
            schema: {
              docType: { name: "_doc_type", type: "select" },
              persona: { name: "_persona_type", type: "select" },
              public: { name: "_is_public", type: "checkbox" },
              tags: { name: "_tags", type: "multi_select" },
            },
          },
        },
      },
    },
    collection_view: {
      [fixtureViewId]: {
        value: {
          value: {
            id: fixtureViewId,
            type: "list",
            collection_id: fixtureCollectionId,
            format: {
              list_properties: [
                { property: "title", visible: true },
                { property: "docType", visible: true },
                { property: "docType", visible: true },
              ],
              table_properties: [
                { property: "title", visible: true },
                { property: "title", visible: true },
                { property: "docType", visible: true },
              ],
              collection_group_by: { property: "docType" },
              collection_groups: [],
            },
          },
        },
      },
    },
    collection_query: {
      [fixtureCollectionId]: {
        [fixtureViewId]: {
          reducerResults: {
            "results:select:profile": { blockIds: [fixturePageId] },
          },
        },
      },
    },
    signed_urls: {},
    collection_view_page: {},
    notion_user: {},
    collection_query_by_collection: {},
  } as unknown as ExtendedRecordMap;
}

export const fixtureImagePageId = "28299029-c0b4-81ce-8999-d425287d3dc0";
export const fixtureHeadingBlockId = "28299029-c0b4-81ce-8999-d425287d3dc1";
export const fixtureParagraphBlockId = "28299029-c0b4-81ce-8999-d425287d3dc2";
export const fixtureImageBlockId = "28299029-c0b4-81ce-8999-d425287d3dc3";
export const fixtureSecondImageBlockId =
  "28299029-c0b4-81ce-8999-d425287d3dc4";

// A page with: heading -> paragraph -> captioned image -> plain image.
// Exercises document-order context tracking in extractNotionPageImages.
export function buildImagePageRecordMap(): ExtendedRecordMap {
  return {
    block: {
      [fixtureImagePageId]: {
        value: {
          id: fixtureImagePageId,
          type: "page",
          properties: { title: text("Architecture Notes") },
          content: [
            fixtureHeadingBlockId,
            fixtureParagraphBlockId,
            fixtureImageBlockId,
            fixtureSecondImageBlockId,
          ],
        },
      },
      [fixtureHeadingBlockId]: {
        value: {
          id: fixtureHeadingBlockId,
          type: "sub_header",
          parent_id: fixtureImagePageId,
          properties: { title: text("Retrieval Pipeline") },
        },
      },
      [fixtureParagraphBlockId]: {
        value: {
          id: fixtureParagraphBlockId,
          type: "text",
          parent_id: fixtureImagePageId,
          properties: { title: text("The pipeline fans out per chunk.") },
        },
      },
      [fixtureImageBlockId]: {
        value: {
          id: fixtureImageBlockId,
          type: "image",
          parent_id: fixtureImagePageId,
          properties: {
            source: [["https://example.com/pipeline-diagram.png"]],
            caption: text("Figure 1: retrieval fan-out"),
          },
        },
      },
      [fixtureSecondImageBlockId]: {
        value: {
          id: fixtureSecondImageBlockId,
          type: "image",
          parent_id: fixtureImagePageId,
          format: {
            display_source: "https://example.com/screenshot.png",
          },
          properties: {},
        },
      },
    },
    signed_urls: {},
    collection: {},
    collection_view: {},
    collection_query: {},
    collection_view_page: {},
    notion_user: {},
    collection_query_by_collection: {},
  } as unknown as ExtendedRecordMap;
}

// Mirrors the doubly-nested shape Notion sometimes returns:
// recordMap.block[id].value = { role, value: Block } instead of the Block itself.
// https://github.com/NotionX/react-notion-x/issues/682
export function buildDoublyNestedNotionRecordMap(): ExtendedRecordMap {
  const base = buildNotionContractRecordMap();
  const block = Object.fromEntries(
    Object.entries(base.block).map(([id, entry]) => [
      id,
      { value: { role: "reader", value: entry.value } },
    ]),
  );
  return { ...base, block } as unknown as ExtendedRecordMap;
}
