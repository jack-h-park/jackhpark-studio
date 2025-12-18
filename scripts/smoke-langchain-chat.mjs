import { setTimeout as wait } from "node:timers/promises";

const BASE_URL = process.env.LANGCHAIN_CHAT_BASE_URL ?? "http://127.0.0.1:3000";

const CHAT_DEBUG = process.env.CHAT_DEBUG === "1";
const JSON_BODY = JSON.stringify({
  messages: [{ role: "user", content: "hi" }],
});

const HEADERS = {
  "Content-Type": "application/json",
};

const GET_TIMEOUT_MS = 3_000;
const FIRST_BYTE_MS = CHAT_DEBUG ? 2_000 : 10_000;
const POST_TIMEOUT_MS = 30_000;

async function smokeGet() {
  const controller = new AbortController();
  const timeout = wait(GET_TIMEOUT_MS).then(() => controller.abort());
  try {
    const response = await fetch(`${BASE_URL}/api/langchain_chat`, {
      method: "GET",
      signal: controller.signal,
    });
    if (response.status !== 405) {
      throw new Error(
        `GET expected 405 but received ${response.status} ${response.statusText}`,
      );
    }
    console.log("[smoke] GET /api/langchain_chat -> 405 OK");
  } finally {
    controller.abort();
    await timeout.catch(() => undefined);
  }
}

async function smokePost() {
  const controller = new AbortController();
  const timeout = wait(POST_TIMEOUT_MS).then(() => controller.abort());
  try {
    const response = await fetch(`${BASE_URL}/api/langchain_chat`, {
      method: "POST",
      headers: HEADERS,
      body: JSON_BODY,
      signal: controller.signal,
    });
    if (response.status !== 200) {
      throw new Error(
        `POST expected 200 but received ${response.status} ${response.statusText}`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("response body is missing");
    }

    const firstByteStart = Date.now();
    let firstChunk;
    while (true) {
      firstChunk = await reader.read();
      if (firstChunk.done) {
        throw new Error("stream ended before emitting any chunk");
      }
      if (firstChunk.value && firstChunk.value.length > 0) {
        break;
      }
    }
    const elapsed = Date.now() - firstByteStart;
    if (elapsed > FIRST_BYTE_MS) {
      throw new Error(
        `first byte delay ${elapsed}ms exceeded ${FIRST_BYTE_MS}ms threshold`,
      );
    }
    console.log(`[smoke] POST first byte ${elapsed}ms`);

    // Drain the rest of the stream before finishing.
    while (!firstChunk.done) {
      firstChunk = await reader.read();
    }
    if (response.body?.locked) {
      reader.releaseLock();
    }
    console.log("[smoke] POST stream completed");
  } finally {
    controller.abort();
    await timeout.catch(() => undefined);
  }
}

async function main() {
  console.log("[smoke] base url", BASE_URL);
  await smokeGet();
  await smokePost();
  await verifyDebugRoute(CHAT_DEBUG ? 200 : 404);
  console.log("[smoke] langchain chat smoke checks passed");
}

async function verifyDebugRoute(expectedStatus) {
  const controller = new AbortController();
  const timeout = wait(GET_TIMEOUT_MS).then(() => controller.abort());
  try {
    const response = await fetch(`${BASE_URL}/api/_debug/heavy-import`, {
      method: "GET",
      signal: controller.signal,
    });
    if (response.status !== expectedStatus) {
      throw new Error(
        `debug route expected ${expectedStatus} but received ${response.status} ${response.statusText}`,
      );
    }
    console.log(
      `[smoke] debug route responded ${response.status} (CHAT_DEBUG=${
        CHAT_DEBUG ? "1" : "0"
      })`,
    );
  } finally {
    controller.abort();
    await timeout.catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("[smoke] langchain chat smoke check failed", error);
  process.exitCode = 1;
});
