// scripts/ingest-interview-bank.ts
//
// Thin CLI over the shared manual-ingestion path, for the interview Q&A bank.
// Mirrors scripts/ingest-notion.ts: flags and console rendering only, no ingestion logic.
//
//   pnpm ingest:interview-bank [--full|--partial]
import {
  type ManualIngestionEvent,
  runManualIngestion,
} from "../lib/admin/manual-ingestor";
import { formatRunSummary } from "../lib/rag/pipeline";

type CompleteEvent = Extract<ManualIngestionEvent, { type: "complete" }>;

function parseRunMode(defaultType: "full" | "partial"): "full" | "partial" {
  for (const arg of process.argv.slice(2)) {
    if (arg === "--full" || arg === "--mode=full") return "full";
    if (arg === "--partial" || arg === "--mode=partial") return "partial";
  }
  return defaultType;
}

async function main() {
  const ingestionType = parseRunMode("partial");
  console.log(`Starting interview bank ingestion (${ingestionType})...`);

  const started = Date.now();
  const outcome: { completion: CompleteEvent | null } = { completion: null };

  await runManualIngestion(
    { mode: "interview_bank", ingestionType, source: "cli/interview-bank" },
    (event) => {
      switch (event.type) {
        case "run":
          if (event.runId) console.log(`[interview-bank] run ${event.runId}`);
          break;

        case "log":
          if (event.level === "error") console.error(event.message);
          else if (event.level === "warn") console.warn(event.message);
          else console.log(event.message);
          break;

        case "queue":
          console.log(`[${event.current}/${event.total}] ${event.title}`);
          break;

        case "complete":
          outcome.completion = event;
          break;

        default:
          break;
      }
    },
  );

  const completion = outcome.completion;
  if (!completion) {
    console.error("\n--- No completion event; treating as failed ---");
    process.exitCode = 1;
    return;
  }

  const { status, stats, message } = completion;
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

try {
  await main();
} catch (err) {
  console.error("\n--- Interview bank ingestion failed ---");
  console.error(err);
  process.exitCode = 1;
}
