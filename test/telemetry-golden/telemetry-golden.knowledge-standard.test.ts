// Golden telemetry smoke test for the knowledge->standard pipeline.
// Run with `pnpm test:telemetry-golden`, and refresh snapshots via
// `UPDATE_GOLDEN=1 pnpm test:telemetry-golden`.
// Catches regressions for `rag:root`, `context:selection`, and
// `rag_retrieval_stage` telemetry contents without making Langfuse network calls.

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ensureLangfuseClient, langfuse } from "@/lib/langfuse";
import {
  drainIngestionBatches,
  resetIngestionBatches,
} from "@/lib/server/telemetry/telemetry-test-sink";

import { buildGoldenFromIngestion } from "./buildGoldenFromIngestion";
import { normalizeGolden } from "./normalizeGolden";
import { GOLDEN_TRACE_OPTIONS, runGoldenScenario } from "./scenario";

const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "golden.knowledge-standard.json",
);

async function waitForEventLoop() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function captureGoldenTelemetryPayload() {
  await resetIngestionBatches();

  const client = await ensureLangfuseClient();
  if (!client) {
    throw new Error("langfuse client unavailable");
  }

  const trace = langfuse.trace(GOLDEN_TRACE_OPTIONS);
  if (!trace) {
    throw new Error("langfuse trace was not created");
  }
  await runGoldenScenario(trace);

  await waitForEventLoop();

  const payload = buildGoldenFromIngestion(drainIngestionBatches());
  return payload;
}

void describe("golden telemetry payload", () => {
  void it("matches the knowledge intent standard snapshot", async () => {
    process.env.TELEMETRY_TEST_SINK = "1";
    process.env.LANGFUSE_INCLUDE_PII = "false";
    process.env.TELEMETRY_ENABLED = "1";
    process.env.TELEMETRY_SAMPLE_RATE_DEFAULT = "1";
    process.env.TELEMETRY_SAMPLE_RATE_MAX = "1";
    process.env.TELEMETRY_DETAIL_DEFAULT = "standard";
    process.env.TELEMETRY_DETAIL_MAX = "standard";
    process.env.LANGFUSE_BASE_URL = "https://example.com";
    process.env.LANGFUSE_PUBLIC_KEY = "golden-public";
    process.env.LANGFUSE_SECRET_KEY = "golden-secret";

    const originalDateNow = Date.now;
    let fakeTime = 1_700_000_000_000;

    (Date as any).now = () => {
      fakeTime += 1;
      return fakeTime;
    };

    try {
      const payload = await captureGoldenTelemetryPayload();
      const normalized = normalizeGolden(payload);

      if (process.env.UPDATE_GOLDEN === "1") {
        await writeFile(
          FIXTURE_PATH,
          `${JSON.stringify(normalized, null, 2)}\n`,
          "utf8",
        );
        return;
      }

      const expectedText = await readFile(FIXTURE_PATH, "utf8");
      const expected = JSON.parse(expectedText);
      assert.deepStrictEqual(normalized, expected);
    } finally {
      (Date as any).now = originalDateNow;
    }
  });
});
