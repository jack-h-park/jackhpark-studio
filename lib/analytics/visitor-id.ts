import { posthog } from "posthog-js";

/**
 * Client-side identity used to correlate chat telemetry.
 *
 * The chat API resolves its PostHog `distinct_id` from request headers; without
 * one it falls back to the per-request id, which makes every single request look
 * like a new person. Sending the posthog-js distinct id instead merges
 * server-emitted `chat_completion` events into the same person as the visitor's
 * client-side events.
 */
const FALLBACK_STORAGE_KEY = "jp_visitor_id";

function createRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Pre-randomUUID browsers: a collision-tolerant id is fine here, this only
  // groups telemetry rows.
  return `v-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * A stable per-conversation id. Sent as `x-chat-id` so a multi-turn chat groups
 * into one session in PostHog and Langfuse.
 */
export function createChatSessionId(): string {
  return createRandomId();
}

/**
 * Best-effort stable visitor id, preferring the posthog-js distinct id. Falls
 * back to a locally-persisted UUID when PostHog is not initialised (e.g. dev
 * without a key, or a blocked script) so telemetry still attributes to one
 * visitor rather than one-per-request. Returns null when neither is reachable —
 * the server then keeps its existing per-request fallback.
 */
export function getVisitorId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const distinctId = posthog.get_distinct_id();
    if (typeof distinctId === "string" && distinctId.length > 0) {
      return distinctId;
    }
  } catch {
    // posthog.init() has not run — fall through to the local id.
  }
  try {
    const existing = window.localStorage.getItem(FALLBACK_STORAGE_KEY);
    if (existing) {
      return existing;
    }
    const created = createRandomId();
    window.localStorage.setItem(FALLBACK_STORAGE_KEY, created);
    return created;
  } catch {
    // Storage blocked (private mode / strict settings).
    return null;
  }
}
