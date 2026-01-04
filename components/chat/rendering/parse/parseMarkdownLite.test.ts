/* eslint-disable @typescript-eslint/no-floating-promises */

import assert from "node:assert";
import { describe, it } from "node:test";

import { parseMarkdownLite } from "./parseMarkdownLite";

// Helper for deep equality since expect(...).toEqual(...) is not in node:test
const expect = (actual: any) => ({
  toEqual: (expected: any) => assert.deepStrictEqual(actual, expected),
  toMatchObject: (expected: any) => {
    // Simple partial match for properties present in expected
    for (const key in expected) {
      assert.deepStrictEqual(actual[key], expected[key]);
    }
  },
  toBe: (expected: any) => assert.strictEqual(actual, expected),
});

describe("parseMarkdownLite", () => {
  it("parses plain text as a paragraph", () => {
    const text = "Hello world";
    const ast = parseMarkdownLite(text);
    expect(ast).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", text: "Hello world" }],
      },
    ]);
  });

  it("parses multiple paragraphs", () => {
    const text = "Para 1\n\nPara 2";
    const ast = parseMarkdownLite(text);
    expect(ast).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", text: "Para 1" }],
      },
      {
        type: "paragraph",
        children: [{ type: "text", text: "Para 2" }],
      },
    ]);
  });

  it("parses unordered lists", () => {
    const text = "- Item 1\n- Item 2";
    const ast = parseMarkdownLite(text);
    expect(ast).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", text: "Item 1" }],
          [{ type: "text", text: "Item 2" }],
        ],
      },
    ]);
  });

  it("parses ordered lists", () => {
    const text = "1. First\n2. Second";
    const ast = parseMarkdownLite(text);
    expect(ast).toEqual([
      {
        type: "list",
        ordered: true,
        items: [
          [{ type: "text", text: "First" }],
          [{ type: "text", text: "Second" }],
        ],
      },
    ]);
  });

  it("parses mixed content", () => {
    const text = "Intro\n\n- List 1\n- List 2\n\nOutro";
    const ast = parseMarkdownLite(text);
    expect(ast).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", text: "Intro" }],
      },
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", text: "List 1" }],
          [{ type: "text", text: "List 2" }],
        ],
      },
      {
        type: "paragraph",
        children: [{ type: "text", text: "Outro" }],
      },
    ]);
  });

  it("parses inline formatting", () => {
    const text = "Bold **strong** and italic *em* and `code`";
    const ast = parseMarkdownLite(text);
    expect(ast[0]).toMatchObject({
      type: "paragraph",
      children: [
        { type: "text", text: "Bold " },
        { type: "strong", children: [{ type: "text", text: "strong" }] },
        { type: "text", text: " and italic " },
        { type: "em", children: [{ type: "text", text: "em" }] },
        { type: "text", text: " and " },
        { type: "inlineCode", code: "code" },
      ],
    });
  });

  it("parses links", () => {
    const text = "Check [Google](https://google.com)";
    const ast = parseMarkdownLite(text);
    expect(ast[0]).toMatchObject({
      type: "paragraph",
      children: [
        { type: "text", text: "Check " },
        { type: "link", label: "Google", href: "https://google.com" },
      ],
    });
  });

  it("ignores code blocks by default", () => {
    const text = "```\ncode\n```";
    const ast = parseMarkdownLite(text);
    // Should be parsed as paragraphs or text, not codeblock
    expect(ast[0].type).toBe("paragraph");
  });

  it("parses code blocks when allowed", () => {
    const text = "```js\nconsole.log('hi');\n```";
    const ast = parseMarkdownLite(text, { allowCodeBlocks: true });
    expect(ast).toEqual([
      {
        type: "codeblock",
        language: "js",
        code: "console.log('hi');",
      },
    ]);
  });

  it("parses recursive formatting", () => {
    const text = "**bold *italic* **";
    const ast = parseMarkdownLite(text);
    expect(ast[0]).toMatchObject({
      type: "paragraph",
      children: [
        {
          type: "strong",
          children: [
            { type: "text", text: "bold " },
            { type: "em", children: [{ type: "text", text: "italic" }] },
            { type: "text", text: " " },
          ],
        },
      ],
    });
  });
});
