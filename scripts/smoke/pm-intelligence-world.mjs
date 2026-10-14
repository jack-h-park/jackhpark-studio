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
    .locator('nav[aria-label="Introduction sections"] a[href="#decisions"]')
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
    .locator('nav[aria-label="Introduction sections"] a[href="#decisions"]')
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
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  assert.equal(new URL(page.url()).hash, "#chapter");
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
  await page
    .locator("canvas")
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await page
    .getByText(
      "The 3D view is unavailable. The complete introduction remains below.",
    )
    .waitFor();
});
await browser.close();
await writeFile(
  path.join(output, "browser-report.json"),
  JSON.stringify(results, null, 2),
);
for (const result of results)
  process.stdout.write(
    `${result.name}: ${result.status}${result.error ? ` — ${result.error}` : ""}\n`,
  );
