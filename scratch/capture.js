import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Set viewport size
  await page.setViewportSize({ width: 1280, height: 1000 });

  // Local screenshot run: pass a destination as the first argument, otherwise
  // write inside the repo's own scratch dir. A hardcoded home path would
  // publish this machine's layout and be useless to anyone else.
  const destDir =
    process.argv[2] ?? path.join(process.cwd(), "scratch", "captures");
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // 1. Visit Ingestion Dashboard (Light mode)
  console.log("Navigating to Ingestion Dashboard (Light)...");
  await page.goto("http://localhost:3000/admin/ingestion", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${destDir}/ingestion-light.png` });
  console.log("Ingestion Light screenshot saved.");

  // 2. Toggle Dark mode
  console.log("Switching to Dark Mode...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.body.classList.add("dark");
  });
  // Wait a moment for transitions
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${destDir}/ingestion-dark.png` });
  console.log("Ingestion Dark screenshot saved.");

  // 3. Visit Chat Config (Light mode)
  console.log("Navigating to Chat Config (Light)...");
  await page.goto("http://localhost:3000/admin/chat-config", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${destDir}/chat-config-light.png` });
  console.log("Chat Config Light screenshot saved.");

  // 4. Toggle Dark mode
  console.log("Switching to Dark Mode...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.body.classList.add("dark");
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${destDir}/chat-config-dark.png` });
  console.log("Chat Config Dark screenshot saved.");

  await browser.close();
  console.log("Done capturing screenshots!");
}

try {
  await main();
} catch (err) {
  console.error(err);
  throw err;
}
