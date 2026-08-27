// Golden telemetry smoke test for the knowledge->standard pipeline on the
// Langfuse v4 (OTel) backend. Run with `pnpm test:telemetry-golden:otel`, and
// refresh via `UPDATE_GOLDEN=1 pnpm test:telemetry-golden:otel`.
//
// Runs the same scenario as the legacy golden, against the other backend, so
// the two snapshots can be compared while LANGFUSE_OTEL_TRACING is rolled out.
// Both are kept until the legacy backend is removed.

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import { createOtelTrace } from "@/lib/server/telemetry/otel-trace-backend";

import { buildGoldenFromSpans } from "./buildGoldenFromSpans";
import { normalizeGolden } from "./normalizeGolden";
import { GOLDEN_TRACE_OPTIONS, runGoldenScenario } from "./scenario";

const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "golden.otel.knowledge-standard.json",
);

const exporter = new InMemorySpanExporter();

before(() => {
  // A SimpleSpanProcessor, not the LangfuseSpanProcessor: this test asserts what
  // the app puts on its spans, not that the exporter can reach Langfuse. No
  // network calls.
  new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  }).register();
});

async function captureGoldenTelemetryPayload() {
  exporter.reset();

  // createOtelTrace directly rather than through langfuse.trace(): the backend
  // choice is what this test pins, so it should not depend on an env var being
  // set correctly by the runner.
  const trace = createOtelTrace(GOLDEN_TRACE_OPTIONS, "dev");
  await runGoldenScenario(trace);
  trace.end?.();

  return buildGoldenFromSpans(exporter.getFinishedSpans());
}

void describe("golden telemetry payload (OTel backend)", () => {
  void it("matches the knowledge intent standard snapshot", async () => {
    process.env.LANGFUSE_INCLUDE_PII = "false";

    const payload = normalizeGolden(await captureGoldenTelemetryPayload());

    if (process.env.UPDATE_GOLDEN === "1") {
      await writeFile(FIXTURE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
      return;
    }

    const expected = JSON.parse(
      await readFile(FIXTURE_PATH, "utf8"),
    ) as unknown;
    assert.deepEqual(payload, expected);
  });

  void it("puts the request-level record on a single root observation", async () => {
    const payload = await captureGoldenTelemetryPayload();

    // v4 has no trace entity. Exactly one root observation must carry the
    // request-level input/output, or downstream consumers have nowhere to read
    // the overall request from.
    assert.equal(payload.traces.length, 1);
    assert.equal(payload.traces[0]?.name, "langchain-chat");
    assert.ok(payload.traces[0]?.input, "root must carry the request input");
  });
});
