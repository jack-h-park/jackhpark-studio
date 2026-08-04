import { telemetryLogger } from "@/lib/logging/logger";

export type ChatStartedNotice = {
  question: string;
  sessionId: string | null;
  traceId: string | null;
  environment: string;
};

const QUESTION_PREVIEW_CHARS = 200;

// Both config gates below are static per process, so log each reason once —
// enough to diagnose a misconfigured deployment without repeating per request.
// They log at `info` because the production default level is `info`; at `debug`
// the skip stays invisible in exactly the environment where it matters.
const loggedSkipReasons = new Set<string>();
let didLogFirstSend = false;

function logSkipOnce(reason: string, payload: Record<string, unknown>): void {
  if (loggedSkipReasons.has(reason)) {
    return;
  }
  loggedSkipReasons.add(reason);
  telemetryLogger.info(`[notify] telegram skipped: ${reason}`, payload);
}

// Langfuse project id for trace deep links. Resolved once per process from the
// API keys via /api/public/projects (the keys are project-scoped, so the call
// returns exactly the owning project). LANGFUSE_PROJECT_ID overrides when set;
// `null` marks a failed resolution so we don't retry on every message.
let cachedProjectId: string | null | undefined;

async function resolveLangfuseProjectId(): Promise<string | null> {
  const fromEnv = process.env.LANGFUSE_PROJECT_ID;
  if (fromEnv) {
    return fromEnv;
  }
  if (cachedProjectId !== undefined) {
    return cachedProjectId;
  }
  const baseUrl = process.env.LANGFUSE_BASE_URL;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!baseUrl || !publicKey || !secretKey) {
    cachedProjectId = null;
    return null;
  }
  try {
    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
    const res = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/public/projects`,
      { headers: { Authorization: `Basic ${auth}` } },
    );
    if (!res.ok) {
      cachedProjectId = null;
      return null;
    }
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    cachedProjectId = body.data?.[0]?.id ?? null;
  } catch {
    cachedProjectId = null;
  }
  return cachedProjectId;
}

/**
 * Fire-and-forget Telegram notification when a visitor starts a new chat.
 *
 * Enabled only when TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are set, and only for
 * the environment named in CHAT_NOTIFY_ENV (default "prod") so local/dev runs
 * stay silent. The send is intentionally not awaited by callers — it has the
 * whole streaming window to complete, and failures are debug-logged without
 * ever affecting the request.
 */
export function notifyChatStarted(notice: ChatStartedNotice): void {
  // Trim env values defensively — stray whitespace in .env files would
  // otherwise break the token or make the env gate silently never match.
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!botToken || !chatId) {
    logSkipOnce("missing_credentials", {
      hasBotToken: Boolean(botToken),
      hasChatId: Boolean(chatId),
    });
    return;
  }
  const notifyEnv = (process.env.CHAT_NOTIFY_ENV ?? "prod").trim();
  if (notice.environment !== notifyEnv) {
    // Both values are non-secret env names — log them so a "production" vs
    // "prod" style mismatch is visible instead of silently never firing.
    logSkipOnce("env_mismatch", {
      appEnv: notice.environment,
      chatNotifyEnv: notifyEnv,
      chatNotifyEnvSet: process.env.CHAT_NOTIFY_ENV !== undefined,
    });
    return;
  }

  const preview =
    notice.question.length > QUESTION_PREVIEW_CHARS
      ? `${notice.question.slice(0, QUESTION_PREVIEW_CHARS)}…`
      : notice.question;

  void (async () => {
    // Deep-link to the Langfuse trace; the project id is auto-resolved from
    // the API keys (or LANGFUSE_PROJECT_ID when set). Falls back to the bare
    // trace id when no link can be built.
    const baseUrl = process.env.LANGFUSE_BASE_URL;
    const projectId = notice.traceId ? await resolveLangfuseProjectId() : null;
    // The Langfuse UI locates traces by time partition, so its trace URLs
    // carry a ?timestamp= anchor — without it the page can report "Trace not
    // found" even for existing traces. The notice fires right after trace
    // creation, so "now" is the trace's timestamp.
    const traceUrl =
      notice.traceId && baseUrl && projectId
        ? `${baseUrl.replace(/\/$/, "")}/project/${projectId}/traces/${notice.traceId}?timestamp=${encodeURIComponent(new Date().toISOString())}`
        : null;

    const text = [
      "💬 New JackGPT chat",
      `Q: ${preview}`,
      notice.sessionId ? `Session: ${notice.sessionId}` : null,
      traceUrl ?? (notice.traceId ? `Trace: ${notice.traceId}` : null),
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      },
    );
    if (!res.ok) {
      // Telegram explains rejections in `description` (bad chat_id, bot blocked,
      // …); surface it — the status alone is not actionable. Never log the token.
      const description = await res
        .clone()
        .json()
        .then((body) => (body as { description?: string }).description ?? null)
        .catch(() => null);
      telemetryLogger.error("[notify] telegram send failed", {
        status: res.status,
        description,
      });
      return;
    }
    if (!didLogFirstSend) {
      didLogFirstSend = true;
      // One line per process confirms the happy path in production logs without
      // needing a Telegram round trip to verify a deployment.
      telemetryLogger.info("[notify] telegram send ok", {
        environment: notice.environment,
      });
    }
  })().catch((err: unknown) => {
    telemetryLogger.error("[notify] telegram send failed", {
      error: err instanceof Error ? err.message : String(err ?? "unknown"),
    });
  });
}
