import { mkdir, rename } from "node:fs/promises";
import { basename, join } from "node:path";
import { chromium } from "@playwright/test";

const url = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--"))
  ?? "https://lighting-lab-46l.pages.dev/";
const outDir = "output/build-week-video/raw";

await mkdir(outDir, { recursive: true });

const waitForScene = async (page) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("canvas").first().waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForTimeout(1_800);
};

const makeContext = (browser, viewport) => browser.newContext({
  viewport,
  recordVideo: { dir: outDir, size: viewport }
});

const setEnglishDemoState = async (context) => {
  await context.addInitScript(() => {
    localStorage.setItem("ldk-language", "en");
    localStorage.setItem("ldk-intro-seen", "1");
  });
};

const recordDesktop = async (browser) => {
  const context = await makeContext(browser, { width: 1280, height: 720 });
  await setEnglishDemoState(context);
  const page = await context.newPage();
  const video = page.video();

  await waitForScene(page);
  await page.waitForTimeout(2_000);

  await page.getByLabel("Select a light").selectOption("light-tv-wall-1");
  await page.waitForTimeout(1_000);
  const dimming = page.locator(".light-inspector .light-range-control input[type='range']").first();
  await dimming.press("Home");
  for (let value = 0; value < 45; value += 1) await dimming.press("ArrowRight");
  await page.locator(".light-inspector .light-inspector-section .chip").first().click();
  await page.waitForTimeout(2_500);

  await page.getByRole("button", { name: "Realistic" }).click();
  await page.waitForTimeout(7_000);

  await page.getByRole("button", { name: "Export / Render" }).click();
  await page.waitForTimeout(3_000);

  await context.close();
  return video.path();
};

const recordMobile = async (browser) => {
  const context = await makeContext(browser, { width: 390, height: 844 });
  await setEnglishDemoState(context);
  const page = await context.newPage();
  const video = page.video();

  await waitForScene(page);
  await page.waitForTimeout(1_500);
  await page.getByRole("button", { name: "3D" }).click();
  await page.waitForTimeout(2_000);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.waitForTimeout(3_000);

  await context.close();
  return video.path();
};

const browser = await chromium.launch({ headless: false });
try {
  const desktopPath = await recordDesktop(browser);
  const mobilePath = await recordMobile(browser);
  const desktopOut = join(outDir, "desktop.webm");
  const mobileOut = join(outDir, "mobile.webm");
  await rename(desktopPath, desktopOut);
  await rename(mobilePath, mobileOut);
  console.log(`desktop=${desktopOut}`);
  console.log(`mobile=${mobileOut}`);
} finally {
  await browser.close();
}
