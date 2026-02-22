import { createRequire } from "node:module";

import type { NextApiRequest, NextApiResponse } from "next";

type JsdomSmokeSuccessResponse = {
  jsdomVersion?: string;
  node: string;
  ok: true;
  title: string;
};

type JsdomSmokeErrorResponse = {
  code?: string;
  message: string;
  node: string;
  ok: false;
  stackTop?: string[];
};

type JsdomSmokeResponse = JsdomSmokeSuccessResponse | JsdomSmokeErrorResponse;
type JsdomRequireResult = {
  JSDOM: new (html?: string) => {
    window: {
      document: {
        title: string;
      };
    };
  };
};

const runtimeRequire = createRequire(import.meta.url);

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

function getJsdomVersion(): string | undefined {
  try {
    // This is intentionally resolved via CommonJS at runtime to mirror the production failure path.
    const packageJson = runtimeRequire("jsdom/package.json") as { version?: string };
    return packageJson.version;
  } catch {
    return undefined;
  }
}

function toErrorResponse(error: unknown): JsdomSmokeErrorResponse {
  const node = process.version;

  if (error instanceof Error) {
    const stackTop = error.stack?.split("\n").slice(0, 8).map((line) => line.trim());
    const errorWithCode = error as Error & { code?: unknown };

    return {
      code: typeof errorWithCode.code === "string" ? errorWithCode.code : undefined,
      message: error.message,
      node,
      ok: false,
      stackTop,
    };
  }

  return {
    message: "Unknown error",
    node,
    ok: false,
  };
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<JsdomSmokeResponse>
) {
  if (!hasValidDebugSecret(req)) {
    res.status(404).end();
    return;
  }

  try {
    // This route intentionally uses CommonJS require() to reproduce ERR_REQUIRE_ESM if present.
    const { JSDOM } = runtimeRequire("jsdom") as JsdomRequireResult;
    const dom = new JSDOM("<!doctype html><html><body><div>hi</div></body></html>");

    res.status(200).json({
      jsdomVersion: getJsdomVersion(),
      node: process.version,
      ok: true,
      title: dom.window.document.title ?? "",
    });
  } catch (err: unknown) {
    res.status(500).json(toErrorResponse(err));
  }
}
