import type { NextApiRequest, NextApiResponse } from "next";

import { getAppEnv } from "@/lib/app-env";
import { flushLangfuseSpans } from "@/lib/server/telemetry/otel-runtime";

type RuntimeDebugResponse = {
  node: string;
  nextRuntime: "nodejs";
  region?: string;
  vercelEnv?: string;
  appEnv?: string;
  /** Present only for `?span=1`. Look this trace up in Langfuse to confirm the
   * OTel export path works in this environment. */
  probeTraceId?: string | null;
  probeError?: string;
};

/**
 * Emits one throwaway span through the Langfuse OTel pipeline and flushes it
 * inline, so the export path can be verified in an environment before any real
 * telemetry is moved onto it.
 *
 * Flushed inline rather than via waitUntil: this endpoint exists to answer
 * "did it arrive", so it should not return until the send has been attempted.
 */
async function emitProbeSpan(): Promise<{
  traceId?: string | null;
  error?: string;
}> {
  try {
    const { startActiveObservation } = await import("@langfuse/tracing");

    let traceId: string | null = null;
    await startActiveObservation("debug:otel-probe", async (span) => {
      span.update({
        input: { probe: true },
        output: { ok: true },
        metadata: { appEnv: getAppEnv() },
      });
      traceId = span.traceId;
    });

    await flushLangfuseSpans();
    return { traceId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function getProvidedSecret(req: NextApiRequest): string | null {
  const headerSecret = req.headers["x-debug-secret"];
  if (typeof headerSecret === "string" && headerSecret.length > 0) {
    return headerSecret;
  }

  const querySecret = req.query.secret;
  if (typeof querySecret === "string" && querySecret.length > 0) {
    return querySecret;
  }

  return null;
}

function hasValidDebugSecret(req: NextApiRequest): boolean {
  const expectedSecret = process.env.DEBUG_API_SECRET;
  if (!expectedSecret) {
    return false;
  }

  const providedSecret = getProvidedSecret(req);
  return providedSecret === expectedSecret;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RuntimeDebugResponse>,
) {
  if (!hasValidDebugSecret(req)) {
    res.status(404).end();
    return;
  }

  const payload: RuntimeDebugResponse = {
    node: process.version,
    nextRuntime: "nodejs",
    appEnv: getAppEnv(),
  };

  if (process.env.VERCEL_ENV) {
    payload.vercelEnv = process.env.VERCEL_ENV;
  }

  if (process.env.VERCEL_REGION) {
    payload.region = process.env.VERCEL_REGION;
  }

  if (req.query.span === "1") {
    const probe = await emitProbeSpan();
    payload.probeTraceId = probe.traceId ?? null;
    if (probe.error) {
      payload.probeError = probe.error;
    }
  }

  res.status(200).json(payload);
}
