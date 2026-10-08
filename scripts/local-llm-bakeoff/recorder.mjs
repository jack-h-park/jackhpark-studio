#!/usr/bin/env node
// scripts/local-llm-bakeoff/recorder.mjs
import { once } from "node:events";
import { appendFile } from "node:fs/promises";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const STUB_ANSWER = "Recorded.";
const STUB_MODEL = "recorder-stub";

/** @param {import("node:http").IncomingMessage} req */
async function readBody(req) {
  /** @type {Buffer[]} */
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

/** @param {import("node:http").ServerResponse} res */
function sendStubStream(res) {
  const base = {
    id: "stub",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: STUB_MODEL,
  };
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: STUB_ANSWER }, finish_reason: null }] })}\n\n`,
  );
  res.write(
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
  );
  res.end("data: [DONE]\n\n");
}

function stubCompletion() {
  return {
    id: "stub",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: STUB_MODEL,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: STUB_ANSWER },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 1, total_tokens: 1 },
  };
}

/**
 * OpenAI-compatible stand-in that stores every chat request the app sends
 * and answers with a fixed stub. Pointing the app's LM Studio provider here
 * captures the exact messages the app assembles, retrieval included.
 * `POST /__label {label}` tags the requests that follow.
 * @param {{ port: number; logPath: string; host?: string }} options
 */
export async function startRecorder({ port, logPath, host = "127.0.0.1" }) {
  /** @type {string | null} */
  let label = null;
  let seq = 0;
  const server = createServer(async (req, res) => {
    try {
      const raw = await readBody(req);
      if (req.method === "POST" && req.url === "/__label") {
        label = JSON.parse(raw).label ?? null;
        return sendJson(res, 200, { label });
      }
      if (req.method === "GET" && req.url === "/v1/models") {
        return sendJson(res, 200, {
          object: "list",
          data: [{ id: STUB_MODEL, object: "model" }],
        });
      }
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        const body = JSON.parse(raw);
        seq += 1;
        await appendFile(
          logPath,
          `${JSON.stringify({ label, seq, receivedAt: new Date().toISOString(), body })}\n`,
        );
        return body.stream
          ? sendStubStream(res)
          : sendJson(res, 200, stubCompletion());
      }
      return sendJson(res, 404, {
        error: `recorder does not serve ${req.method} ${req.url}`,
      });
    } catch (error) {
      return sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  server.listen(port, host);
  await once(server, "listening");
  const address = server.address();
  const boundPort =
    typeof address === "object" && address !== null ? address.port : port;
  return {
    url: `http://${host}:${boundPort}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve(undefined));
      }),
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      port: { type: "string", default: "18080" },
      log: { type: "string" },
    },
  });
  if (!values.log) {
    throw new Error("--log is required");
  }
  const recorder = await startRecorder({
    port: Number(values.port),
    logPath: values.log,
  });
  console.log(
    `recorder listening on ${recorder.url}; set LMSTUDIO_BASE_URL=${recorder.url}/v1`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
