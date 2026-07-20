import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const url = "http://127.0.0.1:5174/?demo=2";
const output = "output/build-week-video/finished-dining-high.png";
const quality = process.env.RENDER_QUALITY ?? "high";

await mkdir("output/build-week-video", { recursive: true });

const browser = await chromium.launch({ headless: false });
// 960 x 724 leaves a 960 x 540 (16:9) scene viewport after the application
// chrome. High still means the product's 512-sample preset, while this size
// is practical enough to complete on the recording machine.
const context = await browser.newContext({ viewport: { width: 960, height: 724 } });
await context.addInitScript(() => {
  localStorage.setItem("ldk-language", "en");
  localStorage.setItem("ldk-intro-seen", "1");
});

try {
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`browser-error=${message.text()}`);
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("canvas").first().waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForTimeout(2_000);

  // Match the video: approach the dining table before switching to Finished
  // look, so the completed high-quality image is about the same comparison.
  await page.locator("canvas").click();
  for (let i = 0; i < 8; i += 1) await page.keyboard.press("Shift+ArrowUp");
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowLeft");

  await page.getByRole("button", { name: "Finished look" }).click();
  await page.getByRole("button", { name: "Create finished image" }).click();
  await page.locator(".output-popover select").selectOption(quality);
  await page.getByRole("button", { name: "Create image" }).click();

  const image = page.getByRole("img", { name: "Finished image" });
  const progressLog = setInterval(async () => {
    console.log(`progress=${await page.locator(".output-progress").innerText()}`);
  }, 30_000);
  try {
    await image.waitFor({ state: "visible", timeout: 1_200_000 });
  } finally {
    clearInterval(progressLog);
  }
  const dataUrl = await image.getAttribute("src");
  if (!dataUrl?.startsWith("data:image/png;base64,")) throw new Error("完成画像のPNGデータを取得できません。");
  await writeFile(output, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
  console.log(`finished=${output}`);
} finally {
  await context.close();
  await browser.close();
}
