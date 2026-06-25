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
  // close if backdrop visible
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
  await page.waitForTimeout(1200);
}

// Step 1: baseline
await page.screenshot({ path: `${outDir}/check-01-baseline.png`, fullPage: true });

// Step 2: Open menu screenshot
await openAddMenu();
await page.screenshot({ path: `${outDir}/check-02-add-menu.png`, fullPage: true });

// Verify menu items
const menuText = await page.locator(".add-modal").innerText().catch(() => "");
const checks = {
  pendant: menuText.includes("ペンダント"),
  lineLight: menuText.includes("ライン照明"),
  frontDoor: menuText.includes("玄関扉"),
  backdoor: menuText.includes("勝手口"),
  washer: menuText.includes("洗濯機"),
  sink: menuText.includes("洗面台"),
  toilet: menuText.includes("トイレ"),
  bathtub: menuText.includes("浴槽"),
  desk: menuText.includes("デスク"),
  shoebox: menuText.includes("下駄箱"),
  doma: menuText.includes("下げ床"),
};
console.log("menu items present:", JSON.stringify(checks));

// Step 3: Add ペンダント
await clickMenuItem("ペンダント");
await page.screenshot({ path: `${outDir}/check-03-pendant-added.png`, fullPage: true });
console.log("step3: pendant added — screenshot saved");

// Step 4: Add 下げ床(土間)
await openAddMenu();
await clickMenuItem("下げ床(土間)");
await page.screenshot({ path: `${outDir}/check-04-doma-added.png`, fullPage: true });
const bodyDoma = await page.locator("body").innerText().catch(() => "");
console.log("step4: doma added | 下げ量 slider present =", bodyDoma.includes("下げ量"));

// Step 5: Add 洗濯機
await openAddMenu();
await clickMenuItem("洗濯機");
await page.screenshot({ path: `${outDir}/check-05-washer-added.png`, fullPage: true });
console.log("step5: washer added — screenshot saved");

// Step 6: Add ライン照明
await openAddMenu();
await clickMenuItem("ライン照明");
await page.screenshot({ path: `${outDir}/check-06-line-light-added.png`, fullPage: true });
console.log("step6: line lighting added — screenshot saved");

// Step 7: Multi-furniture scene
await openAddMenu(); await clickMenuItem("洗面台");
await openAddMenu(); await clickMenuItem("トイレ");
await openAddMenu(); await clickMenuItem("浴槽");
await openAddMenu(); await clickMenuItem("デスク");
await openAddMenu(); await clickMenuItem("下駄箱");
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outDir}/check-07-multi-furniture.png`, fullPage: true });
console.log("step7: multi-furniture added — screenshot saved");

// Console errors
console.log("console errors:", consoleErrors.length);
if (consoleErrors.length > 0) {
  consoleErrors.slice(0, 8).forEach(e => console.log("  ERR:", e.substring(0, 160)));
}

await browser.close();
console.log("done");
