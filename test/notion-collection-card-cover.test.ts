import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  Block,
  CollectionCardCover,
  ExtendedRecordMap,
} from "notion-types";

import {
  type CollectionCardCoverCandidate,
  getCollectionCardCoverCandidate,
} from "@/lib/notion-collection-card-cover";

type TestBlock = { type: string; text: string };

type TopicFixture = {
  /** The page's value for the property, or undefined to leave it unset. */
  value?: string;
  /** Notion's colour on that option. */
  color?: string;
  /** Defaults to "Topic". */
  propertyName?: string;
};

const COLLECTION_ID = "collection-1";
const TOPIC_PROPERTY_ID = "t0p;";

function buildPage(
  blocks: TestBlock[],
  pageId = "page-1",
  topic?: TopicFixture,
) {
  const block: Record<string, { value: unknown }> = {
    [pageId]: {
      value: {
        id: pageId,
        type: "page",
        parent_id: COLLECTION_ID,
        content: blocks.map((_, index) => `b${index}`),
        properties: {
          title: [["Page title"]],
          ...(topic?.value ? { [TOPIC_PROPERTY_ID]: [[topic.value]] } : {}),
        },
        format: { page_icon: "🧠" },
      },
    },
  };
  for (const [index, child] of blocks.entries()) {
    block[`b${index}`] = {
      value: {
        id: `b${index}`,
        type: child.type,
        properties: { title: [[child.text]] },
      },
    };
  }

  const recordMap = {
    block,
    collection: topic
      ? {
          [COLLECTION_ID]: {
            value: {
              id: COLLECTION_ID,
              schema: {
                title: { name: "Name", type: "title" },
                [TOPIC_PROPERTY_ID]: {
                  name: topic.propertyName ?? "Topic",
                  type: "select",
                  options: [
                    { id: "o1", value: topic.value, color: topic.color },
                  ],
                },
              },
            },
          },
        }
      : {},
    collection_view: {},
    notion_user: {},
    collection_query: {},
    signed_urls: {},
  } as unknown as ExtendedRecordMap;

  return { root: block[pageId]!.value as Block, recordMap };
}

function coverFor(
  blocks: TestBlock[],
  pageId?: string,
  topic?: TopicFixture,
): CollectionCardCoverCandidate | null {
  const { root, recordMap } = buildPage(blocks, pageId, topic);
  return getCollectionCardCoverCandidate({
    block: root,
    cover: { type: "page_content" } as unknown as CollectionCardCover,
    recordMap,
    mapImageUrl: (url) => url ?? "",
    cardCoverPosition: 50,
  });
}

function leadOf(blocks: TestBlock[]): string | undefined {
  const candidate = coverFor(blocks);
  return candidate?.kind === "thesis" ? candidate.lead : undefined;
}

function bodyOf(blocks: TestBlock[]): string | undefined {
  const candidate = coverFor(blocks);
  return candidate?.kind === "thesis" ? candidate.body : undefined;
}

void describe("collection card thesis cover", () => {
  void it("promotes the opening sentence to the lead and keeps the rest as body", () => {
    const blocks = [
      {
        type: "text",
        text: "As products scale, complexity compounds. New features pile up.",
      },
    ];
    assert.equal(leadOf(blocks), "As products scale, complexity compounds.");
    assert.equal(bodyOf(blocks), "New features pile up.");
  });

  void it("extends a too-short opening sentence with the next one", () => {
    assert.equal(
      leadOf([
        {
          type: "text",
          text: "It's 2:14 AM. A security analyst gets an alert. Nobody knows why.",
        },
      ]),
      "It's 2:14 AM. A security analyst gets an alert.",
    );
  });

  void it("skips a leading series note in parentheses", () => {
    assert.equal(
      leadOf([
        {
          type: "text",
          text: "(Part 2 of a two-part pair on trust in AI security products.)",
        },
        {
          type: "text",
          text: "The renewal meeting is going badly, and it is going badly for a strange reason.",
        },
      ]),
      "The renewal meeting is going badly, and it is going badly for a strange reason.",
    );
  });

  void it("treats a block boundary as a sentence boundary and keeps the list as body", () => {
    const blocks = [
      {
        type: "text",
        text: "Fine-tuning is the better fit when the goal is default behavior:",
      },
      { type: "bulleted_list", text: "Fixed style, tone, or format" },
    ];
    // The colon is kept because the list it introduces is right there below it.
    assert.equal(
      leadOf(blocks),
      "Fine-tuning is the better fit when the goal is default behavior:",
    );
    assert.equal(bodyOf(blocks), "Fixed style, tone, or format");
  });

  void it("trails off a list lead-in that has nothing under it", () => {
    assert.equal(
      leadOf([
        {
          type: "text",
          text: "Fine-tuning is the better fit when the goal is default behavior:",
        },
      ]),
      "Fine-tuning is the better fit when the goal is default behavior…",
    );
  });

  void it("promotes an early heading to the eyebrow", () => {
    const candidate = coverFor([
      { type: "sub_header", text: "Is this reversible? A useful test" },
      {
        type: "text",
        text: "Reversible decisions deserve speed and real signal every time.",
      },
    ]);
    assert.equal(candidate?.kind, "thesis");
    if (candidate?.kind !== "thesis") return;
    assert.equal(candidate.eyebrow, "Is this reversible? A useful test");
    assert.equal(
      candidate.lead,
      "Reversible decisions deserve speed and real signal every time.",
    );
    assert.equal(candidate.icon, "🧠");
  });

  void it("takes the tint from the topic option's own Notion colour", () => {
    const blocks = [
      {
        type: "text",
        text: "Most product work gets celebrated on the way in.",
      },
    ];
    const candidate = coverFor(blocks, "page-topic", {
      value: "AI Products",
      color: "purple",
    });
    assert.equal(candidate?.kind === "thesis" && candidate.tint, "purple");

    // Notion's green has no matching background token; it lands on teal.
    const green = coverFor(blocks, "page-topic", {
      value: "Craft & Career",
      color: "green",
    });
    assert.equal(green?.kind === "thesis" && green.tint, "teal");
  });

  void it("falls back to the id hash when the topic is unset or unrecognized", () => {
    const blocks = [
      {
        type: "text",
        text: "Most product work gets celebrated on the way in.",
      },
    ];
    const untinted = coverFor(blocks, "page-topic");
    const unknownColor = coverFor(blocks, "page-topic", {
      value: "AI Products",
      color: "chartreuse",
    });
    const wrongProperty = coverFor(blocks, "page-topic", {
      value: "AI Products",
      color: "purple",
      propertyName: "Category",
    });

    assert.equal(untinted?.kind, "thesis");
    assert.deepEqual(unknownColor, untinted);
    assert.deepEqual(wrongProperty, untinted);
  });

  void it("keeps the tint stable for the same page id", () => {
    const blocks = [
      {
        type: "text",
        text: "Most product work gets celebrated on the way in.",
      },
    ];
    const first = coverFor(blocks, "2ba99029-c0b4-8027-8d3f-ca1786b52bba");
    const second = coverFor(blocks, "2ba99029-c0b4-8027-8d3f-ca1786b52bba");
    assert.equal(first?.kind, "thesis");
    assert.deepEqual(first, second);
  });
});
