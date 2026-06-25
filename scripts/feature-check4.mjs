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
  await page.locator("button.add-button").first().click({ timeout: 5000 });
  await page.waitForTimeout(400);
}

async function clickMenuItem(label) {
  const btn = page.locator(`[role="menuitem"]`).filter({ hasText: label }).first();
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(1000);
}

// Switch to 2D plan view to see added items clearly
// Find the plan/2D view tab button
const viewBtns = await page.locator("button").all();
for (const b of viewBtns) {
  const txt = await b.innerText().catch(() => "");
  if (txt.includes("2D") || txt.includes("平面") || txt.includes("プラン")) {
    console.log("Found 2D button:", txt);
  }
}

// Check top-area buttons
const headerBtns = await page.locator("header button, nav button, .toolbar button, .scene-strip button").all();
for (const b of headerBtns) {
  const txt = await b.innerText().catch(() => "");
  if (txt.trim()) console.log("header btn:", JSON.stringify(txt.trim().substring(0,40)));
}

// Get scene strip text
const sceneStripText = await page.locator("[class*='strip'], [class*='Strip'], [class*='tab'], [class*='Tab']").innerText().catch(() => "");
console.log("scene strip text:", sceneStripText.substring(0, 300));

// Add pendant first
await openAddMenu();
await clickMenuItem("ペンダント");

// Check if inspector shows pendant-specific fields
const bodyText = await page.locator("body").innerText().catch(() => "");
const hasHangLen = bodyText.includes("吊り長さ") || bodyText.includes("コード長") || bodyText.includes("吊下");
console.log("pendant inspector: 吊り長さ/コード長 present =", hasHangLen);

// Take wider screenshot of the whole page
await page.screenshot({ path: `${outDir}/check-pendant-inspector.png`, fullPage: true });

// Try clicking on any item in the 2D canvas or list panel to see if pendant appears
// Look for the 2D view panel
const panel2d = page.locator("[class*='plan'], [class*='Plan'], [class*='floor-plan']");
const panel2dCount = await panel2d.count();
console.log("2D plan panels found:", panel2dCount);

// Add doma and check inspector
await openAddMenu();
await clickMenuItem("下げ床(土間)");

// Wait for inspector to update
await page.waitForTimeout(500);
const bodyAfterDoma = await page.locator("body").innerText().catch(() => "");
const hasDomaSlider = bodyAfterDoma.includes("下げ量");
console.log("doma inspector: 下げ量 present =", hasDomaSlider);

// Take screenshot showing inspector panel
await page.screenshot({ path: `${outDir}/check-doma-inspector.png`, fullPage: true });

// Check if there's an inspector/property panel
const inspectorEl = page.locator("[class*='inspector'], [class*='Inspector'], [class*='property'], [class*='Property']");
const inspCount = await inspectorEl.count();
console.log("inspector panels found:", inspCount);
if (inspCount > 0) {
  const inspText = await inspectorEl.first().innerText().catch(() => "");
  console.log("inspector text:", inspText.substring(0, 400));
}

// Console errors
console.log("console errors:", consoleErrors.length);
if (consoleErrors.length > 0) {
  consoleErrors.slice(0, 8).forEach(e => console.log("  ERR:", e.substring(0, 160)));
}

await browser.close();
console.log("done");
