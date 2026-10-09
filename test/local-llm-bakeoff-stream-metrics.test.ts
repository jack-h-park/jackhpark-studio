import assert from "node:assert/strict";
import test from "node:test";

import {
  measureChatStream,
  readSseData,
  splitInlineThinking,
} from "@/scripts/local-llm-bakeoff/stream-metrics.mjs";

function sseBody(text: string, splitEvery = 7): AsyncIterable<Uint8Array> {
  const encoder = new TextEncoder();
  return (async function* () {
    for (let i = 0; i < text.length; i += splitEvery) {
      yield encoder.encode(text.slice(i, i + splitEvery));
    }
  })();
}

function sse(events: unknown[]): string {
  return (
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

function delta(fields: Record<string, string>, finish: string | null = null) {
  return { choices: [{ index: 0, delta: fields, finish_reason: finish }] };
}

// Each call advances 10 ms; measureChatStream calls it once per parsed event
// and once at the end.
function tickingClock(): () => number {
  let t = 0;
  return () => {
    t += 10;
    return t;
  };
}

void test("measures TTFT, decode rate and text from content split across chunks", async () => {
  const body = sseBody(
    sse([
      delta({ role: "assistant" }),
      delta({ content: "Hel" }),
      delta({ content: "lo" }),
      delta({}, "stop"),
      { choices: [], usage: { completion_tokens: 2 } },
    ]),
  );
  const metrics = await measureChatStream(body, 0, tickingClock());
  assert.equal(metrics.text, "Hello");
  assert.equal(metrics.firstTokenMs, 20);
  assert.equal(metrics.ttftMs, 20);
  assert.equal(metrics.completionTokens, 2);
  assert.equal(metrics.completionTokensSource, "usage");
  assert.equal(metrics.decodeTokensPerSecond, 100);
  assert.equal(metrics.finishReason, "stop");
  assert.equal(metrics.totalMs, 60);
  assert.equal(metrics.inlineThinking, false);
});

void test("separated reasoning delays TTFT and falls back to delta counting", async () => {
  const body = sseBody(
    sse([
      delta({ reasoning_content: "hmm" }),
      delta({ reasoning_content: " ok" }),
      delta({ content: "Hi" }),
    ]),
  );
  const metrics = await measureChatStream(body, 0, tickingClock());
  assert.equal(metrics.firstTokenMs, 10);
  assert.equal(metrics.ttftMs, 30);
  assert.equal(metrics.reasoningChars, 6);
  assert.equal(metrics.completionTokens, 3);
  assert.equal(metrics.completionTokensSource, "deltas");
  assert.equal(metrics.decodeTokensPerSecond, 100);
  assert.equal(metrics.text, "Hi");
});

void test("inline <think> blocks are reasoning, not visible text", async () => {
  const body = sseBody(
    sse([
      delta({ content: "<thi" }),
      delta({ content: "nk>plan</think>" }),
      delta({ content: "\nAnswer" }),
    ]),
  );
  const metrics = await measureChatStream(body, 0, tickingClock());
  assert.equal(metrics.firstTokenMs, 10);
  assert.equal(metrics.ttftMs, 30);
  assert.equal(metrics.text, "Answer");
  assert.equal(metrics.inlineThinking, true);
  assert.equal(metrics.reasoningChars, 4);
});

void test("a partial opening tag is not yet visible text", () => {
  assert.deepEqual(splitInlineThinking("<thi"), {
    visible: "",
    thinking: "",
    inline: true,
  });
  assert.deepEqual(splitInlineThinking("Plain"), {
    visible: "Plain",
    thinking: "",
    inline: false,
  });
});

void test("an error event mid-stream throws instead of returning a partial answer", async () => {
  const body = sseBody(
    sse([
      delta({ content: "Hel" }),
      { error: { message: "model crashed" } },
      delta({ content: "lo" }),
    ]),
  );
  await assert.rejects(
    measureChatStream(body, 0, tickingClock()),
    /stream error: model crashed/,
  );
  const bare = sseBody(sse([{ error: "out of memory" }]));
  await assert.rejects(
    measureChatStream(bare, 0, tickingClock()),
    /stream error: "out of memory"/,
  );
});

void test("bytes still held by the decoder at end of stream are flushed into the tail", async () => {
  // A truncated multi-byte sequence with no trailing newline: only the final
  // decoder flush turns it into a character instead of dropping it silently.
  const body = (async function* () {
    yield new TextEncoder().encode("data: x");
    yield new Uint8Array([0xed, 0x95]);
  })();
  const lines: string[] = [];
  for await (const line of readSseData(body)) {
    lines.push(line);
  }
  assert.deepEqual(lines, ["x�"]);
});
