import { createHash, timingSafeEqual } from "node:crypto";

export const SYNTHETIC_TRAFFIC_HEADER = "x-jackgpt-synthetic";
export const CHAT_TRAFFIC_RESPONSE_HEADER = "X-Chat-Traffic";

export type ChatTrafficSource = "visitor" | "synthetic";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Classifies a chat request as visitor or synthetic (smoke tests, agent
 * probes). Synthetic requires the header to match SYNTHETIC_TRAFFIC_TOKEN: a
 * bare marker would let any visitor hide their own conversation from the owner
 * notice and the product metrics. A missing or wrong token falls back to
 * "visitor" rather than rejecting, so a misconfigured probe is over-reported
 * instead of breaking the chat for a real user.
 */
export function classifyChatTraffic(
  headerValue: string | null | undefined,
  expectedToken: string | undefined = process.env.SYNTHETIC_TRAFFIC_TOKEN,
): ChatTrafficSource {
  const expected = expectedToken?.trim();
  const provided = headerValue?.trim();
  if (!expected || !provided) {
    return "visitor";
  }
  // Compare fixed-length digests so the check is constant-time regardless of
  // the provided value's length.
  return timingSafeEqual(digest(provided), digest(expected))
    ? "synthetic"
    : "visitor";
}
