// scripts/ingest-notion.ts
import { NotionAPI } from "notion-client";
import { type ExtendedRecordMap } from "notion-types";
import { getAllPagesInSpace } from "notion-utils";
import pMap from "p-map";

import { rootNotionPageId as configRootNotionPageId } from "../lib/config";
import { resolveEmbeddingSpace } from "../lib/core/embedding-spaces";
import { supabaseClient } from "../lib/core/supabase";
import {
  type EmbedBatchOptions,
  type IngestRunErrorLog,
  type IngestRunStats,
} from "../lib/rag";
import { debugIngestionLog } from "../lib/rag/debug";
import {
  formatRunSummary,
  ingestPreparedDocument,
  type IngestReporter,
  withIngestRun,
} from "../lib/rag/pipeline";
import {
  markAttempt,
  markFetchFailure,
} from "../lib/rag/ragDocumentLifecycle";
import {
  deriveNotionDocIdentifiers,
  prepareNotionPageDocument,
} from "../lib/rag/sources/notion";

const notion = new NotionAPI();
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
const DEFAULT_ROOT_PAGE_ID = configRootNotionPageId;

const consoleReporter: IngestReporter = {
  log: (level, message) => {
    if (level === "info") {
      console.log(message);
    } else if (level === "warn") {
      console.warn(message);
    } else {
      console.error(message);
    }
  },
};

type RunMode = {
  type: "full" | "partial";
};

function parseRunMode(defaultType: "full" | "partial"): RunMode {
  const args = process.argv.slice(2);
  let mode: RunMode = { type: defaultType };

  for (const arg_ of args) {
    const arg = arg_!;

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
const INGEST_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.INGEST_CONCURRENCY ?? "2", 10),
);

async function ingestPage(
  pageId: string,
  recordMap: ExtendedRecordMap,
  stats: IngestRunStats,
  ingestionType: RunMode["type"],
): Promise<void> {
  const doc = prepareNotionPageDocument(recordMap, pageId);
  await ingestPreparedDocument({
    doc,
    ingestionType,
    embedding: EMBEDDING_OPTIONS,
    stats,
    reporter: consoleReporter,
  });
}

async function ingestWorkspace(
  rootPageId: string,
  stats: IngestRunStats,
  errorLogs: IngestRunErrorLog[],
  ingestionType: RunMode["type"],
) {
  console.log(`\nFetching all pages in Notion space (root: ${rootPageId})...`);
  const pageMap = await getAllPagesInSpace(
    rootPageId,
    undefined,
    async (pageId) => {
      const { canonicalId } = deriveNotionDocIdentifiers(pageId);
      await markAttempt(supabaseClient, canonicalId);
      try {
        return await notion.getPage(pageId);
      } catch (err) {
        await markFetchFailure(supabaseClient, canonicalId, err);
        throw err;
      }
    },
  );

  console.log(`Found ${Object.keys(pageMap).length} total pages.`);

  const entries = Object.entries(pageMap).filter(
    (entry): entry is [string, ExtendedRecordMap] => Boolean(entry[1]),
  );

  if (entries.length === 0) {
    console.log("No pages to ingest.");
    return;
  }

  await pMap(
    entries,
    async ([pageId, recordMap]) => {
      try {
        await ingestPage(pageId, recordMap, stats, ingestionType);
      } catch (err) {
        stats.errorCount += 1;
        const message =
          err instanceof Error ? err.message : JSON.stringify(err);
        errorLogs.push({
          doc_id: pageId,
          message,
        });
        console.error(`Failed to ingest Notion page ${pageId}: ${message}`);
      }
    },
    { concurrency: INGEST_CONCURRENCY },
  );
}

async function ingestSinglePage(
  pageId: string,
  stats: IngestRunStats,
  errorLogs: IngestRunErrorLog[],
  ingestionType: RunMode["type"],
) {
  debugIngestionLog("single-page-mode", { pageId });
  const { canonicalId } = deriveNotionDocIdentifiers(pageId);
  try {
    await markAttempt(supabaseClient, canonicalId);
    const recordMap = await notion.getPage(pageId);
    await ingestPage(pageId, recordMap, stats, ingestionType);
  } catch (err) {
    stats.errorCount += 1;
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    errorLogs.push({
      doc_id: pageId,
      message,
    });
    await markFetchFailure(supabaseClient, canonicalId, err);
    console.error(`Failed to ingest Notion page ${pageId}: ${message}`);
  }
}

async function main() {
  const rootPageId = process.env.NOTION_ROOT_PAGE_ID ?? DEFAULT_ROOT_PAGE_ID;
  if (!rootPageId) {
    throw new Error(
      "Missing Notion root page ID. Set NOTION_ROOT_PAGE_ID or configure it in site.config.ts.",
    );
  }

  console.log("Starting Notion ingestion...");

  const mode = parseRunMode("full");
  const targetPageId = parseTargetPageId();

  try {
    const result = await withIngestRun(
      {
        source: "notion",
        ingestion_type: mode.type,
        metadata: {
          rootPageId,
          embeddingProvider: DEFAULT_EMBEDDING_SELECTION.provider,
          embeddingSpaceId: DEFAULT_EMBEDDING_SELECTION.embeddingSpaceId,
          embeddingModelId: DEFAULT_EMBEDDING_SELECTION.embeddingModelId,
          embeddingVersion: DEFAULT_EMBEDDING_SELECTION.version,
        },
      },
      async ({ stats, errorLogs }) => {
        if (targetPageId) {
          console.log("[ingest-notion] ingesting single page", {
            targetPageId,
          });
          await ingestSinglePage(targetPageId, stats, errorLogs, mode.type);
        } else {
          await ingestWorkspace(rootPageId, stats, errorLogs, mode.type);
        }
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
