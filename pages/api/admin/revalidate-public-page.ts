import type { NextApiRequest, NextApiResponse } from "next";

import { getSiteMap } from "@/lib/get-site-map";
import {
  auditAdminMutation,
  type PublicPageRefreshFailure,
  requireAdminApiAccess,
  requireSameOriginMutation,
} from "@/lib/server/admin-auth";
import { invalidateNotionNavigationHeader } from "@/lib/server/notion-header";
import {
  type HeaderRevisionVerification,
  NotionHeaderCacheError,
} from "@/lib/server/notion-header-error";
import {
  invalidatePublicChatShell,
  type PublicChatCacheInvalidation,
} from "@/lib/server/public-chat-cache";
import {
  type PublicPageRevalidationTarget,
  resolvePublicPageRevalidationTarget,
} from "@/lib/server/public-page-revalidation";

type RevalidationResponse =
  | { revalidatedPath: string; revalidatedAt: string }
  | { error: string; requestId?: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RevalidationResponse>,
): Promise<void> {
  const admin = await requireAdminApiAccess(req, res);
  if (!admin) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  if (!requireSameOriginMutation(req, res)) {
    auditAdminMutation({
      ...admin,
      action: "revalidate",
      target: "public-page",
      result: "failure",
    });
    return;
  }

  const body = req.body as unknown;
  const requestedPath =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).path
      : undefined;
  let target: PublicPageRevalidationTarget | null = null;
  let stage: PublicPageRefreshFailure["stage"] = "resolve_target";
  let pageRevalidated = false;
  let cacheVerification: HeaderRevisionVerification | undefined;
  let cacheInvalidation: PublicChatCacheInvalidation | undefined;

  try {
    const siteMap = await getSiteMap();
    target = resolvePublicPageRevalidationTarget(
      requestedPath,
      siteMap.canonicalPageMap,
    );

    if (!target) {
      auditAdminMutation({
        ...admin,
        action: "revalidate",
        target: "public-page",
        result: "failure",
      });
      res.status(400).json({ error: "Invalid public page target." });
      return;
    }

    stage = "page_revalidation";
    await res.revalidate(target.path);
    pageRevalidated = true;
    if (target.path === "/studio") {
      stage = "header_invalidation";
      cacheVerification = await invalidateNotionNavigationHeader();
      stage = "chat_invalidation";
      cacheInvalidation = await invalidatePublicChatShell();
    }
    const revalidatedAt = new Date().toISOString();
    auditAdminMutation({
      ...admin,
      action: "revalidate",
      target: target.path,
      result: "success",
      cacheVerification,
      cacheInvalidation,
    });
    res.status(200).json({
      revalidatedPath: target.path,
      revalidatedAt,
      requestId: admin.requestId,
      ...(cacheInvalidation ? { chatCacheRefresh: cacheInvalidation } : {}),
    });
  } catch (err) {
    auditAdminMutation({
      ...admin,
      action: "revalidate",
      target: target?.path ?? "public-page",
      result: "failure",
      cacheVerification:
        err instanceof NotionHeaderCacheError
          ? (err.verification ?? cacheVerification)
          : cacheVerification,
      failure: {
        stage,
        code:
          err instanceof NotionHeaderCacheError ? err.code : "operation_failed",
        pageRevalidated,
      },
    });
    // A late failure must not invite repeating already completed mutations.
    const message =
      pageRevalidated && stage === "chat_invalidation"
        ? "The page and shared navigation refresh completed, but the public chat cache refresh was not confirmed. Check the refresh diagnostics before trying again."
        : pageRevalidated && stage === "header_invalidation"
          ? "The page refresh completed, but the shared navigation and public chat cache refresh were not confirmed. Check the refresh diagnostics before trying again."
          : "Unable to refresh the public page.";
    res.status(500).json({
      error: message,
      requestId: admin.requestId,
    });
  }
}
