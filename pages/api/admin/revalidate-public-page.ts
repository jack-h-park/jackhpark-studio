import type { NextApiRequest, NextApiResponse } from "next";

import { getSiteMap } from "@/lib/get-site-map";
import { resolvePublicPageRevalidationTarget } from "@/lib/server/public-page-revalidation";
import {
  auditAdminMutation,
  requireAdminApiAccess,
  requireSameOriginMutation,
} from "@/lib/server/admin-auth";

type RevalidationResponse =
  | { revalidatedPath: string; revalidatedAt: string }
  | { error: string };

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
  const siteMap = await getSiteMap();
  const target = resolvePublicPageRevalidationTarget(
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

  try {
    await res.revalidate(target.path);
    const revalidatedAt = new Date().toISOString();
    auditAdminMutation({
      ...admin,
      action: "revalidate",
      target: target.path,
      result: "success",
    });
    res.status(200).json({ revalidatedPath: target.path, revalidatedAt });
  } catch {
    auditAdminMutation({
      ...admin,
      action: "revalidate",
      target: target.path,
      result: "failure",
    });
    res.status(500).json({ error: "Unable to refresh the public page." });
  }
}
