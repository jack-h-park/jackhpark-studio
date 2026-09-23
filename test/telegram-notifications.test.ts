import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { notifyChatCompleted } from "@/lib/server/notifications/telegram";

const TELEGRAM_ENV_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "CHAT_NOTIFY_ENV",
  "LANGFUSE_BASE_URL",
  "LANGFUSE_PROJECT_ID",
] as const;

const originalFetch = globalThis.fetch;
const originalEnv = new Map(
  TELEGRAM_ENV_KEYS.map((key) => [key, process.env[key]]),
);
let sentMessages: Array<{ chat_id: string; text: string }> = [];

void describe("notifyChatCompleted", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "telegram-test-token";
    process.env.TELEGRAM_CHAT_ID = "chat-test-id";
    process.env.CHAT_NOTIFY_ENV = "prod";
    process.env.LANGFUSE_BASE_URL = "https://langfuse.example.test";
    process.env.LANGFUSE_PROJECT_ID = "project-test-id";
    sentMessages = [];
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        chat_id: string;
        text: string;
      };
      sentMessages.push(body);
      return Response.json({ ok: true });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const key of TELEGRAM_ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  void it("includes the complete question, answer, session, and trace link", async () => {
    await notifyChatCompleted({
      question: "What did Jack contribute?",
      answer: "He led the enterprise deployment work.",
      sessionId: "session-123",
      traceId: "trace-456",
      environment: "prod",
    });

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0]?.chat_id, "chat-test-id");
    assert.match(sentMessages[0]?.text ?? "", /Q: What did Jack contribute\?/);
    assert.match(
      sentMessages[0]?.text ?? "",
      /A: He led the enterprise deployment work\./,
    );
    assert.match(sentMessages[0]?.text ?? "", /Session: session-123/);
    assert.match(
      sentMessages[0]?.text ?? "",
      /https:\/\/langfuse\.example\.test\/project\/project-test-id\/traces\/trace-456\?/,
    );
  });

  void it("truncates long transcripts to one Telegram-sized message", async () => {
    const question = `Q😀${"q".repeat(5000)}`;
    const answer = `A🌌${"a".repeat(5000)}`;
    await notifyChatCompleted({
      question,
      answer,
      sessionId: "session-long",
      traceId: "trace-long",
      environment: "prod",
    });

    const text = sentMessages[0]?.text ?? "";
    assert.equal(sentMessages.length, 1);
    assert.ok(
      text.length <= 4096,
      `Telegram text has ${text.length} UTF-16 units`,
    );
    assert.match(text, /Q: Q😀/);
    assert.match(text, /A: A🌌/);
    assert.match(text, /Session: session-long/);
    assert.match(
      text,
      /https:\/\/langfuse\.example\.test\/project\/project-test-id\/traces\/trace-long\?/,
    );
    assert.match(text, /…/);
    assert.doesNotMatch(text, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    assert.doesNotMatch(text, /(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  });
});
