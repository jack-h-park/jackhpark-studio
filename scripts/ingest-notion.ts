// scripts/ingest-notion.ts
//
// Thin CLI over the shared manual-ingestion path (`lib/admin/manual-ingestor.ts`).
//
// This script used to carry its own traversal, its own per-page loop, its own run
// bookkeeping and its own sweep — a second implementation of what the admin dashboard
// already does. The copies had drifted, and only one of them worked:
//
//   - It built its own `new NotionAPI()`, ignoring NOTION_API_BASE_URL, so it hit
//     www.notion.so/api/v3 — which answers 403 without a token, and no token is sent.
//   - It handed a bare `notion.getPage` to `getAllPagesInSpace`. Record-map entries come
//     back doubly nested (`{value: {value: …}}`); notion-utils reads `block[key].value.type`,
//     saw `undefined` on every block, and matched zero page-like blocks. The workspace
//     crawl returned one page — the root — and called that the workspace.
//
// Both neighbours normalize (`lib/get-site-map.ts` wraps its fetcher;
// `lib/admin/manual-ingestor.ts` reads through `unwrapRecordValue`), and this was the one
// caller that did neither. Rather than repair a second traversal, the CLI now calls the
// one that works, so there is a single ingest path to keep correct.
import {
  type ManualIngestionEvent,
  type ManualIngestionRequest,
  runManualIngestion,
} from "../lib/admin/manual-ingestor";
import { formatRunSummary } from "../lib/rag/pipeline";

type RunModeType = "full" | "partial";
type CompleteEvent = Extract<ManualIngestionEvent, { type: "complete" }>;

function parseRunMode(defaultType: RunModeType): RunModeType {
  const args = process.argv.slice(2);
  let mode: RunModeType = defaultType;

  for (const arg_ of args) {
    const arg = arg_!;

    if (arg === "--full" || arg === "--mode=full") {
      mode = "full";
      continue;
    }

    if (arg === "--partial" || arg === "--mode=partial") {
      mode = "partial";
      continue;
    }

    if (arg.startsWith("--mode=")) {
      const value = arg.split("=")[1];
      if (value === "full" || value === "partial") {
        mode = value;
      }
      continue;
    }
  }

  return mode;
}

function parseTargetPageId(): string | null {
  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--page" || arg === "--page-id") {
      const candidate = args[index + 1];
      if (candidate && !candidate.startsWith("--")) {
        return candidate;
      }
    }

    if (arg.startsWith("--page=")) {
      const value = arg.split("=", 2)[1];
      if (value) {
        return value;
      }
    }

    if (arg.startsWith("--page-id=")) {
      const value = arg.split("=", 2)[1];
      if (value) {
        return value;
      }
    }
  }

  return null;
}

function buildRequest(
  ingestionType: RunModeType,
  targetPageId: string | null,
): ManualIngestionRequest {
  // `source` is the ingest-runs filter facet, so a CLI run stays distinguishable from one
  // started in the dashboard even though both take the same code path.
  const base = { ingestionType, source: "cli/notion-page" } as const;

  if (targetPageId) {
    return {
      ...base,
      mode: "notion_page",
      scope: "selected",
      pageIds: [targetPageId],
      includeLinkedPages: false,
    };
  }

  // Workspace scope resolves the root from NOTION_ROOT_PAGE_ID / site.config itself.
  return { ...base, mode: "notion_page", scope: "workspace" };
}

async function main() {
  const ingestionType = parseRunMode("full");
  const targetPageId = parseTargetPageId();
  const request = buildRequest(ingestionType, targetPageId);

  console.log("Starting Notion ingestion...");
  if (targetPageId) {
    console.log(`[ingest-notion] single page: ${targetPageId}`);
  }
  console.log(`[ingest-notion] mode: ${ingestionType}`);

  const started = Date.now();
  const outcome: { completion: CompleteEvent | null } = { completion: null };

  const emit = (event: ManualIngestionEvent) => {
    switch (event.type) {
      case "run":
        if (event.runId) console.log(`[ingest-notion] run ${event.runId}`);
        break;
      
      case "log":
        if (event.level === "error") console.error(event.message);
        else if (event.level === "warn") console.warn(event.message);
        else console.log(event.message);
        break;
      
      case "queue":
        console.log(
          `[${event.current}/${event.total}] ${event.title ?? event.pageId}`,
        );
        break;
      
      case "complete":
        outcome.completion = event;
        break;
      
      // `progress` drives the dashboard's bar; it says nothing a log line does not.
      default:
        break;
    }
  };

  try {
    await runManualIngestion(request, emit);
  } catch (err) {
    console.error("\n--- Ingestion Failed ---");
    console.error(err);
    throw err;
  }

  const completion = outcome.completion;
  if (!completion) {
    // runManualIngestion always emits `complete`, including on failure. Reaching here means
    // the contract changed; treat it as a failure rather than reporting a success we cannot
    // substantiate.
    console.error(
      "\n--- Ingestion produced no completion event; treating as failed ---",
    );
    process.exitCode = 1;
    return;
  }

  const { status, stats, message } = completion;
  // `formatRunSummary` reads only stats/status/durationMs. Per-document failures already
  // reached the console as error-level log events while they happened, and the run record
  // holds them; the completion event does not carry them again.
  console.log(
    formatRunSummary({
      stats,
      status,
      durationMs: Date.now() - started,
      errorLogs: [],
    }),
  );
  if (message) console.log(message);

  if (status === "failed" || stats.errorCount > 0) {
    process.exitCode = 1;
  }
}

await main();
