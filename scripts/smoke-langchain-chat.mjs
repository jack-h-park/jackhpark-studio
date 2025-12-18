import { setTimeout as wait } from "node:timers/promises";

const BASE_URL = process.env.LANGCHAIN_CHAT_BASE_URL ?? "http://127.0.0.1:3000";
const JSON_BODY = JSON.stringify({
  messages: [{ role: "user", content: "hi" }],
});

const HEADERS = {
  "Content-Type": "application/json",
};

const GET_TIMEOUT_MS = 3_000;
const POST_TIMEOUT_MS = 30_000;

const smokeEnvDebug = parseEnvFlag("DEBUG_SURFACES_ENABLED", false);
const smokeEnvTelemetry = parseEnvFlag("TELEMETRY_ENABLED", true);
const FIRST_BYTE_MS = smokeEnvDebug ? 2_000 : 10_000;
const EXPECT_DEBUG_SURFACES = parseExpectation("EXPECT_DEBUG_SURFACES");
const EXPECT_TELEMETRY = parseExpectation("EXPECT_TELEMETRY");

console.log(
  `[smoke] process env DEBUG_SURFACES_ENABLED=${
    smokeEnvDebug ? "1" : "0"
  } TELEMETRY_ENABLED=${smokeEnvTelemetry ? "1" : "0"} (may differ from server)`,
);

function parseEnvFlag(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue == null) {
    return fallback;
  }
  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseExpectation(name) {
  const rawValue = process.env[name];
  if (rawValue == null) {
    return null;
  }
  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return null;
}

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

async function verifyDebugRoute() {
  const controller = new AbortController();
  const timeout = wait(GET_TIMEOUT_MS).then(() => controller.abort());
  try {
    const response = await fetch(`${BASE_URL}/api/_debug/heavy-import`, {
      method: "GET",
      signal: controller.signal,
    });
    let inferredDebugEnabled;
    if (response.status === 200) {
      inferredDebugEnabled = true;
    } else if (response.status === 404) {
      inferredDebugEnabled = false;
    } else {
      throw new Error(
        `debug route unexpected status ${response.status} ${response.statusText}`,
      );
    }
    console.log(
      `[smoke] debug surfaces inferred: ${
        inferredDebugEnabled ? "ON" : "OFF"
      } (status=${response.status})`,
    );

    if (EXPECT_DEBUG_SURFACES !== null) {
      if (EXPECT_DEBUG_SURFACES !== inferredDebugEnabled) {
        throw new Error(
          `EXPECTED_DEBUG_SURFACES=${EXPECT_DEBUG_SURFACES ? "1" : "0"} but server reported ${
            inferredDebugEnabled ? "ON" : "OFF"
          }`,
        );
      }
    }

    if (EXPECT_TELEMETRY !== null) {
      console.log(
        `[smoke] strict telemetry expectation=${EXPECT_TELEMETRY ? "ON" : "OFF"} (no inference performed)`,
      );
    }
  } finally {
    controller.abort();
    await timeout.catch(() => undefined);
  }
}

async function main() {
  console.log("[smoke] base url", BASE_URL);
  await smokeGet();
  await smokePost();
  await verifyDebugRoute();
  console.log("[smoke] langchain chat smoke checks passed");
}

main().catch((error) => {
  console.error("[smoke] langchain chat smoke check failed", error);
  process.exitCode = 1;
});
