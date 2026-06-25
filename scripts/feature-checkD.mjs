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

// Helper: close modal backdrop by pressing Escape
async function closeModal() {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

// Helper: open the left panel add menu (first .add-button)
async function openAddMenu() {
  await closeModal();
  await page.locator("button.add-button").first().click({ force: true, timeout: 5000, noWaitAfter: true });
  await page.waitForTimeout(500);
}

async function clickMenuItem(label) {
  const btn = page.locator(`[role="menuitem"]`).filter({ hasText: label }).first();
  await btn.click({ force: true, timeout: 5000, noWaitAfter: true });
  await page.waitForTimeout(400);
}

const SVG_CX = 149;
const SVG_CY = 496;

async function placeOnPlan(ox = 0, oy = 0) {
  await page.mouse.click(SVG_CX + ox, SVG_CY + oy);
  await page.waitForTimeout(500);
}

const items = [
  ["洗濯機", 30, 30],
  ["洗面台", -30, 20],
  ["トイレ", 50, -20],
  ["浴槽", -20, -30],
  ["デスク", 60, 0],
  ["下駄箱", 0, -40],
];
for (const [label, ox, oy] of items) {
  await openAddMenu();
  await clickMenuItem(label);
  await placeOnPlan(ox, oy);
}

await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/final-multi-furniture.png`, fullPage: true });
await page.screenshot({ path: `${outDir}/final-3d-crop.png`, clip: { x: 295, y: 185, width: 860, height: 520 } });
await page.screenshot({ path: `${outDir}/final-2dplan.png`, clip: { x: 0, y: 380, width: 300, height: 230 } });

const body = await page.locator("body").innerText().catch(() => "");
const lm = body.match(/照明\s*\n?\s*(\d+)/);
const fm = body.match(/家具\s*\n?\s*(\d+)/);
console.log("final counters: lights =", lm?.[1], "furniture =", fm?.[1]);
console.log("console errors:", consoleErrors.length);
if (consoleErrors.length > 0) {
  consoleErrors.slice(0, 5).forEach(e => console.log("  ERR:", e.substring(0, 200)));
}
await browser.close();
console.log("done");
