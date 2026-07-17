import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const url = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--"))
  ?? "https://lighting-lab-46l.pages.dev/";
const outDir = "output/build-week-video/raw";
const fastMode = process.env.DEMO_FAST === "1";

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

const step = async (label, action) => {
  console.log(`step=${label}`);
  return action();
};

const pause = (page, durationMs) => page.waitForTimeout(fastMode ? Math.min(durationMs, 100) : durationMs);

const recordDesktop = async (browser) => {
  const context = await makeContext(browser, { width: 1280, height: 720 });
  await setEnglishDemoState(context);
  const page = await context.newPage();
  const video = page.video();

  await step("desktop scene ready", () => waitForScene(page));
  await pause(page, 15_000);

  await page.getByRole("button", { name: "Import floor plan" }).hover();
  await pause(page, 5_000);

  await step("select dining pendant", () => page.getByLabel("Select a light").selectOption("light-dining-pendant"));
  await pause(page, 7_000);

  await step("set 3500K", () => page.getByRole("button", { name: "Neutral white 3500K" }).click());
  await pause(page, 10_000);

  const dimming = page.locator(".light-inspector .light-range-control input[type='range']").first();
  await dimming.press("Home");
  for (let value = 0; value < 55; value += 1) await dimming.press("ArrowRight");
  await pause(page, 8_000);

  await dimming.press("Home");
  for (let value = 0; value < 92; value += 1) await dimming.press("ArrowRight");
  await pause(page, 8_000);

  const pendant = page.locator(".plan-light", { hasText: "Dining pendant" });
  const pendantBox = await pendant.boundingBox();
  if (!pendantBox) throw new Error("Dining pendant is not visible in the 2D plan");
  const startX = pendantBox.x + pendantBox.width / 2;
  const startY = pendantBox.y + pendantBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 48, startY - 20, { steps: 24 });
  await page.mouse.up();
  await pause(page, 10_000);

  if (!await page.locator(".light-inspector").isVisible()) {
    await step("reselect dining pendant", () => pendant.dispatchEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1
    }));
    await page.locator(".light-inspector").waitFor({ state: "visible", timeout: 5_000 });
  }
  await page.getByText("Details +", { exact: true }).click();
  const beamAngle = page.locator("label.field", { hasText: "Beam spread" }).locator("input");
  await beamAngle.fill("70");
  await beamAngle.press("Tab");
  await pause(page, 10_000);

  await step("maximize 3D", () => page.getByRole("button", { name: "Maximize 3D" }).click());
  await pause(page, 10_000);

  await step("enable Realistic", () => page.getByRole("button", { name: "Realistic" }).click());
  await pause(page, 30_000);

  await context.close();
  return video.path();
};

const recordMobile = async (browser) => {
  const context = await makeContext(browser, { width: 390, height: 844 });
  await setEnglishDemoState(context);
  const page = await context.newPage();
  const video = page.video();

  await step("mobile scene ready", () => waitForScene(page));
  await pause(page, 5_000);
  await page.getByRole("button", { name: "3D" }).click();
  await pause(page, 8_000);
  await page.getByRole("button", { name: "Open settings" }).click();
  await pause(page, 10_000);

  await context.close();
  return video.path();
};

const browser = await chromium.launch({ headless: false });
try {
  const desktopPath = await recordDesktop(browser);
  const mobilePath = await recordMobile(browser);
  const desktopOut = join(outDir, "dining-desktop.webm");
  const mobileOut = join(outDir, "dining-mobile.webm");
  await rename(desktopPath, desktopOut);
  await rename(mobilePath, mobileOut);
  console.log(`desktop=${desktopOut}`);
  console.log(`mobile=${mobileOut}`);
} finally {
  await browser.close();
}
