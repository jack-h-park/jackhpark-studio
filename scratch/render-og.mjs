// Renders scratch/og-landing.html to public/og/landing.png (1200×630 @2x).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const dir = path.dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
await page.goto(`file://${path.join(dir, "og-landing.html")}`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({
  path: path.join(dir, "..", "public", "og", "landing.png"),
});
await browser.close();
console.log("Wrote public/og/landing.png");
