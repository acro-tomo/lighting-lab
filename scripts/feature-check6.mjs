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
  await page.waitForTimeout(800);
}

// Dump all buttons to find the 2D/3D toggle
const allBtns = await page.locator("button").all();
const btnTexts = [];
for (const b of allBtns) {
  const txt = await b.innerText().catch(() => "");
  const cls = await b.getAttribute("class").catch(() => "");
  if (txt.trim()) btnTexts.push({ text: txt.trim().substring(0, 30), class: (cls||"").substring(0, 40) });
}
console.log("all buttons:", JSON.stringify(btnTexts.slice(0, 30)));

// Look for the 2D plan tab — it might be in the left panel
const leftPanel = page.locator(".left-panel, [class*='left'], [class*='sidebar'], [class*='Sidebar']").first();
const leftText = await leftPanel.innerText().catch(() => "");
console.log("left panel text:", leftText.substring(0, 300));

// Check left panel HTML for tab structure
const leftHtml = await page.locator("[class*='tab-bar'], [class*='TabBar'], [class*='view-toggle'], [class*='ViewToggle']").first().innerHTML().catch(() => "NO TAB BAR");
console.log("tab bar HTML:", leftHtml.substring(0, 500));

// Check the counter - is it "照明 X"?
// Look for the status bar with counts
const headerText = await page.locator("header, .header, [class*='header']").first().innerText().catch(() => "");
console.log("header text:", headerText.substring(0, 300));

// Find the count display
const allText = await page.locator("body").innerText().catch(() => "");
// Find 照明 N count in the text
const match = allText.match(/照明\s*\n?\s*(\d+)/);
const match2 = allText.match(/家具\s*\n?\s*(\d+)/);
console.log("lighting count:", match?.[1], "furniture count:", match2?.[1]);

// Add pendant
await openAddMenu();
await clickMenuItem("ペンダント");
const allText2 = await page.locator("body").innerText().catch(() => "");
const match3 = allText2.match(/照明\s*\n?\s*(\d+)/);
console.log("lighting count AFTER pendant add:", match3?.[1]);

// Screenshot right after add - crop to inspect the header/counter area
await page.screenshot({ path: `${outDir}/check-E-after-pendant.png`, fullPage: true });

// Check if the item list in the left panel shows the new pendant
const leftAfter = await page.locator(".left-panel, [class*='left'], [class*='sidebar'], [class*='Sidebar']").first().innerText().catch(() => "");
console.log("left panel after pendant:", leftAfter.substring(0, 500));

// Console errors
console.log("console errors:", consoleErrors.length);
if (consoleErrors.length > 0) {
  consoleErrors.slice(0, 8).forEach(e => console.log("  ERR:", e.substring(0, 200)));
}

await browser.close();
