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

async function placeOnCanvas() {
  // The 2D canvas is the Konva canvas in the left panel
  // Based on the crop, the plan is in the bottom-left area
  // Page is 1440x960, left panel appears to be ~280px wide
  // The canvas is at roughly x:70-270, y:400-750 (rough estimate)
  const canvas = page.locator("canvas").first();
  const bbox = await canvas.boundingBox();
  if (!bbox) { console.log("no canvas bbox"); return; }
  console.log("main canvas bbox:", JSON.stringify(bbox));
  
  // The 2D plan is likely the smaller Konva canvas. Let's find all canvases
  const canvases = await page.locator("canvas").all();
  for (let i = 0; i < canvases.length; i++) {
    const bb = await canvases[i].boundingBox();
    console.log(`canvas[${i}] bbox:`, JSON.stringify(bb));
  }
  
  // Click on the plan area - try the center-left of the screen where the 2D plan is
  // Based on the screenshot, the 2D plan seems to be at the bottom of the left panel
  // around x:140, y:600 on the 1440-wide page
  await page.mouse.click(140, 600);
  await page.waitForTimeout(600);
}

const getCounters = async () => {
  const body = await page.locator("body").innerText().catch(() => "");
  const lightMatch = body.match(/照明\s*\n?\s*(\d+)/);
  const furnMatch = body.match(/家具\s*\n?\s*(\d+)/);
  return { lights: lightMatch?.[1] ?? "?", furniture: furnMatch?.[1] ?? "?" };
};

// Take a screenshot first to see layout
await page.screenshot({ path: `${outDir}/check-layout.png`, fullPage: true });

// Step: Open menu, select pendant, then click on canvas to place
await openAddMenu();
await clickMenuItem("ペンダント");
console.log("menu item clicked, now placing on canvas...");

// Click within the 2D plan area to place the pendant
await placeOnCanvas();
await page.waitForTimeout(800);

const afterPendant = await getCounters();
console.log("after pendant place:", afterPendant);
await page.screenshot({ path: `${outDir}/check-pendant-placed.png`, fullPage: true });

// Inspector check
const inspText = await page.locator("[class*='inspector'], [class*='Inspector']").first().innerText().catch(() => "");
console.log("inspector:", inspText.substring(0, 400));

// Console errors
console.log("console errors:", consoleErrors.length);
if (consoleErrors.length > 0) {
  consoleErrors.slice(0, 8).forEach(e => console.log("  ERR:", e.substring(0, 200)));
}

await browser.close();
