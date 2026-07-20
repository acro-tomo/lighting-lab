import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const url = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--"))
  ?? "https://lighting-lab-46l.pages.dev/?demo=2";
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

const hideTransientNotices = async (page) => {
  await page.locator('[role="status"]').evaluateAll((elements) => {
    for (const element of elements) element.setAttribute("style", "visibility: hidden");
  });
};

const selectExampleLight = async (page) => {
  const candidateSelectors = [
    ".plan-light[data-light-id='light-kitchen-west']",
    ".plan-light[data-light-id='light-kitchen-1']",
    ".plan-light"
  ];
  let light = page.locator(candidateSelectors.at(-1)).first();
  for (const selector of candidateSelectors) {
    const candidate = page.locator(selector).first();
    if (await candidate.count()) {
      light = candidate;
      break;
    }
  }
  await light.waitFor({ state: "attached", timeout: 15_000 });
  console.log(`selectedLight=${await light.getAttribute("data-light-id")}`);

  const box = await light.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }

  // In dense plans the light marker can be covered by a furniture hit target.
  // Dispatching the same pointer event keeps the recorded interaction focused
  // on the lighting controls rather than on an unrelated furniture selection.
  await light.dispatchEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId: 1
  });
  await page.locator(".light-inspector").waitFor({ state: "visible", timeout: 5_000 });
};

const recordDesktop = async (browser) => {
  const context = await makeContext(browser, { width: 1280, height: 720 });
  await setEnglishDemoState(context);
  const page = await context.newPage();
  const video = page.video();

  await step("desktop demo=2 scene ready", () => waitForScene(page));
  await hideTransientNotices(page);
  await pause(page, 31_000);

  await page.getByRole("button", { name: "Import floor plan" }).hover();
  await pause(page, 4_000);

  await step("select example light", () => selectExampleLight(page));
  await pause(page, 6_000);

  await step("set 2700K", () => page.getByRole("button", { name: "Warm white 2700K" }).click());
  await pause(page, 8_000);
  await step("set 3500K", () => page.getByRole("button", { name: "Neutral white 3500K" }).click());
  await pause(page, 10_000);

  const dimming = page.locator(".light-inspector .light-range-control input[type='range']").first();
  await dimming.press("Home");
  for (let value = 0; value < 45; value += 1) await dimming.press("ArrowRight");
  await pause(page, 7_000);

  await dimming.press("Home");
  for (let value = 0; value < 78; value += 1) await dimming.press("ArrowRight");
  await pause(page, 7_000);

  await page.getByText("Details +", { exact: true }).click();
  await step("compare position", async () => {
    const xPosition = page.getByRole("spinbutton", { name: "X mm" });
    await xPosition.fill("3800");
    await xPosition.press("Tab");
  });
  const beamAngle = page.locator("label.field", { hasText: "Beam spread" }).locator("input");
  await beamAngle.fill("70");
  await beamAngle.press("Tab");
  await pause(page, 12_000);

  await step("maximize 3D", () => page.getByRole("button", { name: "Maximize 3D" }).click());
  await pause(page, 14_000);

  await step("enable finished look", () => page.getByRole("button", { name: /^(Realistic|Finished look)$/ }).click());
  await pause(page, 40_000);

  await context.close();
  return video.path();
};

const recordMobile = async (browser) => {
  const context = await makeContext(browser, { width: 390, height: 844 });
  await setEnglishDemoState(context);
  const page = await context.newPage();
  const video = page.video();

  await step("mobile demo=2 scene ready", () => waitForScene(page));
  await hideTransientNotices(page);
  await pause(page, 5_000);
  await page.getByRole("button", { name: "3D" }).click();
  await pause(page, 7_000);
  await page.getByRole("button", { name: "Open settings" }).click();
  await pause(page, 10_000);

  await context.close();
  return video.path();
};

const browser = await chromium.launch({ headless: false });
try {
  const desktopPath = await recordDesktop(browser);
  const mobilePath = await recordMobile(browser);
  const desktopOut = join(outDir, "demo2-desktop.webm");
  const mobileOut = join(outDir, "demo2-mobile.webm");
  await rename(desktopPath, desktopOut);
  await rename(mobilePath, mobileOut);
  console.log(`desktop=${desktopOut}`);
  console.log(`mobile=${mobileOut}`);
} finally {
  await browser.close();
}
