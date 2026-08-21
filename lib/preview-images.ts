import ky from "ky";
import lqip from "lqip-modern";
import {
  type ExtendedRecordMap,
  type PreviewImage,
  type PreviewImageMap,
} from "notion-types";
import { getPageImageUrls, normalizeUrl } from "notion-utils";
import pMap from "p-map";
import pMemoize from "p-memoize";

import { defaultPageCover, defaultPageIcon } from "./config";
import { db } from "./db";
import { notionLogger } from "./logging/logger";
import { mapImageUrl } from "./map-image-url";
import { normalizeNotionRecordMap } from "./rag/notion-record-value";

export async function getPreviewImageMap(
  recordMap: ExtendedRecordMap,
): Promise<PreviewImageMap> {
  // The render path ships doubly-nested record entries (`block[id].value.value`)
  // while notion-utils reads `block[id].value` directly. Without unwrapping,
  // this scan silently finds zero URLs and every page gets an empty map — the
  // whole LQIP feature quietly does nothing. Scoped to the scan on purpose:
  // the recordMap handed to react-notion-x keeps its original shape.
  const urls: string[] = getPageImageUrls(normalizeNotionRecordMap(recordMap), {
    mapImageUrl,
  })
    .concat([defaultPageIcon, defaultPageCover].filter(Boolean))
    .filter(Boolean);

  const results = await pMap(
    urls,
    async (url) => {
      const cacheKey = normalizeUrl(url);
      return { url, cacheKey, ...(await getPreviewImage(url, { cacheKey })) };
    },
    {
      concurrency: 8,
    },
  );

  reportPreviewImageFailures(results);

  return Object.fromEntries(
    results.map(({ cacheKey, image }) => [cacheKey, image]),
  );
}

/**
 * Individual failures are expected and harmless (an expired attachment URL just
 * loses its blur placeholder), so they are only logged at debug. What is *not*
 * visible per-URL is a systemic failure: production once produced a 133-entry
 * map in which every remote fetch had failed and only the 2 inline `data:` URIs
 * carried real placeholder data. Nothing surfaced that, because each failure
 * looked individually unremarkable. This summary exists to make the ratio
 * loud — and to escalate when the remote fetches fail wholesale.
 */
function reportPreviewImageFailures(
  results: readonly PreviewImageOutcome[],
): void {
  const summary = summarizePreviewImageResults(results);
  if (!summary) return;

  if (summary.severity === "total") {
    notionLogger.error(
      "[preview-images] every remote placeholder fetch failed",
      summary.payload,
    );
    return;
  }

  notionLogger.info(
    "[preview-images] some placeholders unavailable",
    summary.payload,
  );
}

export type PreviewImageOutcome = {
  url: string;
  image: PreviewImage | null;
  reason?: string;
};

export type PreviewImageFailureSummary = {
  severity: "partial" | "total";
  payload: {
    total: number;
    failed: number;
    remoteTotal: number;
    remoteFailed: number;
    reasons: Record<string, number>;
    sampleUrl?: string;
  };
};

/** Split out from the logging call so the escalation rule is unit-testable. */
export function summarizePreviewImageResults(
  results: readonly PreviewImageOutcome[],
): PreviewImageFailureSummary | null {
  const failures = results.filter((result) => !result.image);
  if (failures.length === 0) return null;

  // `data:` URIs need no network, so they separate "the fetch is broken" from
  // "the image pipeline is broken". Only the remote ones decide the severity.
  const remote = results.filter((result) => !result.url.startsWith("data:"));
  const remoteFailed = remote.filter((result) => !result.image).length;

  const reasons: Record<string, number> = {};
  for (const failure of failures) {
    const reason = failure.reason ?? "unknown";
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }

  return {
    severity:
      remote.length > 0 && remoteFailed === remote.length ? "total" : "partial",
    payload: {
      total: results.length,
      failed: failures.length,
      remoteTotal: remote.length,
      remoteFailed,
      reasons,
      sampleUrl: failures[0]?.url,
    },
  };
}

/**
 * Carries the failure reason instead of collapsing to `null`, so
 * `reportPreviewImageFailures` can group causes rather than just count losses.
 */
type PreviewImageResult = {
  image: PreviewImage | null;
  reason?: string;
};

// notion.so/image/* answers 403 to a request with no User-Agent, which is what
// undici sends by default — so every remote placeholder fetch failed, and each
// failure looked individually unremarkable. Any self-identifying agent is
// accepted; this is the string lib/rag/fetch-favicon.ts already uses.
const PREVIEW_IMAGE_USER_AGENT =
  "jackhpark-nextjs-notion/1.0 (+https://jackhpark.com/)";

async function createPreviewImage(
  url: string,
  { cacheKey }: { cacheKey: string },
): Promise<PreviewImageResult> {
  try {
    try {
      const cachedPreviewImage = (await db.get(cacheKey)) as
        | PreviewImage
        | undefined;
      if (cachedPreviewImage) {
        return { image: cachedPreviewImage };
      }
    } catch (err: unknown) {
      // ignore cache errors: a miss only costs us a re-fetch
      notionLogger.debug("[preview-images] cache read failed", {
        cacheKey,
        reason: toReason(err),
      });
    }

    const body = await ky(url, {
      headers: { "user-agent": PREVIEW_IMAGE_USER_AGENT },
    }).arrayBuffer();
    const result = await lqip(body);
    //console.log('lqip', { ...result.metadata, url, cacheKey })

    const previewImage = {
      originalWidth: result.metadata.originalWidth,
      originalHeight: result.metadata.originalHeight,
      dataURIBase64: result.metadata.dataURIBase64,
    };

    try {
      await db.set(cacheKey, previewImage);
    } catch (err: unknown) {
      // ignore cache errors: a failed write only costs us a re-fetch
      notionLogger.debug("[preview-images] cache write failed", {
        cacheKey,
        reason: toReason(err),
      });
    }

    return { image: previewImage };
  } catch (err: unknown) {
    const reason = toReason(err);
    notionLogger.debug("[preview-images] placeholder failed", { url, reason });
    return { image: null, reason };
  }
}

/**
 * Error identity for grouping, not for display: the message alone collapses
 * distinct causes (every undici failure is "fetch failed"), so the cause chain
 * and any error code are folded in.
 */
function toReason(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  const parts = [err.name, err.message];
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string") parts.push(code);

  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const causeCode = (cause as { code?: unknown }).code;
    parts.push(
      typeof causeCode === "string"
        ? causeCode
        : `${cause.name}: ${cause.message}`,
    );
  }

  return parts.filter(Boolean).join(" / ");
}

export const getPreviewImage = pMemoize(createPreviewImage);
