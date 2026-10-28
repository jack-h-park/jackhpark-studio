import assert from "node:assert/strict";
import {
  type ClientRequest,
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type RequestOptions,
} from "node:http";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const communityRequire = createRequire(
  require.resolve("@langchain/community/package.json"),
);
const ibmRequire = createRequire(
  communityRequire.resolve("ibm-cloud-sdk-core"),
);
const axiosRequire = createRequire(ibmRequire.resolve("axios"));

type RedirectOptions = RequestOptions & {
  maxRedirects: number;
  sensitiveHeaders: string[];
};

const followRedirects = axiosRequire("follow-redirects") as {
  http: {
    request(
      options: RedirectOptions,
      callback: (response: IncomingMessage) => void,
    ): Pick<ClientRequest, "end" | "destroy" | "once">;
  };
};

function requestHeaders(
  format: "object" | "array",
  port: number,
): RequestOptions["headers"] {
  const headers = {
    Host: `127.0.0.1:${port}`,
    Authorization: "Bearer synthetic-authorization",
    Cookie: "session=synthetic-cookie",
    "Proxy-Authorization": "Basic synthetic-proxy",
    "X-Api^Key": "synthetic-caret",
    "X-Token|Secret": "synthetic-pipe",
    "X-Control-Key": "synthetic-control",
    "X-Harmless": "keep-me",
    "X-Token": "keep-token",
    Secret: "keep-secret",
  };
  return format === "array" ? Object.entries(headers).flat() : headers;
}

function protectedHeaders(headers: IncomingHttpHeaders) {
  return {
    authorization: headers.authorization,
    cookie: headers.cookie,
    "proxy-authorization": headers["proxy-authorization"],
    "x-api^key": headers["x-api^key"],
    "x-token|secret": headers["x-token|secret"],
    "x-control-key": headers["x-control-key"],
  };
}

for (const format of ["object", "array"] as const) {
  for (const crossHost of [true, false]) {
    void test(
      `${format} headers ${crossHost ? "strip credentials across hosts" : "retain credentials on the same origin"}`,
      { timeout: 5000 },
      async (t) => {
        const received: IncomingHttpHeaders[] = [];
        const server = createServer((request, response) => {
          request.resume();
          received.push({ ...request.headers });
          if (request.url === "/start") {
            const host = crossHost ? "localhost" : "127.0.0.1";
            response.writeHead(302, {
              Location: `http://${host}:${port}/target`,
            });
          }
          response.end("ok");
        });
        t.after(async () => {
          server.closeAllConnections();
          await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          });
        });
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", resolve);
        });
        const address = server.address();
        assert.ok(address && typeof address === "object");
        const port = address.port;

        let request:
          | ReturnType<typeof followRedirects.http.request>
          | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await new Promise<void>((resolve, reject) => {
            timer = setTimeout(() => {
              const error = new Error("Loopback redirect request timed out");
              request?.destroy(error);
              reject(error);
            }, 2000);
            request = followRedirects.http.request(
              {
                hostname: "127.0.0.1",
                port,
                path: "/start",
                method: "GET",
                headers: requestHeaders(format, port),
                sensitiveHeaders: [
                  "X-Api^Key",
                  "X-Token|Secret",
                  "X-Control-Key",
                ],
                maxRedirects: 1,
                agent: false,
                family: 4,
                // Different hostnames trigger stripping; DNS stays on loopback.
                lookup(hostname, _options, callback) {
                  if (hostname !== "localhost") {
                    callback(
                      new Error("Only loopback hostnames are allowed"),
                      "",
                      4,
                    );
                    return;
                  }
                  callback(null, "127.0.0.1", 4);
                },
              },
              (response) => {
                response.once("error", reject);
                response.once("end", () => {
                  try {
                    assert.equal(response.statusCode, 200);
                    resolve();
                  } catch (err) {
                    reject(err);
                  }
                });
                response.resume();
              },
            );
            request.once("error", reject);
            request.end();
          });
        } finally {
          clearTimeout(timer);
          request?.destroy();
        }

        assert.equal(
          received.length,
          2,
          "exactly one redirect must be followed",
        );
        const expectedCredentials = {
          authorization: "Bearer synthetic-authorization",
          cookie: "session=synthetic-cookie",
          "proxy-authorization": "Basic synthetic-proxy",
          "x-api^key": "synthetic-caret",
          "x-token|secret": "synthetic-pipe",
          "x-control-key": "synthetic-control",
        };
        assert.deepEqual(protectedHeaders(received[0]), expectedCredentials);
        assert.deepEqual(
          protectedHeaders(received[1]),
          crossHost
            ? {
                authorization: undefined,
                cookie: undefined,
                "proxy-authorization": undefined,
                "x-api^key": undefined,
                "x-token|secret": undefined,
                "x-control-key": undefined,
              }
            : expectedCredentials,
        );
        assert.equal(received[1]["x-harmless"], "keep-me");
        assert.equal(received[1]["x-token"], "keep-token");
        assert.equal(received[1].secret, "keep-secret");
        assert.equal(
          received[1].host,
          `${crossHost ? "localhost" : "127.0.0.1"}:${port}`,
        );
      },
    );
  }
}
