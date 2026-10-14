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
