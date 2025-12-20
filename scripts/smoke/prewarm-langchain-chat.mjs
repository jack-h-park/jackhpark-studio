import { setTimeout as wait } from "node:timers/promises";

const BASE_URL = process.env.LANGCHAIN_CHAT_BASE_URL ?? "http://127.0.0.1:3000";
const PING_URL = `${BASE_URL}/api/ping`;
const MAX_PING_MS = 30_000;
const PING_INTERVAL_MS = 1_000;

async function waitForPing() {
  const deadline = Date.now() + MAX_PING_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(PING_URL);
      if (response.ok) {
        return;
      }
    } catch {
      // ignore
    }
    await wait(PING_INTERVAL_MS);
  }
  throw new Error("Ping endpoint did not become ready within 30s");
}

async function main() {
  console.log("[prewarm] waiting for ping...");
  await waitForPing();
  console.log(
    "[prewarm] ping ready; /api/_debug/precompile-langchain-chat has been retired",
  );
  console.log("[prewarm] langchain chat prewarm check completed");
}

main().catch((error) => {
  console.error("[prewarm] failed", error);
  process.exitCode = 1;
});
