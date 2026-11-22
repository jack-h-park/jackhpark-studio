import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import nextConfig from "../next.config.js";

void test("local React aliases leave framework-specific React subpaths to Next", () => {
  const edgeRenderer = "next/dist/build/webpack/alias/react-dom-server.js";
  const config = {
    resolve: {
      alias: { "react-dom/server.edge$": edgeRenderer } as Record<
        string,
        string
      >,
    },
  };
  const webpack = nextConfig.webpack as (value: typeof config) => typeof config;
  const aliases = webpack(config).resolve.alias;
  assert.equal(
    aliases.react,
    undefined,
    "Broad aliases must not mask App Router React resolutions",
  );
  assert.equal(aliases["react-dom"], undefined);
  assert.equal(aliases["react-dom/server.edge$"], edgeRenderer);
  for (const specifier of [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
  ]) {
    assert.equal(
      aliases[`${specifier}$`],
      path.join(process.cwd(), "node_modules", specifier),
    );
  }
});
