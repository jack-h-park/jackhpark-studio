import { randomUUID } from "node:crypto";

import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { isAllowedAdminEmail } from "@/lib/admin/auth";
import { dbLogger } from "@/lib/logging/logger";
import { authOptions } from "@/lib/server/auth";

export type AdminAuthContext = {
  actorEmail: string;
  requestId: string;
};

export type AdminMutationResult = "success" | "failure";

function getRequestId(req: NextApiRequest): string {
  const header = req.headers["x-request-id"];
  const value = typeof header === "string" ? header.trim() : "";
  return value.length > 0 && value.length <= 128 ? value : randomUUID();
}

function getHeaderValue(
  headers: NextApiRequest["headers"],
  name: string,
): string | null {
  const value = headers[name];
  return typeof value === "string" ? value : null;
}

export async function requireAdminApiAccess(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<AdminAuthContext | null> {
  const requestId = getRequestId(req);
  try {
    const session = await getServerSession(req, res, authOptions);
    const actorEmail = session?.user?.email;
    if (
      typeof actorEmail === "string" &&
      isAllowedAdminEmail(actorEmail, process.env.ADMIN_GOOGLE_EMAIL)
    ) {
      return { actorEmail, requestId };
    }
  } catch {
    // Treat unavailable or invalid OIDC sessions as unauthenticated.
  }

  res.status(401).json({ error: "Authentication required." });
  return null;
}

export function auditAdminMutation(input: {
  actorEmail: string;
  requestId: string;
  action: string;
  target: string;
  result: AdminMutationResult;
}): void {
  dbLogger.info("admin:mutation", {
    actor: input.actorEmail,
    action: input.action,
    target: input.target,
    result: input.result,
    requestId: input.requestId,
  });
}

function getExpectedOrigin(req: NextApiRequest): string | null {
  const host = getHeaderValue(req.headers, "host");
  if (!host) {
    return null;
  }

  const forwardedProto = getHeaderValue(req.headers, "x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const protocol = forwardedProto || "http";
  return `${protocol}://${host}`;
}

export function requireSameOriginMutation(
  req: NextApiRequest,
  res: NextApiResponse,
): boolean {
  if (getHeaderValue(req.headers, "sec-fetch-site") === "cross-site") {
    res.status(403).json({ error: "Cross-site mutation rejected." });
    return false;
  }

  const origin = getHeaderValue(req.headers, "origin");
  if (!origin) {
    return true;
  }

  const expectedOrigin = getExpectedOrigin(req);
  if (!expectedOrigin || origin !== expectedOrigin) {
    res.status(403).json({ error: "Cross-origin mutation rejected." });
    return false;
  }

  return true;
}
