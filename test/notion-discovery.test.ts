import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { type ExtendedRecordMap } from "notion-types";

import {
  collectLinkedPagesFromSeeds,
  type ManualIngestionEvent,
} from "@/lib/admin/manual-ingestor";
import { notion } from "@/lib/notion-api";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const ROOT_ID = "28299029-c0b4-81ce-8999-d425287d3d01";
const CHILD_ID = "28299029-c0b4-81ce-8999-d425287d3d02";
const COLLECTION_ID = "28299029-c0b4-81ce-8999-d425287d3d03";
const VIEW_ID = "28299029-c0b4-81ce-8999-d425287d3d04";
const ROW_ID = "28299029-c0b4-81ce-8999-d425287d3d05";

const originalGetPage = notion.getPage.bind(notion);
const originalGetCollectionData = notion.getCollectionData.bind(notion);

afterEach(() => {
  notion.getPage = originalGetPage;
  notion.getCollectionData = originalGetCollectionData;
});

/** A page whose content links to one child page. */
function pageWithChild(childId: string): ExtendedRecordMap {
  return {
    block: {
      [ROOT_ID]: { value: { id: ROOT_ID, type: "page", alive: true } },
      [childId]: { value: { id: childId, type: "child_page", alive: true } },
    },
    collection: {},
    collection_view: {},
  } as unknown as ExtendedRecordMap;
}

/** A page carrying one inline database. */
function pageWithDatabase(): ExtendedRecordMap {
  return {
    block: {
      [ROOT_ID]: { value: { id: ROOT_ID, type: "page", alive: true } },
      [COLLECTION_ID]: {
        value: {
          id: COLLECTION_ID,
          type: "collection_view",
          alive: true,
          collection_id: COLLECTION_ID,
          view_ids: [VIEW_ID],
        },
      },
    },
    collection: {},
    collection_view: {},
  } as unknown as ExtendedRecordMap;
}

const leaf = {
  block: { [CHILD_ID]: { value: { id: CHILD_ID, type: "page", alive: true } } },
  collection: {},
  collection_view: {},
} as unknown as ExtendedRecordMap;

function recorder() {
  const events: ManualIngestionEvent[] = [];
  const emit = async (event: ManualIngestionEvent) => {
    events.push(event);
  };
  return { events, emit };
}

// Discovery decides what a full ingest considers to exist. Everything it fails
// to reach looks identical to something that was deleted — which is why the
// caller may only sweep after a traversal that reached everything.
void describe("workspace discovery completeness", () => {
  void it("reports complete when every fetch succeeds", async () => {
    notion.getPage = (async (id: string) =>
      id === ROOT_ID ? pageWithChild(CHILD_ID) : leaf) as typeof notion.getPage;

    const { events, emit } = recorder();
    const result = await collectLinkedPagesFromSeeds([ROOT_ID], emit);

    assert.equal(result.complete, true);
    assert.ok(result.pageIds.includes(CHILD_ID));
    assert.equal(
      events.filter((e) => e.type === "log" && e.level === "warn").length,
      0,
    );
  });

  void it("reports incomplete when a page fetch fails", async () => {
    // The failure this guards: the child is skipped, the list comes back
    // shorter, and a caller reading only the length cannot tell that from the
    // child having been deleted.
    notion.getPage = (async (id: string) => {
      if (id === ROOT_ID) return pageWithChild(CHILD_ID);
      throw new Error("500 Internal Server Error");
    }) as typeof notion.getPage;

    const { events, emit } = recorder();
    const result = await collectLinkedPagesFromSeeds([ROOT_ID], emit);

    assert.equal(result.complete, false);
    assert.ok(
      events.some(
        (e) =>
          e.type === "log" &&
          e.level === "warn" &&
          e.message.includes(CHILD_ID),
      ),
      "the skipped page must be named in a warning, not swallowed",
    );
  });

  void it("reports incomplete when a database fetch fails", async () => {
    notion.getPage = (async () => pageWithDatabase()) as typeof notion.getPage;
    notion.getCollectionData = (async () => {
      throw new Error("500 Internal Server Error");
    }) as typeof notion.getCollectionData;

    const { emit } = recorder();
    const result = await collectLinkedPagesFromSeeds([ROOT_ID], emit);

    assert.equal(result.complete, false);
  });

  void it("retries a rate-limited page instead of dropping it", async () => {
    // Notion 429s routinely on a workspace-sized crawl. Before the retry, one
    // such response cost the page and everything under it.
    let attempts = 0;
    notion.getPage = (async (id: string) => {
      if (id === ROOT_ID) return pageWithChild(CHILD_ID);
      attempts++;
      if (attempts === 1)
        throw new Error("Request failed with status code 429");
      return leaf;
    }) as typeof notion.getPage;

    const { emit } = recorder();
    const result = await collectLinkedPagesFromSeeds([ROOT_ID], emit);

    assert.equal(attempts, 2, "the 429 must be retried");
    assert.equal(result.complete, true);
    assert.ok(result.pageIds.includes(CHILD_ID));
  });

  void it("collects database rows when the fetch succeeds", async () => {
    notion.getPage = (async () => pageWithDatabase()) as typeof notion.getPage;
    notion.getCollectionData = (async () => ({
      result: { blockIds: [ROW_ID] },
      recordMap: {},
    })) as unknown as typeof notion.getCollectionData;

    const { emit } = recorder();
    const result = await collectLinkedPagesFromSeeds([ROOT_ID], emit);

    assert.equal(result.complete, true);
    assert.ok(result.pageIds.includes(ROW_ID));
  });
});

// The consequence lives inside runManualIngestion, which needs Supabase to
// run. Pin the wiring structurally: the sweep may only be reached through the
// flag discovery computes, never through a length comparison that cannot see
// a swallowed failure.
void describe("the sweep is gated on discovery completeness", () => {
  void it("takes its flag from the discovery result", async () => {
    const source = await readFile(
      path.join(repoRoot, "lib/admin/manual-ingestor.ts"),
      "utf8",
    );

    assert.match(
      source,
      /workspaceTraversalComplete = discovery\.complete;/,
      "completeness must come from discovery, which sees swallowed fetch failures",
    );
    assert.doesNotMatch(
      source,
      /workspaceTraversalComplete\s*=\s*\n?\s*workspacePageIds\.length/,
      "a length comparison cannot tell a truncated crawl from a shrunken workspace",
    );
    assert.match(
      source,
      /if \(isFull && isWorkspace && workspaceTraversalComplete\)/,
      "the sweep must stay behind the completeness gate",
    );
  });
});
