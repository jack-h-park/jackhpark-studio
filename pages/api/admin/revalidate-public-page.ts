import type { NextApiRequest, NextApiResponse } from "next";

import { getSiteMap } from "@/lib/get-site-map";
import {
  auditAdminMutation,
  type PublicPageRefreshFailure,
  requireAdminApiAccess,
  requireSameOriginMutation,
} from "@/lib/server/admin-auth";
import { invalidateNotionNavigationHeader } from "@/lib/server/notion-header";
import { NotionHeaderCacheError } from "@/lib/server/notion-header-error";
import { invalidatePublicChatShell } from "@/lib/server/public-chat-cache";
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
      await invalidateNotionNavigationHeader();
      stage = "chat_invalidation";
      await invalidatePublicChatShell();
    }
    const revalidatedAt = new Date().toISOString();
    auditAdminMutation({
      ...admin,
      action: "revalidate",
      target: target.path,
      result: "success",
    });
    res.status(200).json({ revalidatedPath: target.path, revalidatedAt });
  } catch (err) {
    auditAdminMutation({
      ...admin,
      action: "revalidate",
      target: target?.path ?? "public-page",
      result: "failure",
      failure: {
        stage,
        code:
          err instanceof NotionHeaderCacheError
            ? err.code
            : "operation_failed",
        pageRevalidated,
      },
    });
    res.status(500).json({
      error: "Unable to refresh the public page.",
      requestId: admin.requestId,
    });
  }
}
