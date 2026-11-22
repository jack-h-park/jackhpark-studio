#!/usr/bin/env node

const baseUrl = (
  process.env.PROD_BASE_URL ?? "https://www.jackhpark.com"
).replace(/\/$/, "");

async function check(path, status, validate) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "jackhpark-deployment-api-smoke/1.0" },
    });
    const passed = response.status === status && (await validate(response));
    if (!response.bodyUsed) await response.body?.cancel();
    console.log(
      `${passed ? "PASS" : "FAIL"} ${path} ${response.status} ${Date.now() - startedAt}ms`,
    );
    if (!passed) process.exitCode = 1;
  } catch (error) {
    console.error(
      `FAIL ${path}: ${error instanceof Error ? error.name : "request failed"}`,
    );
    process.exitCode = 1;
  }
}

// The rejected method checks routing and the allowed method without sending a chat.
await check(
  "/api/chat",
  405,
  (response) => response.headers.get("allow")?.trim() === "POST",
);
await check("/api/chat-config", 200, async (response) => {
  if (!response.headers.get("content-type")?.includes("application/json"))
    return false;
  const payload = await response.json();
  return (
    typeof payload?.models?.engine === "string" &&
    payload.models.engine.length > 0
  );
});
