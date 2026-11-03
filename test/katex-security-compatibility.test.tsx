import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

import type { EquationBlock } from "notion-types";
import { JSDOM } from "jsdom";
import postcss from "postcss";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Equation } from "react-notion-x/build/third-party/equation";

const require = createRequire(import.meta.url);
const rendererRequire = createRequire(
  require.resolve("react-notion-x/build/third-party/equation"),
);
const wrapperRequire = createRequire(
  rendererRequire.resolve("@matejmazur/react-katex"),
);
const katexPath = rendererRequire.resolve("katex");
const katex = rendererRequire("katex") as {
  version: string;
  renderToString(math: string, settings?: Record<string, unknown>): string;
};
const settings = { throwOnError: false, strict: false };

// A vulnerable transitive resolution re-enables trusted HTML through prototypes.
// Each process receives no application environment and never executes its output.
for (const mode of [
  "options",
  "trust",
  "default",
  "processor",
  "namespace",
  "namespace-restoration",
]) {
  void test(
    `Equation dependency ignores inherited ${mode}`,
    { timeout: 6000 },
    () => {
      const script = String.raw`
      const assert = require('node:assert/strict');
      const katex = require(process.argv[1]);
      const mode = process.argv[2];
      const settings = {throwOnError:false, strict:false};
      // Isolate trust's absent schema default from unrelated option defaults.
      if (mode === 'default') Object.assign(settings, {
        macros:{}, output:'htmlAndMathml', displayMode:false, errorColor:'#cc0000',
      });
      const probes = [
        ['\\href{https://example.invalid/katex-probe}{safe}', /<a\b/],
        ['\\includegraphics{https://example.invalid/katex-probe}', /<img\b/],
        ['\\htmlClass{probe-marker}{x}', /class="[^"]*\bprobe-marker\b/],
      ];
      let property;
      let descriptor;
      try {
        if (mode !== 'options' && mode !== 'namespace-restoration') {
          property = mode === 'namespace' ? '\\probe' : mode;
          descriptor = Object.getOwnPropertyDescriptor(Object.prototype, property);
          Object.defineProperty(Object.prototype, property, {
            value: mode === 'namespace' ? 'Q' : mode === 'processor' ? () => true : true,
            writable: true, configurable: true, enumerable: false,
          });
        }
        if (mode === 'namespace-restoration') {
          for (const expression of ['q', String.raw\x60{\def q{R}q}q\x60]) {
            const html = katex.renderToString(expression, {...settings, macros:Object.create({q:'Q'})});
            assert.doesNotMatch(html, />Q</, 'inherited namespace marker expanded');
            assert.match(html, />q</, 'ordinary q must survive group restoration');
          }
          assert.match(katex.renderToString('q', {...settings, macros:{q:'Q'}}), />Q</);
        } else if (mode === 'namespace') {
          const html = katex.renderToString('\\probe', settings);
          assert.doesNotMatch(html, />Q</, 'inherited builtin macro expanded');
          assert.match(html, /katex-error/);
        } else {
          const options = mode === 'options'
            ? Object.assign(Object.create({trust:true}), settings)
            : {...settings};
          for (const [math, active] of probes) {
            assert.doesNotMatch(katex.renderToString(math, options), active, mode);
            assert.doesNotMatch(katex.renderToString(math, {...options, trust:false}), active, 'own false');
          }
        }
      } finally {
        if (property) {
          if (descriptor) Object.defineProperty(Object.prototype, property, descriptor);
          else delete Object.prototype[property];
        }
      }
    `.replaceAll("\\x60", "`");
      const child = spawnSync(
        process.execPath,
        ["-e", script, katexPath, mode],
        {
          env: { NODE_ENV: "test", LANG: "C", TZ: "UTC" },
          timeout: 4000,
          maxBuffer: 128 * 1024,
          encoding: "utf8",
        },
      );
      assert.equal(child.error, undefined);
      assert.equal(child.signal, null);
      assert.equal(child.status, 0, child.stderr);
    },
  );
}

void test("Equation uses the same fixed KaTeX as its wrapper and application CSS", () => {
  assert.equal(katex.version, "0.18.2");
  assert.equal(
    realpathSync(katexPath),
    realpathSync(wrapperRequire.resolve("katex")),
  );
  assert.equal(realpathSync(katexPath), realpathSync(require.resolve("katex")));
});

void test("Equation defaults reject trusted HTML while an own trusted control is detectable", () => {
  const math = String.raw`\href{https://example.invalid/katex-probe}{safe}\includegraphics{https://example.invalid/katex-probe}\htmlClass{probe-marker}{x}`;
  assert.doesNotMatch(
    katex.renderToString(math, settings),
    /<a\b|<img\b|class="[^"]*\bprobe-marker\b/,
  );
  const trusted = katex.renderToString(math, { ...settings, trust: true });
  assert.match(trusted, /<a\b/);
  assert.match(trusted, /<img\b/);
  assert.match(trusted, /class="[^"]*\bprobe-marker\b/);
});

void test("Equation renders isolate macros and bound recursive expansion", () => {
  assert.doesNotMatch(
    katex.renderToString(String.raw`\gdef\probe{Q}\probe`, settings),
    /katex-error/,
  );
  assert.match(
    katex.renderToString(String.raw`\probe`, settings),
    /color:#cc0000/,
  );
  assert.match(
    katex.renderToString(String.raw`\def\probe{\probe}\probe`, settings),
    /katex-error/,
  );
});

void test("Equation CSS supplies renamed structural selectors and every local font", () => {
  const cssPath = rendererRequire.resolve("katex/dist/katex.min.css");
  const css = readFileSync(cssPath, "utf8");
  const selectors: string[] = [];
  const fontUrls = new Set<string>();
  postcss.parse(css).walkRules((rule) => {
    selectors.push(rule.selector);
  });
  for (const selector of [".katex-base", ".katex-strut", ".katex-sizing"]) {
    assert.ok(
      selectors.some((entry) => entry.includes(selector)),
      selector,
    );
  }
  postcss.parse(css).walkDecls("src", (declaration) => {
    for (const match of declaration.value.matchAll(
      /url\(["']?([^"')]+)["']?\)/g,
    )) {
      assert.match(match[1], /^fonts\/KaTeX_[\w-]+\.(woff2?|ttf)$/);
      fontUrls.add(match[1]);
      const asset = resolve(dirname(cssPath), match[1]);
      assert.ok(existsSync(asset), match[1]);
      assert.ok(readFileSync(asset).length > 1000, match[1]);
    }
  });
  assert.equal(fontUrls.size, 60);
});

void test("real Equation React effects render inline, block, and invalid math", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>");
  const globals = globalThis as unknown as Record<string, unknown>;
  const descriptors = new Map(
    ["window", "document", "IS_REACT_ACT_ENVIRONMENT"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  Object.assign(globals, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = dom.window.document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  const block: EquationBlock = {
    id: "equation-fixture",
    type: "equation",
    parent_id: "fixture",
    parent_table: "block",
    version: 1,
    created_time: 0,
    last_edited_time: 0,
    alive: true,
    created_by_table: "notion_user",
    created_by_id: "fixture",
    last_edited_by_table: "notion_user",
    last_edited_by_id: "fixture",
    properties: {
      title: [
        [String.raw`\frac{1}{2}+\sqrt{x}+\begin{matrix}a&b\\c&d\end{matrix}`],
      ],
    },
  };
  try {
    await act(async () => {
      root.render(
        createElement(
          "div",
          null,
          createElement(Equation, { block, math: "x^2+y^2=z^2", inline: true }),
          createElement(Equation, { block }),
          createElement(Equation, { block, math: String.raw`\frac{<img>}{` }),
        ),
      );
    });
    assert.equal(
      container.querySelectorAll(".notion-equation-inline .katex").length,
      1,
    );
    assert.equal(
      container.querySelectorAll(".notion-equation-block .katex-display")
        .length,
      1,
    );
    assert.equal(container.querySelectorAll("math").length, 2);
    assert.ok(container.querySelector(".mfrac"));
    assert.ok(container.querySelector(".sqrt"));
    assert.ok(container.querySelector("mtable"));
    assert.match(
      container.querySelector(".katex-error")?.textContent ?? "",
      /<img>/,
    );
    assert.equal(container.querySelectorAll("img, script, a").length, 0);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globals[key];
    }
  }
});
