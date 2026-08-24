import type { NextApiRequest, NextApiResponse } from "next";

import type { AdminChatConfig } from "@/types/chat-config";
import {
  auditAdminMutation,
  requireAdminApiAccess,
  requireSameOriginMutation,
} from "@/lib/server/admin-auth";
import { saveAdminChatConfig } from "@/lib/server/admin-chat-config";

type ApiResponse = {
  updatedAt?: string | null;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
) {
  const admin = await requireAdminApiAccess(req, res);
  if (!admin) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!requireSameOriginMutation(req, res)) {
    auditAdminMutation({
      ...admin,
      action: "update",
      target: "chat-config",
      result: "failure",
    });
    return;
  }

  const payload = req.body;
  if (!payload || typeof payload !== "object") {
    auditAdminMutation({
      ...admin,
      action: "update",
      target: "chat-config",
      result: "failure",
    });
    return res.status(400).json({ error: "Invalid config payload" });
  }

  const config = (
    "config" in payload ? payload.config : payload
  ) as AdminChatConfig;
  try {
    const { updatedAt } = await saveAdminChatConfig(config);
    auditAdminMutation({
      ...admin,
      action: "update",
      target: "chat-config",
      result: "success",
    });
    return res.status(200).json({ updatedAt });
  } catch (err: unknown) {
    auditAdminMutation({
      ...admin,
      action: "update",
      target: "chat-config",
      result: "failure",
    });
    const message =
      err instanceof Error ? err.message : "Failed to save admin chat config.";
    return res.status(500).json({ error: message });
  }
}
