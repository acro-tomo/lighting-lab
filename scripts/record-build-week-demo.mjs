import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const url = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--"))
  ?? "http://127.0.0.1:5174/?demo=2";
const outDir = "output/build-week-video/raw";
const fastMode = process.env.DEMO_FAST === "1";

await mkdir(outDir, { recursive: true });

const waitForScene = async (page) => {
  page.once("dialog", (dialog) => dialog.accept());
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

const selectLight = async (page, id) => {
  const light = page.locator(`.plan-light[data-light-id='${id}']`);
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

const moveCameraToDining = async (page) => {
  await page.locator("canvas").click();
  // The demo's initial camera is a room-wide view. Move toward the dining
  // table and look slightly left so colour changes affect a large, legible
  // table-and-chair area rather than a tiny fixture in a wide room shot.
  for (let i = 0; i < 8; i += 1) await page.keyboard.press("Shift+ArrowUp");
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowLeft");
};

const adjustRange = async (locator, value) => {
  await locator.press("Home");
  for (let i = 0; i < value; i += 1) await locator.press("ArrowRight");
};

const recordDesktop = async (browser) => {
  const context = await makeContext(browser, { width: 1280, height: 720 });
  await setEnglishDemoState(context);
  const page = await context.newPage();
  const video = page.video();

  await step("desktop demo=2 scene ready", () => waitForScene(page));
  await hideTransientNotices(page);
  // The first narration section needs a calm whole-room establishing shot,
  // before any inspector or cursor action competes with the problem statement.
  await pause(page, 20_000);
  await hideTransientNotices(page);

  await page.getByRole("button", { name: "Import floor plan" }).hover();
  await pause(page, 3_000);

  await step("move camera toward dining", () => moveCameraToDining(page));
  await pause(page, 3_000);
  // Camera keyboard control focuses the canvas and can clear a 2D selection.
  // Select only after arriving, so the close dining view and its Inspector
  // remain visible together for the colour-temperature comparison.
  await step("select dining pendant west", () => selectLight(page, "light-dining-west"));
  await pause(page, 2_000);

  await step("set 2700K", () => page.getByRole("button", { name: "Warm white" }).click());
  await pause(page, 4_000);
  await step("set 3500K", () => page.getByRole("button", { name: "Neutral white" }).click());
  await pause(page, 5_000);

  const dimming = page.locator(".light-inspector .light-range-control input[type='range']").first();
  await adjustRange(dimming, 45);
  await pause(page, 3_000);

  await adjustRange(dimming, 78);
  await pause(page, 3_000);

  await page.getByText("Details +", { exact: true }).click();
  await step("compare position", async () => {
    const xPosition = page.getByRole("spinbutton", { name: "X mm" });
    await xPosition.fill("-900");
    await xPosition.press("Tab");
  });
  const beamAngle = page.locator("label.field", { hasText: "Beam spread" }).locator("input");
  await beamAngle.fill("100");
  await beamAngle.press("Tab");
  await pause(page, 4_000);

  await step("maximize 3D", () => page.getByRole("button", { name: "Maximize 3D" }).click());
  await pause(page, 2_000);
  await page.locator("canvas").click();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("Alt+ArrowRight");
  await pause(page, 5_000);

  await step("return to normal view", () => page.getByRole("button", { name: "Return to normal view" }).click());
  await step("select sculpture spotlight", () => selectLight(page, "light-living-sculpture"));
  await pause(page, 2_000);
  const aimInput = page.locator(".aim-dial-deg input[type='number']");
  await aimInput.fill("80");
  await aimInput.press("Tab");
  await pause(page, 4_000);

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
  await hideTransientNotices(page);
  await page.getByRole("button", { name: "3D" }).click();
  await pause(page, 3_000);
  await page.getByRole("button", { name: "Open settings" }).click();
  await pause(page, 4_000);

  await context.close();
  return video.path();
};

const browser = await chromium.launch({ headless: false });
try {
  const desktopPath = await recordDesktop(browser);
  const mobilePath = await recordMobile(browser);
  const desktopOut = join(outDir, "demo2-dining-desktop.webm");
  const mobileOut = join(outDir, "demo2-dining-mobile.webm");
  await rename(desktopPath, desktopOut);
  await rename(mobilePath, mobileOut);
  console.log(`desktop=${desktopOut}`);
  console.log(`mobile=${mobileOut}`);
} finally {
  await browser.close();
}
