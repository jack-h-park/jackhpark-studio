/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("node:module");
const originalLoad = Module._load;

const threshold = Number(process.env.REQUIRE_TRACE_THRESHOLD_MS ?? "200");

if (process.env.REQUIRE_TRACE !== "1") {
  module.exports = {};
  return;
}

Module._load = function (request, parent) {
  const start = process.hrtime.bigint();
  const result = originalLoad.apply(this, arguments);
  const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
  if (durationMs > threshold) {
    const parentName = parent?.filename ?? "(none)";
    console.log(
      `[require-trace] ${durationMs.toFixed(1)}ms ${request} -> ${Module._resolveFilename(
        request,
        parent,
      )} (parent: ${parentName})`,
    );
  }
  return result;
};
