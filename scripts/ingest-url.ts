// scripts/ingest-url.ts
import pMap from "p-map";

import { resolveEmbeddingSpace } from "../lib/core/embedding-spaces";
import { ingestionLogger } from "../lib/logging/logger";
import {
  type EmbedBatchOptions,
  type IngestRunStats,
} from "../lib/rag";
import {
  formatRunSummary,
  ingestPreparedDocument,
  type IngestReporter,
  withIngestRun,
} from "../lib/rag/pipeline";
import { fetchUrlDocument } from "../lib/rag/sources/url";

const INGEST_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.INGEST_CONCURRENCY ?? "4", 10),
);

const DEFAULT_EMBEDDING_SELECTION = resolveEmbeddingSpace({
  embeddingSpaceId: process.env.EMBEDDING_SPACE_ID ?? null,
  embeddingModelId: process.env.EMBEDDING_MODEL ?? null,
  provider: process.env.EMBEDDING_PROVIDER ?? process.env.LLM_PROVIDER ?? null,
  version: process.env.EMBEDDING_VERSION ?? null,
});
const EMBEDDING_OPTIONS: EmbedBatchOptions = {
  provider: DEFAULT_EMBEDDING_SELECTION.provider,
  embeddingModelId: DEFAULT_EMBEDDING_SELECTION.embeddingModelId,
  embeddingSpaceId: DEFAULT_EMBEDDING_SELECTION.embeddingSpaceId,
  version: DEFAULT_EMBEDDING_SELECTION.version,
};

const loggerReporter: IngestReporter = {
  log: (level, message) => {
    if (level === "info") {
      ingestionLogger.info(`[ingest-url] ${message}`);
    } else {
      ingestionLogger.error(`[ingest-url] ${message}`);
    }
  },
};

type RunMode = {
  type: "full" | "partial";
};

type ParsedArgs = {
  mode: RunMode;
  urls: string[];
};

function parseArgs(defaultType: "full" | "partial"): ParsedArgs {
  const raw = process.argv.slice(2);
  const urls: string[] = [];
  let mode: RunMode = { type: defaultType };

  for (const element of raw) {
    const arg = element!;

    if (arg === "--full" || arg === "--mode=full") {
      mode = { type: "full" };
      continue;
    }

    if (arg === "--partial" || arg === "--mode=partial") {
      mode = { type: "partial" };
      continue;
    }

    if (arg.startsWith("--mode=")) {
      const value = arg.split("=")[1];
      if (value === "full" || value === "partial") {
        mode = { type: value };
      }
      continue;
    }

    urls.push(arg);
  }

  return { mode, urls };
}

async function ingestUrl(
  url: string,
  stats: IngestRunStats,
  ingestionType: RunMode["type"],
): Promise<void> {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    stats.documentsProcessed += 1;
    stats.documentsSkipped += 1;
    ingestionLogger.error(
      "[ingest-url] Empty URL provided; skipping ingestion.",
    );
    return;
  }

  const doc = await fetchUrlDocument(normalizedUrl);
  await ingestPreparedDocument({
    doc,
    ingestionType,
    embedding: EMBEDDING_OPTIONS,
    stats,
    reporter: loggerReporter,
  });
}

async function main(): Promise<void> {
  console.log("Starting external URL ingestion...");

  const { mode, urls } = parseArgs("partial");
  const targets = urls.filter(Boolean);

  if (targets.length === 0) {
    console.error(
      "Usage: pnpm tsx scripts/ingest-url.ts [--full|--partial] <url> [url...]",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Ingesting ${targets.length} URL(s)...`);

  try {
    const result = await withIngestRun(
      {
        source: "web",
        ingestion_type: mode.type,
        metadata: {
          urlCount: targets.length,
          embeddingProvider: DEFAULT_EMBEDDING_SELECTION.provider,
          embeddingSpaceId: DEFAULT_EMBEDDING_SELECTION.embeddingSpaceId,
          embeddingModelId: DEFAULT_EMBEDDING_SELECTION.embeddingModelId,
          embeddingVersion: DEFAULT_EMBEDDING_SELECTION.version,
        },
      },
      async ({ stats, errorLogs }) => {
        await pMap(
          targets,
          async (url) => {
            try {
              await ingestUrl(url, stats, mode.type);
            } catch (err) {
              stats.errorCount += 1;
              const message =
                err instanceof Error ? err.message : JSON.stringify(err);
              errorLogs.push({ context: url, message });
              ingestionLogger.error(
                `[ingest-url] Failed to ingest ${url}: ${message}`,
              );
            }
          },
          { concurrency: INGEST_CONCURRENCY },
        );
      },
    );

    console.log(formatRunSummary(result));

    if (result.stats.errorCount > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("\n--- Ingestion Failed ---");
    console.error(err);
    throw err;
  }
}

await main();
