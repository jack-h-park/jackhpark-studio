import assert from "node:assert/strict";
import { after, describe, it, mock } from "node:test";

import type { ExtendedRecordMap } from "notion-types";

import type { ManualIngestionEvent as Event } from "@/lib/admin/manual-ingestor";
import { createNotionRunCache } from "@/lib/admin/notion-run-cache";

const ROOT = "28299029-c0b4-81ce-8999-d425287d3d01";
const CHILD = "28299029-c0b4-81ce-8999-d425287d3d02";
const ROW = "28299029-c0b4-81ce-8999-d425287d3d03";
const COLLECTION = "28299029-c0b4-81ce-8999-d425287d3d04";
const VIEW = "28299029-c0b4-81ce-8999-d425287d3d05";
const LEAF = "28299029-c0b4-81ce-8999-d425287d3d06";
const OLD_ATTEMPT = "2000-01-01T00:00:00.000Z";

function page(
  id = ROOT,
  title = "Root",
  children: string[] = [],
): ExtendedRecordMap {
  return {
    block: {
      [id]: {
        value: {
          id,
          type: "page",
          alive: true,
          properties: { title: [[title]] },
          content: children,
        },
      },
      ...Object.fromEntries(
        children.map((child) => [
          child,
          { value: { id: child, type: "child_page", alive: true } },
        ]),
      ),
    },
    collection: {},
    collection_view: {},
    collection_query: {},
    signed_urls: {},
  } as unknown as ExtendedRecordMap;
}

function sizedPage(bytes: number, character = "x"): ExtendedRecordMap {
  const recordMap = page();
  const baseBytes = Buffer.byteLength(JSON.stringify(recordMap));
  const paddingBytes = bytes - baseBytes - 12;
  const characterBytes = Buffer.byteLength(character);
  recordMap.signed_urls.padding =
    character.repeat(Math.floor(paddingBytes / characterBytes)) +
    "x".repeat(paddingBytes % characterBytes);
  assert.equal(Buffer.byteLength(JSON.stringify(recordMap)), bytes);
  return recordMap;
}

void describe("bounded Notion run snapshots", () => {
  void it("consumes an isolated JSON snapshot once", () => {
    const cache = createNotionRunCache();
    const original = page();
    cache.remember(ROOT, original);
    original.signed_urls.changed = "after discovery";
    const retained = cache.take(ROOT);
    assert.ok(retained);
    assert.notEqual(retained, original);
    assert.equal(retained.signed_urls.changed, undefined);
    assert.equal(cache.take(ROOT), undefined);
  });

  void it("evicts the oldest entry when 33 pages are retained", () => {
    const cache = createNotionRunCache();
    for (let index = 0; index < 33; index++)
      cache.remember(String(index), page());
    assert.equal(cache.take("0"), undefined);
    for (let index = 1; index < 33; index++)
      assert.ok(cache.take(String(index)));
  });

  void it("admits exactly 1 MiB but rejects larger UTF-8 snapshots", () => {
    const cache = createNotionRunCache();
    cache.remember(ROOT, sizedPage(1024 * 1024, "é"));
    cache.remember(CHILD, sizedPage(1024 * 1024 + 1, "é"));
    assert.ok(cache.take(ROOT));
    assert.equal(cache.take(CHILD), undefined);
  });

  void it("evicts by UTF-8 bytes at 8 MiB and releases consumed capacity", () => {
    const cache = createNotionRunCache();
    const large = sizedPage(1024 * 1024, "é");
    for (let index = 0; index < 9; index++)
      cache.remember(String(index), large);
    assert.equal(cache.take("0"), undefined);
    assert.ok(cache.take("1"));
    cache.remember("9", large);
    for (let index = 2; index <= 9; index++)
      assert.ok(cache.take(String(index)));
  });

  void it("replaces duplicate keys without double-counting retained bytes", () => {
    const cache = createNotionRunCache();
    const large = sizedPage(1024 * 1024);
    cache.remember("0", large);
    cache.remember("0", large);
    for (let index = 1; index < 8; index++)
      cache.remember(String(index), large);
    assert.ok(cache.take("0"));
    for (let index = 1; index < 8; index++)
      assert.ok(cache.take(String(index)));
  });

  void it("treats empty, invalid, and unserializable responses as misses", () => {
    const cache = createNotionRunCache();
    cache.remember("valid", page());
    const circular = page();
    Object.assign(circular, { circular });
    const invalid: unknown[] = [
      null,
      {},
      { block: {} },
      { block: [] },
      circular,
      { ...page(), toJSON: () => null },
      { ...page(), toJSON: () => ({ block: {} }) },
      { ...page(), signed_urls: { value: 1n } },
    ];
    for (const [index, value] of invalid.entries()) {
      assert.doesNotThrow(() =>
        cache.remember(String(index), value as ExtendedRecordMap),
      );
      assert.equal(cache.take(String(index)), undefined);
    }
    assert.ok(
      cache.take("valid"),
      "rejected entries must not evict a valid snapshot",
    );
  });

  void it("clears leftovers and keeps independent runs isolated", () => {
    const first = createNotionRunCache();
    const second = createNotionRunCache();
    first.remember(ROOT, page(ROOT, "First"));
    second.remember(ROOT, page(ROOT, "Second"));
    first.clear();
    assert.equal(first.take(ROOT), undefined);
    assert.equal(
      second.take(ROOT)?.block[ROOT]?.value.properties?.title?.[0]?.[0],
      "Second",
    );
  });
});

// Every HTTP boundary is intercepted before importing the ingestion modules. Synthetic
// loopback configuration also prevents inherited provider URLs or credentials being used.
const testEnv = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role",
  OPENAI_API_KEY: "synthetic-openai-key",
  OPENAI_BASE_URL: "http://127.0.0.1:54322/v1",
  NOTION_API_BASE_URL: "http://127.0.0.1:54323",
  LOG_GLOBAL_LEVEL: "off",
  LOG_DB_LEVEL: "off",
  LOG_INGESTION_LEVEL: "off",
  TELEMETRY_ENABLED: "false",
  INGEST_CONCURRENCY: "1",
  IMAGE_CHUNKS_ENABLED: "false",
};
const previousEnv = Object.fromEntries(
  Object.keys(testEnv).map((key) => [key, process.env[key]]),
);
Object.assign(process.env, testEnv);
let handleHttp: typeof fetch = async () => {
  throw new Error("HTTP boundary not configured");
};
const fetchMock = mock.method(
  globalThis,
  "fetch",
  (...args: Parameters<typeof fetch>) => handleHttp(...args),
);
const { runManualIngestion } = await import("@/lib/admin/manual-ingestor");
const { notion } = await import("@/lib/notion-api");

after(() => {
  fetchMock.mock.restore();
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

type StoredRow = Record<string, unknown>;
function databaseBoundary() {
  const documents = new Map<string, StoredRow>();
  const chunks = new Map<string, StoredRow[]>();
  const attempts: string[] = [];
  const unexpected: string[] = [];
  let embeddingCalls = 0;
  let sweeps = 0;
  let runCount = 0;
  handleHttp = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    const reply = (body: unknown, headers?: HeadersInit) =>
      new Response(method === "HEAD" ? null : JSON.stringify(body), {
        headers: { "Content-Type": "application/json", ...headers },
      });
    if (
      url.origin === "http://127.0.0.1:54322" &&
      url.pathname === "/v1/embeddings"
    ) {
      embeddingCalls++;
      const payload = (await request.json()) as { input: string[] };
      return reply({
        data: payload.input.map((_, index) => ({
          index,
          embedding: [0.25, 0.75],
        })),
      });
    }
    if (url.origin === "http://127.0.0.1:54321") {
      if (url.pathname === "/rest/v1/rpc/take_rag_snapshot") return reply(null);
      const table = url.pathname.split("/").at(-1);
      const id = url.searchParams.get("doc_id")?.replace(/^eq\./, "") ?? "";
      if (table === "rag_ingest_runs") {
        return reply(method === "POST" ? { id: `run-${++runCount}` } : null);
      }
      if (table === "rag_documents") {
        if (method === "GET") {
          if (
            url.searchParams.get("select") === "doc_id,last_sync_attempt_at"
          ) {
            sweeps++;
            assert.equal(url.searchParams.get("status"), "eq.active");
            assert.equal(
              url.searchParams.get("source_url"),
              "like.https://www.notion.so/%",
            );
            return reply(
              [...documents.values()]
                .filter(
                  (row) =>
                    row.status === "active" &&
                    String(row.source_url).startsWith("https://www.notion.so/"),
                )
                .map(({ doc_id, last_sync_attempt_at }) => ({
                  doc_id,
                  last_sync_attempt_at: last_sync_attempt_at ?? null,
                })),
            );
          }
          return reply(documents.get(id) ?? null);
        }
        const payload = (await request.json()) as StoredRow;
        if (method === "POST") {
          const docId = String(payload.doc_id);
          documents.set(docId, {
            status: "active",
            ...documents.get(docId),
            ...payload,
          });
        }
        if (method === "PATCH") {
          if (payload.last_sync_attempt_at) attempts.push(id);
          if (documents.has(id))
            documents.set(id, { ...documents.get(id), ...payload });
        }
        return reply(
          request.headers.get("prefer")?.includes("return=representation")
            ? [{ doc_id: id }]
            : null,
        );
      }
      if (table?.startsWith("rag_chunks")) {
        if (method === "HEAD")
          return reply(null, {
            "Content-Range": `0-0/${chunks.get(id)?.length ?? 0}`,
          });
        if (method === "GET") return reply(chunks.get(id) ?? []);
        if (method === "DELETE") {
          const hashes =
            url.searchParams.get("chunk_hash")?.slice(4, -1).split(",") ?? [];
          chunks.set(
            id,
            (chunks.get(id) ?? []).filter(
              (row) => !hashes.includes(String(row.chunk_hash)),
            ),
          );
          return reply(null);
        }
        if (method === "POST") {
          const rows = (await request.json()) as StoredRow[];
          for (const row of rows)
            chunks.set(String(row.doc_id), [
              ...(chunks.get(String(row.doc_id)) ?? []),
              row,
            ]);
          return reply(null);
        }
      }
      if (table === "admin_chat_config") return reply(null);
    }
    unexpected.push(`${method} ${url.origin}${url.pathname}`);
    throw new Error(
      `Unexpected external request: ${method} ${url.origin}${url.pathname}`,
    );
  };
  return {
    documents,
    chunks,
    attempts,
    unexpected,
    get embeddingCalls() {
      return embeddingCalls;
    },
    get sweeps() {
      return sweeps;
    },
  };
}

function seedActiveDocuments(documents: Map<string, StoredRow>, ids: string[]) {
  for (const id of ids) {
    const canonicalId = id.replaceAll("-", "");
    documents.set(canonicalId, {
      doc_id: canonicalId,
      raw_doc_id: id,
      source_url: `https://www.notion.so/${canonicalId}`,
      status: "active",
      last_sync_attempt_at: OLD_ATTEMPT,
    });
  }
}

async function ingest(
  events: Event[],
  options: {
    full?: boolean;
    deadlineAt?: number;
    emit?: (event: Event) => void;
  } = {},
) {
  await runManualIngestion(
    {
      mode: "notion_page",
      scope: "workspace",
      pageId: ROOT,
      ingestionType: options.full ? "full" : "partial",
      deadlineAt: options.deadlineAt,
      embeddingSpaceId: "openai/text-embedding-3-small/v1",
      embeddingModel: "text-embedding-3-small",
      embeddingProvider: "openai",
    },
    (event) => {
      events.push(event);
      options.emit?.(event);
    },
  );
}

void describe("real manual ingestion discovery reuse", () => {
  void it("fetches discovered root and child once and preserves stored document identity and hash skips", async (t) => {
    const db = databaseBoundary();
    const reads: string[] = [];
    t.mock.method(notion, "getPage", async (id: string) => {
      reads.push(id);
      return id === ROOT ? page(ROOT, "Root", [CHILD]) : page(CHILD, "Child");
    });
    const events: Event[] = [];
    await ingest(events);
    assert.deepEqual(reads.toSorted(), [ROOT, CHILD].toSorted());
    assert.deepEqual([...db.documents.keys()].toSorted(), [
      "28299029c0b481ce8999d425287d3d01",
      "28299029c0b481ce8999d425287d3d02",
    ]);
    assert.equal(
      db.documents.get("28299029c0b481ce8999d425287d3d01")?.raw_doc_id,
      ROOT,
    );
    assert.equal(
      db.documents.get("28299029c0b481ce8999d425287d3d02")?.raw_doc_id,
      CHILD,
    );
    assert.equal(
      db.chunks.get("28299029c0b481ce8999d425287d3d02")?.[0]?.title,
      "Child",
    );
    assert.equal(db.embeddingCalls, 2);
    assert.equal(db.attempts.length, 2);
    await ingest(events);
    assert.equal(
      db.embeddingCalls,
      2,
      "unchanged retained pages must skip embeddings by existing content hash",
    );
    const completion = events.findLast((e) => e.type === "complete");
    assert.equal(
      completion?.type === "complete" && completion.stats.documentsSkipped,
      2,
    );
    assert.equal(db.attempts.length, 4);
    assert.equal(db.sweeps, 0);
    for (const row of db.documents.values()) {
      assert.equal(row.status, "active");
      assert.notEqual(row.last_sync_attempt_at, OLD_ATTEMPT);
    }
    assert.deepEqual(db.unexpected, []);
  });

  void it("also reuses discovery pages for the selected linked-page scope", async (t) => {
    const db = databaseBoundary();
    const reads: string[] = [];
    t.mock.method(notion, "getPage", async (id: string) => {
      reads.push(id);
      return id === ROOT ? page(ROOT, "Root", [CHILD]) : page(CHILD, "Child");
    });
    await runManualIngestion(
      {
        mode: "notion_page",
        scope: "selected",
        pageId: ROOT,
        includeLinkedPages: true,
        ingestionType: "full",
        embeddingProvider: "openai",
        embeddingModel: "text-embedding-3-small",
      },
      () => {},
    );
    assert.deepEqual(reads.toSorted(), [ROOT, CHILD].toSorted());
    assert.equal(db.documents.size, 2);
    assert.equal(db.sweeps, 0);
    assert.deepEqual(db.unexpected, []);
  });

  void it("fetches again when a successful discovery map cannot be snapshotted", async (t) => {
    const db = databaseBoundary();
    let reads = 0;
    t.mock.method(notion, "getPage", async () => {
      const recordMap = page();
      if (++reads === 1) Object.assign(recordMap, { circular: recordMap });
      return recordMap;
    });
    const events: Event[] = [];
    await ingest(events, { full: true });
    assert.equal(reads, 2);
    assert.equal(db.documents.size, 1);
    assert.equal(db.sweeps, 1);
    assert.ok(
      events.some(
        (event) => event.type === "complete" && event.status === "success",
      ),
    );
    assert.ok(
      events.some(
        (event) => event.type === "complete" && event.pagesNotReached === 0,
      ),
    );
    assert.ok(
      !events.some(
        (event) =>
          event.type === "log" && event.message.includes("processing deadline"),
      ),
    );
    assert.deepEqual(db.unexpected, []);
  });

  void it("fetches a discovery failure and uncached database row during processing and suppresses incomplete sweep", async (t) => {
    const db = databaseBoundary();
    const reads: string[] = [];
    const root = page(ROOT, "Root", [CHILD]);
    Object.assign(root.block, {
      [COLLECTION]: {
        value: {
          id: COLLECTION,
          type: "collection_view",
          alive: true,
          collection_id: COLLECTION,
          view_ids: [VIEW],
        },
      },
    });
    let childReads = 0;
    t.mock.method(notion, "getPage", async (id: string) => {
      reads.push(id);
      if (id === CHILD && ++childReads === 1)
        throw new Error("discovery unavailable");
      return id === ROOT ? root : page(id, id === ROW ? "Row" : "Child");
    });
    t.mock.method(notion, "getCollectionData", async () => ({
      result: { blockIds: [ROW] },
      recordMap: {},
    }));
    const events: Event[] = [];
    await ingest(events, { full: true });
    assert.equal(reads.filter((id) => id === ROOT).length, 1);
    assert.equal(reads.filter((id) => id === CHILD).length, 2);
    assert.equal(reads.filter((id) => id === ROW).length, 1);
    assert.equal(db.documents.size, 3);
    assert.equal(db.sweeps, 0);
    assert.ok(
      events.some(
        (e) =>
          e.type === "log" && e.message.includes("traversal did not complete"),
      ),
    );
    assert.ok(
      events.some(
        (event) => event.type === "complete" && event.pagesNotReached === 0,
      ),
    );
    assert.ok(
      !events.some(
        (event) =>
          event.type === "log" && event.message.includes("processing deadline"),
      ),
    );
    assert.deepEqual(db.unexpected, []);
  });

  void it("never sweeps a deadline-skipped active page at the 25% retirement threshold", async (t) => {
    const db = databaseBoundary();
    seedActiveDocuments(db.documents, [ROOT, CHILD, ROW, LEAF]);
    const reads: string[] = [];
    t.mock.method(notion, "getPage", async (id: string) => {
      reads.push(id);
      return page(id, id, id === ROOT ? [CHILD, ROW, LEAF] : []);
    });
    let now = Date.parse("2025-01-01T00:00:00.000Z");
    const deadlineAt = now + 1000;
    t.mock.method(Date, "now", () => now);
    const events: Event[] = [];
    await ingest(events, {
      full: true,
      deadlineAt,
      emit: (event) => {
        if (event.type === "queue" && event.current === 3) now = deadlineAt;
      },
    });

    assert.deepEqual(reads, [ROOT, CHILD, ROW, LEAF]);
    const skipped = db.documents.get(LEAF.replaceAll("-", ""));
    assert.equal(
      skipped?.status,
      "active",
      "a discovered but unprocessed page must not retire",
    );
    assert.equal(skipped?.last_sync_attempt_at, OLD_ATTEMPT);
    assert.equal(skipped?.missing_detected_at, undefined);
    assert.equal(
      db.sweeps,
      0,
      "incomplete processing must not query sweep candidates",
    );
    assert.deepEqual(
      db.attempts,
      [ROOT, CHILD, ROW].map((id) => id.replaceAll("-", "")),
    );
    const complete = events.findLast((event) => event.type === "complete");
    assert.ok(complete?.type === "complete");
    assert.equal(complete.pagesNotReached, 1);
    assert.equal(complete.stats.documentsProcessed, 3);
    assert.equal(complete.stats.errorCount, 0);
    assert.equal(complete.status, "success");
    assert.match(complete.message ?? "", /1 page\(s\) not visited/);
    assert.ok(
      events.some(
        (event) =>
          event.type === "log" &&
          event.level === "warn" &&
          event.message.includes("processing deadline"),
      ),
    );
    assert.ok(
      !events.some(
        (event) =>
          event.type === "log" &&
          event.message.includes("traversal did not complete"),
      ),
    );
    assert.deepEqual(db.unexpected, []);
  });

  void it("never queries the sweep or stamps attempts when every discovered page misses the deadline", async (t) => {
    const db = databaseBoundary();
    seedActiveDocuments(db.documents, [ROOT, CHILD]);
    t.mock.method(notion, "getPage", async (id: string) =>
      page(id, id, id === ROOT ? [CHILD] : []),
    );
    t.mock.method(Date, "now", () => Date.parse("2025-01-01T00:00:00.000Z"));
    const events: Event[] = [];
    await ingest(events, { full: true, deadlineAt: 0 });
    assert.equal(db.sweeps, 0);
    assert.deepEqual(db.attempts, []);
    for (const row of db.documents.values()) {
      assert.equal(row.status, "active");
      assert.equal(row.last_sync_attempt_at, OLD_ATTEMPT);
    }
    const complete = events.findLast((event) => event.type === "complete");
    assert.ok(complete?.type === "complete");
    assert.equal(complete.pagesNotReached, 2);
    assert.equal(complete.stats.documentsProcessed, 0);
    assert.equal(complete.stats.documentsSkipped, 0);
    assert.equal(complete.stats.errorCount, 0);
    assert.equal(complete.status, "success");
    assert.deepEqual(db.unexpected, []);
  });

  for (const elapsed of [false, true]) {
    void it(`retires a truly missing page after complete processing with a ${elapsed ? "now-elapsed" : "future"} deadline`, async (t) => {
      const db = databaseBoundary();
      seedActiveDocuments(db.documents, [ROOT, CHILD, ROW, LEAF]);
      t.mock.method(notion, "getPage", async (id: string) =>
        page(id, id, id === ROOT ? [CHILD, ROW] : []),
      );
      let now = Date.parse("2025-01-01T00:00:00.000Z");
      const deadlineAt = now + 1000;
      t.mock.method(Date, "now", () => now);
      const events: Event[] = [];
      await ingest(events, {
        full: true,
        deadlineAt,
        emit: (event) => {
          if (elapsed && event.type === "queue" && event.current === 3)
            now = deadlineAt;
        },
      });
      assert.equal(db.sweeps, 1);
      assert.equal(
        db.documents.get(LEAF.replaceAll("-", ""))?.status,
        "missing",
      );
      for (const id of [ROOT, CHILD, ROW])
        assert.equal(
          db.documents.get(id.replaceAll("-", ""))?.status,
          "active",
        );
      const complete = events.findLast((event) => event.type === "complete");
      assert.ok(complete?.type === "complete");
      assert.equal(complete.pagesNotReached, 0);
      assert.equal(complete.stats.documentsProcessed, 3);
      assert.equal(complete.stats.errorCount, 0);
      assert.equal(complete.status, "success");
      assert.doesNotMatch(complete.message ?? "", /Deadline reached/);
      assert.deepEqual(db.unexpected, []);
    });
  }

  void it("falls back to fetching oversized and FIFO-evicted discovery maps without disabling a complete sweep", async (t) => {
    const db = databaseBoundary();
    const children = Array.from(
      { length: 33 },
      (_, index) =>
        `28299029-c0b4-81ce-8999-${String(index + 100).padStart(12, "0")}`,
    );
    const reads: string[] = [];
    t.mock.method(notion, "getPage", async (id: string) => {
      reads.push(id);
      if (id === ROOT) return page(ROOT, "Root", children);
      const child = page(id, "Child");
      if (id === children[32])
        child.signed_urls.padding = "x".repeat(1024 * 1024);
      return child;
    });
    const events: Event[] = [];
    await ingest(events, { full: true });
    assert.equal(reads.filter((id) => id === ROOT).length, 2);
    assert.equal(reads.filter((id) => id === children[0]).length, 1);
    assert.equal(reads.filter((id) => id === children[32]).length, 2);
    assert.equal(db.documents.size, 34);
    assert.equal(db.sweeps, 1);
    assert.deepEqual(db.unexpected, []);
  });

  void it("keeps simultaneous runs isolated even when the same page changes between discoveries", async (t) => {
    const db = databaseBoundary();
    let reads = 0;
    t.mock.method(notion, "getPage", async () =>
      page(ROOT, ++reads === 1 ? "First" : "Second"),
    );
    let release!: () => void;
    let discovered!: () => void;
    const reached = new Promise<void>((resolve) => {
      discovered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstEvents: Event[] = [];
    const first = runManualIngestion(
      {
        mode: "notion_page",
        scope: "workspace",
        pageId: ROOT,
        embeddingProvider: "openai",
        embeddingModel: "text-embedding-3-small",
      },
      async (event) => {
        firstEvents.push(event);
        if (event.type === "progress" && event.step === "collected") {
          discovered();
          await gate;
        }
      },
    );
    await reached;
    try {
      await ingest([]);
    } finally {
      release();
    }
    await first;
    assert.equal(reads, 2);
    assert.ok(
      firstEvents.some((e) => e.type === "queue" && e.title === "First"),
    );
    assert.equal(
      db.chunks.get("28299029c0b481ce8999d425287d3d01")?.at(-1)?.title,
      "First",
    );
    assert.deepEqual(db.unexpected, []);
  });

  void it("discards leftovers after processing failure and deadline termination", async (t) => {
    const db = databaseBoundary();
    let reads = 0;
    t.mock.method(notion, "getPage", async (id: string) => {
      reads++;
      return page(id, `Revision ${reads}`, id === ROOT ? [CHILD] : []);
    });
    let failed = false;
    const failedEvents: Event[] = [];
    await ingest(failedEvents, {
      emit: (event) => {
        if (
          !failed &&
          event.type === "log" &&
          event.message.startsWith("Fetching Notion")
        ) {
          failed = true;
          throw new Error("processing sink failed");
        }
      },
    });
    assert.ok(
      failedEvents.some(
        (event) =>
          event.type === "complete" && event.status === "completed_with_errors",
      ),
    );
    const deadlineEvents: Event[] = [];
    const attemptsBeforeDeadline = db.attempts.length;
    await ingest(deadlineEvents, { deadlineAt: 0 });
    assert.equal(db.attempts.length, attemptsBeforeDeadline);
    assert.ok(
      deadlineEvents.some(
        (event) => event.type === "complete" && event.pagesNotReached === 2,
      ),
    );
    const final: Event[] = [];
    await ingest(final);
    assert.equal(reads, 6);
    assert.ok(
      final.some((e) => e.type === "queue" && e.title === "Revision 5"),
    );
    assert.deepEqual(db.unexpected, []);
  });
});
