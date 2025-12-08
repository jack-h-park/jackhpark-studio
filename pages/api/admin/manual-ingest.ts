import type { NextApiRequest, NextApiResponse } from "next";
import { parsePageId } from "notion-utils";

import {
  type ManualIngestionEvent,
  type ManualIngestionRequest,
  runManualIngestion,
} from "../../../lib/admin/manual-ingestor";

type ManualIngestionBody = ManualIngestionRequest & {
  mode?: unknown;
  pageId?: unknown;
  pageIds?: unknown;
  url?: unknown;
  ingestionType?: unknown;
  includeLinkedPages?: unknown;
  scope?: unknown;
  embeddingProvider?: unknown;
  embeddingModel?: unknown;
  embeddingSpaceId?: unknown;
};

function parsePageIds(raw: unknown): string[] {
  const normalized = new Set<string>();
  const addValue = (value?: string) => {
    if (!value) {
      return;
    }
    const cleaned = value.trim();
    if (!cleaned) {
      return;
    }
    const parsed = parsePageId(cleaned, { uuid: true });
    if (parsed) {
      normalized.add(parsed);
    }
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === "string") {
        addValue(entry);
      }
    }
  } else if (typeof raw === "string") {
    for (const part of raw.split(/[\n,]+/)) {
      addValue(part);
    }
  }

  return Array.from(normalized);
}

function validateBody(body: ManualIngestionBody): ManualIngestionRequest {
  if (body.mode === "notion_page") {
    const ingestionType = body.ingestionType === "full" ? "full" : "partial";
    const rawIncludeLinkedPages = body.includeLinkedPages;
    const includeLinkedPages =
      typeof rawIncludeLinkedPages === "boolean"
        ? rawIncludeLinkedPages
        : typeof rawIncludeLinkedPages === "string"
          ? rawIncludeLinkedPages === "true"
          : true;

    const normalizedPageIds = parsePageIds(body.pageIds);
    const fallbackPageId =
      typeof body.pageId === "string"
        ? parsePageId(body.pageId, { uuid: true })
        : undefined;
    const allPageIds =
      normalizedPageIds.length > 0
        ? normalizedPageIds
        : fallbackPageId
          ? [fallbackPageId]
          : [];

    const requestedScope =
      body.scope === "workspace"
        ? "workspace"
        : body.scope === "selected"
          ? "selected"
          : includeLinkedPages
            ? "workspace"
            : "selected";

    if (requestedScope === "selected" && allPageIds.length === 0) {
      throw new Error("Missing Notion page ID.");
    }

    const embeddingModel =
      typeof body.embeddingModel === "string" &&
      body.embeddingModel.trim().length > 0
        ? body.embeddingModel.trim()
        : undefined;
    const embeddingSpaceId =
      typeof body.embeddingSpaceId === "string" &&
      body.embeddingSpaceId.trim().length > 0
        ? body.embeddingSpaceId.trim()
        : embeddingModel;

    return {
      mode: "notion_page",
      scope: requestedScope,
      pageId: allPageIds[0] ?? undefined,
      pageIds:
        requestedScope === "selected" && allPageIds.length > 0
          ? allPageIds
          : undefined,
      ingestionType,
      includeLinkedPages,
      embeddingModel,
      embeddingSpaceId,
    };
  }

  if (body.mode === "url") {
    if (typeof body.url !== "string") {
      throw new Error("Missing URL.");
    }

    const trimmed = body.url.trim();
    let parsed: URL;

    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error("Invalid URL.");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only HTTP and HTTPS URLs are supported.");
    }

    const ingestionType = body.ingestionType === "full" ? "full" : "partial";
    const embeddingModel =
      typeof body.embeddingModel === "string" &&
      body.embeddingModel.trim().length > 0
        ? body.embeddingModel.trim()
        : undefined;
    const embeddingSpaceId =
      typeof body.embeddingSpaceId === "string" &&
      body.embeddingSpaceId.trim().length > 0
        ? body.embeddingSpaceId.trim()
        : embeddingModel;

    return {
      mode: "url",
      url: parsed.toString(),
      ingestionType,
      embeddingModel,
      embeddingSpaceId,
    };
  }

  throw new Error("Unsupported ingestion mode.");
}

export const config = {
  runtime: "nodejs",
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).send("Method Not Allowed");
    return;
  }

  let request: ManualIngestionRequest;
  try {
    request = validateBody((req.body ?? {}) as ManualIngestionBody);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid payload.";
    res.status(400).json({ error: message });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: ManualIngestionEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const close = () => {
    if (!res.writableEnded) {
      res.end();
    }
  };

  req.on("close", close);

  try {
    await runManualIngestion(request, send);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    send({
      type: "log",
      level: "error",
      message: `Manual ingestion aborted: ${message}`,
    });
    send({
      type: "complete",
      status: "failed",
      message: `Manual ingestion failed: ${message}`,
      runId: null,
      stats: {
        documentsProcessed: 0,
        documentsAdded: 0,
        documentsUpdated: 0,
        documentsSkipped: 0,
        chunksAdded: 0,
        chunksUpdated: 0,
        charactersAdded: 0,
        charactersUpdated: 0,
        errorCount: 1,
      },
    });
  } finally {
    close();
  }
}
