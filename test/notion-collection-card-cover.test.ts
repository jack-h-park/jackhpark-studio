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

function buildPage(blocks: TestBlock[], pageId = "page-1") {
  const block: Record<string, { value: unknown }> = {
    [pageId]: {
      value: {
        id: pageId,
        type: "page",
        content: blocks.map((_, index) => `b${index}`),
        properties: { title: [["Page title"]] },
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
    collection: {},
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
): CollectionCardCoverCandidate | null {
  const { root, recordMap } = buildPage(blocks, pageId);
  return getCollectionCardCoverCandidate({
    block: root,
    cover: { type: "page_content" } as unknown as CollectionCardCover,
    recordMap,
    mapImageUrl: (url) => url ?? "",
    cardCoverPosition: 50,
  });
}

function thesisOf(blocks: TestBlock[]): string | undefined {
  const candidate = coverFor(blocks);
  return candidate?.kind === "thesis" ? candidate.thesis : undefined;
}

void describe("collection card thesis cover", () => {
  void it("uses the opening sentence, not the whole paragraph", () => {
    assert.equal(
      thesisOf([
        {
          type: "text",
          text: "As products scale, complexity compounds. New features pile up.",
        },
      ]),
      "As products scale, complexity compounds.",
    );
  });

  void it("extends a too-short opening sentence with the next one", () => {
    assert.equal(
      thesisOf([
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
      thesisOf([
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

  void it("treats block boundaries as sentence boundaries and trails off a list lead-in", () => {
    assert.equal(
      thesisOf([
        {
          type: "text",
          text: "Fine-tuning is the better fit when the goal is default behavior:",
        },
        { type: "bulleted_list", text: "Fixed style, tone, or format" },
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
    assert.equal(candidate.icon, "🧠");
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
