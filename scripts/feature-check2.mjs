import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const url = "http://127.0.0.1:5174/";
const outDir = "/Users/hoshi/AI/家/照明計画/output/playwright";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });

const consoleErrors = [];
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

await page.goto(url, { waitUntil: "networkidle" });
await page.locator("canvas").first().waitFor({ state: "attached", timeout: 30000 });
await page.waitForTimeout(1400);

// Open add menu
const addBtn = page.locator("button.add-button");
await addBtn.first().click({ timeout: 5000 });
await page.waitForTimeout(500);

// Dump the structure of the menu
const menuHtml = await page.locator(".add-modal, [class*='add-modal'], [class*='add-menu'], [class*='AddModal']").first().innerHTML().catch(async () => {
  return await page.locator("body").innerHTML();
});
console.log("menu partial HTML:\n", menuHtml.substring(0, 3000));

await browser.close();
