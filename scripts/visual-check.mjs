import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const shouldRender = process.argv.includes("--render");
const shouldPeekRender = process.argv.includes("--render-peek");
const url = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) ?? "http://127.0.0.1:5175/";
const outputPath = shouldRender || shouldPeekRender
  ? "output/playwright/ldk-lighting-lab-pathtraced.png"
  : "output/playwright/ldk-lighting-lab.png";

await mkdir("output/playwright", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });

page.on("console", (message) => {
  if (message.type() === "error") {
    console.log(`console.error: ${message.text()}`);
  }
});
page.on("pageerror", (error) => {
  console.log(`pageerror: ${error.message}`);
});
page.on("requestfailed", (request) => {
  console.log(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`);
});

await page.goto(url, { waitUntil: "networkidle" });
try {
  await page.locator("canvas").first().waitFor({ state: "attached", timeout: 30000 });
} catch (error) {
  console.log(`pageUrl=${page.url()}`);
  console.log(`body=${await page.locator("body").innerText().catch(() => "")}`);
  await page.screenshot({ path: "output/playwright/debug-no-canvas.png", fullPage: true, timeout: 10000 }).catch((screenshotError) => {
    console.log(`debugScreenshotError=${screenshotError.message}`);
  });
  throw error;
}
await page.waitForTimeout(1400);

if (shouldRender || shouldPeekRender) {
  await page.getByRole("button", { name: "レンダリング開始" }).click();
  if (shouldPeekRender) {
    await page.waitForTimeout(8000);
    console.log(`renderStatus=${await page.locator(".render-status-wide").innerText()}`);
  } else {
    await page.waitForFunction(
      () => document.body.textContent?.includes("Path traced") || document.body.textContent?.includes("完了"),
      null,
      { timeout: 180000 }
    );
    await page.waitForTimeout(800);
  }
}

const canvasCheck = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  if (!canvas) return { found: false, nonDarkPixels: 0 };
  const sample = document.createElement("canvas");
  sample.width = 160;
  sample.height = 100;
  const context = sample.getContext("2d");
  if (!context) return { found: true, nonDarkPixels: 0 };
  context.drawImage(canvas, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  let nonDarkPixels = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 48) {
      nonDarkPixels += 1;
    }
  }
  return { found: true, nonDarkPixels };
});

await page.screenshot({ path: outputPath, fullPage: true });
await browser.close();

if (!canvasCheck.found || canvasCheck.nonDarkPixels < 300) {
  throw new Error(`3D canvas looks blank: ${JSON.stringify(canvasCheck)}`);
}

console.log(`screenshot=${outputPath}`);
console.log(`canvasNonDarkPixels=${canvasCheck.nonDarkPixels}`);
