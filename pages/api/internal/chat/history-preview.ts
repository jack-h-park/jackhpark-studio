import crypto from "node:crypto";

import type { NextApiRequest, NextApiResponse } from "next";

import type { HistoryPreviewResult } from "@/lib/chat/historyWindowPreview";
import {
  applyHistoryWindow,
  type ChatGuardrailConfig,
  getChatGuardrailConfig,
  type GuardrailChatMessage,
} from "@/lib/server/chat-guardrails";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // 1. Robust Environment Gating
  const isDev = process.env.NODE_ENV !== "production";
  const isPreview = process.env.VERCEL_ENV === "preview";
  const isExplicitEnabled =
    process.env.HISTORY_PREVIEW_EXACT_ENABLED === "true";

  const isAllowedEnv = isDev || isPreview || isExplicitEnabled;
  if (!isAllowedEnv) {
    return res.status(404).end();
  }

  // ... inside handler ...

  // Optional Secret Check
  // Only enforced if the secret env var is present
  const secret = process.env.HISTORY_PREVIEW_EXACT_SECRET;
  if (secret) {
    const headerSecret = req.headers["x-preview-secret"];

    // Constant-time comparison to prevent timing attacks
    // We treat missing header as empty string for comparison safety
    const a = Buffer.from(secret);
    const b = Buffer.from(typeof headerSecret === "string" ? headerSecret : "");

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({ message: "Forbidden: Invalid secret" });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { messages, historyTokenBudget, summaryReplacementEnabled } =
      req.body as {
        messages: unknown;
        historyTokenBudget: unknown;
        summaryReplacementEnabled?: unknown;
      };

    // 2. Strict Input Validation
    if (!Array.isArray(messages) || typeof historyTokenBudget !== "number") {
      return res.status(400).json({ message: "Invalid request body" });
    }

    // Validate message structure
    const validMessages: GuardrailChatMessage[] = [];
    for (const msg of messages) {
      if (
        typeof msg === "object" &&
        msg !== null &&
        "content" in msg &&
        typeof (msg as any).content === "string"
        // role is optional in some contexts or defaults to user, but let's check string if present
      ) {
        // Ensure we construct clean objects that preserve reference identity for our mapping phase,
        // although `applyHistoryWindow` doesn't strictly depend on specific object instances, just array entries.
        // Wait! We NEED to track identity.
        // The objects coming from `req.body` are NEW references compared to what verified client sent.
        // But within this function execution scope, `validMessages` entries are the stable references we will check against.
        validMessages.push(msg as GuardrailChatMessage);
      } else {
        return res.status(400).json({ message: "Invalid message format" });
      }
    }

    // 3. Compute Window using Server Logic
    const baseConfig = await getChatGuardrailConfig();
    const config: ChatGuardrailConfig = {
      ...baseConfig,
      historyTokenBudget,
      summary: {
        ...baseConfig.summary,
        enabled:
          typeof summaryReplacementEnabled === "boolean"
            ? summaryReplacementEnabled
            : baseConfig.summary.enabled,
      },
    };

    const windowResult = applyHistoryWindow(validMessages, config);

    // 4. Reference-based Mapping
    // Create a Map from message object -> original index
    const indexByRef = new Map<GuardrailChatMessage, number>();
    for (const [index, msg] of validMessages.entries())
      indexByRef.set(msg, index);

    // Note: If duplicate objects exist in `validMessages` (same reference), `set` overwrites.
    // In JSON parsing, every object is unique unless custom parser changes that.
    // So `indexByRef` will map perfectly unique objects to indices.

    const includedIndices: number[] = [];
    const syntheticPreserved: GuardrailChatMessage[] = [];

    for (const preservedMsg of windowResult.preserved) {
      // Check if this preserved message is one of our input messages
      const originalIndex = indexByRef.get(preservedMsg);
      if (originalIndex !== undefined) {
        includedIndices.push(originalIndex);
      } else {
        // It's a synthetic message (e.g. summary)
        syntheticPreserved.push(preservedMsg);
      }
    }

    // Sort indices for clean UI
    includedIndices.sort((a, b) => a - b);

    // Compute excluded indices
    const includedSet = new Set(includedIndices);
    const excludedIndices: number[] = [];
    for (let i = 0; i < validMessages.length; i++) {
      if (!includedSet.has(i)) {
        excludedIndices.push(i);
      }
    }

    // 5. Build Response
    const response: HistoryPreviewResult = {
      includedCount: windowResult.preserved.length,
      excludedCount: windowResult.trimmed.length, // or validMessages.length - includedIndices.length?
      // Preserved length includes synthetics. Trimmed is count of dropped.
      // Total input = included_original + excluded.
      // `windowResult.trimmed` contains messages removed.
      // Let's stick to true counts from window result.
      includedIndices,
      excludedIndices,
      isEstimate: false,
      syntheticCount:
        syntheticPreserved.length > 0 ? syntheticPreserved.length : undefined,
      syntheticPreview:
        syntheticPreserved.length > 0
          ? syntheticPreserved.map((m) => ({
              role: m.role,
              content:
                m.content.length > 120
                  ? m.content.slice(0, 120) + "..."
                  : m.content,
            }))
          : undefined,
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error("Error in history-preview endpoint:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
