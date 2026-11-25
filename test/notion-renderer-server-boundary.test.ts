import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import type { ExtendedRecordMap } from "notion-types";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import {
  PROSE_PAGE_ID,
  PROSE_TEXT,
  proseRecordMap,
} from "./fixtures/notion-prose-record-map";

const require = createRequire(import.meta.url);
async function renderer() {
  const result = await build({
    entryPoints: ["components/NotionPageRenderer.tsx"],
    bundle: true,
    packages: "external",
    write: false,
    loader: { ".module.css": "empty" },
    platform: "node",
    format: "esm",
    jsx: "automatic",
    banner: { js: "const fixture={evaluated:[]};" },
    footer: { js: "export {fixture};" },
    plugins: [
      {
        name: "client-import-canaries",
        setup(b) {
          b.onResolve(
            {
              filter:
                /^(?:react-notion-x\/build\/third-party\/(?:collection|equation|modal)|\.\/notion-code|react-tweet)$/,
            },
            (a) => ({ path: a.path, namespace: "client" }),
          );
          b.onLoad({ filter: /.*/, namespace: "client" }, (a) => {
            const name = a.path.endsWith("collection")
              ? "Collection"
              : a.path.endsWith("equation")
                ? "Equation"
                : a.path.endsWith("modal")
                  ? "Modal"
                  : a.path === "react-tweet"
                    ? "Tweet"
                    : "NotionCode";
            return {
              contents: `fixture.evaluated.push('${name}');export function ${name}(){return null;}${name === "Tweet" ? "export const EmbeddedTweet=Tweet,TweetNotFound=Tweet,TweetSkeleton=Tweet;" : ""}`,
              loader: "js",
            };
          });
          b.onResolve({ filter: /^(?:[^./@]|@[^/])/ }, (a) =>
            a.kind === "entry-point" || a.path.startsWith("node:")
              ? undefined
              : {
                  path: pathToFileURL(require.resolve(a.path)).href,
                  external: true,
                },
          );
        },
      },
    ],
  });
  return (await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + `\n//${Math.random()}`).toString("base64")}`
  )) as {
    NotionPageRenderer: (props: {
      recordMap: ExtendedRecordMap;
      pageId?: string;
      rootPageId?: string;
      fullPage?: boolean;
      showCustomHeader?: boolean;
    }) => ReturnType<typeof createElement>;
    fixture: { evaluated: string[] };
  };
}

void test("server HTML carries the article prose outside script tags and keeps both wrapper classes", async () => {
  const module = await renderer();
  const html = renderToString(
    createElement(module.NotionPageRenderer, {
      recordMap: proseRecordMap(),
      pageId: PROSE_PAGE_ID,
      rootPageId: PROSE_PAGE_ID,
      fullPage: true,
      showCustomHeader: true,
    }),
  );
  assert.ok(
    html.startsWith(
      '<div class="notion-wrapper has-custom-header-props"><div class="notion-frame">',
    ),
  );
  // Crawlers and LLM fetchers read visible markup, not serialized props, so
  // parse the HTML and drop every script element before reading its text.
  const { document } = new JSDOM(html).window;
  for (const script of document.querySelectorAll("script")) script.remove();
  const text = (document.body.textContent ?? "").replaceAll(/\s+/g, " ");
  for (const expected of PROSE_TEXT) {
    assert.ok(text.includes(expected), `server HTML is missing "${expected}"`);
  }
  assert.match(
    document.querySelector("h2")?.textContent ?? "",
    /Server rendered section heading/,
  );
  assert.ok(
    document.querySelector("pre.notion-code.language-javascript"),
    "code blocks must reach the server HTML as plain text",
  );
});

void test("server rendering does not evaluate client math code collection modal or tweet modules", async () => {
  const module = await renderer();
  renderToString(
    createElement(module.NotionPageRenderer, {
      recordMap: proseRecordMap(),
      pageId: PROSE_PAGE_ID,
      rootPageId: PROSE_PAGE_ID,
      fullPage: true,
    }),
  );
  assert.deepEqual(module.fixture.evaluated, []);
});
