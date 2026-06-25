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
  // immediately capture inspector
  await page.waitForTimeout(600);
}

// --- Add pendant and immediately check inspector ---
await openAddMenu();
await clickMenuItem("ペンダント");
// screenshot immediately
await page.screenshot({ path: `${outDir}/check-A-pendant-immediate.png`, fullPage: true });
const inspAfterPendant = await page.locator("[class*='inspector'], [class*='Inspector']").first().innerText().catch(() => "");
console.log("inspector after pendant:", inspAfterPendant.substring(0, 500));

// --- Add doma and immediately check inspector ---
await openAddMenu();
await clickMenuItem("下げ床(土間)");
await page.screenshot({ path: `${outDir}/check-B-doma-immediate.png`, fullPage: true });
const inspAfterDoma = await page.locator("[class*='inspector'], [class*='Inspector']").first().innerText().catch(() => "");
console.log("inspector after doma:", inspAfterDoma.substring(0, 500));
const hasDomaSlider = inspAfterDoma.includes("下げ量");
console.log("doma 下げ量 present =", hasDomaSlider);

// --- Check 2D plan view: find plan2d canvas/svg and look for doma outline ---
// Look for plan-related elements
const canvases = await page.locator("canvas").all();
console.log("canvas count:", canvases.length);

// Scroll left panel to see if 2D plan has updated
// The 2D plan is likely on the left side
await page.screenshot({ path: `${outDir}/check-C-with-doma.png`, fullPage: true });

// --- Add pendant and see if 3D changes (check canvas pixel change) ---
// Get canvas pixel count before/after
async function countNonDark() {
  return await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return 0;
    const s = document.createElement("canvas");
    s.width = 160; s.height = 100;
    const c = s.getContext("2d");
    if (!c) return 0;
    c.drawImage(canvas, 0, 0, s.width, s.height);
    const px = c.getImageData(0, 0, s.width, s.height).data;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i]+px[i+1]+px[i+2] > 48) n++;
    return n;
  });
}
const px1 = await countNonDark();
await openAddMenu();
await clickMenuItem("洗濯機");
const px2 = await countNonDark();
console.log("canvas pixels before washer:", px1, "after:", px2, "delta:", px2 - px1);
await page.screenshot({ path: `${outDir}/check-D-washer-3d.png`, fullPage: true });

// Check if 3D scene has any new objects (look for item list)
// Find items panel
const allPanelsText = await page.locator("body").innerText().catch(() => "");
const hasNewPendant = allPanelsText.includes("ペンダント");
const hasWasher = allPanelsText.includes("洗濯機");
console.log("body has ペンダント:", hasNewPendant, "| 洗濯機:", hasWasher);

// Console errors
console.log("console errors:", consoleErrors.length);
if (consoleErrors.length > 0) {
  consoleErrors.slice(0, 8).forEach(e => console.log("  ERR:", e.substring(0, 200)));
}

await browser.close();
console.log("done");
