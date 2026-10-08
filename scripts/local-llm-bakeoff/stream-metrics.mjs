/**
 * Per-request timing for an OpenAI-compatible streaming chat completion.
 *
 * @typedef {Object} StreamMetrics
 * @property {number | null} firstTokenMs First generated token of any kind, reasoning included.
 * @property {number | null} ttftMs First visible answer character; reasoning never counts.
 * @property {number} totalMs
 * @property {number} completionTokens
 * @property {"usage" | "deltas"} completionTokensSource
 * @property {number | null} decodeTokensPerSecond
 * @property {number} reasoningChars
 * @property {boolean} inlineThinking
 * @property {string} text
 * @property {string | null} finishReason
 */

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

/**
 * Yields the payload of every `data:` line in an SSE byte stream.
 * @param {AsyncIterable<Uint8Array>} body
 * @returns {AsyncGenerator<string>}
 */
export async function* readSseData(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (line.startsWith("data:")) {
        yield line.slice(5).trim();
      }
      newline = buffer.indexOf("\n");
    }
  }
  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    yield tail.slice(5).trim();
  }
}

/**
 * Splits streamed content into the visible answer and any `<think>` section
 * a model emitted in-band instead of as a separate reasoning field.
 * @param {string} raw
 * @returns {{ visible: string; thinking: string; inline: boolean }}
 */
export function splitInlineThinking(raw) {
  const trimmed = raw.trimStart();
  // "<thi" may still become "<think>", so it is not visible yet.
  if (trimmed.length < THINK_OPEN.length && THINK_OPEN.startsWith(trimmed)) {
    return { visible: "", thinking: "", inline: trimmed.length > 0 };
  }
  if (!trimmed.startsWith(THINK_OPEN)) {
    return { visible: raw, thinking: "", inline: false };
  }
  const close = trimmed.indexOf(THINK_CLOSE);
  if (close === -1) {
    return {
      visible: "",
      thinking: trimmed.slice(THINK_OPEN.length),
      inline: true,
    };
  }
  return {
    visible: trimmed.slice(close + THINK_CLOSE.length).trimStart(),
    thinking: trimmed.slice(THINK_OPEN.length, close),
    inline: true,
  };
}

/**
 * @param {AsyncIterable<Uint8Array>} body
 * @param {number} startedAtMs
 * @param {() => number} [now]
 * @returns {Promise<StreamMetrics>}
 */
export async function measureChatStream(
  body,
  startedAtMs,
  now = () => performance.now(),
) {
  /** @type {number | null} */
  let firstTokenMs = null;
  /** @type {number | null} */
  let ttftMs = null;
  /** @type {number | null} */
  let lastTokenMs = null;
  /** @type {number | null} */
  let usageTokens = null;
  /** @type {string | null} */
  let finishReason = null;
  let raw = "";
  let reasoning = "";
  let deltaCount = 0;

  for await (const data of readSseData(body)) {
    if (data === "[DONE]") {
      break;
    }
    const event = JSON.parse(data);
    const at = now() - startedAtMs;
    if (typeof event.usage?.completion_tokens === "number") {
      usageTokens = event.usage.completion_tokens;
    }
    const choice = event.choices?.[0];
    if (!choice) {
      continue;
    }
    if (choice.finish_reason) {
      finishReason = choice.finish_reason;
    }
    const reasoningPiece =
      choice.delta?.reasoning_content ?? choice.delta?.reasoning ?? "";
    const contentPiece = choice.delta?.content ?? "";
    if (!reasoningPiece && !contentPiece) {
      continue;
    }
    deltaCount += 1;
    firstTokenMs ??= at;
    lastTokenMs = at;
    reasoning += reasoningPiece;
    raw += contentPiece;
    if (ttftMs === null && splitInlineThinking(raw).visible.length > 0) {
      ttftMs = at;
    }
  }

  const totalMs = now() - startedAtMs;
  const split = splitInlineThinking(raw);
  // Usage counts every generated token, reasoning included, which is what the
  // decode rate should measure. Servers that omit usage get one token per delta.
  const completionTokens = usageTokens ?? deltaCount;
  const spanMs =
    firstTokenMs !== null && lastTokenMs !== null
      ? lastTokenMs - firstTokenMs
      : 0;
  return {
    firstTokenMs,
    ttftMs,
    totalMs,
    completionTokens,
    completionTokensSource: usageTokens === null ? "deltas" : "usage",
    decodeTokensPerSecond:
      spanMs > 0 && completionTokens > 1
        ? (completionTokens - 1) / (spanMs / 1000)
        : null,
    reasoningChars: reasoning.length + split.thinking.length,
    inlineThinking: split.inline,
    text: split.visible,
    finishReason,
  };
}
