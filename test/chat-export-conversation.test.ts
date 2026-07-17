/* eslint-disable @typescript-eslint/no-floating-promises */

import assert from "node:assert";
import { describe, it } from "node:test";

import type { ChatMessage } from "../components/chat/hooks/useChatSession";
import { conversationToMarkdown } from "../lib/chat/export-conversation";
import { formatMessageTime } from "../lib/chat/format-message-time";

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: over.id ?? "m",
  role: over.role ?? "user",
  content: over.content ?? "",
  ...over,
});

describe("conversationToMarkdown", () => {
  it("renders user and assistant turns with labels", () => {
    const md = conversationToMarkdown([
      msg({ id: "u1", role: "user", content: "What do you do?" }),
      msg({ id: "a1", role: "assistant", content: "I build things." }),
    ]);
    assert.match(md, /\*\*You:\*\*\n\nWhat do you do\?/);
    assert.match(md, /\*\*JackGPT:\*\*\n\nI build things\./);
  });

  it("skips empty placeholders and error notices", () => {
    const md = conversationToMarkdown([
      msg({ id: "u1", role: "user", content: "hi" }),
      msg({ id: "a1", role: "assistant", content: "", isComplete: false }),
      msg({
        id: "a2",
        role: "assistant",
        content: "Warning: something failed",
        isError: true,
      }),
    ]);
    assert.match(md, /You:/);
    assert.doesNotMatch(md, /JackGPT:/);
    assert.doesNotMatch(md, /Warning/);
  });

  it("lists assistant citations as a numbered source list", () => {
    const md = conversationToMarkdown([
      msg({
        id: "a1",
        role: "assistant",
        content: "See the docs.",
        // Only the fields the exporter reads are needed here.
        citations: [
          { title: "Studio", url: "https://example.com/studio" },
        ] as unknown as ChatMessage["citations"],
      }),
    ]);
    assert.match(md, /_Sources:_/);
    assert.match(md, /1\. \[Studio\]\(https:\/\/example\.com\/studio\)/);
  });

  it("always ends with a single trailing newline", () => {
    const md = conversationToMarkdown([msg({ content: "hi" })]);
    assert.ok(md.endsWith("\n"));
    assert.ok(!md.endsWith("\n\n"));
  });
});

describe("formatMessageTime", () => {
  it("shows only the time for same-day messages", () => {
    const now = new Date("2026-07-17T14:30:00").getTime();
    const at = new Date("2026-07-17T09:15:00").getTime();
    const out = formatMessageTime(at, now);
    // No month name when it's the same calendar day.
    assert.doesNotMatch(out, /Jul/);
    assert.match(out, /\d/);
  });

  it("includes the date for messages from another day", () => {
    const now = new Date("2026-07-17T14:30:00").getTime();
    const at = new Date("2026-07-15T09:15:00").getTime();
    const out = formatMessageTime(at, now);
    assert.match(out, /Jul/);
  });
});
