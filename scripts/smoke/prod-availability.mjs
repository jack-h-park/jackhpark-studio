#!/usr/bin/env node

const baseUrl = (
  process.env.PROD_BASE_URL ?? "https://www.jackhpark.com"
).replace(/\/$/, "");
const scope = process.env.SMOKE_SCOPE ?? "core";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 10000);
const failures = [];

async function check(path, expectedStatuses, predicate) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "jackhpark-prod-smoke/1.0" },
    });
    const body = await response.text();
    const latencyMs = Date.now() - startedAt;
    const contentType = response.headers.get("content-type") ?? "";
    const statusOk = expectedStatuses.includes(response.status);
    const predicateOk = predicate
      ? predicate({ body, contentType, response })
      : true;
    const result = statusOk && predicateOk ? "PASS" : "FAIL";
    console.log(`${result} ${path} ${response.status} ${latencyMs}ms`);
    if (!statusOk || !predicateOk) {
      failures.push({
        path,
        status: response.status,
        latencyMs,
        contentType,
        body: body.slice(0, 160),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL ${path} ${message}`);
    failures.push({
      path,
      status: null,
      latencyMs: Date.now() - startedAt,
      error: message,
    });
  } finally {
    clearTimeout(timer);
  }
}

const html =
  (title) =>
  ({ body }) =>
    body.includes(`<title`) && body.includes(title);
const json = ({ contentType }) => contentType.includes("application/json");

await check("/", [200], html("Ask JackGPT"));
await check("/chat", [200], html("Ask JackGPT"));
await check("/studio", [200]);
await check("/feed", [200]);
await check("/admin/sign-in", [200]);
await check("/api/ping", [200], json);
await check("/api/chat-config", [200], json);
await check("/api/chat-runtime", [200], json);
await check("/api/chat", [405]);
await check("/assets/avatar-favicon/error.png", [200], ({ contentType }) =>
  contentType.includes("image/png"),
);

if (scope === "full") {
  await check("/landing", [200, 301, 302, 307, 308]);
  await check("/robots.txt", [200]);
  await check(
    "/sitemap.xml",
    [200],
    ({ contentType }) =>
      contentType.includes("xml") || contentType.includes("text"),
  );
  await check("/404", [404]);
}

if (failures.length > 0) {
  console.error(JSON.stringify({ baseUrl, scope, failures }, null, 2));
  process.exitCode = 1;
}
