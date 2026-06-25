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

// Helper: close any open modal
async function closeModal() {
  const backdrop = page.locator(".add-modal-backdrop");
  const count = await backdrop.count();
  if (count > 0) {
    await backdrop.click({ position: { x: 5, y: 5 }, timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

// Helper: open add menu  
async function openAddMenu() {
  await closeModal();
  const btn = page.locator("button.add-button");
  const count = await btn.count();
  if (count > 0) {
    await btn.first().click({ timeout: 5000 });
  } else {
    // fallback: find button with ＋追加 text
    await page.locator("button").filter({ hasText: /＋|追加/ }).first().click({ timeout: 5000 });
  }
  await page.waitForTimeout(500);
}

// Helper: get body text
async function getBodyText() {
  return await page.locator("body").innerText().catch(() => "");
}

// --- Step 1: Baseline ---
await page.screenshot({ path: `${outDir}/check-01-baseline.png`, fullPage: true });
console.log("step1: baseline captured");

// --- Step 2: Open + menu, check items ---
await openAddMenu();
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/check-02-add-menu.png`, fullPage: true });

const menuText = await getBodyText();
const hasMenu = {
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
  doma: menuText.includes("下げ床") || menuText.includes("土間"),
};
console.log("step2: menu items:", JSON.stringify(hasMenu));

// --- Step 3: Click ペンダント ---
let addedPendant = false;
try {
  await page.getByText("ペンダント", { exact: true }).first().click({ timeout: 3000 });
  addedPendant = true;
} catch {
  try { await page.getByText("ペンダント").first().click({ timeout: 2000 }); addedPendant = true; } catch {}
}
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outDir}/check-03-pendant-added.png`, fullPage: true });
console.log("step3: pendant added =", addedPendant);

// --- Step 4: Add 下げ床 ---
await openAddMenu();
await page.waitForTimeout(400);
let addedDoma = false;
try {
  const domaText = await page.getByText(/下げ床|土間/).first();
  await domaText.click({ timeout: 3000 });
  addedDoma = true;
} catch {}
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outDir}/check-04-doma-added.png`, fullPage: true });
const bodyAfterDoma = await getBodyText();
const hasDomaSlider = bodyAfterDoma.includes("下げ量");
console.log("step4: doma added =", addedDoma, "| 下げ量 slider =", hasDomaSlider);

// --- Step 5: Add 洗濯機 ---
await openAddMenu();
await page.waitForTimeout(400);
let addedWasher = false;
try {
  await page.getByText("洗濯機", { exact: true }).first().click({ timeout: 3000 });
  addedWasher = true;
} catch {}
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outDir}/check-05-washer-added.png`, fullPage: true });
console.log("step5: washer added =", addedWasher);

// --- Step 6: Add ライン照明 ---
await openAddMenu();
await page.waitForTimeout(400);
let addedLine = false;
try {
  await page.getByText("ライン照明", { exact: true }).first().click({ timeout: 3000 });
  addedLine = true;
} catch {}
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outDir}/check-06-line-light-added.png`, fullPage: true });
console.log("step6: line lighting added =", addedLine);

// --- Step 7: Pendant inspector check ---
// Click on scene to select pendant (try clicking the 3D canvas area roughly center-top)
await closeModal();
await page.waitForTimeout(300);

// Console errors
console.log("console errors count:", consoleErrors.length);
if (consoleErrors.length > 0) {
  consoleErrors.slice(0, 8).forEach(e => console.log("  ERR:", e.substring(0, 160)));
}

await browser.close();
console.log("done — screenshots in", outDir);
