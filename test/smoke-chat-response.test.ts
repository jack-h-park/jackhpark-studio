import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CITATIONS_SEPARATOR,
  extractAnswerFromJson,
  extractChunkText,
  readChatResponseBody,
  stripCitations,
} from "@/scripts/smoke/lib/chat-response";

void describe("chat smoke response parsing", () => {
  void it("extracts OpenAI-style SSE chunks", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const response = new Response(stream, {
      headers: { "content-type": "text/event-stream" },
    });

    const parsed = await readChatResponseBody(response);

    assert.equal(parsed.answerText, "Hello world");
    assert.equal(parsed.chunkCount, 2);
    assert.equal(parsed.isEventStream, true);
  });

  void it("extracts JSON responses and strips citation payloads", async () => {
    const response = Response.json({
      answer: `Answer body${CITATIONS_SEPARATOR}{"citations":[]}`,
    });

    const parsed = await readChatResponseBody(response);

    assert.equal(parsed.answerText, "Answer body");
    assert.equal(parsed.hasCitations, true);
    assert.equal(parsed.chunkCount, 1);
  });

  void it("extracts plain chunked text and helper-level JSON shapes", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode("plain "));
        controller.enqueue(encoder.encode("text"));
        controller.close();
      },
    });
    const response = new Response(stream);

    const parsed = await readChatResponseBody(response);

    assert.equal(parsed.answerText, "plain text");
    assert.equal(
      extractChunkText('{"choices":[{"message":{"content":"from message"}}]}'),
      "from message",
    );
    assert.equal(extractAnswerFromJson({ data: "from data" }), "from data");
    assert.equal(
      stripCitations(`body${CITATIONS_SEPARATOR}citation json`),
      "body",
    );
  });
});
