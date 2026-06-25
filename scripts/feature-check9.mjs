import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const url = "http://127.0.0.1:5174/";
const outDir = "/Users/hoshi/AI/家/照明計画/output/playwright";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });

await page.goto(url, { waitUntil: "networkidle" });
await page.locator("canvas").first().waitFor({ state: "attached", timeout: 30000 });
await page.waitForTimeout(1400);

// Find the 2D plan element
const plan2d = page.locator("[class*='plan2d'], [class*='Plan2d'], [class*='plan-2d'], [class*='Plan2D'], [class*='floor-plan'], [class*='FloorPlan']");
const plan2dCount = await plan2d.count();
console.log("plan2d count:", plan2dCount);

// Get bbox of left panel small diagram
const svgEls = await page.locator("svg").all();
console.log("svg count:", svgEls.length);
for (let i = 0; i < svgEls.length; i++) {
  const bb = await svgEls[i].boundingBox();
  console.log(`svg[${i}] bbox:`, JSON.stringify(bb));
}

// Try to find the konva container or the 2D plan element
const konva = await page.locator("[class*='konva'], .konvajs-content").all();
console.log("konva count:", konva.length);

// Look for the mini map / plan viewer
const allDivs = await page.locator("div[class]").all();
const planDivs = [];
for (const d of allDivs) {
  const cls = await d.getAttribute("class").catch(() => "");
  if (cls && (cls.includes("plan") || cls.includes("Plan") || cls.includes("2d") || cls.includes("floor"))) {
    const bb = await d.boundingBox();
    planDivs.push({ class: cls.substring(0, 60), bbox: bb });
  }
}
console.log("plan divs:", JSON.stringify(planDivs.slice(0, 10)));

// More broadly - look at the left side of the page
// Crop left side to see what's there
await page.screenshot({ path: `${outDir}/debug-left.png`, clip: { x: 0, y: 0, width: 300, height: 960 } });

await browser.close();
