import { mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const url = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) ?? "http://127.0.0.1:5173/";
const outDir = "output/demo-video";
const videoName = "ldk-lighting-lab-demo.webm";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  recordVideo: { dir: outDir, size: { width: 1600, height: 1000 } }
});
const page = await context.newPage();

page.on("pageerror", (error) => console.log(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") console.log(`console.error: ${message.text()}`);
});

const step = async (label, fn) => {
  console.log(`step: ${label}`);
  await fn();
};

await step("goto", () => page.goto(url, { waitUntil: "networkidle" }));
await step("wait canvas", () => page.locator("canvas").first().waitFor({ state: "attached", timeout: 30000 }));
await page.waitForTimeout(1200);

await step("dismiss intro", () => page.getByRole("button", { name: "はじめる" }).click({ timeout: 5000 })).catch(() => {});
await page.waitForTimeout(300);

await step("import project", () =>
  page.locator('input[type="file"][accept*="json"]').setInputFiles("public/demo/share-demo-project.json")
);
await page.getByRole("status").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2600); // 2D+3D+Inspectorが揃った状態を見せる

// 「全照明の色温度を一括変更」の chip は [電球色2700K, 温白色3500K, 昼白色5000K, 昼光色6500K] の固定順。
const bulkChips = page.locator("label.field", { hasText: "全照明の色温度を一括変更" }).locator("button.chip");

await step("daylight color", () => bulkChips.nth(3).click());
await page.waitForTimeout(2600); // 寒色寄りの雰囲気

await step("warm color", () => bulkChips.nth(0).click());
await page.waitForTimeout(2600); // 暖色でくつろぎの雰囲気に戻す

await step("maximize 3d", () => page.getByRole("button", { name: "3Dを最大化" }).click());
await page.waitForTimeout(3500); // 暖色でくつろぐ最終カットとして少し長めに保持

await step("close", async () => {
  await page.waitForTimeout(500);
  await context.close();
  await browser.close();
});

const files = await readdir(outDir);
const recorded = files.find((file) => file.endsWith(".webm") && file !== videoName);
if (recorded) {
  await rename(join(outDir, recorded), join(outDir, videoName));
  console.log(`video=${join(outDir, videoName)}`);
} else {
  console.log("video=NOT_FOUND");
}
