import assert from "node:assert/strict";
import test from "node:test";

import type { NextApiRequest, NextApiResponse } from "next";
import { build } from "esbuild";

import type { NotionPageInfo, PageError } from "../lib/types";

const pageId = "28299029-c0b4-81ce-8999-d425287d3db6";
const cover = "https://images.unsplash.com/cover.jpg";
const socialCover = "https://images.unsplash.com/social.jpg?w=800";
const icon = "https://images.unsplash.com/unused-author.jpg";
const fallback = "https://images.unsplash.com/fallback.jpg?w=1200";

type PageResult =
  | { type: "success"; data: NotionPageInfo }
  | { type: "error"; error: PageError };
type Bundle = {
  default: (req: NextApiRequest, res: NextApiResponse) => Promise<Response>;
  getNotionPageInfo: (input: { pageId: string }) => Promise<PageResult>;
  fixture: {
    recordMap: ReturnType<typeof recordMap>;
    reads: string[];
    heads: string[];
    rejected: string[];
    renderOptions: { width: number; height: number } | null;
  };
};

function recordMap(options: { socialImage?: string; title?: string } = {}) {
  return {
    block: {
      [pageId]: {
        role: "reader",
        value: {
          id: pageId,
          type: "page",
          version: 1,
          alive: true,
          parent_id: "collection-fixture",
          parent_table: "collection",
          created_time: 0,
          last_edited_time: 0,
          properties: {
            title: [[options.title ?? "An observable card"]],
            author: [["Fixture Author"]],
            social: options.socialImage ? [[options.socialImage]] : [],
          },
          format: { page_cover: cover, page_icon: icon },
        },
      },
    },
    collection: {
      "collection-fixture": {
        role: "reader",
        value: {
          id: "collection-fixture",
          schema: {
            title: { name: "Name", type: "title" },
            author: { name: "Author", type: "text" },
            social: { name: "Social Image", type: "url" },
          },
        },
      },
    },
    collection_view: {},
    notion_user: {},
    collection_query: {},
    signed_urls: {},
  };
}

async function route(): Promise<Bundle> {
  const result = await build({
    entryPoints: ["pages/api/social-image.tsx"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    define: {
      "process.env.NEXT_PUBLIC_SITE_CONFIG": JSON.stringify(
        JSON.stringify({ defaultPageCover: fallback }),
      ),
    },
    banner: {
      js: "import {createRequire} from 'node:module'; const require = createRequire(process.cwd() + '/package.json'); const fixture = {recordMap: null, reads: [], heads: [], rejected: [], renderOptions: null};",
    },
    footer: { js: "export {fixture};" },
    plugins: [
      {
        name: "social-image-external-boundaries",
        setup(b) {
          b.onResolve(
            {
              filter:
                /^(?:ky|next\/og|@\/lib\/(?:notion-api|fonts\/inter-semibold))$/,
            },
            ({ path }) => ({ path, namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => {
            const contents =
              path === "ky"
                ? `export default {async head(url) {
                    fixture.heads.push(url);
                    if (fixture.rejected.includes(url)) throw new Error('Unavailable image');
                    return new Response(null);
                  }};`
                : path === "@/lib/notion-api"
                  ? `export const notion = {async getPage(id) {
                      fixture.reads.push(id); return fixture.recordMap;
                    }};`
                  : path === "next/og"
                    ? `import {renderToStaticMarkup} from 'react-dom/server';
                      export class ImageResponse extends Response {
                        constructor(element, options) {
                          super(renderToStaticMarkup(element));
                          fixture.renderOptions = options;
                        }
                      }`
                    : "export default new ArrayBuffer(0);";
            return { contents, loader: "js", resolveDir: process.cwd() };
          });
        },
      },
    ],
  });
  const module = (await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + `\n//${Math.random()}`).toString("base64")}`
  )) as Bundle;
  module.fixture.recordMap = recordMap();
  return module;
}

void test("social metadata validates the displayed cover without looking up the unused author icon", async () => {
  const module = await route();
  const result = await module.getNotionPageInfo({ pageId });
  assert.equal(result.type, "success");
  if (result.type !== "success") return;
  assert.equal(result.data.title, "An observable card");
  assert.equal(result.data.author, "Fixture Author");
  assert.equal(
    result.data.image,
    "https://images.unsplash.com/cover.jpg?w=1200&fit=max",
  );
  assert.deepEqual(module.fixture.reads, [pageId]);
  assert.deepEqual(module.fixture.heads, [cover]);
});

void test("an explicit social image retains priority over the page cover", async () => {
  const module = await route();
  module.fixture.recordMap = recordMap({ socialImage: socialCover });
  const result = await module.getNotionPageInfo({ pageId });
  assert.equal(result.type, "success");
  if (result.type !== "success") return;
  assert.equal(result.data.image, socialCover);
  assert.deepEqual(module.fixture.heads, [socialCover]);
});

void test("a failed cover validation keeps the configured fallback image", async () => {
  const module = await route();
  module.fixture.rejected = [cover];
  const result = await module.getNotionPageInfo({ pageId });
  assert.equal(result.type, "success");
  if (result.type !== "success") return;
  assert.equal(result.data.image, fallback);
  assert.deepEqual(module.fixture.heads, [cover]);
});

void test("the social route renders the selected cover, title and author at the existing card dimensions", async () => {
  const module = await route();
  const response = await module.default(
    {
      url: `https://studio.example/api/social-image?id=${pageId}`,
    } as NextApiRequest,
    {} as NextApiResponse,
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /An observable card/);
  assert.match(html, /Fixture Author/);
  assert.match(html, /cover\.jpg\?w=1200&amp;fit=max/);
  assert.doesNotMatch(html, /unused-author/);
  assert.equal(module.fixture.renderOptions?.width, 1200);
  assert.equal(module.fixture.renderOptions?.height, 630);
  assert.deepEqual(module.fixture.heads, [cover]);
});
