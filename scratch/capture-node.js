import fs from "node:fs";

import { chromium } from "playwright";

async function main() {
  // Launch the browser
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Set viewport size
  await page.setViewportSize({ width: 1280, height: 1000 });

  // This is a CLI-only capture script; configuration is intentionally supplied by the process environment.
  // eslint-disable-next-line no-process-env
  const destDir = process.env.DEST_DIR ?? "output/admin-visuals";
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // eslint-disable-next-line no-process-env
  const smokeUser = process.env.ADMIN_SMOKE_USER;
  // eslint-disable-next-line no-process-env
  const smokePassword = process.env.ADMIN_SMOKE_PASSWORD;
  if (!smokeUser || !smokePassword) {
    throw new Error("Set ADMIN_SMOKE_USER and ADMIN_SMOKE_PASSWORD before running the capture script");
  }
  const credentials = `http://${encodeURIComponent(smokeUser)}:${encodeURIComponent(smokePassword)}@localhost:3000`;

  // 1. Visit Ingestion Dashboard (Light mode)
  console.log("Navigating to Ingestion Dashboard (Light)...");
  await page.goto(`${credentials}/admin/ingestion`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${destDir}/ingestion-light.png` });
  console.log("Ingestion Light screenshot saved.");

  // 2. Toggle Dark mode
  console.log("Switching to Dark Mode...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.body.classList.add("dark");
  });
  // Wait a moment for transitions
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${destDir}/ingestion-dark.png` });
  console.log("Ingestion Dark screenshot saved.");

  // 3. Visit Chat Config (Light mode)
  console.log("Navigating to Chat Config (Light)...");
  // Navigate again to clear any forced dark mode state
  await page.goto(`${credentials}/admin/chat-config`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${destDir}/chat-config-light.png` });
  console.log("Chat Config Light screenshot saved.");

  // 4. Toggle Dark mode
  console.log("Switching to Dark Mode...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.body.classList.add("dark");
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${destDir}/chat-config-dark.png` });
  console.log("Chat Config Dark screenshot saved.");

  // 5. Visit Documents list (Light mode)
  console.log("Navigating to Documents list (Light)...");
  await page.goto(`${credentials}/admin/documents`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${destDir}/documents-light.png` });
  console.log("Documents list Light screenshot saved.");

  // 6. Toggle Dark mode
  console.log("Switching to Dark Mode...");
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.body.classList.add("dark");
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${destDir}/documents-dark.png` });
  console.log("Documents list Dark screenshot saved.");

  await browser.close();
  console.log("Done capturing screenshots!");
}

try {
  await main();
} catch (err) {
  console.error("Capture failed:", err);
  throw err;
}
