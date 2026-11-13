import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import type { ExtendedRecordMap } from "notion-types";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

const require = createRequire(import.meta.url);
async function renderer() {
  const result = await build({
    entryPoints: ["components/NotionPageRenderer.tsx"],
    bundle: true,
    packages: "external",
    write: false,
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
                /^(?:react-notion-x\/build\/third-party\/(?:collection|equation|modal)|\.\/notion-code)$/,
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
                  : "NotionCode";
            return {
              contents: `fixture.evaluated.push('${name}');export function ${name}(){return null;}`,
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
      showCustomHeader?: boolean;
    }) => ReturnType<typeof createElement>;
    fixture: { evaluated: string[] };
  };
}

void test("server rendering leaves body sanitization to the browser and preserves both wrapper classes", async () => {
  const module = await renderer();
  let traversals = 0;
  const map = {
    block: new Proxy(
      {},
      {
        ownKeys() {
          traversals++;
          return [];
        },
      },
    ),
    collection: {},
    collection_view: {},
    collection_query: {},
    notion_user: {},
    signed_urls: {},
  } as ExtendedRecordMap;
  const html = renderToString(
    createElement(module.NotionPageRenderer, {
      recordMap: map,
      pageId: "fixture",
      showCustomHeader: true,
    }),
  );
  assert.equal(
    html,
    '<div class="notion-wrapper has-custom-header-props"><div class="notion-frame"></div></div>',
  );
  assert.equal(
    traversals,
    0,
    "an empty server frame must not traverse the body map",
  );
});

void test("the server frame does not evaluate client math code collection or modal modules", async () => {
  const module = await renderer();
  assert.deepEqual(module.fixture.evaluated, []);
});
