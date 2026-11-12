import assert from "node:assert/strict";

const base = process.argv[2] || "http://127.0.0.1:3037";
const response = await fetch(`${base}/experiences/pm-intelligence`);
assert.equal(response.status, 200);
const html = await response.text();
const cssPaths = [
  ...html.matchAll(/<link\b[^>]*href="([^"]+\.css(?:\?[^"]*)?)"[^>]*>/g),
].map((match) => match[1]);
assert.equal(
  cssPaths.length,
  0,
  "First paint must not wait on external stylesheets",
);
const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(
  (match) => match[1],
);
assert.ok(styles.length > 0, "Expected framework-inlined styles");
const cssBytes = styles.reduce(
  (bytes, css) => bytes + Buffer.byteLength(css),
  0,
);
assert.ok(
  !styles.some((css) => css.includes(".notion-page")),
  "The experience must not inherit Notion page CSS",
);
assert.ok(
  cssBytes < 120_000,
  `Initial CSS exceeds isolated-route budget: ${cssBytes} bytes`,
);
assert.ok(
  !/src="[^\"]*\/pages\/_app-/.test(html),
  "The experience must not load the Pages App bundle",
);
assert.ok(
  /<h1\b[^>]*>Product work\./.test(
    html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ""),
  ),
  "Full introduction must be server rendered",
);
assert.ok(html.includes("noindex"));
assert.ok(html.includes("/decks/pm-intelligence-system"));
console.log(
  JSON.stringify({
    cssBytes,
    cssFiles: cssPaths.length,
    appIsolated: true,
    fullIntroduction: true,
  }),
);
