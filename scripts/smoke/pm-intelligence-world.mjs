import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
const { values } = parseArgs({
  options: {
    "base-url": { type: "string", default: "http://localhost:3037" },
    out: { type: "string" },
    case: { type: "string", default: "all" },
    "build-kind": { type: "string", default: "development" },
  },
});
const base = new URL(values["base-url"]);
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  throw new Error("Only a loopback test server is allowed.");
if (!values.out)
  throw new Error("--out must name a session artifact directory.");
const output = path.resolve(values.out);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const url = new URL("/experiences/pm-intelligence", base).href;
async function check(name, fn) {
  if (values.case !== "all" && values.case !== name) return;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    hasTouch: name === "accessibility",
  });
  context.setDefaultTimeout(15000);
  try {
    await fn(context);
    results.push({ name, status: "passed" });
  } catch (error) {
    results.push({ name, status: "failed", error: String(error) });
    process.exitCode = 1;
  } finally {
    process.stdout.write(`${name}: ${results.at(-1).status}\n`);
    await context.close();
  }
}
await check("navigation", async (context) => {
  const page = await context.newPage();
  await page.goto(url);
  await page
    .getByRole("button", { name: "Guided introduction", exact: true })
    .click();
  for (let i = 0; i < 7; i++)
    await page.getByRole("button", { name: "Next →", exact: true }).click();
  await page
    .getByRole("heading", { name: "Show what is known. Leave room to learn." })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Enter the simulation →" })
      .isVisible(),
    false,
  );
  await page
    .locator('nav[aria-label="Introduction sections"] a[href$="/decisions"]')
    .click();
  await page.getByRole("button", { name: "Enter the simulation →" }).click();
  await page.getByLabel("Collect more evidence").check();
  await page.getByLabel("What is your reason?").fill("Need customer evidence");
  await page.getByRole("heading", { name: "Your decision record" }).waitFor();
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page.goBack();
  assert.equal(
    await page.getByLabel("What is your reason?").inputValue(),
    "Need customer evidence",
  );
  await page.getByRole("button", { name: "Reset simulation" }).click();
  assert.equal(
    await page.getByRole("heading", { name: "Your decision record" }).count(),
    0,
  );
});
await check("fallback", async (context) => {
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (String(type).includes("webgl")) return null;
      return original.call(this, type, ...args);
    };
  });
  const page = await context.newPage();
  await page.goto(url);
  await page
    .getByRole("button", { name: "Open 3D world", exact: true })
    .click();
  await page
    .getByText(
      "The 3D view is unavailable. The complete introduction remains below.",
    )
    .waitFor({ timeout: 15000 });
  await page
    .locator('nav[aria-label="Introduction sections"] a[href$="/decisions"]')
    .click();
  await page.getByRole("button", { name: "Enter the simulation →" }).waitFor();
});
await check("accessibility", async (context) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  assert.ok(
    await page.locator("main").evaluate((el) => {
      const surface = el.closest('[data-theme="jp"]');
      const style = getComputedStyle(surface);
      const numbers = style.backgroundColor.match(/[0-9.]+/g)?.map(Number);
      return numbers && numbers[0] < 80 && numbers[1] < 80 && numbers[2] < 80;
    }),
    "Studio dark surface must remain readable with a light site preference",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page
    .locator(
      'nav[aria-label="Introduction sections"] a[href="#quick/overview"]',
    )
    .waitFor();
  await page
    .getByRole("link", { name: "Skip to content", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "heading-overview",
  );
  await page
    .getByRole("button", { name: "Guided introduction", exact: true })
    .click();
  await page
    .locator('nav[aria-label="Introduction sections"] a[href$="/questions"]')
    .click();
  await page
    .getByRole("link", { name: "Skip to content", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  assert.equal(new URL(page.url()).hash, "#guide/questions");
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "heading-questions",
  );
  await page.screenshot({
    path: path.join(output, "mobile.png"),
    fullPage: true,
  });
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  try {
    const p = await noJs.newPage();
    await p.goto(url);
    await p
      .getByRole("heading", { name: "Agents prepare. A person decides." })
      .waitFor();
    await p
      .getByRole("heading", { name: "Demand informs what to study." })
      .waitFor();
  } finally {
    await noJs.close();
  }
});
await check("scene", async (context) => {
  const page = await context.newPage();
  await page.goto(url);
  await page
    .getByRole("button", { name: "Open 3D world", exact: true })
    .click();
  await page.locator("canvas").waitFor();
  await page.screenshot({
    path: path.join(output, "desktop-world.png"),
    fullPage: true,
  });
  await page.locator("canvas").evaluate((canvas) => {
    const gl = canvas.getContext("webgl2");
    const loss = gl?.getExtension("WEBGL_lose_context");
    if (!loss) throw new Error("Context-loss extension unavailable");
    loss.loseContext();
  });
  await page
    .getByText(
      "The 3D view is unavailable. The complete introduction remains below.",
    )
    .waitFor();
});
await check("import-failure", async (context) => {
  const page = await context.newPage();
  await page.goto(url);
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page.route("**/_next/static/chunks/**", (route) => route.abort());
  await page
    .getByRole("button", { name: "Open 3D world", exact: true })
    .click();
  await page
    .getByText(
      "The 3D view is unavailable. The complete introduction remains below.",
    )
    .waitFor();
  await page
    .locator('nav[aria-label="Introduction sections"] a[href$="/learning"]')
    .click();
  await page
    .getByRole("heading", { name: "Demand informs what to study." })
    .waitFor();
});
await check("keyboard", async (context) => {
  const page = await context.newPage();
  await page.goto(url);
  await page
    .locator('nav[aria-label="Introduction sections"] a[href$="/decisions"]')
    .focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Enter the simulation →" }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Proceed with a bounded proposal").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  assert.ok(await page.getByLabel("Collect more evidence").isChecked());
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "decision-reason",
  );
  await page.keyboard.type("More evidence is needed.");
  await page.getByRole("heading", { name: "Your decision record" }).waitFor();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Enter the simulation →" }).waitFor();
});
await check("motion", async (context) => {
  const page = await context.newPage();
  await page.goto(url);
  await page
    .getByRole("button", { name: "Open 3D world", exact: true })
    .click();
  await page.locator("canvas").waitFor();
  const nav = page.locator('nav[aria-label="Introduction sections"]');
  await nav.locator('a[href$="/inputs"]').click();
  await nav.locator('a[href$="/questions"]').click();
  await page.goBack();
  await page
    .getByRole("heading", { name: "Different work. A shared foundation." })
    .waitFor();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const before = await page.locator("canvas").screenshot();
  await new Promise((resolve) => setTimeout(resolve, 150));
  const after = await page.locator("canvas").screenshot();
  assert.ok(before.equals(after), "Reduced motion must stop camera travel");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await nav.locator('a[href$="/learning"]').click();
  await page
    .getByRole("heading", { name: "Demand informs what to study." })
    .waitFor();
});
await check("share-link", async (context) => {
  const page = await context.newPage();
  await page.goto(url);
  await page
    .getByRole("button", { name: "Guided introduction", exact: true })
    .click();
  const href = await page
    .locator('nav[aria-label="Introduction sections"] a[href$="learning"]')
    .getAttribute("href");
  assert.equal(href, "#guide/learning");
  const shared = await context.newPage();
  await shared.goto(url + href);
  await shared
    .getByRole("heading", { name: "Demand informs what to study." })
    .waitFor();
});
await check("content", async (context) => {
  const page = await context.newPage();
  const operations = [];
  page.on("request", (request) => {
    if (
      /\/api\/(chat|langchain_chat)|localhost:8000|127\.0\.0\.1:8000/.test(
        request.url(),
      )
    )
      operations.push(request.url());
  });
  await page.goto(url);
  await page
    .locator('nav[aria-label="Introduction sections"] a[href$="/questions"]')
    .click();
  await page
    .getByRole("button", { name: /A source-linked answer draft/ })
    .click();
  await page
    .getByRole("heading", { name: "A source-linked answer draft", exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(output, "record-review.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close record", exact: true }).click();
  await page
    .locator('nav[aria-label="Introduction sections"] a[href$="/learning"]')
    .click();
  await page
    .getByRole("button", { name: /A recorded practice response/ })
    .click();
  await page
    .getByRole("heading", { name: "A recorded practice response", exact: true })
    .waitFor();
  assert.deepEqual(operations, []);
  for (const href of ["/decks/pm-intelligence-system", "/studio", "/#contact"])
    assert.ok(await page.locator(`a[href="${href}"]`).count());
});
await check("labels", async (context) => {
  const page = await context.newPage();
  await page.goto(url);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "Open 3D world", exact: true })
    .click();
  await page.locator("canvas").waitFor();
  const labels = page.locator('[aria-label="Spatial workspaces"] button');
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll('[aria-label="Spatial workspaces"] button'),
    ].every((el) => el.style.left),
  );
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => {
      const c = document.querySelector("canvas");
      return c && c.width / c.height > 0;
    });
    await page
      .getByRole("button", { name: "Quick overview", exact: true })
      .click();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const boxes = await labels.evaluateAll((elements) =>
      elements
        .filter((el) => !el.hidden)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
        }),
    );
    assert.equal(boxes.length, 6, "Overview must name every spatial workspace");
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        assert.ok(
          a.right <= b.x ||
            b.right <= a.x ||
            a.bottom <= b.y ||
            b.bottom <= a.y,
          "Spatial labels must not cover each other",
        );
      }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator('[aria-label="Spatial workspaces"]')
    .getByRole("button", { name: "Product decisions On request", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Learning can stop here. Decisions start on request.",
    })
    .waitFor();
  assert.ok(
    await page
      .getByRole("button", { name: "Enter the simulation →" })
      .isVisible(),
  );
});
await check("reflow", async (context) => {
  const page = await context.newPage();
  await page.goto(url);
  await page
    .locator(
      'nav[aria-label="Introduction sections"] a[href="#quick/overview"]',
    )
    .waitFor();
  await page.evaluate(() => (document.documentElement.style.zoom = "200%"));
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "200% CSS zoom must not cause horizontal page overflow",
  );
  await page
    .locator('nav[aria-label="Introduction sections"] a[href$="/learning"]')
    .click();
  await page
    .getByRole("heading", { name: "Demand informs what to study." })
    .waitFor();
});
await check("performance", async (context) => {
  const page = await context.newPage();
  await page.goto(url);
  await page
    .locator(
      'nav[aria-label="Introduction sections"] a[href="#quick/overview"]',
    )
    .waitFor();
  const before = await page.evaluate(
    () => performance.getEntriesByType("resource").length,
  );
  await page
    .getByRole("button", { name: "Open 3D world", exact: true })
    .click();
  await page.locator("canvas").waitFor();
  const cdp = await context.newCDPSession(page);
  const completion = new Promise((resolve) =>
    cdp.once("Tracing.tracingComplete", resolve),
  );
  await cdp.send("Tracing.start", {
    categories:
      "devtools.timeline,disabled-by-default-devtools.timeline.frame,cc",
    transferMode: "ReturnAsStream",
  });
  const start = Date.now();
  let i = 0;
  const sections = [
    "knowledge",
    "inputs",
    "writing",
    "questions",
    "learning",
    "decisions",
  ];
  while (Date.now() - start < 10000) {
    await page
      .locator(
        `nav[aria-label="Introduction sections"] a[href$="/${sections[i++ % sections.length]}"]`,
      )
      .click();
    await new Promise((resolve) => setTimeout(resolve, 650));
  }
  await cdp.send("Tracing.end");
  const { stream } = await completion;
  let raw = "";
  while (true) {
    const part = await cdp.send("IO.read", { handle: stream });
    raw += part.base64Encoded
      ? Buffer.from(part.data, "base64").toString()
      : part.data;
    if (part.eof) break;
  }
  await cdp.send("IO.close", { handle: stream });
  const events = JSON.parse(raw).traceEvents;
  const groups = new Map();
  for (const event of events.filter((e) => e.name === "DrawFrame")) {
    const key = `${event.pid}/${event.tid}`;
    const frames = groups.get(key) || [];
    frames.push(event.ts / 1000);
    groups.set(key, frames);
  }
  const frames =
    [...groups.values()].sort((a, b) => b.length - a.length)[0] || [];
  const intervals = frames
    .slice(1)
    .map((t, i) => t - frames[i])
    .filter((t) => t > 0)
    .sort((a, b) => a - b);
  const resources = await page.evaluate(
    (before) =>
      performance
        .getEntriesByType("resource")
        .slice(before)
        .map((entry) => ({
          name: new URL(entry.name).pathname,
          transferSize: entry.transferSize,
          decodedBodySize: entry.decodedBodySize,
        })),
    before,
  );
  const gpu = await page.locator("canvas").evaluate((canvas) => {
    const gl = canvas.getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable";
  });
  const report = {
    buildKind: values["build-kind"],
    environment: "Local headless Chromium; not real iOS hardware",
    userAgent: await page.evaluate(() => navigator.userAgent),
    gpu,
    viewport: page.viewportSize(),
    durationMs: Date.now() - start,
    drawFrameEvents: frames.length,
    frameIntervalP95Ms: intervals.length
      ? intervals[Math.floor((intervals.length - 1) * 0.95)]
      : null,
    onDemandResources: resources,
    onDemandTransferBytes: resources.reduce((n, r) => n + r.transferSize, 0),
  };
  await writeFile(path.join(output, "performance-trace.json"), raw);
  await writeFile(
    path.join(output, "performance-summary.json"),
    JSON.stringify(report, null, 2),
  );
  assert.ok(
    frames.length > 0,
    "Chromium must expose actual compositor frame events",
  );
});

await check("discovery", async (context) => {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(url);
  await page
    .getByRole("button", { name: "Play the discovery trail →", exact: true })
    .click();
  const trail = page.getByRole("region", {
    name: "Discovery trail",
    exact: true,
  });
  const stages = trail.getByRole("navigation", {
    name: "Discovery trail stages",
  });
  await stages.getByRole("button", { name: "Connect & reuse" }).click();
  assert.equal(
    await trail
      .getByRole("button", { name: "Connect note → draft", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await trail
      .getByRole("button", { name: /Reveal Product decisions/ })
      .isDisabled(),
    true,
  );
  await stages.getByRole("button", { name: "Discover inputs" }).click();
  for (const name of [
    "External signals",
    "Hands-on projects",
    "Market sensing",
  ]) {
    const input = trail.getByRole("button", { name: new RegExp(name) });
    await input.focus();
    await page.keyboard.press("Enter");
  }
  assert.equal(await page.locator('svg path[data-lit="true"]').count(), 3);
  await trail
    .getByRole("button", { name: "Follow the knowledge connection →" })
    .focus();
  await page.keyboard.press("Enter");
  await trail.locator("h3:focus").waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent),
    "02 / Keep the source attached.",
  );
  for (const name of ["Inspect source note", "Inspect linked draft"]) {
    await trail.getByRole("button", { name: new RegExp(name) }).click();
    await trail
      .getByRole("complementary", { name: "Record details" })
      .getByText("What remains unknown")
      .waitFor();
    await trail
      .getByRole("button", { name: "Close record", exact: true })
      .click();
  }
  await trail
    .getByRole("button", { name: "Connect note → draft", exact: true })
    .click();
  for (const name of [
    "Strategic viewpoints",
    "PM questions",
    "New opportunities",
    "Product decisions",
  ])
    await trail
      .getByRole("button", { name: new RegExp(`Reveal ${name}`, "i") })
      .click();
  assert.equal(await page.locator('svg path[data-lit="true"]').count(), 7);
  assert.equal(
    await page
      .getByRole("button", { name: "Enter the simulation →" })
      .isVisible(),
    true,
  );
  assert.equal(
    await page.getByRole("heading", { name: "Your decision record" }).count(),
    0,
  );
  await trail
    .getByRole("button", { name: "Meet the preparation roles →" })
    .click();
  const ack = trail.getByRole("button", {
    name: "Acknowledge human review",
    exact: true,
  });
  assert.equal(await ack.isDisabled(), true);
  await trail.getByRole("button", { name: /Inspect Cleo/ }).click();
  await trail
    .getByRole("article", { name: "Cleo preparation" })
    .getByText("Source-linked answer drafts", { exact: true })
    .waitFor();
  assert.equal(await ack.isDisabled(), true);
  await trail.getByRole("button", { name: /Inspect Orin/ }).click();
  await ack.focus();
  await page.keyboard.press("Enter");
  await trail
    .getByRole("status")
    .getByText("Trail complete. Your exploration passport is ready.")
    .waitFor();
  await trail
    .getByRole("button", { name: "View exploration passport →" })
    .click();
  assert.equal(await trail.locator('li[data-earned="true"]').count(), 4);
  await page
    .getByRole("button", { name: "Quick overview", exact: true })
    .click();
  await page.goBack();
  assert.equal(await trail.locator('li[data-earned="true"]').count(), 4);
  await trail.getByRole("button", { name: "Pause trail" }).click();
  assert.equal(
    await trail
      .getByRole("heading", { name: "Your exploration passport" })
      .isVisible(),
    false,
  );
  await trail.getByRole("button", { name: "Resume trail" }).click();
  await page.getByTestId("world-scene").waitFor();
  assert.match(
    await page.getByTestId("world-scene").getAttribute("data-illuminated"),
    /knowledge writing questions learning decisions roles/,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(output, "discovery-passport-desktop.png"),
    fullPage: true,
  });
  await trail.getByRole("button", { name: "Reset trail", exact: true }).click();
  assert.equal(await page.locator('svg path[data-lit="true"]').count(), 0);
  await page
    .getByRole("button", { name: "Start discovery trail →", exact: true })
    .click();
  assert.match(
    await page
      .getByRole("region", { name: "Discovery trail", exact: true })
      .getByRole("status")
      .innerText(),
    /0\/3 inputs/,
  );
  await page.reload();
  assert.equal(
    await page
      .getByRole("region", { name: "Discovery trail", exact: true })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
});
await check("discovery-fallback", async (context) => {
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return String(type).includes("webgl")
        ? null
        : original.call(this, type, ...args);
    };
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  await page
    .getByRole("button", { name: "Play the discovery trail →", exact: true })
    .click();
  await page
    .getByText(
      "The 3D view is unavailable. The complete introduction remains below.",
      { exact: true },
    )
    .waitFor();
  const trail = page.getByRole("region", {
    name: "Discovery trail",
    exact: true,
  });
  await trail.getByRole("button", { name: /External signals/ }).click();
  await trail.getByRole("button", { name: /Hands-on projects/ }).click();
  await trail.getByRole("button", { name: /Market sensing/ }).click();
  await trail
    .getByRole("button", { name: "Follow the knowledge connection →" })
    .click();
  await trail.getByRole("button", { name: /Inspect source note/ }).click();
  await trail.getByRole("button", { name: "Close record" }).click();
  await trail.getByRole("button", { name: /Inspect linked draft/ }).click();
  await trail.getByRole("button", { name: "Close record" }).click();
  await trail
    .getByRole("button", { name: "Connect note → draft", exact: true })
    .click();
  for (const name of [
    "Strategic viewpoints",
    "PM questions",
    "New opportunities",
    "Product decisions",
  ])
    await trail
      .getByRole("button", { name: new RegExp(`Reveal ${name}`, "i") })
      .click();
  await trail
    .getByRole("button", { name: "Meet the preparation roles →" })
    .click();
  await trail.getByRole("button", { name: /Inspect Iris/ }).click();
  await trail.getByRole("button", { name: /Inspect Quill/ }).click();
  await trail
    .getByRole("button", { name: "Acknowledge human review", exact: true })
    .click();
  await trail
    .getByRole("button", { name: "View exploration passport →" })
    .click();
  assert.equal(await trail.locator('li[data-earned="true"]').count(), 4);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(output, "discovery-passport-mobile.png"),
    fullPage: true,
  });
});

await browser.close();
await writeFile(
  path.join(
    output,
    values.case === "all"
      ? "browser-report.json"
      : `browser-report-${values.case}.json`,
  ),
  JSON.stringify(results, null, 2),
);
for (const result of results)
  process.stdout.write(
    `${result.name}: ${result.status}${result.error ? ` — ${result.error}` : ""}\n`,
  );
