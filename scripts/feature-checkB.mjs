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

async function openAddMenu() {
  const backdrop = page.locator(".add-modal-backdrop");
  if (await backdrop.count() > 0) {
    await backdrop.click({ position: { x: 5, y: 5 }, force: true, timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  const addBtns = page.locator("button.add-button");
  const count = await addBtns.count();
  await addBtns.nth(count - 1).click({ timeout: 5000 });
  await page.waitForTimeout(400);
}

async function clickMenuItem(label) {
  const btn = page.locator(`[role="menuitem"]`).filter({ hasText: label }).first();
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(500);
}

const SVG_CX = 149;
const SVG_CY = 496;

async function placeOnPlan(ox = 0, oy = 0) {
  await page.mouse.click(SVG_CX + ox, SVG_CY + oy);
  await page.waitForTimeout(800);
}

// Add ライン照明 and check inspector for 長さ
await openAddMenu();
await clickMenuItem("ライン照明");
await placeOnPlan(10, -20);
await page.screenshot({ path: `${outDir}/final-line-light.png`, fullPage: true });
const inspLine = await page.locator("[class*='inspector'], [class*='Inspector']").first().innerText().catch(() => "");
const hasLineLen = inspLine.includes("長さ") || inspLine.includes("サイズ");
console.log("line light inspector: 長さ/サイズ =", hasLineLen);
console.log("line inspector (first 400):", inspLine.substring(0, 400));

// Add several furniture items for regression
await openAddMenu(); await clickMenuItem("洗面台"); await placeOnPlan(-30, 30);
await openAddMenu(); await clickMenuItem("トイレ"); await placeOnPlan(50, -30);
await openAddMenu(); await clickMenuItem("浴槽"); await placeOnPlan(-40, -10);
await openAddMenu(); await clickMenuItem("デスク"); await placeOnPlan(30, 40);
await openAddMenu(); await clickMenuItem("下駄箱"); await placeOnPlan(-20, -40);
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/final-multi-furniture.png`, fullPage: true });

// Zoomed view of 3D to see new furniture shapes
// Take screenshot from just the 3D viewport area (right side of page)
await page.screenshot({ path: `${outDir}/final-3d-crop.png`, clip: { x: 295, y: 185, width: 860, height: 520 } });

// Left panel 2D plan crop with all new items
await page.screenshot({ path: `${outDir}/final-2dplan-crop.png`, clip: { x: 0, y: 380, width: 300, height: 230 } });

// Check counters
const body = await page.locator("body").innerText().catch(() => "");
const lm = body.match(/照明\s*\n?\s*(\d+)/);
const fm = body.match(/家具\s*\n?\s*(\d+)/);
console.log("final counters: lights =", lm?.[1], "furniture =", fm?.[1]);

// Console errors
console.log("console errors:", consoleErrors.length);
if (consoleErrors.length > 0) {
  consoleErrors.slice(0, 8).forEach(e => console.log("  ERR:", e.substring(0, 200)));
}

await browser.close();
console.log("done");
