import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import postcss from "postcss";
import tailwindcss from "tailwindcss";

interface Address {
  correctForm(): string;
  zone: string;
}

interface UriComponents {
  scheme?: string;
  host?: string;
  path?: string;
  error?: string;
}

interface UriRuntime {
  parse(input: string): UriComponents;
  normalize(input: string): string;
  resolve(base: string, relative: string): string;
  serialize(components: UriComponents, options?: { reference: string }): string;
  equal(left: string, right: string): boolean;
}

interface SelectorNode {
  type: string;
  value: string;
  attribute?: string;
}

interface SelectorRoot {
  walk(callback: (node: SelectorNode) => void): void;
  toString(): string;
}

const require = createRequire(import.meta.url);
// Resolve through consumers without executing Checkly or opening its stores.
const checklyRequire = createRequire(require.resolve("checkly"));
const proxyRequire = createRequire(checklyRequire.resolve("socks-proxy-agent"));
const socksRequire = createRequire(proxyRequire.resolve("socks"));
const confRequire = createRequire(checklyRequire.resolve("conf"));
const ajvRequire = createRequire(confRequire.resolve("ajv"));
const tailwindRequire = createRequire(require.resolve("tailwindcss"));
const { Address4, Address6 } = socksRequire("ip-address") as {
  Address4: new (input: string) => Pick<Address, "correctForm">;
  Address6: { new (input: string): Address; isValid(input: string): boolean };
};
const { ipToBuffer } = socksRequire("socks/build/common/helpers.js") as {
  ipToBuffer(input: string): Buffer;
};
const uri = ajvRequire("fast-uri") as UriRuntime;
const Ajv = confRequire("ajv") as new () => {
  addSchema(schema: Record<string, unknown>): void;
  compile(schema: Record<string, unknown>): (data: unknown) => boolean;
};
const selectorParser = tailwindRequire("postcss-selector-parser") as () => {
  astSync(input: string): SelectorRoot;
};
const nesting = require("tailwindcss/nesting") as () => postcss.Plugin;

void test("SOCKS address parsing preserves IPv4, IPv6 and IPv6 zones", () => {
  assert.equal(new Address4("192.0.2.1").correctForm(), "192.0.2.1");
  assert.equal(
    new Address6("2001:0db8:0:0:0:0:0:1").correctForm(),
    "2001:db8::1",
  );
  const zoned = new Address6("fe80::1%eth0");
  assert.equal(zoned.zone, "%eth0");
  assert.equal(zoned.correctForm(), "fe80::1");
  assert.equal(Address6.isValid("::1%\n"), false);
});

void test("SOCKS converts ordinary addresses to exact wire bytes offline", () => {
  assert.equal(ipToBuffer("192.0.2.1").toString("hex"), "c0000201");
  assert.equal(
    ipToBuffer("::1").toString("hex"),
    "00000000000000000000000000000001",
  );
  assert.throws(
    () => ipToBuffer("not-an-address"),
    /Invalid IP address format/,
  );
});

void test("AJV URI resolver preserves ordinary HTTPS normalization", () => {
  assert.equal(
    uri.normalize("HTTPS://EXAMPLE.INVALID:443/a"),
    "https://example.invalid/a",
  );
  assert.equal(
    uri.serialize(uri.parse("https://example.invalid/a?q=1#part")),
    "https://example.invalid/a?q=1#part",
  );
});

void test("AJV URI resolver rejects encoded schemes without activating them", () => {
  const input = "ht%74ps://example.invalid/";
  assert.equal(uri.parse(input).error, "URI scheme is malformed.");
  assert.equal(uri.normalize(input), input);
  assert.equal(uri.equal(input, "https://example.invalid/"), false);
  assert.throws(
    () => uri.resolve("https://example.invalid/base/", input),
    /URI scheme is malformed/,
  );
});

void test("AJV URI resolver rejects an authority containing a second delimiter", () => {
  const input = "https://user@other@example.invalid/";
  assert.equal(uri.parse(input).error, "URI host is malformed.");
  assert.equal(uri.normalize(input), input);
  assert.throws(
    () =>
      uri.resolve("https://example.invalid/", "//user@other@example.invalid/"),
    /URI host is malformed/,
  );
});

void test("AJV URI resolver keeps relative normalization at its original target", () => {
  assert.equal(uri.normalize("a/../b"), "b");
  assert.equal(uri.normalize("../x"), "../x");
  assert.equal(uri.normalize("x/.."), "./");
  assert.equal(
    uri.resolve("https://example.invalid/p/q/", uri.normalize("a/../b")),
    "https://example.invalid/p/q/b",
  );
  assert.equal(uri.equal("../x", "x"), false);
});

void test("AJV URI resolver cannot emit a scheme from a suffix path colon", () => {
  const output = uri.serialize(
    { scheme: "foo", path: "a:b" },
    { reference: "suffix" },
  );
  assert.equal(output, "a%3Ab");
  assert.equal(uri.parse(output).scheme, undefined);
});

void test("Checkly's fixed string-field schema validates synthetic data offline", () => {
  const ajv = new Ajv();
  const validate = ajv.compile({
    type: "object",
    properties: {
      accountId: { type: "string" },
      accountName: { type: "string" },
      apiKey: { type: "string" },
    },
  });
  assert.equal(
    validate({
      accountId: "fixture-id",
      accountName: "fixture",
      apiKey: "synthetic",
    }),
    true,
  );
  assert.equal(validate({ accountId: 42 }), false);
  assert.equal(validate({ accountName: false }), false);
  assert.equal(validate({ apiKey: null }), false);
});

void test("Checkly's AJV resolves local and registered relative schema references", () => {
  const ajv = new Ajv();
  ajv.addSchema({
    $id: "https://example.invalid/schemas/name.json",
    type: "string",
  });
  const validate = ajv.compile({
    $id: "https://example.invalid/schemas/config.json",
    type: "object",
    definitions: { local: { type: "integer" } },
    properties: {
      name: { $ref: "name.json" },
      count: { $ref: "#/definitions/local" },
    },
    required: ["name", "count"],
  });
  assert.equal(validate({ name: "fixture", count: 2 }), true);
  assert.equal(validate({ name: 2, count: 2 }), false);
  assert.equal(validate({ name: "fixture", count: "2" }), false);
});

for (const [input, type, values] of [
  [".a.b", "class", ["a", "b"]],
  ["#a#b", "id", ["a", "b"]],
] as const) {
  void test(`Tailwind selector parser preserves both ${type} nodes in ${input}`, () => {
    const root = selectorParser().astSync(input);
    const actual: string[] = [];
    root.walk((node) => {
      if (node.type === type) actual.push(node.value);
    });
    assert.deepEqual(actual, values);
    assert.equal(root.toString(), input);
  });
}

void test("Tailwind selector parser retains pseudo, attribute and escaped class semantics", () => {
  const input = ':is(.a, .b)[data-kind="x"] .hover\\:bg-red-500';
  const root = selectorParser().astSync(input);
  const nodes: SelectorNode[] = [];
  root.walk((node) => nodes.push(node));
  assert.deepEqual(
    nodes.filter((node) => node.type === "class").map((node) => node.value),
    ["a", "b", "hover:bg-red-500"],
  );
  assert.equal(nodes.find((node) => node.type === "pseudo")?.value, ":is");
  assert.equal(
    nodes.find((node) => node.type === "attribute")?.attribute,
    "data-kind",
  );
  assert.equal(root.toString(), input);
});

void test("Tailwind generates utilities and expands small nested selectors offline", async () => {
  const result = await postcss([
    nesting(),
    tailwindcss({
      content: [{ raw: '<div class="p-2"></div>', extension: "html" }],
      corePlugins: { preflight: false },
    }),
  ]).process("@tailwind utilities; .card { & .label { color: red; } }", {
    from: undefined,
  });
  const selectors: string[] = [];
  result.root.walkRules((rule) => {
    selectors.push(rule.selector);
  });
  assert.ok(selectors.includes(".card .label"));
  const utility = result.root.nodes.find(
    (node) => node.type === "rule" && node.selector === ".p-2",
  );
  assert.ok(utility && utility.type === "rule");
  const declarations: string[] = [];
  utility.walkDecls("padding", (declaration) => {
    declarations.push(declaration.value);
  });
  assert.deepEqual(declarations, ["0.5rem"]);
});
