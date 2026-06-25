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

// SVG bbox: x:17, y:394, w:265, h:205 - click center of it
// The plan SVG center is at x:17+132=149, y:394+102=496
const SVG_CX = 149;
const SVG_CY = 496;

async function placeOnPlan(offsetX = 0, offsetY = 0) {
  await page.mouse.click(SVG_CX + offsetX, SVG_CY + offsetY);
  await page.waitForTimeout(800);
}

const getCounters = async () => {
  const body = await page.locator("body").innerText().catch(() => "");
  const lightMatch = body.match(/照明\s*\n?\s*(\d+)/);
  const furnMatch = body.match(/家具\s*\n?\s*(\d+)/);
  return { lights: lightMatch?.[1] ?? "?", furniture: furnMatch?.[1] ?? "?" };
};

const before = await getCounters();
console.log("before:", before);

// Add pendant via menu then click 2D plan
await openAddMenu();
await clickMenuItem("ペンダント");
console.log("status after menu click:", await page.locator("body").innerText().then(t => t.substring(t.indexOf("配置"), t.indexOf("配置") + 50)).catch(() => "N/A"));
await placeOnPlan();
const afterPendant = await getCounters();
console.log("after pendant:", afterPendant);
await page.screenshot({ path: `${outDir}/final-pendant.png`, fullPage: true });
// Left panel crop
await page.screenshot({ path: `${outDir}/final-pendant-left.png`, clip: { x: 0, y: 0, width: 300, height: 960 } });

// Inspector check
const inspText = await page.locator("[class*='inspector'], [class*='Inspector']").first().innerText().catch(() => "");
const hasHangLen = inspText.includes("吊り長さ") || inspText.includes("吊下") || inspText.includes("コード");
console.log("pendant inspector: 吊り長さ =", hasHangLen);
console.log("inspector (first 300):", inspText.substring(0, 300));

// Add doma
await openAddMenu();
await clickMenuItem("下げ床(土間)");
await placeOnPlan(20, 20);
const afterDoma = await getCounters();
console.log("after doma:", afterDoma);
await page.screenshot({ path: `${outDir}/final-doma.png`, fullPage: true });
await page.screenshot({ path: `${outDir}/final-doma-left.png`, clip: { x: 0, y: 0, width: 300, height: 960 } });

const inspDoma = await page.locator("[class*='inspector'], [class*='Inspector']").first().innerText().catch(() => "");
const hasDomaSlider = inspDoma.includes("下げ量");
console.log("doma inspector: 下げ量 =", hasDomaSlider);
console.log("inspector (first 300):", inspDoma.substring(0, 300));

// Add washer
await openAddMenu();
await clickMenuItem("洗濯機");
await placeOnPlan(40, 10);
const afterWasher = await getCounters();
console.log("after washer:", afterWasher);
await page.screenshot({ path: `${outDir}/final-washer.png`, fullPage: true });

// Console errors
console.log("console errors:", consoleErrors.length);
if (consoleErrors.length > 0) {
  consoleErrors.slice(0, 8).forEach(e => console.log("  ERR:", e.substring(0, 200)));
}

await browser.close();
console.log("done");
