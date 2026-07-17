/* eslint-disable @typescript-eslint/no-floating-promises */

import assert from "node:assert";
import { describe, it } from "node:test";

import { tokenizeCode } from "../components/chat/rendering/nodes/highlightCode";

const joined = (tokens: ReturnType<typeof tokenizeCode>) =>
  tokens.map((t) => t.text).join("");

describe("tokenizeCode", () => {
  it("round-trips the source text exactly", () => {
    const code = `const x = fetch("/api/chat"); // send\nreturn x;`;
    assert.strictEqual(joined(tokenizeCode(code, "ts")), code);
  });

  it("classifies JS keywords, strings, comments, and numbers", () => {
    const tokens = tokenizeCode(
      `const n = 42; // answer\nconst s = "hi";`,
      "typescript",
    );
    const byType = (type: string) =>
      tokens.filter((t) => t.type === type).map((t) => t.text);
    assert.deepStrictEqual(byType("keyword"), ["const", "const"]);
    assert.deepStrictEqual(byType("number"), ["42"]);
    assert.deepStrictEqual(byType("comment"), ["// answer"]);
    assert.deepStrictEqual(byType("string"), ['"hi"']);
  });

  it("does not treat // inside a string as a comment", () => {
    const tokens = tokenizeCode(`const u = "https://example.com";`, "js");
    assert.ok(tokens.every((t) => t.type !== "comment"));
    assert.ok(
      tokens.some(
        (t) => t.type === "string" && t.text === '"https://example.com"',
      ),
    );
  });

  it("uses hash comments and python keywords for python", () => {
    const tokens = tokenizeCode(`def f():\n    return None  # noop`, "python");
    const types = new Map(tokens.map((t) => [t.text, t.type]));
    assert.strictEqual(types.get("def"), "keyword");
    assert.strictEqual(types.get("return"), "keyword");
    assert.strictEqual(types.get("None"), "keyword");
    assert.strictEqual(types.get("# noop"), "comment");
  });

  it("matches SQL keywords case-insensitively", () => {
    const tokens = tokenizeCode(`SELECT id FROM docs WHERE score > 0.5`, "sql");
    const keywords = tokens
      .filter((t) => t.type === "keyword")
      .map((t) => t.text);
    assert.deepStrictEqual(keywords, ["SELECT", "FROM", "WHERE"]);
  });

  it("is stateless across repeated calls (shared regex reset)", () => {
    const code = `const a = 1;`;
    const first = tokenizeCode(code, "js");
    const second = tokenizeCode(code, "js");
    assert.deepStrictEqual(first, second);
  });

  it("falls back to the JS family for unknown languages", () => {
    const tokens = tokenizeCode(`return true`, undefined);
    assert.ok(
      tokens.some((t) => t.type === "keyword" && t.text === "return"),
    );
  });
});
