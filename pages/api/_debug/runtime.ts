import type { NextApiRequest, NextApiResponse } from "next";

type RuntimeDebugResponse = {
  node: string;
  nextRuntime: "nodejs";
  region?: string;
  vercelEnv?: string;
};

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

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<RuntimeDebugResponse>
) {
  if (!hasValidDebugSecret(req)) {
    res.status(404).end();
    return;
  }

  const payload: RuntimeDebugResponse = {
    node: process.version,
    nextRuntime: "nodejs",
  };

  if (process.env.VERCEL_ENV) {
    payload.vercelEnv = process.env.VERCEL_ENV;
  }

  if (process.env.VERCEL_REGION) {
    payload.region = process.env.VERCEL_REGION;
  }

  res.status(200).json(payload);
}
