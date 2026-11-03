import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import { JSDOM } from "jsdom";

type ParseResult =
  | { success: true; data: unknown }
  | { success: false; error: { issues: { code: string }[] } };
interface Schema {
  safeParse(input: unknown): ParseResult;
  max(size: number): Schema;
  length(size: number): Schema;
}
interface ZodRuntime {
  string(): Schema;
  preprocess(callback: (input: unknown) => unknown, schema: Schema): Schema;
  array(schema: Schema): Schema;
  set(schema: Schema): Schema;
  map(key: Schema, value: Schema): Schema;
  object(shape: Record<string, Schema>): Schema;
}
interface Sanitizer {
  sanitize(
    input: string | Node,
    options: Record<string, unknown>,
  ): string | Node;
  addHook(name: string, callback: (node: Node) => void): void;
}

const require = createRequire(import.meta.url);
const posthogRequire = createRequire(require.resolve("posthog-js"));
const anthropicRequire = createRequire(require.resolve("@anthropic-ai/sdk"));
const functionsRequire = createRequire(require.resolve("@vercel/functions"));
const oidcRequire = createRequire(functionsRequire.resolve("@vercel/oidc"));
const cliConfigRequire = createRequire(
  oidcRequire.resolve("@vercel/cli-config"),
);
const langchainRequire = createRequire(require.resolve("@langchain/anthropic"));
const productionSdkRequire = createRequire(
  langchainRequire.resolve("@anthropic-ai/sdk"),
);
const createSanitizer = posthogRequire("dompurify") as (
  window: unknown,
) => Sanitizer;

function withSanitizer(run: (document: Document, purify: Sanitizer) => void) {
  // jsdom defaults disable script execution and resource loading; no unsafe options.
  const dom = new JSDOM("");
  try {
    run(dom.window.document as Document, createSanitizer(dom.window));
  } finally {
    dom.window.close();
  }
}

void test("PostHog sanitizer neutralizes split template text in a shadow root", () => {
  withSanitizer((document, purify) => {
    const root = document.createElement("div");
    const host = document.createElement("div");
    root.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    for (const text of ["{", "{ inert }", "}"]) {
      shadow.append(document.createTextNode(text));
    }

    purify.sanitize(root, { IN_PLACE: true, SAFE_FOR_TEMPLATES: true });

    assert.doesNotMatch(shadow.textContent ?? "", /\{\{|\}\}/);
  });
});

for (const detached of ["ancestor", "sibling"] as const) {
  void test(`PostHog sanitizer neutralizes an original subtree detached by the ${detached} hook`, () => {
    withSanitizer((document, purify) => {
      const root = document.createElement("div");
      root.innerHTML =
        '<section><b>marker</b><img onerror="inert-marker"></section><aside><img onerror="inert-marker"></aside>';
      const target =
        detached === "ancestor"
          ? root.firstElementChild
          : root.lastElementChild;
      assert.ok(target);
      const originalImage = target.querySelector("img");
      assert.ok(originalImage);
      purify.addHook("uponSanitizeElement", (node) => {
        if (node.nodeName === "B") target.remove();
      });

      purify.sanitize(root, { IN_PLACE: true });

      assert.equal(target.parentNode, null);
      assert.equal(originalImage.hasAttribute("onerror"), false);
    });
  });
}

void test("PostHog sanitizer preserves ordinary string and iframe HTML", () => {
  withSanitizer((document, purify) => {
    const sanitized = purify.sanitize(
      '<p>Hello <strong>tour</strong></p><iframe src="https://example.invalid/embed" allowfullscreen frameborder="0" referrerpolicy="no-referrer"></iframe>',
      {
        ADD_TAGS: ["iframe"],
        ADD_ATTR: ["allowfullscreen", "frameborder", "referrerpolicy"],
      },
    );
    assert.equal(typeof sanitized, "string");
    assert.equal(
      sanitized,
      '<p>Hello <strong>tour</strong></p><iframe src="https://example.invalid/embed" allowfullscreen="" frameborder="0" referrerpolicy="no-referrer"></iframe>',
    );
    const container = document.createElement("div");
    container.innerHTML = sanitized as string;
    assert.equal(container.querySelector("strong")?.textContent, "tour");
  });
});

function assertIssues(result: ParseResult, codes: string[]) {
  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(
      result.error.issues.map((issue) => issue.code),
      codes,
    );
  }
}

for (const [context, consumerRequire] of [
  ["direct Anthropic SDK", anthropicRequire],
  ["Functions → OIDC → CLI config", cliConfigRequire],
  ["production LangChain Anthropic SDK", productionSdkRequire],
] as const) {
  const z = consumerRequire("zod/v4") as ZodRuntime;

  void test(`${context}: bounded array rejects before visiting three invalid elements`, () => {
    let visits = 0;
    const element = z.preprocess((input) => {
      visits++;
      return input;
    }, z.string());
    const result = z.array(element).max(2).safeParse([1, 2, 3]);

    assert.equal(visits, 0);
    assertIssues(result, ["too_big"]);
  });

  void test(`${context}: bounded array preserves valid boundary and in-range validation`, () => {
    let visits = 0;
    const element = z.preprocess((input) => {
      visits++;
      return input;
    }, z.string());
    const schema = z.array(element).max(2);

    assert.deepEqual(schema.safeParse(["a", "b"]), {
      success: true,
      data: ["a", "b"],
    });
    assert.equal(visits, 2);
    visits = 0;
    assertIssues(schema.safeParse([1, "b"]), ["invalid_type"]);
    assert.equal(visits, 2);
  });

  void test(`${context}: exact-length array caps oversized input and preserves smaller-input validation`, () => {
    let visits = 0;
    const element = z.preprocess((input) => {
      visits++;
      return input;
    }, z.string());
    const schema = z.array(element).length(2);

    assertIssues(schema.safeParse([1, 2, 3]), ["too_big"]);
    assert.equal(visits, 0);
    assertIssues(schema.safeParse([1]), ["invalid_type", "too_small"]);
    assert.equal(visits, 1);
    visits = 0;
    assert.deepEqual(schema.safeParse(["a", "b"]), {
      success: true,
      data: ["a", "b"],
    });
    assert.equal(visits, 2);
  });

  void test(`${context}: tiny bounded sets and maps reject before element traversal`, () => {
    const { map: createMap } = z;
    let visits = 0;
    const element = z.preprocess((input) => {
      visits++;
      return input;
    }, z.string());

    assertIssues(
      z
        .set(element)
        .max(2)
        .safeParse(new Set([1, 2, 3])),
      ["too_big"],
    );
    assertIssues(
      createMap(element, element)
        .max(2)
        .safeParse(
          new Map([
            [1, 1],
            [2, 2],
            [3, 3],
          ]),
        ),
      ["too_big"],
    );
    assert.equal(visits, 0);
    assert.equal(
      z
        .set(element)
        .max(2)
        .safeParse(new Set(["a", "b"])).success,
      true,
    );
    assert.equal(
      createMap(element, element)
        .max(2)
        .safeParse(new Map([["a", "b"]])).success,
      true,
    );
    assert.equal(visits, 4);
  });

  void test(`${context}: unbounded arrays still validate every element`, () => {
    let visits = 0;
    const element = z.preprocess((input) => {
      visits++;
      return input;
    }, z.string());

    assertIssues(z.array(element).safeParse([1, 2, 3]), [
      "invalid_type",
      "invalid_type",
      "invalid_type",
    ]);
    assert.equal(visits, 3);
  });
}

for (const [context, sdkRequire] of [
  ["direct Anthropic SDK", anthropicRequire],
  ["production LangChain Anthropic SDK", productionSdkRequire],
] as const) {
  void test(`${context}: structured output converts and parses offline`, () => {
    const z = sdkRequire("zod/v4") as ZodRuntime;
    const { zodOutputFormat } = sdkRequire("@anthropic-ai/sdk/helpers/zod") as {
      zodOutputFormat(schema: Schema): {
        type: string;
        schema: { type: string; properties: { items: { type: string } } };
        parse(content: string): unknown;
      };
    };
    const format = zodOutputFormat(
      z.object({ items: z.array(z.string()).max(2) }),
    );

    assert.equal(format.type, "json_schema");
    assert.equal(format.schema.type, "object");
    assert.equal(format.schema.properties.items.type, "array");
    assert.deepEqual(format.parse('{"items":["a","b"]}'), {
      items: ["a", "b"],
    });
    assert.throws(() => format.parse('{"items":["a","b","c"]}'));
    assert.throws(() => format.parse('{"items":[1]}'));
  });
}

void test("CLI config pure scalar schemas validate synthetic values offline", () => {
  const schemaPath = path.join(
    path.dirname(oidcRequire.resolve("@vercel/cli-config")),
    "schema.js",
  );
  const { globalConfigSchema, authConfigSchema } = cliConfigRequire(
    schemaPath,
  ) as {
    globalConfigSchema: Schema;
    authConfigSchema: Schema;
  };
  const config = {
    credStorage: "file",
    currentTeam: "synthetic-team",
    telemetry: { enabled: false },
  };

  assert.deepEqual(globalConfigSchema.safeParse(config), {
    success: true,
    data: config,
  });
  assertIssues(
    globalConfigSchema.safeParse({ telemetry: { enabled: "invalid" } }),
    ["invalid_type"],
  );
  assert.deepEqual(
    authConfigSchema.safeParse({ skipWrite: true, expiresAt: 123 }),
    {
      success: true,
      data: { skipWrite: true, expiresAt: 123 },
    },
  );
  assertIssues(authConfigSchema.safeParse({ expiresAt: "invalid" }), [
    "invalid_type",
  ]);
});
