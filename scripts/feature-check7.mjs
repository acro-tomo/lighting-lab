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
  // Use the SECOND add-button (the one in header, not left panel)
  const addBtns = page.locator("button.add-button");
  const count = await addBtns.count();
  // click the last one (header)
  await addBtns.nth(count - 1).click({ timeout: 5000 });
  await page.waitForTimeout(400);
}

async function clickMenuItem(label) {
  const btn = page.locator(`[role="menuitem"]`).filter({ hasText: label }).first();
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(800);
}

// Check counters before
const getCounters = async () => {
  const body = await page.locator("body").innerText().catch(() => "");
  const lightMatch = body.match(/照明\s*\n?\s*(\d+)/);
  const furnMatch = body.match(/家具\s*\n?\s*(\d+)/);
  return { lights: lightMatch?.[1] ?? "?", furniture: furnMatch?.[1] ?? "?" };
};

const before = await getCounters();
console.log("before:", before);

// Add pendant 
await openAddMenu();
await clickMenuItem("ペンダント");
const afterPendant = await getCounters();
console.log("after pendant:", afterPendant);

await page.screenshot({ path: `${outDir}/check-F-pendant-final.png`, fullPage: true });

// Add doma
await openAddMenu();
await clickMenuItem("下げ床(土間)");
const afterDoma = await getCounters();
console.log("after doma:", afterDoma);
await page.screenshot({ path: `${outDir}/check-G-doma-final.png`, fullPage: true });

// Check inspector state
const inspText = await page.locator("[class*='inspector'], [class*='Inspector']").first().innerText().catch(() => "");
const hasDomaSlider = inspText.includes("下げ量");
const hasPendantField = inspText.includes("吊り長さ") || inspText.includes("吊下") || inspText.includes("コード");
console.log("inspector after doma: 下げ量 =", hasDomaSlider, "| pendant field =", hasPendantField);
console.log("inspector text:", inspText.substring(0, 300));

// Zoom into 2D plan area to see new elements
// The 2D plan appears to be in the left side of the screen (small panel)
// Crop to left panel area
const clip = { x: 0, y: 0, width: 280, height: 500 };
await page.screenshot({ path: `${outDir}/check-H-left-panel-crop.png`, clip });

// Add washer
await openAddMenu();
await clickMenuItem("洗濯機");
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/check-I-washer-final.png`, fullPage: true });

const afterWasher = await getCounters();
console.log("after washer:", afterWasher);

// Console errors
console.log("console errors:", consoleErrors.length);
if (consoleErrors.length > 0) {
  consoleErrors.slice(0, 8).forEach(e => console.log("  ERR:", e.substring(0, 200)));
}

await browser.close();
console.log("done");
