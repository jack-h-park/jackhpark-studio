import assert from "node:assert/strict";

const base = process.argv[2] || "http://127.0.0.1:3037";
const response = await fetch(`${base}/experiences/pm-intelligence`);
assert.equal(response.status, 200);
const html = await response.text();
const htmlBytes = Buffer.byteLength(html);
assert.ok(
  htmlBytes < 80_000,
  `Initial HTML must not duplicate a full stylesheet: ${htmlBytes} bytes`,
);
const cssPaths = [
  ...new Set(
    [
      ...html.matchAll(/<link\b[^>]*href="([^"]+\.css(?:\?[^"]*)?)"[^>]*>/g),
    ].map((match) => match[1]),
  ),
];
assert.ok(cssPaths.length > 0, "Expected independently cacheable stylesheets");
let cssBytes = 0;
for (const url of cssPaths) {
  assert.match(url, /^\/_next\/static\/css\/[a-f0-9]+\.css$/);
  const asset = await fetch(new URL(url, base));
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control") || "", /immutable/);
  assert.match(asset.headers.get("cache-control") || "", /max-age=31536000/);
  const css = await asset.text();
  cssBytes += Buffer.byteLength(css);
  assert.ok(
    !css.includes(".notion-page"),
    "Notion page CSS must remain excluded",
  );
}
assert.ok(
  cssBytes < 90_000,
  `Initial CSS exceeds minimal-shell budget: ${cssBytes} bytes`,
);
const inlineBytes = [
  ...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g),
].reduce((total, match) => total + Buffer.byteLength(match[1]), 0);
assert.ok(inlineBytes < 2_000, "Do not duplicate the shared stylesheet inline");
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
    htmlBytes,
    cssBytes,
    inlineBytes,
    cssFiles: cssPaths.length,
    immutableCss: true,
    appIsolated: true,
    fullIntroduction: true,
  }),
);
